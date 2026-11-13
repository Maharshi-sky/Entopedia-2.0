export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin' | 'rd_scientist' | 'regulatory_specialist' | 'marketing' | 'leadership';
  module_access: ModuleAccess[];
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
}

export interface ModuleAccess {
  user_id: string;
  module_id: string;
  access_level: 'none' | 'read' | 'edit' | 'admin';
}

export interface Module {
  id: string;
  name: string;
  slug: string;
  group: 'intelligence' | 'rd_claims' | 'operations' | 'system';
  description: string;
}

export interface AIQuery {
  id: string;
  user_id: string;
  modules: string[];
  query_text: string;
  response: string;
  sources: AISource[];
  confidence_level: 'high' | 'medium' | 'low';
  retrieved_vs_inferred: ('retrieved' | 'inferred')[];
  tokens_used: number;
  created_at: Date;
}

export interface AISource {
  id: string;
  type: 'patent' | 'paper' | 'regulation' | 'news' | 'competitor_data';
  title: string;
  url?: string;
  relevance_score: number;
  excerpt?: string;
}

export interface Patent {
  id: string;
  patent_number: string;
  title: string;
  filer: string;
  filing_date: Date;
  publication_date?: Date;
  active_ingredients: string[];
  format: string;
  claims_count: number;
  abstract: string;
  ai_summary?: string;
  threat_score: number;
}

export interface Competitor {
  id: string;
  name: string;
  country: string;
  products: string[];
  threat_score: number;
  recent_filings_count: number;
  ai_summary?: string;
  last_updated: Date;
}

export interface Regulation {
  id: string;
  active_ingredient: string;
  market: string;
  approval_status: 'approved' | 'pending' | 'suspended' | 'withdrawn';
  max_concentration?: number;
  permitted_formats: string[];
  off_patent_date?: Date;
  risk_rating: 'high' | 'medium' | 'low';
}

export interface News {
  id: string;
  title: string;
  source: string;
  category: string;
  published_date: Date;
  content: string;
  ai_summary?: string;
  url: string;
  saved_by_users?: string[];
}

export interface ProductClaim {
  id: string;
  product_id: string;
  claim_text: string;
  category: string;
  evidence_needed: string[];
  compliance_status: Record<string, 'approved' | 'pending' | 'flag'>;
  created_at: Date;
}

export interface PestIdentification {
  id: string;
  user_id: string;
  photo_url: string;
  identified_species: string;
  confidence: number;
  similar_species: string[];
  identified_at: Date;
}

export interface Newsletter {
  id: string;
  title: string;
  created_by: string;
  items: NewsItem[];
  scheduled_date?: Date;
  sent_date?: Date;
  recipient_list: string[];
}

export interface NewsItem {
  news_id: string;
  position: number;
  custom_note?: string;
}

export interface Deliverable {
  id: string;
  template_type: 'patent_landscape' | 'research_digest' | 'teardown_summary' | 'quarterly_deck';
  created_by: string;
  content: any;
  created_at: Date;
  updated_at: Date;
}
