# Connecting the frontend (Step 1)

What changed so the Next.js frontend can read from this API, and how to run the two together.

## Run it locally

```bash
npm install
cp .env.example .env            # then set DB_*, JWT_SECRET (required), ANTHROPIC_API_KEY
npm run db:migrate              # applies src/migrations/*.sql once each (tracked in schema_migrations)
npm run db:demo                 # optional: fictional demo rows for local/staging only
npm run db:seed -- --email you@company.com --password '<10+ chars>' --name 'Your Name' --role admin
npm run db:seed -- --email svc-frontend@company.com --password '<10+ chars>' --name 'Frontend service' --role admin
npm run dev                     # http://localhost:4000/api
```

The second seeded user is the **service account** the frontend's server reads data with. Put its email and password in the frontend's `.env.local` as `ENTOPEDIA_API_EMAIL` / `ENTOPEDIA_API_PASSWORD`, and put this `JWT_SECRET` there as `ENTOPEDIA_JWT_SECRET`. It needs the `admin` role because the Admin and Audit pages read `/api/admin/*` and `/api/audit/*`.

`POST /api/auth/register` always creates a `marketing` user, so `npm run db:seed` is how you create admins. Roles in use: `admin`, `regulatory_specialist`, `marketing`.

Redis is optional for now: no route uses it, so the API logs a warning and keeps running when Redis is not reachable.

## What was fixed

**The project did not install or build as delivered.**
- `jsonwebtoken@^9.1.0` does not exist on npm, so `npm install` failed → `^9.0.2`.
- `tsc` reported 77 type errors, so `npm run build` failed, and `npm run dev` (ts-node-dev type-checks) could not start. Wired code is now clean. Missing `@types/*` packages were added. `@anthropic-ai/sdk` went from 0.9 (no `messages` API) to 0.39.
- `src/services/` and `src/websocket/` are excluded from the build for now. Nothing imports them, and their packages (bull, socket.io, Elasticsearch) are not installed. Wiring them is Step 2.
- `db:migrate` and `db:seed` pointed at files that did not exist. They now exist (`src/migrations/index.ts`, `seed.ts`).

**The database schema could not be created.** `01_initial_schema.sql` failed on the unquoted reserved word `group`, and `02` used it too. Migration `04_integration_fixes.sql` adds the `paper_studies` and `pest_related_content` tables that routes already queried, plus `common_name`, `pest_type` and `image_url` on `pest_encyclopedia`.

**Security.**
- The JWT secret no longer falls back to the string `'secret'`, and the server will not start without `JWT_SECRET`.
- Disabled users (`is_active = false`) can no longer sign in.

**Routes.** Six routes returned 500 errors; they are fixed and a few responses gained fields. See *Integration update* at the end of `API.md`.

## Endpoints the frontend reads (15 of its 26 data resources)

| Frontend resource | API endpoint |
|---|---|
| dashboardMetrics | `GET /dashboard/kpis?range=30d` |
| competitorMomentum | `GET /dashboard/launch-momentum` |
| newsFlow | `GET /dashboard/news-flow?granularity=month&months=6` |
| signals | `GET /dashboard/alerts` |
| news | `GET /news?limit=100` |
| competitorProfiles | `GET /competitor?limit=100` |
| whiteSpace | `GET /patent/white-space?full=1` |
| patents | `GET /patent?limit=200` |
| actives | `GET /regulatory/actives?limit=500` |
| claimsEvidence | `GET /claim/evidence-matrix` |
| pests | `GET /pest-vision/pests` (new) |
| adminKpis, moduleUsage | `GET /admin/usage-metrics?period=30d` |
| users | `GET /admin/users?limit=200` |
| auditLog | `GET /audit/ai-queries?limit=100` |

Still served from the frontend's sample data, because this API has no endpoint for them yet (Step 2): launch signals, strategic filings, research papers, product library, registrations, deals, investors, knowledge queue/assets/questions, newsletter approval chat.

## Known gaps (Step 2)

- `POST /claim/generate`, `POST /claim/pack-check` and `POST /competitor/q-and-a` return placeholder content. Do not connect them to the UI until they call the AI service.
- `GET /competitor/:id` queries a non-existent `product_name` column, and `GET /dashboard/competitor-matrix` joins on a non-existent `patent_id`.
- `patents` has no grant-status column, so the frontend shows every patent as *Pending*. Competitors have no SKU or launch counts, so the frontend shows "—".
- `POST /patent/upload-csv` does not store anything yet.
- `.env` is included in the project folder. Keep it out of source control and shared zips (`.gitignore` already lists it).
