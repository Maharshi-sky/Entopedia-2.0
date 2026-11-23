-- Turn on Row Level Security for every table in the public schema (Supabase "RLS disabled" warning).
--
-- Why it is safe for Entopedia: the backend connects as the `postgres` user, which owns these tables, and a
-- table's owner is not limited by RLS (we do NOT use FORCE ROW LEVEL SECURITY). The app keeps working.
-- What it changes: Supabase's public REST/GraphQL API (the anon and authenticated keys) can no longer read or
-- write these tables, because no policy allows it. Entopedia does not use that API, so nothing breaks.
--
-- Safe to run again: re-run it after any new migration that adds a table.

-- ── 1. Enable ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    RAISE NOTICE 'RLS enabled on %', t.tablename;
  END LOOP;
END $$;

-- ── 2. Check: every row should say true ───────────────────────────────────────
SELECT tablename, rowsecurity AS rls_on, tableowner
  FROM pg_tables
 WHERE schemaname = 'public'
 ORDER BY rowsecurity, tablename;

-- ── To undo (only if something needs the REST API): ───────────────────────────
-- DO $$ DECLARE t record; BEGIN
--   FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
--   END LOOP;
-- END $$;
