"""
Database connection: tries Supabase Cloud PostgreSQL first (via
SUPABASE_DB_URL / DATABASE_URL), falls back to local Docker PostgreSQL.
Mid-flight failover: if Supabase drops connection during a query, the query
is retried once on the local Docker pool.
"""
import json
import os
import time
from datetime import UTC, date, datetime
from typing import Any, Optional, Sequence

import asyncpg

from app.utils.logger import logger

_raw_supabase_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
SUPABASE_URL: Optional[str] = (
    _raw_supabase_url.strip().strip("'\"") if _raw_supabase_url else None
)


def _docker_dsn() -> dict:
    return {
        "host": os.getenv("LOCAL_DB_HOST") or os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("LOCAL_DB_PORT") or os.getenv("DB_PORT", "5432")),
        "database": os.getenv("LOCAL_DB_NAME") or os.getenv("DB_NAME", "entopedia"),
        "user": os.getenv("LOCAL_DB_USER") or os.getenv("DB_USER", "postgres"),
        "password": os.getenv("LOCAL_DB_PASSWORD") or os.getenv("DB_PASSWORD", "postgres"),
    }


def _json_encode(value: Any) -> str:
    # Callers already pass json.dumps(...) strings; keep those as they are, encode anything else.
    return value if isinstance(value, str) else json.dumps(value, default=str)


def _time_encode(value: Any) -> str:
    # node-postgres took ISO strings ("2026-11-05T08:00:00+00:00", "2024-03-15") for date/time parameters and
    # the ported code still passes them; asyncpg alone accepts only datetime/date objects.
    return value if isinstance(value, str) else value.isoformat()


