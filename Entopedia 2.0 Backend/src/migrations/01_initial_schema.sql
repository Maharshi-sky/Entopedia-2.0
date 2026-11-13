-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'marketing',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Modules table
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  "group" VARCHAR(50) NOT NULL, -- reserved word: must be quoted
  description TEXT
);

-- Module access control
CREATE TABLE IF NOT EXISTS module_access (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  access_level VARCHAR(20) NOT NULL DEFAULT 'none',
  PRIMARY KEY (user_id, module_id)
);

-- Competitors
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  country VARCHAR(100),
  threat_score DECIMAL(3,2),
  recent_filings_count INTEGER DEFAULT 0,
  ai_summary TEXT,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Patents
CREATE TABLE IF NOT EXISTS patents (
  id UUID PRIMARY KEY,
  patent_number VARCHAR(50) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  filer VARCHAR(255),
  filing_date DATE,
  publication_date DATE,
  expiration_date DATE,
  active_ingredients TEXT[],
  format VARCHAR(100),
  claims_count INTEGER,
  abstract TEXT,
  ai_summary TEXT,
  threat_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Regulations
CREATE TABLE IF NOT EXISTS regulations (
  id UUID PRIMARY KEY,
  active_ingredient VARCHAR(255),
  market VARCHAR(100),
  approval_status VARCHAR(50),
  max_concentration DECIMAL(5,2),
  permitted_formats TEXT[],
  off_patent_date DATE,
  risk_rating VARCHAR(20)
);

-- News
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  source VARCHAR(255),
  category VARCHAR(100),
  published_date TIMESTAMP,
  content TEXT,
  ai_summary TEXT,
  url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Saved news
CREATE TABLE IF NOT EXISTS saved_news (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  news_id UUID REFERENCES news(id) ON DELETE CASCADE,
  saved_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, news_id)
);

-- Product claims
CREATE TABLE IF NOT EXISTS product_claims (
  id UUID PRIMARY KEY,
  product_id VARCHAR(255),
  claim_text TEXT NOT NULL,
  category VARCHAR(100),
  evidence_needed TEXT[],
  compliance_status JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pest identifications
CREATE TABLE IF NOT EXISTS pest_identifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT,
  identified_species VARCHAR(255),
  confidence DECIMAL(3,2),
  identified_at TIMESTAMP DEFAULT NOW()
);

-- Pest encyclopedia
CREATE TABLE IF NOT EXISTS pest_encyclopedia (
  id UUID PRIMARY KEY,
  species VARCHAR(255) UNIQUE NOT NULL,
  biology TEXT,
  regions TEXT[],
  resistance_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI queries (audit trail)
CREATE TABLE IF NOT EXISTS ai_queries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  modules VARCHAR(50)[],
  query_text TEXT,
  response TEXT,
  confidence_level VARCHAR(20),
  retrieved_vs_inferred VARCHAR(20)[],
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI sources for queries
CREATE TABLE IF NOT EXISTS ai_sources (
  id UUID PRIMARY KEY,
  query_id UUID REFERENCES ai_queries(id) ON DELETE CASCADE,
  source_type VARCHAR(50),
  title VARCHAR(500),
  url TEXT,
  relevance_score DECIMAL(3,2),
  excerpt TEXT
);

-- Newsletters
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY,
  title VARCHAR(255),
  created_by UUID REFERENCES users(id),
  scheduled_date TIMESTAMP,
  sent_date TIMESTAMP,
  recipient_list TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Newsletter items
CREATE TABLE IF NOT EXISTS newsletter_items (
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  news_id UUID REFERENCES news(id),
  position INTEGER,
  custom_note TEXT
);

-- Deliverables (reports)
CREATE TABLE IF NOT EXISTS deliverables (
  id UUID PRIMARY KEY,
  template_type VARCHAR(100),
  created_by UUID REFERENCES users(id),
  content JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Access log (for audit)
CREATE TABLE IF NOT EXISTS access_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  module_id UUID,
  action VARCHAR(50),
  accessed_at TIMESTAMP DEFAULT NOW()
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title VARCHAR(255),
  message TEXT,
  severity VARCHAR(20),
  source_module VARCHAR(100),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Data provenance tracking
CREATE TABLE IF NOT EXISTS data_provenance (
  source_id UUID PRIMARY KEY,
  data_type VARCHAR(100),
  source_url TEXT,
  last_updated TIMESTAMP,
  confidence DECIMAL(3,2),
  metadata JSONB
);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Saved searches
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  query TEXT,
  modules VARCHAR(50)[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_patents_filer ON patents(filer);
CREATE INDEX idx_patents_filing_date ON patents(filing_date);
CREATE INDEX idx_competitors_threat_score ON competitors(threat_score);
CREATE INDEX idx_news_published_date ON news(published_date);
CREATE INDEX idx_news_category ON news(category);
CREATE INDEX idx_ai_queries_user_id ON ai_queries(user_id);
CREATE INDEX idx_ai_queries_created_at ON ai_queries(created_at);
CREATE INDEX idx_module_access_user_id ON module_access(user_id);
CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);
