# Entopedia 2.0 API Documentation

## Base URL
```
http://localhost:4000/api
```
(Local default. Set `PORT` in `.env`; the frontend's `ENTOPEDIA_API_URL` must point here.)

## Authentication
All endpoints except `/auth/*` require a Bearer token:
```
Authorization: Bearer <jwt_token>
```

---

## Authentication Endpoints

### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "John Doe"
}
```
**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "token": "eyJhbGc..."
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```
**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "marketing",
  "token": "eyJhbGc..."
}
```

### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "token": "eyJhbGc..."
}
```

---

## Dashboard Endpoints

### Get KPI Metrics
```http
GET /dashboard/kpis?range=30d
```
**Query Parameters:**
- `range`: `7d`, `30d`, `90d`, `ytd` (default: 30d)

**Response:**
```json
{
  "metrics": {
    "competitors": 45,
    "patents": 312,
    "news": 87,
    "threats": 8,
    "claims": 38,
    "alerts": 12
  },
  "trends": {
    "patents": [3, 5, 4, 6, 5, 7, 6, 7, 8, 9],
    "news": [20, 22, 25, 21, 24, 28, 26, 27, 30, 31],
    "claims": [0, 1, 0, 2, 1, 3, 2, 1, 4, 2],
    "alerts": [1, 0, 2, 1, 1, 3, 0, 2, 1, 2]
  },
  "timeRange": "30d"
}
```
`threats` counts patents with `threat_score >= 0.7` (the score is 0–1). `alerts` counts high/critical alerts. `trends` are weekly counts for the last 10 weeks, oldest first.
```
```

### Get Launch Momentum
```http
GET /dashboard/launch-momentum
```

### Get News Intelligence Flow
```http
GET /dashboard/news-flow
```

### Get Competitor Claim Matrix
```http
GET /dashboard/competitor-matrix
```

### Get Top Movers
```http
GET /dashboard/top-movers
```

### Get User Alerts
```http
GET /dashboard/alerts
```

---

## Competitor Intelligence Endpoints

### List Competitors
```http
GET /competitor?search=reckitt&limit=20&offset=0
```

### Get Competitor Profile
```http
GET /competitor/:id
```
**Response includes:**
- Products, actives, patents, registrations, threat score
- AI summary with sources

### Ask AI Question
```http
POST /competitor/q-and-a
Content-Type: application/json

{
  "question": "What are SC Johnson's recent filings?"
}
```

---

## Patent Endpoints

### List Patents
```http
GET /patent?filer=sc%20johnson&active_ingredient=pyrethrin&format=Aerosol&limit=50&offset=0
```

### Patent Landscaping
```http
GET /patent/landscaping
```
**Response:**
```json
{
  "filer_active_heatmap": [...],
  "patent_cliff": [...]
}
```

### Find White Space
```http
GET /patent/white-space
```

### Upload Patent CSV
```http
POST /patent/upload-csv
Content-Type: application/json

{
  "data": [
    {"patent_number": "US123456", "filer": "Company A", ...}
  ]
}
```

---

## Claim Studio Endpoints

### Generate Claims
```http
POST /claim/generate
Content-Type: application/json

{
  "product_photo_url": "https://...",
  "product_description": "Fast-acting mosquito spray",
  "target_market": "EU"
}
```
**Response:**
```json
{
  "claims": [
    {
      "id": "uuid",
      "text": "Kills 99.9% of common household pests",
      "category": "efficacy",
      "confidence": 0.95
    }
  ],
  "compliance_by_market": {
    "EU": [...]
  }
}
```

### Pack Compliance Check
```http
POST /claim/pack-check
Content-Type: application/json

{
  "pack_image_url": "https://..."
}
```
**Response:**
```json
{
  "extracted_claims": [...],
  "compliance_check": {
    "approved": 5,
    "flagged": 1
  }
}
```

### Get Evidence Matrix
```http
GET /claim/evidence-matrix
```

---

## Pest Vision Endpoints

### Identify Pest
```http
POST /pest-vision/identify
Content-Type: application/json

{
  "photo_url": "https://..."
}
```
**Response:**
```json
{
  "id": "uuid",
  "species": "Culex quinquefasciatus",
  "confidence": 0.94,
  "similar_species": ["Culex pipiens", "Aedes aegypti"],
  "biology": {...},
  "related_products": [...],
  "related_research": [...]
}
```

### Get Identification History
```http
GET /pest-vision/history
```

### Get Species Encyclopedia
```http
GET /pest-vision/encyclopedia/:species
```

---

## Regulatory Endpoints

### List Active Ingredients
```http
GET /regulatory/actives?market=EU&active_ingredient=pyrethrin&limit=50&offset=0
```

### Get Active Ingredient Details
```http
GET /regulatory/active/:id
```

### Get Market Regulations
```http
GET /regulatory/market/:market
```
**Example:**
```http
GET /regulatory/market/EU
```

---

## News Endpoints

### Get News Feed
```http
GET /news?category=Regulation&limit=50&offset=0
```
**Query Parameters:**
- `category`: Regulation, M&A, Research, etc.
- `saved_only`: `true` to get only saved articles

### Get News Categories
```http
GET /news/categories/list
```

### Save News Article
```http
POST /news/:id/save
```

### Add to Newsletter
```http
POST /news/:id/add-to-newsletter
Content-Type: application/json

{
  "newsletter_id": "uuid"
}
```

---

## AI Integration Endpoints

