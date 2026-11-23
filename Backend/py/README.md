# Entopedia 2.0 Backend — Python port

A 1:1 port of the original TypeScript/Express backend to Python, using FastAPI.
The original `src/`, `dist/` and `jest.config.js` have been removed now that this
port is the project's only implementation. Same routes, same request/response
shapes, same database schema (the SQL migrations live in `migrations_sql/`).

## Stack

- **FastAPI** + Uvicorn (ASGI) in place of Express
- **asyncpg** in place of `pg` (Supabase-first with local Docker Postgres fallback,
  including the mid-query failover behaviour of the original `db/connection.ts`)
- **redis-py (asyncio)** in place of `redis` v4
- **PyJWT** + **bcrypt** in place of `jsonwebtoken` / `bcryptjs`
- **httpx** + **BeautifulSoup4** in place of the Node `fetch` + `cheerio` news scraper
- **APScheduler** in place of `node-cron`
- **python-socketio** in place of `socket.io` (websocket/socket.py mirrors the
  original, which is likewise not mounted by the app)
- **anthropic**, **elasticsearch**, **aiohttp** mirror the corresponding JS/TS SDKs

## Layout

```
app/
  main.py              FastAPI app (the original index.ts's entry point)
  db/                  connection.py, redis_client.py
  middleware/auth.py    JWT verification + role guard
  routes/              one module per original *.routes.ts file
  services/            ai, cache, notification, analytics, amazon scraper, queue, search
  news/                Google News scraper, classifier, image lookup/proxy, store, refresh, scheduler, cli
  migrations/          run.py / seed.py (apply the SQL files in migrations_sql/)
  utils/               logger.py, range.py
  websocket/socket.py  Socket.IO mirror of the original websocket/socket.ts (not wired into main.py, as in the original)
migrations_sql/        schema SQL, unchanged from the original src/migrations
```

## Running

Needs Python 3.11 or newer (`python --version`).

Windows PowerShell, from the `py` folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt

copy ..\.env.example ..\.env      # same .env file as the TypeScript backend (keep it out of zips)
uvicorn app.main:app --reload --port 4000
```

macOS/Linux: `source .venv/bin/activate` and `cp ../.env.example ../.env`.

The port must be 4000 (the frontend's `ENTOPEDIA_API_URL`); plain `uvicorn app.main:app` would use 8000.

CLI equivalents of the original `npm run` scripts:

```
python -m app.migrations.run [--demo]
python -m app.migrations.seed --email you@example.com --password ...
python -m app.news.cli refresh|images|rejudge [options]
```

## Differences from node-postgres that the port handles

`app/db/connection.py` sets codecs on every connection so that asyncpg behaves like `pg` did: json/jsonb
come back as objects, uuid as text, date/timestamp parameters accept ISO strings, and zone-less timestamps
are returned as UTC. Without them login fails (a UUID cannot go into the JWT), news cannot be saved (ISO
dates rejected) and the News page gets `brands` as a string. Interval parameters are passed as text
(`$1::text::interval`). Fire-and-forget work uses `app.utils.tasks.spawn`, which keeps the task alive.

## Tests

`tests/news/` is a 1:1 port of the four `*.test.ts` files next to the news scraper
(`classifier`, `googleNews`, `imageProxy`, `images`) — same cases, same assertions,
using pytest + pytest-httpx in place of Jest + mocked `fetch`.

```
pytest
```
