-- 06_news_quality.sql
--
-- Better brand-news sorting and a sturdier refresh lock. All changes are additive.

-- The company that owns a brand ("Godrej Consumer Products" for HIT). Company news (results, shares)
-- then goes to the company's own row when that is tracked, instead of to every brand it owns.
ALTER TABLE news_brands ADD COLUMN IF NOT EXISTS company VARCHAR(120);

UPDATE news_brands SET company = 'Godrej Consumer Products' WHERE company IS NULL AND name IN ('Good Knight', 'HIT');
UPDATE news_brands SET company = 'Reckitt'                  WHERE company IS NULL AND name = 'Mortein';
UPDATE news_brands SET company = 'SC Johnson'               WHERE company IS NULL AND name = 'All Out';

-- Verdicts remember which prompt gave them. When the prompt changes, older verdicts are asked again
-- instead of being reused. 'company' = about the brand's company, not the brand.
ALTER TABLE news_story_verdicts ADD COLUMN IF NOT EXISTS prompt_version INT NOT NULL DEFAULT 1;
ALTER TABLE news_story_verdicts DROP CONSTRAINT IF EXISTS news_story_verdicts_relevance_check;
ALTER TABLE news_story_verdicts ADD CONSTRAINT news_story_verdicts_relevance_check
  CHECK (relevance IN ('brand', 'company', 'related', 'unrelated'));

-- The same headline saved for several brands is shown once on the News page, with every brand on it.
ALTER TABLE news ADD COLUMN IF NOT EXISTS headline_key VARCHAR(32)
  GENERATED ALWAYS AS (md5(btrim(regexp_replace(lower(title), '[^[:alnum:]]+', ' ', 'g')))) STORED;
CREATE INDEX IF NOT EXISTS idx_news_headline_key ON news (headline_key);

-- A running refresh writes a heartbeat every minute. A refresh is stuck (its process stopped) only when
-- the heartbeat is old, however long the refresh itself takes.
ALTER TABLE news_refresh_runs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;
