-- 09_knowledge_hub.sql
--
-- Knowledge Hub: files people upload (PDF, Excel, Word, CSV, text), their text split into chunks,
-- and full-text search over the chunks for "Ask Knowledge Hub". Shared by every user.

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,   -- who uploaded it
  filename      VARCHAR(255) NOT NULL,
  file_type     VARCHAR(10)  NOT NULL,                          -- pdf | xlsx | docx | csv | txt
  file_size     INT          NOT NULL,
  storage_path  TEXT         NOT NULL,                          -- under UPLOAD_DIR/knowledge
  status        VARCHAR(12)  NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'indexed', 'failed')),
  error         TEXT,
  pages         INT,                                            -- PDF pages / Excel sheets
  chunks        INT,
  chars         INT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  indexed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_created ON knowledge_documents (created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id           BIGSERIAL PRIMARY KEY,
  document_id  UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  idx          INT  NOT NULL,                                   -- order within the document
  page         INT,                                             -- PDF page / sheet number, when known
  content      TEXT NOT NULL,
  tsv          TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv ON knowledge_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks (document_id, idx);
