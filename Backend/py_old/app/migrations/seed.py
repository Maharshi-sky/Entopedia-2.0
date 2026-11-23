"""
Create or update a user: `python -m app.migrations.seed --email <email> --password <password> [--name <name>] [--role <role>]`

Also supports environment variables (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) or defaults
so automated cloud deployments (Render) can seed the initial admin account without CLI flags.

Roles used by the API: admin, regulatory_specialist, marketing.
"""
import argparse
import asyncio
import os
import sys
import uuid

import asyncpg
import bcrypt
from dotenv import load_dotenv

load_dotenv()


async def _get_seed_connection() -> tuple[asyncpg.Pool, str]:
    supabase_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")

    if supabase_url:
        try:
            pool = await asyncpg.create_pool(dsn=supabase_url, ssl="require", min_size=1, max_size=2, timeout=5)
            print("Connected to PRIMARY database for seeding: Supabase PostgreSQL")
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
    print("Connected to FALLBACK database for seeding: Local Docker PostgreSQL")
    return pool, "LOCAL_DOCKER"


async def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--name")
    parser.add_argument("--role")
    args = parser.parse_args()

    email = args.email or os.getenv("SEED_ADMIN_EMAIL") or os.getenv("ENTOPEDIA_API_EMAIL") or "admin@entopedia.com"
    password = args.password or os.getenv("SEED_ADMIN_PASSWORD") or os.getenv("ENTOPEDIA_API_PASSWORD") or "Entopedia@2026"
    name = args.name or "Entopedia Admin"
    role = args.role or "admin"

    if len(password) < 10:
        print("Use a password of at least 10 characters.", file=sys.stderr)
        sys.exit(1)

    pool, source = await _get_seed_connection()

    try:
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
                   ON CONFLICT (email) DO UPDATE SET
                     name = EXCLUDED.name,
                     password_hash = EXCLUDED.password_hash,
                     role = EXCLUDED.role,
                     is_active = true,
                     updated_at = NOW()
                   RETURNING id, (xmax = 0) AS inserted""",
                str(uuid.uuid4()), email, name, password_hash, role,
            )
            user_id, inserted = row["id"], row["inserted"]

            if role == "admin":
                await conn.execute(
                    """INSERT INTO module_access (user_id, module_id, access_level)
                       SELECT $1, id, 'full' FROM modules
                       ON CONFLICT (user_id, module_id) DO UPDATE SET access_level = 'full'""",
                    user_id,
                )

            print(f"[{source}] {'Created' if inserted else 'Updated'} {role} user: {email}")
    finally:
        await pool.close()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as error:  # noqa: BLE001
        # repr, not str: a timeout's message is empty, which used to exit with nothing printed
        print(f"Failed: {error!r}", file=sys.stderr)
        sys.exit(1)
