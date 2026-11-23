-- 07_user_activity.sql
--
-- User activity for the Admin page. The tables user_activity_log and access_log
-- already exist (01/03); this adds what the API now writes and reads. Additive only.
--
--   user_activity_log  logins, failed logins, logouts, admin changes to users
--   access_log         one row per module a user opens (at most one per user,
--                      module and 5 minutes)
--   ai_queries         every AI call, as before, now from every AI feature

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_activity_log_created ON user_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user ON user_activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_accessed ON access_log (accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_user_module ON access_log (user_id, module_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_queries_created ON ai_queries (created_at DESC);
