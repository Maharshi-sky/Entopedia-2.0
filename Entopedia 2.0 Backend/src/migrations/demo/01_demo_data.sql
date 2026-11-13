-- DEMO DATA — fictional rows for local and staging databases only.
-- Loaded by `npm run db:demo`. Never run this against production.
-- Patent numbers start with DEMO- and every news source is "Demo feed" so none
-- of it can be mistaken for real intelligence.

-- News across the frontend's categories, spread over the last six months.
INSERT INTO news (id, title, source, category, published_date, ai_summary, url) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Regulator proposes tighter limits on indoor pyrethroid sprays', 'Demo feed', 'Regulatory', NOW() - INTERVAL '3 hours', 'Draft guidance would cap indoor aerosol loadings and require new exposure data.', 'https://example.com/demo/1'),
  ('a1000000-0000-4000-8000-000000000002', 'Liquid vaporizer refills see double-digit growth in South Asia', 'Demo feed', 'Industry', NOW() - INTERVAL '1 day', 'Retail panel data shows LV refills outpacing coils for the third straight quarter.', 'https://example.com/demo/2'),
  ('a1000000-0000-4000-8000-000000000003', 'Field trial reports spatial repellent cuts Aedes landings by 60%', 'Demo feed', 'Science', NOW() - INTERVAL '4 days', 'A randomized household study measured landing rates over eight weeks.', 'https://example.com/demo/3'),
  ('a1000000-0000-4000-8000-000000000004', 'Low-power heater design extends refill life to 60 nights', 'Demo feed', 'Technology', NOW() - INTERVAL '12 days', 'A new heater curve keeps release rate steady as the wick ages.', 'https://example.com/demo/4'),
  ('a1000000-0000-4000-8000-000000000005', 'Smokeless coil range launched in three markets', 'Demo feed', 'Product', NOW() - INTERVAL '20 days', 'The range claims lower particulate emission than standard coils.', 'https://example.com/demo/5'),
  ('a1000000-0000-4000-8000-000000000006', 'Dengue cases rise ahead of monsoon season', 'Demo feed', 'Disease', NOW() - INTERVAL '35 days', 'Health ministry data shows an early seasonal rise in reported cases.', 'https://example.com/demo/6'),
  ('a1000000-0000-4000-8000-000000000007', 'Study links aerosol misuse to respiratory complaints', 'Demo feed', 'Safety', NOW() - INTERVAL '50 days', 'Researchers recommend clearer ventilation instructions on packs.', 'https://example.com/demo/7'),
  ('a1000000-0000-4000-8000-000000000008', 'R&D head on the shift to plant-derived actives', 'Demo feed', 'Interviews', NOW() - INTERVAL '70 days', 'A conversation on formulation trade-offs for botanical actives.', 'https://example.com/demo/8'),
  ('a1000000-0000-4000-8000-000000000009', 'Household insecticide maker appoints new regulatory chief', 'Demo feed', 'People & Company', NOW() - INTERVAL '95 days', 'The appointment follows a reorganization of the regulatory team.', 'https://example.com/demo/9'),
  ('a1000000-0000-4000-8000-000000000010', 'Registration window opens for new mosquito mat formats', 'Demo feed', 'Regulatory', NOW() - INTERVAL '120 days', 'Applicants can now file mats with reduced active loading.', 'https://example.com/demo/10'),
  ('a1000000-0000-4000-8000-000000000011', 'Repellent cream category grows on travel demand', 'Demo feed', 'Industry', NOW() - INTERVAL '140 days', 'Pharmacy channel sales rose ahead of the holiday season.', 'https://example.com/demo/11'),
  ('a1000000-0000-4000-8000-000000000012', 'Resistance monitoring finds kdr mutations in urban Aedes', 'Demo feed', 'Science', NOW() - INTERVAL '160 days', 'Surveillance in three cities detected knockdown-resistance alleles.', 'https://example.com/demo/12')
ON CONFLICT (id) DO NOTHING;

