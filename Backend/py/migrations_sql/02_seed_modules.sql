-- Seed modules
INSERT INTO modules (id, name, slug, "group", description) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Dashboard', 'dashboard', 'intelligence', 'Overview with KPIs and top movers'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Competitor Intelligence', 'competitor-intelligence', 'intelligence', 'Track competitors and their moves'),
  ('550e8400-e29b-41d4-a716-446655440003', 'Patent Landscaping', 'patent-landscaping', 'intelligence', 'Patent filing analysis and trends'),
  ('550e8400-e29b-41d4-a716-446655440004', 'News', 'news', 'intelligence', 'Market news and updates'),
  ('550e8400-e29b-41d4-a716-446655440005', 'Regulatory & Actives', 'regulatory-actives', 'intelligence', 'Active ingredient regulations by market'),
  ('550e8400-e29b-41d4-a716-446655440006', 'Patent Sheet Analyser', 'patent-analyser', 'rd_claims', 'Analyze patent sheets and datasets'),
  ('550e8400-e29b-41d4-a716-446655440007', 'Claim Studio AI', 'claim-studio', 'rd_claims', 'Generate and verify product claims'),
  ('550e8400-e29b-41d4-a716-446655440008', 'Knowledge Hub', 'knowledge-hub', 'rd_claims', 'Document library with AI Q&A'),
  ('550e8400-e29b-41d4-a716-446655440009', 'Pest Vision', 'pest-vision', 'rd_claims', 'AI pest identification from photos'),
  ('550e8400-e29b-41d4-a716-446655440010', 'Newsletter Composer', 'newsletter', 'operations', 'Create and schedule newsletters'),
  ('550e8400-e29b-41d4-a716-446655440011', 'Deliverables', 'deliverables', 'operations', 'Generate reports and presentations'),
  ('550e8400-e29b-41d4-a716-446655440012', 'Admin', 'admin', 'system', 'User and access management'),
  ('550e8400-e29b-41d4-a716-446655440013', 'Audit & Provenance', 'audit', 'system', 'AI query logs and data tracking');

-- Seed sample competitors
INSERT INTO competitors (id, name, country, threat_score, recent_filings_count, last_updated) VALUES
  ('650e8400-e29b-41d4-a716-446655440001', 'Reckitt', 'UK', 0.95, 45, NOW()),
  ('650e8400-e29b-41d4-a716-446655440002', 'SC Johnson', 'USA', 0.88, 38, NOW()),
  ('650e8400-e29b-41d4-a716-446655440003', 'Godrej', 'India', 0.75, 22, NOW()),
  ('650e8400-e29b-41d4-a716-446655440004', 'Henkel', 'Germany', 0.82, 31, NOW()),
  ('650e8400-e29b-41d4-a716-446655440005', 'Fumakilla', 'Japan', 0.68, 15, NOW());

-- Seed sample patents
INSERT INTO patents (id, patent_number, title, filer, filing_date, active_ingredients, format, claims_count, threat_score) VALUES
  ('750e8400-e29b-41d4-a716-446655440001', 'US10234567', 'Novel pyrethroid formulation for household insects', 'SC Johnson', '2021-03-15', ARRAY['Pyrethrin', 'Allethrin'], 'Aerosol', 28, 0.92),
  ('750e8400-e29b-41d4-a716-446655440002', 'WO2021045678', 'Sustainable neem-based pest control', 'Godrej', '2020-11-22', ARRAY['Neem oil'], 'Liquid', 15, 0.64),
  ('750e8400-e29b-41d4-a716-446655440003', 'EP3456789', 'Microencapsulated active delivery system', 'Henkel', '2022-01-10', ARRAY['Cypermethrin'], 'Gel', 42, 0.88),
  ('750e8400-e29b-41d4-a716-446655440004', 'JP2022012345', 'Long-lasting surface treatment technology', 'Fumakilla', '2021-06-05', ARRAY['Silica'], 'Powder', 18, 0.72),
  ('750e8400-e29b-41d4-a716-446655440005', 'US10987654', 'AI-enabled pest monitoring system', 'Reckitt', '2022-09-20', ARRAY['IoT', 'Monitoring'], 'Device', 56, 0.95);

-- Seed sample news
INSERT INTO news (id, title, source, category, published_date, url) VALUES
  ('850e8400-e29b-41d4-a716-446655440001', 'New EU ban on neonicotinoids announced', 'Chemical Weekly', 'Regulation', NOW() - INTERVAL '2 days', 'https://example.com/1'),
  ('850e8400-e29b-41d4-a716-446655440002', 'SC Johnson acquires pest control startup', 'Business Journal', 'M&A', NOW() - INTERVAL '1 day', 'https://example.com/2'),
  ('850e8400-e29b-41d4-a716-446655440003', 'Emerging resistance to pyrethroid insecticides', 'Pest Management Today', 'Research', NOW(), 'https://example.com/3');

-- Seed sample regulations
INSERT INTO regulations (id, active_ingredient, market, approval_status, max_concentration, permitted_formats, risk_rating) VALUES
  ('950e8400-e29b-41d4-a716-446655440001', 'Pyrethrin', 'EU', 'approved', 0.5, ARRAY['Aerosol', 'Spray'], 'low'),
  ('950e8400-e29b-41d4-a716-446655440002', 'Neem oil', 'USA', 'approved', 100.0, ARRAY['Liquid', 'Concentrate'], 'low'),
  ('950e8400-e29b-41d4-a716-446655440003', 'Imidacloprid', 'EU', 'suspended', NULL, ARRAY[]::TEXT[], 'high'),
  ('950e8400-e29b-41d4-a716-446655440004', 'Cypermethrin', 'UK', 'approved', 0.3, ARRAY['Aerosol'], 'medium');
