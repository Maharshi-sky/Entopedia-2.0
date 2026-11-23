"""
Migration runner: `python -m app.migrations.run`

Applies every *.sql file in migrations_sql/ (the single source of truth for schema) in filename
order, once each, and records it in `schema_migrations`. Each file runs in its own transaction, so a
failing file leaves the database as it was before that file.

  python -m app.migrations.run            schema migrations (01_…, 02_…, …)
  python -m app.migrations.run --demo      also loads demo/*.sql (sample rows for a
                                            local or staging database — never production)
"""
import asyncio
import os
import sys

import asyncpg
from dotenv import load_dotenv

load_dotenv()

_SQL_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "migrations_sql"))


async def _get_migration_connection() -> tuple[asyncpg.Pool, str]:
    supabase_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")

    if supabase_url:
        try:
            pool = await asyncpg.create_pool(dsn=supabase_url, ssl="require", min_size=1, max_size=2, timeout=5)
            print("Connected to PRIMARY database for migrations: Supabase PostgreSQL")
            return pool, "SUPABASE"
        except Exception as err:  # noqa: BLE001
            print(f"Supabase unreachable ({err}). Falling back to Local Docker PostgreSQL...")

    pool = await asyncpg.create_pool(
        host=os.getenv("LOCAL_DB_HOST") or os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("LOCAL_DB_PORT") or os.getenv("DB_PORT", "5432")),
        database=os.getenv("LOCAL_DB_NAME") or os.getenv("DB_NAME", "entopedia"),
        user=os.getenv("LOCAL_DB_USER") or os.getenv("DB_USER", "postgres"),
        password=os.getenv("LOCAL_DB_PASSWORD") or os.getenv("DB_PASSWORD", "postgres"),
        min_size=1, max_size=2, timeout=3,
    )
    print("Connected to FALLBACK database for migrations: Local Docker PostgreSQL")
    return pool, "LOCAL_DOCKER"


async def run() -> None:
    with_demo = "--demo" in sys.argv
    pool, source = await _get_migration_connection()

    dirs = [(_SQL_DIR, "")]
    if with_demo:
        dirs.append((os.path.join(_SQL_DIR, "demo"), "demo/"))

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW())"
            )
            applied = {r["filename"] for r in await conn.fetch("SELECT filename FROM schema_migrations")}

            count = 0
            for directory, prefix in dirs:
                if not os.path.isdir(directory):
                    continue
                files = sorted(f for f in os.listdir(directory) if f.endswith(".sql"))

                for file in files:
                    name = prefix + file
                    if name in applied:
                        continue
                    with open(os.path.join(directory, file), "r", encoding="utf-8") as f:
                        sql = f.read()
                    print(f"[{source}] Applying {name} … ", end="")
                    try:
                        async with conn.transaction():
                            await conn.execute(sql)
                            await conn.execute("INSERT INTO schema_migrations (filename) VALUES ($1)", name)
                        print("done")
                        count += 1
                    except Exception:
                        print("FAILED")
                        raise

            print(f"{count} migration(s) applied on [{source}]." if count else f"[{source}] Database is up to date.")
    finally:
        await pool.close()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as error:  # noqa: BLE001
        # repr, not str: a timeout's message is empty, which used to exit with nothing printed
        print(f"Failed: {error!r}", file=sys.stderr)
        sys.exit(1)