-- Recent patents by the seeded competitors (fictional DEMO- numbers).
INSERT INTO patents (id, patent_number, title, filer, filing_date, publication_date, expiration_date, active_ingredients, format, claims_count, threat_score) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'DEMO-WO2026-0001', 'Controlled-release vaporizer refill', 'Reckitt', NOW() - INTERVAL '20 days', NULL, NOW() + INTERVAL '20 years', ARRAY['Transfluthrin'], 'LV', 24, 0.91),
  ('b1000000-0000-4000-8000-000000000002', 'DEMO-WO2026-0002', 'Low-smoke coil composition', 'Godrej', NOW() - INTERVAL '45 days', NULL, NOW() + INTERVAL '20 years', ARRAY['Meperfluthrin'], 'Coil', 18, 0.84),
  ('b1000000-0000-4000-8000-000000000003', 'DEMO-WO2026-0003', 'Aerosol valve for reduced overspray', 'SC Johnson', NOW() - INTERVAL '75 days', NOW() - INTERVAL '10 days', NOW() + INTERVAL '19 years', ARRAY['Prallethrin'], 'Aerosol', 31, 0.78),
  ('b1000000-0000-4000-8000-000000000004', 'DEMO-WO2026-0004', 'Passive emanator card', 'Reckitt', NOW() - INTERVAL '100 days', NULL, NOW() + INTERVAL '20 years', ARRAY['Transfluthrin'], 'Card', 12, 0.66),
  ('b1000000-0000-4000-8000-000000000005', 'DEMO-WO2026-0005', 'Botanical repellent cream base', 'Henkel', NOW() - INTERVAL '130 days', NULL, NOW() + INTERVAL '20 years', ARRAY['Neem oil'], 'Cream', 9, 0.52),
  ('b1000000-0000-4000-8000-000000000006', 'DEMO-WO2026-0006', 'Mat with extended-release substrate', 'Fumakilla', NOW() - INTERVAL '150 days', NOW() - INTERVAL '30 days', NOW() + INTERVAL '19 years', ARRAY['D-Allethrin'], 'Mat', 15, 0.71),
  ('b1000000-0000-4000-8000-000000000007', 'DEMO-WO2026-0007', 'Dual-active vaporizer liquid', 'Godrej', NOW() - INTERVAL '10 days', NULL, NOW() + INTERVAL '20 years', ARRAY['Meperfluthrin', 'Prallethrin'], 'LV', 22, 0.88)
ON CONFLICT (id) DO NOTHING;

-- More active-ingredient registrations across markets.
INSERT INTO regulations (id, active_ingredient, market, approval_status, max_concentration, permitted_formats, off_patent_date, risk_rating) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Transfluthrin', 'India', 'approved', 0.05, ARRAY['LV', 'Coil'], '2027-06-30', 'high'),
  ('c1000000-0000-4000-8000-000000000002', 'Transfluthrin', 'EU', 'pending', 0.04, ARRAY['LV'], '2027-06-30', 'high'),
  ('c1000000-0000-4000-8000-000000000003', 'Prallethrin', 'India', 'approved', 0.10, ARRAY['LV', 'Aerosol'], '2029-03-31', 'low'),
  ('c1000000-0000-4000-8000-000000000004', 'Prallethrin', 'Australia', 'approved', 0.10, ARRAY['Aerosol'], '2029-03-31', 'low'),
  ('c1000000-0000-4000-8000-000000000005', 'Meperfluthrin', 'India', 'pending', 0.05, ARRAY['LV', 'Coil'], NULL, 'medium'),
  ('c1000000-0000-4000-8000-000000000006', 'D-Allethrin', 'Brazil', 'approved', 0.20, ARRAY['Coil', 'Mat'], NULL, 'low')
ON CONFLICT (id) DO NOTHING;

