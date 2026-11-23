-- 11_knowledge_chats.sql
--
-- Knowledge Hub conversations: each question and answer (a row in ai_queries) belongs to a chat,
-- so people can start a new chat and go back to earlier ones. Questions asked before this existed
-- are gathered into one chat per user, "Earlier questions". Additive.

CREATE TABLE IF NOT EXISTS knowledge_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chats_user_updated ON knowledge_chats (user_id, updated_at DESC);

ALTER TABLE ai_queries ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES knowledge_chats(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_queries_chat ON ai_queries (chat_id, created_at);

-- Earlier Knowledge Hub questions: one "Earlier questions" chat per user who asked any.
WITH users_with_questions AS (
  SELECT user_id, MIN(created_at) AS first_at, MAX(created_at) AS last_at
    FROM ai_queries
   WHERE 'knowledge-hub' = ANY(modules) AND chat_id IS NULL AND user_id IS NOT NULL
   GROUP BY user_id
), created AS (
  INSERT INTO knowledge_chats (user_id, title, created_at, updated_at)
  SELECT user_id, 'Earlier questions', first_at, last_at FROM users_with_questions
  RETURNING id, user_id
)
UPDATE ai_queries q SET chat_id = c.id
  FROM created c
 WHERE q.user_id = c.user_id AND 'knowledge-hub' = ANY(q.modules) AND q.chat_id IS NULL;
