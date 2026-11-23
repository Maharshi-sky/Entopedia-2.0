-- Remove the demo rows that `npm run db:demo` (src/migrations/demo/01_demo_data.sql) inserted.
-- Every demo row has a fixed id: '<prefix>-0000-4000-8000-...'. Real rows have random ids, so they are not touched.
-- Run in the Supabase SQL Editor: first part 1 (preview), then part 2 (delete).

-- ── 1. Preview: how many demo rows are in each table ──────────────────────────
SELECT 'news'                 AS table_name, count(*) FROM news                 WHERE id::text LIKE 'a1000000-0000-4000-8000-%' OR (origin = 'manual' AND url LIKE 'https://example.com/%')
UNION ALL SELECT 'alerts',               count(*) FROM alerts               WHERE id::text LIKE 'a2000000-0000-4000-8000-%'
UNION ALL SELECT 'ai_queries',           count(*) FROM ai_queries           WHERE id::text LIKE 'a3000000-0000-4000-8000-%'
UNION ALL SELECT 'ai_sources',           count(*) FROM ai_sources           WHERE id::text LIKE 'a4000000-0000-4000-8000-%' OR query_id::text LIKE 'a3000000-0000-4000-8000-%'
UNION ALL SELECT 'patents',              count(*) FROM patents              WHERE id::text LIKE 'b1000000-0000-4000-8000-%'
UNION ALL SELECT 'regulations',          count(*) FROM regulations          WHERE id::text LIKE 'c1000000-0000-4000-8000-%'
UNION ALL SELECT 'product_claims',       count(*) FROM product_claims       WHERE id::text LIKE 'd1000000-0000-4000-8000-%'
UNION ALL SELECT 'paper_studies',        count(*) FROM paper_studies        WHERE id::text LIKE 'e1000000-0000-4000-8000-%' OR paper_id LIKE 'DEMO-PAPER-%'
UNION ALL SELECT 'pest_encyclopedia',    count(*) FROM pest_encyclopedia    WHERE id::text LIKE 'f1000000-0000-4000-8000-%'
UNION ALL SELECT 'pest_related_content', count(*) FROM pest_related_content WHERE id::text LIKE 'f2000000-0000-4000-8000-%';

-- Demo pests that YOU added your own related content to (these pests are kept by part 2; delete by hand if you want):
SELECT p.species, count(*) AS your_rows
  FROM pest_encyclopedia p JOIN pest_related_content r ON r.species = p.species
 WHERE p.id::text LIKE 'f1000000-0000-4000-8000-%' AND r.id::text NOT LIKE 'f2000000-0000-4000-8000-%'
 GROUP BY p.species;

-- ── 2. Delete (children first; all or nothing) ────────────────────────────────
BEGIN;

-- News: drop newsletter links first (that foreign key has no cascade); saved_news rows go with the story.
DELETE FROM newsletter_items
 WHERE news_id IN (SELECT id FROM news WHERE id::text LIKE 'a1000000-0000-4000-8000-%' OR (origin = 'manual' AND url LIKE 'https://example.com/%'));
DELETE FROM news
 WHERE id::text LIKE 'a1000000-0000-4000-8000-%' OR (origin = 'manual' AND url LIKE 'https://example.com/%');

-- AI Assistant demo history.
DELETE FROM ai_sources WHERE id::text LIKE 'a4000000-0000-4000-8000-%' OR query_id::text LIKE 'a3000000-0000-4000-8000-%';
DELETE FROM ai_queries WHERE id::text LIKE 'a3000000-0000-4000-8000-%';
DELETE FROM alerts     WHERE id::text LIKE 'a2000000-0000-4000-8000-%';

-- Claims, papers, patents, regulations.
DELETE FROM paper_studies  WHERE id::text LIKE 'e1000000-0000-4000-8000-%' OR paper_id LIKE 'DEMO-PAPER-%'
                              OR claim_id::text LIKE 'd1000000-0000-4000-8000-%';
DELETE FROM product_claims WHERE id::text LIKE 'd1000000-0000-4000-8000-%';
DELETE FROM patents        WHERE id::text LIKE 'b1000000-0000-4000-8000-%';
DELETE FROM regulations    WHERE id::text LIKE 'c1000000-0000-4000-8000-%';

-- Pests: demo related content, then demo pests that have none of your own content left.
DELETE FROM pest_related_content WHERE id::text LIKE 'f2000000-0000-4000-8000-%';
DELETE FROM pest_encyclopedia p
 WHERE p.id::text LIKE 'f1000000-0000-4000-8000-%'
   AND NOT EXISTS (SELECT 1 FROM pest_related_content r WHERE r.species = p.species);

COMMIT;

-- ── 3. Check: run part 1 again; every count should be 0. ──────────────────────