-- Product claims with their market context, plus supporting studies.
INSERT INTO product_claims (id, product_id, claim_text, category, evidence_needed, compliance_status, created_at) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'demo-lv-01', '8-hour protection', 'efficacy', ARRAY['Field trial'], '{"pest": "Aedes aegypti", "format": "LV", "market": "India", "status": "Substantiated"}', NOW() - INTERVAL '6 days'),
  ('d1000000-0000-4000-8000-000000000002', 'demo-aer-01', '99.9% knockdown', 'efficacy', ARRAY['Lab KT50'], '{"pest": "Anopheles", "format": "Aerosol", "market": "India", "status": "Substantiated"}', NOW() - INTERVAL '13 days'),
  ('d1000000-0000-4000-8000-000000000003', 'demo-cream-01', 'Residue-free', 'safety', ARRAY['Residue study'], '{"pest": "Culex", "format": "Cream", "market": "EU", "status": "Argument-supported"}', NOW() - INTERVAL '20 days'),
  ('d1000000-0000-4000-8000-000000000004', 'demo-coil-01', 'Plant-derived actives', 'composition', ARRAY['Supplier CoA'], '{"pest": "Anopheles", "format": "Coil", "market": "India"}', NOW() - INTERVAL '27 days'),
  ('d1000000-0000-4000-8000-000000000005', 'demo-card-01', '12-hour protection', 'efficacy', ARRAY['Field trial'], '{"pest": "Aedes aegypti", "format": "Card", "market": "Brazil"}', NOW() - INTERVAL '41 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO paper_studies (id, claim_id, paper_id, title, journal, year, finding) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'DEMO-PAPER-001', 'Household protection time of vaporizer refills', 'Demo Journal of Vector Control', 2025, 'Protection above 90% for 8 hours.'),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'DEMO-PAPER-002', 'Knockdown of Anopheles by aerosol formulations', 'Demo Journal of Vector Control', 2024, 'KT50 under 4 minutes.'),
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004', 'DEMO-PAPER-003', 'Botanical actives in mosquito coils: a review', 'Demo Reviews in Entomology', 2023, 'Neem and citronella blends show moderate repellency.')
ON CONFLICT (id) DO NOTHING;

-- Pest encyclopedia.
INSERT INTO pest_encyclopedia (id, species, common_name, pest_type, regions, biology, resistance_notes) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'Aedes aegypti', 'Yellow fever mosquito', 'Mosquito', ARRAY['Tropics', 'Subtropics'], 'Day-biting vector of dengue, Zika and chikungunya.', 'Pyrethroid resistance (kdr) reported in many urban populations.'),
  ('f1000000-0000-4000-8000-000000000002', 'Anopheles gambiae', 'Malaria mosquito', 'Mosquito', ARRAY['Sub-Saharan Africa'], 'Primary vector of Plasmodium falciparum malaria.', 'Widespread pyrethroid resistance.'),
  ('f1000000-0000-4000-8000-000000000003', 'Blattella germanica', 'German cockroach', 'Cockroach', ARRAY['Global', 'Indoor'], 'Fast-breeding; contaminates food surfaces.', 'Resistant to several insecticide classes.'),
  ('f1000000-0000-4000-8000-000000000004', 'Musca domestica', 'House fly', 'Fly', ARRAY['Global'], 'Mechanical carrier of over 100 pathogens.', NULL)
ON CONFLICT (species) DO NOTHING;

INSERT INTO pest_related_content (id, species, type, title, ref_id) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'Aedes aegypti', 'paper', 'Household protection time of vaporizer refills', 'DEMO-PAPER-001'),
  ('f2000000-0000-4000-8000-000000000002', 'Aedes aegypti', 'patent', 'Controlled-release vaporizer refill', 'DEMO-WO2026-0001')
ON CONFLICT (id) DO NOTHING;

-- Organisation-wide alerts (user_id NULL = visible to everyone).
INSERT INTO alerts (id, user_id, title, message, severity, source_module, created_at) VALUES
  ('a2000000-0000-4000-8000-000000000001', NULL, 'Draft limit on indoor pyrethroid sprays published', 'Review aerosol portfolio against the proposed cap.', 'high', 'Regulatory', NOW() - INTERVAL '2 hours'),
  ('a2000000-0000-4000-8000-000000000002', NULL, 'New LV patent filed by a tracked competitor', 'Dual-active vaporizer liquid filed 10 days ago.', 'medium', 'Competitor', NOW() - INTERVAL '6 hours'),
  ('a2000000-0000-4000-8000-000000000003', NULL, 'Aedes outbreak flagged in APAC', 'Pest Vision confidence 94%.', 'high', 'Pest Vision', NOW() - INTERVAL '1 day'),
  ('a2000000-0000-4000-8000-000000000004', NULL, '5 claims generated for a vaporizer brief', 'Ready for review in Claim Studio.', 'low', 'Claims', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- AI query audit trail with sources.
INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, retrieved_vs_inferred, tokens_used, created_at) VALUES
  ('a3000000-0000-4000-8000-000000000001', NULL, ARRAY['Regulatory', 'Knowledge Hub'], 'Transfluthrin registration status India', 'Demo answer.', '0.94', ARRAY['retrieved'], 410, NOW() - INTERVAL '3 hours'),
  ('a3000000-0000-4000-8000-000000000002', NULL, ARRAY['Claims Evidence'], '8-hour protection claim evidence for LV', 'Demo answer.', '0.91', ARRAY['retrieved'], 380, NOW() - INTERVAL '5 hours'),
  ('a3000000-0000-4000-8000-000000000003', NULL, ARRAY['Competitor Intelligence', 'Dashboard'], 'LV market share trend in South Asia', 'Demo answer.', 'medium', ARRAY['inferred'], 520, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_sources (id, query_id, source_type, title, url, relevance_score) VALUES
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'regulation', 'Demo registration register', 'https://example.com/demo/reg', 0.95),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'paper', 'Household protection time of vaporizer refills', 'https://example.com/demo/paper1', 0.92)
ON CONFLICT (id) DO NOTHING;
