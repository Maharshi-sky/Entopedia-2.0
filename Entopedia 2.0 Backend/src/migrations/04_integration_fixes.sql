-- 04: tables and columns the existing routes already query but no migration created.

-- Studies that substantiate a product claim.
-- Used by GET /api/claim/evidence-matrix and GET /api/claim/:id.
CREATE TABLE IF NOT EXISTS paper_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES product_claims(id) ON DELETE CASCADE,
  paper_id VARCHAR(255) NOT NULL,
  title TEXT,
  journal VARCHAR(255),
  year INTEGER,
  finding TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_studies_claim_id ON paper_studies(claim_id);

-- Products, papers and patents linked to a pest species.
-- Used by GET /api/pest-vision/encyclopedia/:species.
CREATE TABLE IF NOT EXISTS pest_related_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species VARCHAR(255) NOT NULL REFERENCES pest_encyclopedia(species) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('product', 'paper', 'patent')),
  title TEXT NOT NULL,
  ref_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pest_related_content_species ON pest_related_content(species);

-- Fields the Pest Vision encyclopedia list needs (GET /api/pest-vision/pests).
ALTER TABLE pest_encyclopedia
  ADD COLUMN IF NOT EXISTS common_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pest_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS image_url TEXT;
