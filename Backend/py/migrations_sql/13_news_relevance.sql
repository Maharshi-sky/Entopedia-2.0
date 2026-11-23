-- 13_news_relevance.sql
--
-- Tighter brand news (see app/news/rules.py). Additive.
--
--   news_brands.exclude_terms     words added to every search as -"term" (Google News excludes them)
--   news_brands.requires_context  the brand name is also an everyday word ("HIT", "Raid", "All Out"):
--                                 a headline counts as about the brand only with a product word in it
--   news.kind = 'company'         company news (results, leadership), shown only when asked for
--   news.source_in                published by an Indian outlet
--   news.cluster_key              stories reporting the same event share one key (shown once)
--   news_story_verdicts model='human'   an admin's "not relevant"; always wins over the model

ALTER TABLE news_brands
  ADD COLUMN IF NOT EXISTS exclude_terms    TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_context BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE news DROP CONSTRAINT IF EXISTS news_kind_check;
ALTER TABLE news ADD CONSTRAINT news_kind_check CHECK (kind IS NULL OR kind IN ('brand', 'related', 'company'));

ALTER TABLE news
  ADD COLUMN IF NOT EXISTS source_in   BOOLEAN,
  ADD COLUMN IF NOT EXISTS cluster_key VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_news_cluster_key ON news (cluster_key);

-- Everyday-word brand names.
UPDATE news_brands SET requires_context = TRUE WHERE name IN ('HIT', 'Raid', 'All Out', 'Good Knight', 'DND', 'Maxo');

-- Quoted search terms (unquoted single words matched almost anything) and per-brand exclusions.
UPDATE news_brands SET search_terms = ARRAY['"mosquito coil"', '"mosquito repellent"', '"liquid vaporizer"', '"Genius"']
 WHERE name = 'Maxo';
UPDATE news_brands SET search_terms = ARRAY['"mosquito repellent"', '"cockroach spray"', '"mosquito spray"']
 WHERE name = 'DND';
UPDATE news_brands SET search_terms = ARRAY['"mosquito repellent"', '"cockroach"', '"herbal repellent"']
 WHERE name = 'Herbal Strategi';

UPDATE news_brands SET exclude_terms = ARRAY['police', 'ED', 'income tax', 'CBI', 'NIA', 'film', 'movie', 'box office', 'Raid 2']
 WHERE name = 'Raid';
UPDATE news_brands SET exclude_terms = ARRAY['box office', 'hit and run', 'hit-and-run', 'film', 'song', 'cricket', 'hit back']
 WHERE name = 'HIT';
UPDATE news_brands SET exclude_terms = ARRAY['war', 'attack', 'strike', 'all-out war', 'cricket']
 WHERE name = 'All Out';
UPDATE news_brands SET exclude_terms = ARRAY['"good night"', 'goodnight', 'sleep']
 WHERE name = 'Good Knight';
UPDATE news_brands SET exclude_terms = ARRAY['"do not disturb"', 'dungeons']
 WHERE name = 'DND';

-- Earlier verdicts came largely from a smaller model and older rules: they are judged again
-- (PROMPT_VERSION 3, and the model is now part of the reuse check). Admin decisions (model='human') stay.
