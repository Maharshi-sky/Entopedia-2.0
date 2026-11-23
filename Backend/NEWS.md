# Brand news

Finds recent news for each tracked brand on Google News, keeps the stories that are really about the brand
(sorted by a local Ollama model), adds each article's publisher link and picture, and saves them in the
`news` table. The News page, the dashboard's Recent News and news chart, saved news and the newsletter all
read from that table.

This is a Node/TypeScript port of the Python `brand_news_check` service (FastAPI + MongoDB + OpenAI). The
logic is the same; three things changed:

| Python version | This version | Why |
| --- | --- | --- |
| MongoDB `Entopedia.news` | Postgres `news` table (+ `news_brands`, `news_refresh_runs`, `news_story_verdicts`) | One database; the dashboard, saved news and newsletter see the stories |
| OpenAI `gpt-4o-mini` | Local Ollama, `qwen2.5:7b` by default | No API cost; same prompt, JSON reply forced with a schema |
| `brands.txt` | `news_brands` table | Brands can be changed without a deploy |

Story keys are computed exactly as before (`md5(brand | normalised headline)`), so stories match across both.

## Setup

1. In `py/`: `pip install -r requirements.txt` (virtual environment active)
2. `python -m app.migrations.run` applies `05_news_scraper.sql` (news tables; seeds Mortein, Godrej and All Out) and
   `06_news_quality.sql` (brand `company`, verdict `prompt_version`, `news.headline_key`, refresh heartbeat).
   Both only add columns, tables and an index.
3. Ollama running with the model: `ollama pull qwen2.5:7b` (already installed on the dev laptop).
4. Optional, in `.env`: `ZYTE_API_KEY`, used only when Google News or a site refuses a direct request.
   See `.env.example` for every news setting.

## Fetch news

From the News page: **Refresh news** at the top (shown to the admin role only). It shows progress and the
result, then the News page and dashboard show the new stories.

From the command line (same options as the Python scripts):

```bash
python -m app.news.cli refresh                                   # every active brand, last 30 days, India
python -m app.news.cli refresh --brand "Mortein"              # one brand from news_brands
python -m app.news.cli refresh --brand "Baygon | Bayer's insect spray brand | spray"   # a brand not in the table
python -m app.news.cli refresh --days 7 --country US          # IN, US, UK, AU, SA, DE
python -m app.news.cli refresh --no-ai                        # keyword sorting only (no Ollama)
python -m app.news.cli refresh --no-images                    # skip looking up article pictures
python -m app.news.cli images                                    # pictures for stories not checked yet
python -m app.news.cli images --retry-blocked                 # also retry sites that refused (via Zyte when set)
python -m app.news.cli images --retry-failed                  # look again for every story without a picture
python -m app.news.cli images --report                        # what is missing a picture, and why
python -m app.news.cli rejudge                                   # judge saved stories again with the current prompt
python -m app.news.cli rejudge --brand HIT                    # only one brand
```

`news:rejudge` is for after a prompt or rule change (`PROMPT_VERSION` in `classifier.ts`): stories now judged
unrelated are removed, unless someone saved them or put them in a newsletter.

Automatic: set `NEWS_AUTO_REFRESH=true` and the API refreshes on `NEWS_REFRESH_CRON` (default every 6 hours,
Asia/Kolkata). Only one refresh runs at a time across the admin button, the schedule and the command line. A running
refresh writes a heartbeat every minute; one with no heartbeat for 10 minutes is taken as dead (the process
stopped) and marked failed, so a crash never blocks the button for long.

### Ollama and the deployed API

The API on Render cannot reach Ollama on your laptop, so a refresh started there falls back to keyword
sorting (the run says so). To keep AI sorting, run `python -m app.news.cli refresh` on the laptop with `.env`
pointing at the production database (Supabase): the stories land in the same table the deployed app reads.
Leave `NEWS_AUTO_REFRESH=false` on Render.

## How a refresh works

