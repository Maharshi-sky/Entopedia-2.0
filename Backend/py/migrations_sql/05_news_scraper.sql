-- 05_news_scraper.sql
--
-- Brand news from Google News (port of the Python brand_news_check service).
-- Scraped stories live in the existing `news` table, so the dashboard's news
-- chart, saved news and newsletters keep working on the same rows.
--
-- Safe to run on a database that already has news: every change is additive,
-- existing rows get origin = 'manual' and keep their data.

-- Scraped rows are inserted without an id from the app.
ALTER TABLE news ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Publication times are stored as real instants. Existing values were written
-- as UTC (NOW() on a UTC database), so they are read as UTC here.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'news' AND column_name = 'published_date') = 'timestamp without time zone' THEN
    ALTER TABLE news ALTER COLUMN published_date TYPE TIMESTAMPTZ USING published_date AT TIME ZONE 'UTC';
  END IF;
END $$;

ALTER TABLE news
  ADD COLUMN IF NOT EXISTS origin          VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'google_news' for scraped stories
  ADD COLUMN IF NOT EXISTS story_key       VARCHAR(32),   -- md5(brand | normalised headline): one row per brand + headline
  ADD COLUMN IF NOT EXISTS brand           VARCHAR(120),
  ADD COLUMN IF NOT EXISTS kind            VARCHAR(10),   -- 'brand' (about the brand) | 'related' (its category or a competitor)
  ADD COLUMN IF NOT EXISTS source_category VARCHAR(40),   -- the scraper's own label, e.g. 'product launch'; `category` holds the app's
  ADD COLUMN IF NOT EXISTS article_url     TEXT,          -- the publisher's page (url keeps the Google News link)
  ADD COLUMN IF NOT EXISTS image_url       TEXT,
  ADD COLUMN IF NOT EXISTS image_checked   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS image_error     TEXT,
  ADD COLUMN IF NOT EXISTS search_query    TEXT,
  ADD COLUMN IF NOT EXISTS country         VARCHAR(2),
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_kind_check') THEN
    ALTER TABLE news ADD CONSTRAINT news_kind_check CHECK (kind IS NULL OR kind IN ('brand', 'related'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_story_key ON news (story_key);
CREATE INDEX IF NOT EXISTS idx_news_brand_published ON news (brand, published_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_url ON news (url);
CREATE INDEX IF NOT EXISTS idx_news_image_pending ON news (published_date DESC)
  WHERE origin = 'google_news' AND image_checked = FALSE;

-- The brands to track (was brands.txt). One row per brand:
--   about         optional; helps the AI drop stories about something else
--   search_terms  optional; for a name that is also an ordinary phrase, each
--                 term becomes its own search ("All Out" mosquito, ...)
CREATE TABLE IF NOT EXISTS news_brands (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL UNIQUE,
  about        TEXT NOT NULL DEFAULT '',
  search_terms TEXT[] NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO news_brands (name, about, search_terms) VALUES
  ('Mortein', 'Reckitt''s mosquito and insect repellent brand', '{}'),
  ('Godrej',  'the Godrej group, especially Godrej Consumer Products (Good Knight, HIT, Cinthol)', '{}'),
  ('All Out', 'SC Johnson''s mosquito repellent brand in India', '{mosquito,repellent,"SC Johnson",vaporiser}')
ON CONFLICT (name) DO NOTHING;

-- Every verdict the AI gave, including "unrelated" stories that are not saved as news. A headline is sent to
-- the model once; later refreshes reuse the verdict, so dropped stories do not come back when a refresh runs
-- with keyword sorting only (Ollama stopped).
CREATE TABLE IF NOT EXISTS news_story_verdicts (
  story_key  VARCHAR(32) PRIMARY KEY,
  brand      VARCHAR(120) NOT NULL,
  title      TEXT NOT NULL,
  relevance  VARCHAR(10) NOT NULL CHECK (relevance IN ('brand', 'related', 'unrelated')),
  category   VARCHAR(40),
  model      VARCHAR(80) NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per refresh, for the status endpoint and the admin page.
CREATE TABLE IF NOT EXISTS news_refresh_runs (
  id           SERIAL PRIMARY KEY,
  status       VARCHAR(10) NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  started_by   VARCHAR(10) NOT NULL CHECK (started_by IN ('admin', 'schedule', 'cli')),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  days         INT NOT NULL,
  country      VARCHAR(2) NOT NULL,
  ai_model     VARCHAR(80),             -- NULL = keyword sorting only
  brands       TEXT[] NOT NULL DEFAULT '{}',
  found        INT,                     -- stories Google returned (after duplicates)
  saved        INT,                     -- stories kept and saved
  dropped      INT,                     -- unrelated stories removed
  with_image   INT,
  notes        JSONB,                   -- per-brand search results and warnings
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_news_refresh_runs_started ON news_refresh_runs (started_at DESC);
