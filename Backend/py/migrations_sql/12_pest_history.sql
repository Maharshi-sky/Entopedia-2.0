-- 12_pest_history.sql
--
-- Pest Vision history. Each identification is its own row (its own id); a photo is recognised by the
-- SHA-256 of its bytes, never by its file name, so two different photos that share a name are never
-- mixed up, and the same photo uploaded again under any name can reuse its earlier answer.
--
--   image_sha256    fingerprint of the picture the model looked at
--   thumbnail       small JPEG (data URL) so the history shows the actual photo
--   result          the full answer as returned to the page
--   model, prompt_version   an earlier answer is reused only if both still match
--   outcome         identified | unlisted | no_pest | unsure
-- photo_url keeps the file name as uploaded (display only). Additive.

ALTER TABLE pest_identifications
  ADD COLUMN IF NOT EXISTS image_sha256   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS thumbnail      TEXT,
  ADD COLUMN IF NOT EXISTS result         JSONB,
  ADD COLUMN IF NOT EXISTS model          VARCHAR(80),
  ADD COLUMN IF NOT EXISTS prompt_version INT,
  ADD COLUMN IF NOT EXISTS outcome        VARCHAR(12);

CREATE INDEX IF NOT EXISTS idx_pest_identifications_sha ON pest_identifications (image_sha256, model, prompt_version);
CREATE INDEX IF NOT EXISTS idx_pest_identifications_user ON pest_identifications (user_id, identified_at DESC);

-- Rows from before this change were all named species.
UPDATE pest_identifications SET outcome = 'identified' WHERE outcome IS NULL;