1. **Search**: for each brand, Google News RSS for `"Name"` (or `"Name" term` per extra search term), last N
   days, one country edition; duplicate headlines removed; 1 second between searches.
2. **Sort**: headlines not seen before go to the model in batches of 20 with the brand and its description.
   Each gets `brand` (about the brand), `company` (about the owning company, e.g. Godrej Consumer Products'
   results), `related` (its category or a competitor) or `unrelated` (dropped: the name used as a phrase,
   other group businesses, general news), plus a category. A `company` story is kept only under the
   company's own brand row when that is tracked, else as related. Market-research press releases
   ("Market Size, Share, Forecast 2034") are dropped by a rule without asking the model. Every verdict is
   remembered in `news_story_verdicts` with the prompt version, so a headline is sent once per prompt
   version, and dropped stories do not come back in a later keyword-only run.
3. **Fallback**: no Ollama or a failed batch means keyword sorting: a headline naming the brand is `brand`,
   the rest `related`.
4. **Pictures**: each Google link is resolved to the publisher's page and its `og:image` read (logos skipped).
   A site that refuses is retried through Zyte when a key is set; a temporary failure is retried by the next
   backfill (also run when the API starts).
5. **Save**: upsert on `story_key`, after each brand. The News page shows one card per headline: the same
   headline saved for several brands is grouped (`news.headline_key`) and carries a badge per brand.

Categories: the model picks the scraper's own label (kept in `news.source_category`), which is mapped to the
app's categories in `news.category`: product launch, marketing & ads → Product; regulatory & legal →
Regulatory; safety & recall → Safety; people & CSR → People & Company; review & opinion → Interviews;
business, stock market, competitor & market, other → Industry.

## Brands

```sql
INSERT INTO news_brands (name, about, search_terms, company)
VALUES ('Good Knight', 'Godrej Consumer Products'' mosquito repellent brand', '{mosquito,repellent}',
        'Godrej Consumer Products');

UPDATE news_brands SET is_active = FALSE WHERE name = 'Godrej';   -- pause a brand
```

`about` helps the model drop other meanings of the name. `search_terms` is for a name that is also an
ordinary phrase ("All Out"): each term becomes its own search. `company` is the owner: with it set, news about
the company alone goes to the company's row (track it as its own brand, e.g. "Godrej Consumer Products"). A
name written in capitals ("HIT") matches headlines in capitals only, so "Hit or Miss" is not the brand.

## Supabase SQL (run by hand in the SQL Editor)

- `supabase/remove-demo-data.sql`: removes the rows `python -m app.migrations.run --demo` inserted (fixed demo ids only). Run the
  preview part first.
- `supabase/enable-rls.sql`: turns on Row Level Security for every public table. The backend connects as the
  table owner, so it keeps working; Supabase's public REST API gets no access. Re-run after new migrations.

## API

All need a signed-in user; refresh needs the admin role.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/news?limit&offset&category&brand&kind=brand\|related&origin=google_news\|manual&saved_only=true` | Stories, newest first, with `brand`, `kind`, `article_url`, `image_url` |
| GET | `/api/news/brands` | Tracked brands with story counts |
| GET | `/api/news/:id/image` | The story's picture, fetched by the server (only public addresses, pictures only, 5 MB max) |
| POST | `/api/news/refresh?days=30&country=IN&ai=true&images=true&brand=Mortein` | 202 with the run; 409 when one is running |
| GET | `/api/news/refresh` | The latest run (`running`, `done`, `failed`) |

## Code

`py/app/news/`: `google_news.py` (search, dedupe, brand match), `classifier.py` (Ollama sorting),
`images.py` (publisher link and picture), `image_proxy.py`, `store.py` (database), `refresh.py` (one refresh,
the lock, backfill), `scheduler.py` (jobs started with the API), `cli.py` (commands). Tests: `pytest` in `py/`.
Run every `python -m ...` command from the `py` folder with the virtual environment active.
