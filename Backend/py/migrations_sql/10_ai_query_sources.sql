-- 10_ai_query_sources.sql
--
-- The sources an AI answer cited (e.g. Knowledge Hub excerpts: ref, document, page), so a
-- conversation can be shown again later with its citations. Additive.

ALTER TABLE ai_queries ADD COLUMN IF NOT EXISTS sources JSONB;

CREATE INDEX IF NOT EXISTS idx_ai_queries_user_created ON ai_queries (user_id, created_at DESC);