def _time_decode(text: str) -> Any:
    try:
        value = datetime.fromisoformat(text)  # Postgres ISO output, e.g. "2026-11-19 10:42:17.955+00"
    except ValueError:
        return text  # "infinity" and the like
    # A TIMESTAMP column has no zone; the session runs in UTC (see _init_connection), so its value is UTC.
    # Marked as such it is sent as "...+00:00", which browsers read correctly; a bare value would be read
    # as the viewer's local time (5h30 off in India).
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _date_decode(text: str) -> Any:
    try:
        return date.fromisoformat(text)
    except ValueError:
        return text


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Make asyncpg behave like node-postgres for the types the ported code relies on:
    json/jsonb come back as objects (not strings) and accept dicts or JSON strings; uuid comes back as text
    (a uuid.UUID cannot go into a JWT or json.dumps); date/timestamp parameters accept ISO strings."""
    await conn.execute("SET DateStyle TO ISO; SET TIME ZONE 'UTC'")
    for name in ("json", "jsonb"):
        await conn.set_type_codec(name, schema="pg_catalog", encoder=_json_encode, decoder=json.loads, format="text")
    await conn.set_type_codec("uuid", schema="pg_catalog", encoder=str, decoder=str, format="text")
    for name in ("timestamptz", "timestamp"):
        await conn.set_type_codec(name, schema="pg_catalog", encoder=_time_encode, decoder=_time_decode, format="text")
    await conn.set_type_codec("date", schema="pg_catalog", encoder=_time_encode, decoder=_date_decode, format="text")


class Database:
    def __init__(self) -> None:
        self._supabase_pool: Optional[asyncpg.Pool] = None
        self._docker_pool: Optional[asyncpg.Pool] = None
        self._active_pool: Optional[asyncpg.Pool] = None
        self._active_source: str = "LOCAL_DOCKER"

    def get_source(self) -> str:
        return self._active_source

    async def connect(self) -> None:
        masked_host = SUPABASE_URL.split("@")[-1] if SUPABASE_URL else "NOT_SET"
        print(f"[DB] Attempting database connection. Supabase target: {masked_host}")

        if SUPABASE_URL:
            try:
                self._supabase_pool = await asyncpg.create_pool(
                    dsn=SUPABASE_URL,
                    init=_init_connection,
                    ssl="require",
                    min_size=1,
                    max_size=15,
                    max_inactive_connection_lifetime=30,
                    timeout=10,
                )
                self._active_pool = self._supabase_pool
                self._active_source = "SUPABASE"
                print("[DB] Connected to PRIMARY database: Supabase PostgreSQL")
                logger.info("Connected to PRIMARY database: Supabase PostgreSQL")
                return
            except Exception as err:  # noqa: BLE001
                print(f"[DB] Supabase unreachable ({err}). Falling back to Local Docker PostgreSQL...")
                logger.warning(f"Supabase unreachable ({err}). Falling back to Local Docker PostgreSQL...")

        try:
            self._docker_pool = await asyncpg.create_pool(
                **_docker_dsn(),
                init=_init_connection,
                min_size=1,
                max_size=20,
                max_inactive_connection_lifetime=30,
                timeout=3,
            )
            self._active_pool = self._docker_pool
            self._active_source = "LOCAL_DOCKER"
            print("[DB] Connected to FALLBACK database: Local Docker PostgreSQL")
            logger.info("Connected to FALLBACK database: Local Docker PostgreSQL")
        except Exception as error:  # noqa: BLE001
            print(f"[DB] Both Supabase and Local Docker databases failed to connect: {error}")
            logger.error(f"Both Supabase and Local Docker databases failed to connect: {error}")
            raise

    async def _ensure_docker_pool(self) -> asyncpg.Pool:
        if self._docker_pool is None:
            self._docker_pool = await asyncpg.create_pool(
                **_docker_dsn(), init=_init_connection, min_size=1, max_size=20, max_inactive_connection_lifetime=30, timeout=3
            )
        return self._docker_pool

    async def query(self, text: str, params: Optional[Sequence[Any]] = None) -> list[asyncpg.Record]:
        params = params or []
        start = time.monotonic()
        pool = self._active_pool
        assert pool is not None, "Database not connected"
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(text, *params)
            duration = (time.monotonic() - start) * 1000
            logger.debug(f"Executed query on [{self._active_source}]", extra={"duration": duration, "rows": len(rows)})
            return rows
        except (asyncpg.exceptions.ConnectionDoesNotExistError, asyncpg.exceptions.ConnectionFailureError,
                asyncpg.exceptions.InterfaceError, OSError, ConnectionError) as error:
            if self._active_source == "SUPABASE":
                print("[DB] Supabase connection dropped mid-query! Switching to Local Docker DB...")
                logger.warning("Supabase connection dropped mid-query! Switching to Local Docker DB...")
                self._active_pool = await self._ensure_docker_pool()
                self._active_source = "LOCAL_DOCKER"
                async with self._active_pool.acquire() as conn:
                    rows = await conn.fetch(text, *params)
                return rows
            logger.error(f"Query error on [{self._active_source}]:", extra={"text": text, "error": str(error)})
            raise
        except Exception as error:  # noqa: BLE001
            logger.error(f"Query error on [{self._active_source}]:", extra={"text": text, "error": str(error)})
            raise

    async def query_one(self, text: str, params: Optional[Sequence[Any]] = None) -> Optional[dict]:
        rows = await self.query(text, params)
        return dict(rows[0]) if rows else None

    async def query_many(self, text: str, params: Optional[Sequence[Any]] = None) -> list[dict]:
        rows = await self.query(text, params)
        return [dict(r) for r in rows]

    async def execute(self, text: str, params: Optional[Sequence[Any]] = None) -> str:
        params = params or []
        pool = self._active_pool
        assert pool is not None, "Database not connected"
        async with pool.acquire() as conn:
            return await conn.execute(text, *params)

    def get_pool(self) -> asyncpg.Pool:
        assert self._active_pool is not None, "Database not connected"
        return self._active_pool

    async def close(self) -> None:
        if self._supabase_pool:
            await self._supabase_pool.close()
        if self._docker_pool:
            await self._docker_pool.close()
        logger.info("Database pools closed")


db = Database()
