# Entopedia

AI-native pest and competitive intelligence platform for R&D, regulatory and
marketing teams. Built with Next.js 16 (App Router, Turbopack), React 19,
TypeScript and Tailwind CSS v4.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Visitors are sent to `/login` first. With no API
configured, any email and password signs in (see **Connecting to the Entopedia
API** below).

To try it from a phone or another laptop on the same Wi-Fi, open the `Network:`
address that `npm run dev` prints (for example `http://192.168.1.26:3000`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build — stop the dev server first; both write to `.next` |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |

## Modules

| Group | Route | Module |
| --- | --- | --- |
| Intelligence | `/` | Dashboard |
| | `/competitor-intelligence` | Competitor Intelligence (overview, patent landscaping, research papers, product library) |
| | `/patent-sheet-analyser` | Patent Sheet Analyser (load, set up, read, charts, heat maps, structure, export) |
| | `/regulatory-actives` | Regulatory & Actives (actives watch, registration monitor) |
| | `/news` | News |
| | `/deals-investments` | Deals & Investments |
| R&D & Claims | `/claim-studio` | Claim Studio AI |
| | `/claims-evidence` | Claims Evidence |
| | `/knowledge-hub` | Knowledge Hub & R&D |
| | `/pest-vision` | Pest Vision |
| Operations | `/newsletter` | Newsletter Studio |
| | `/deliverables` | Deliverable Generator |
| System | `/admin` | Admin |
| | `/audit` | Audit & Provenance |
| | `/settings` | Settings (from the profile menu) |

## Structure

- `src/app` — routes. `(app)/` holds every signed-in page and shares the
  sidebar/top-bar shell; `login/` is outside it. Global styles and design tokens
  are in `globals.css`.
- `src/components/<module>` — one folder per module, plus `ui/` (card, badge,
  tabs, ask box, thumbnail…), `charts/` and `dashboard/` (shell, sidebar, top bar).
- `src/lib` — data access (`api.ts`, `backend.ts`, `adapters.ts`), sign-in
  actions and session/JWT helpers, CSV export, chart maths, scroll-into-view hook.
- `src/proxy.ts` — verifies the session and redirects signed-out visitors to
  `/login`; limits `/admin` and `/audit` by role.
- `public` — images only. Everything here is publicly downloadable.
- `docs` — project documents (design brief). Not served.

## Design

- Fonts: **Poppins** for headings, **Arial** for body text.
- Brand green `#004736`, sidebar/top bar `#101917`, table headers `#E5E8E3`.
- Charts animate once when scrolled into view and respect *reduce motion*.

## Connecting to the Entopedia API

Without configuration the app runs on the sample data in `src/data`, and any
email and password sign in. To use the real backend (the Express API in
*Entopedia 2.0 Backend*):

1. Start the API and create users there (see its `INTEGRATION.md`).
2. `cp .env.example .env.local` and fill in `ENTOPEDIA_API_URL`,
   `ENTOPEDIA_API_EMAIL` / `ENTOPEDIA_API_PASSWORD` (the service account) and
   `ENTOPEDIA_JWT_SECRET` (the API's `JWT_SECRET`).
3. `npm run dev`. Sign in with a user that exists in the API.

How it fits together:

- **Sign-in** (`src/lib/auth-actions.ts`) posts to the API's `/auth/login` and
  keeps the returned JWT in an httpOnly cookie. **Sign-out** deletes it on
  the server.
- **`src/proxy.ts`** verifies that cookie's signature and expiry on every
  request. Signed-out visitors go to `/login`. `/admin` is limited to the
  `admin` role, and `/audit` to `admin` and `regulatory_specialist`, matching
  the API's own checks.
- **Page data** (`src/lib/api.ts`) is read on the server with a service account
  (`src/lib/backend.ts`). Cached data functions cannot read cookies, and tokens
  must not become cache keys. Each response is converted into the shape of its
  sample by `src/lib/adapters.ts`, so components are unchanged.
- **15 of the 26 data resources** come from the API. The other 11 (launch
  signals, strategic filings, research papers, product library, registrations,
  deals, investors, the three Knowledge Hub lists, newsletter approval chat)
  have no API endpoint yet and still show sample data. `dataSource(resource)` in
  `src/lib/api.ts` reports which is which.
- Where the API has no figure (competitor SKUs and launches), the UI shows "—".
  The API has no patent grant status yet, so patents read as *Pending*.

## Not production-ready yet

- **Partly sample data.** See the 11 resources above. Edits, uploads, chats and
  deletions in the UI are still not saved.
- **AI features are not connected.** Q&A boxes, Claim Studio, Pest Vision
  identification, the patent reading model and PPT/PDF export all say so
  instead of faking a result. The API's `/claim/generate`, `/claim/pack-check`
  and `/competitor/q-and-a` still return placeholders, so they are not wired in.
- **The signed-in user's name** in the sidebar is still static.
- **Working exports:** CSV downloads (deals, actives, patent analyser charts and
  heat maps) and the deliverable outline (`.md`) are real.
- A few links have no destination yet: "Read analysis" on news items (no
  article page), "Forgot password?" and "Contact your admin" on the login page.