### Ask Question (Multi-Module)
```http
POST /ai/ask
Content-Type: application/json

{
  "question": "What are the regulatory risks for pyrethroid in EU?",
  "modules": ["regulatory", "patent", "competitor"]
}
```
**Response:**
```json
{
  "query_id": "uuid",
  "answer": "AI-generated answer with sources",
  "sources": [...],
  "confidence_level": "high",
  "tokens_used": 245
}
```

### Summarize Content
```http
POST /ai/summarize
Content-Type: application/json

{
  "content": "Long patent document...",
  "type": "patent"
}
```

### Get AI Query Log
```http
GET /ai/query-log?limit=50&offset=0
```

---

## Admin Endpoints

### List Users
```http
GET /admin/users?limit=50&offset=0
```

### Set User Module Access
```http
POST /admin/users/:user_id/access
Content-Type: application/json

{
  "module_id": "550e8400-e29b-41d4-a716-446655440001",
  "access_level": "edit"
}
```

### Get Module List
```http
GET /admin/modules
```

### Get Usage Metrics
```http
GET /admin/usage-metrics?period=30d
```

---

## Audit Endpoints

### Get AI Query Audit Log
```http
GET /audit/ai-queries?user_id=uuid&module=patent&limit=50&offset=0
```

### Get Access Log
```http
GET /audit/access-log?user_id=uuid&module_id=uuid&limit=50&offset=0
```

### Get Data Provenance
```http
GET /audit/data-provenance/:source_id
```

---

## User Endpoints

### Get User Profile
```http
GET /user/profile
```

### Update Profile
```http
PUT /user/profile
Content-Type: application/json

{
  "name": "Jane Doe"
}
```

### Get Saved Searches
```http
GET /user/saved-searches
```

### Save Search
```http
POST /user/saved-searches
Content-Type: application/json

{
  "name": "My Patent Search",
  "query": "filer:SC Johnson active_ingredient:pyrethrin",
  "modules": ["patent"]
}
```

### Get User Alerts
```http
GET /user/alerts
```

---

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "status": 400
}
```

**Common Status Codes:**
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden (insufficient access)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

---

## Rate Limiting

Currently unlimited, but implement:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

## Webhooks (Future)

- Patent filed
- Competitor activity detected
- Regulatory change
- AI query completed


---

## Integration update (Step 1, Nov 2026)

Changes made while connecting the Next.js frontend. All are additive except where a route was broken before.

### Fixed (these routes returned 500 before)
| Endpoint | Problem | Fix |
|---|---|---|
| `GET /dashboard/kpis`, `GET /admin/usage-metrics` | `NOW() - INTERVAL $1` is invalid SQL | `NOW() - $1::interval`; `30d`/`12w`/`6m`/`1y`/`ytd` accepted |
| `GET /dashboard/launch-momentum` | used a `competitor_name` column that `patents` does not have | groups by `filer` (still returned as `competitor_name`) |
| `GET /patent` | count query was built with `query.replace(...)` → invalid SQL | count reuses the same `WHERE` clause |
| `GET /patent/white-space` | used an `active_ingredient` column that `patents` does not have | unnests `active_ingredients` |
| `GET /admin/modules` | `group` is a reserved word | quoted as `"group"` (also in migrations 01 and 02, which failed to run) |
| `GET /claim/evidence-matrix`, `GET /claim/:id` | `paper_studies` table did not exist | created in migration 04 |
| `GET /pest-vision/encyclopedia/:species` | `pest_related_content` table did not exist | created in migration 04 |

DATE columns are now returned as `YYYY-MM-DD` strings (they were shifted a day back in UTC when the server runs east of Greenwich).

### Changed responses (new fields only)
- `GET /competitor` — each row adds `patent_count`, `active_filing_count` (last 18 months), `format_count`.
- `GET /dashboard/news-flow?granularity=month&months=6` — monthly counts (`month` field) for the last N calendar months. Without `granularity` the original weekly/90-day response is unchanged.
- `GET /dashboard/alerts` — also returns organisation-wide alerts (`user_id IS NULL`).
- `GET /patent/white-space?full=1` — adds `actives`, `formats` and the full `coverage` grid.
- `GET /claim/evidence-matrix` — rows add `id`, `category`, `compliance_status` (JSON: `pest`, `format`, `market`, optional `status`) and `evidence_count`.
- `GET /admin/users` — rows add `modules` (names with access) and `access_levels`.
- `GET /admin/usage-metrics` — adds `active_accounts`, `modules_total`, `modules_active`.
- `GET /audit/ai-queries` — rows add `user_name` and `source_titles`.

### New
```http
GET /pest-vision/pests?type=Mosquito&q=aedes
```
Encyclopedia listing: `{ "data": [{ "species", "common_name", "pest_type", "regions", "biology", "resistance_notes", "image_url" }], "total" }`.

### Previously undocumented endpoints
- `GET /health` (no auth) — `{ "status": "ok", "timestamp" }`
- `GET /news/:id`
- `GET /claim/:id` — claim plus its `evidence` rows
- `GET /admin/users/:id/access` — `{ "access": [{ "module_id", "access_level" }] }`
- `GET /audit/ai-queries/:id` — query plus its `sources`
- `POST /user/notification-preferences` — body `{ "preferences": { … } }`
- `DELETE /user/saved-searches/:id`

### Not yet usable from the frontend
`POST /claim/generate` and `POST /claim/pack-check` return fixed placeholder claims (and `generate` logs them as an AI query); `POST /competitor/q-and-a` returns a placeholder answer; `GET /competitor/:id` queries a `product_name` column that does not exist; `GET /dashboard/competitor-matrix` joins on a `patent_id` column that does not exist. These are left for Step 2.
