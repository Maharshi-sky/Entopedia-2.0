// File: Entopedia 2.0 Backend/src/routes/competitor.routes.ts

import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

const router = Router();

// =========================================================================
// PUBLIC PRODUCT LIBRARY ROUTES (Accessible via /api/competitor/products)
// =========================================================================

// GET /api/competitor/products or /api/competitors/products
router.get('/products', async (req, res) => {
  try {
    const { brand, format, active_id } = req.query;
    let query = 'SELECT * FROM competitor_products WHERE 1=1';
    const params: any[] = [];

    if (brand) {
      params.push(brand);
      query += ` AND brand ILIKE $${params.length}`;
    }

    if (format) {
      params.push(format);
      query += ` AND format ILIKE $${params.length}`;
    }

    if (active_id) {
      params.push(active_id);
      query += ` AND active_ingredient ILIKE $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const products = await db.queryMany(query, params);
    res.json(products);
  } catch (error) {
    logger.error('Error fetching competitor products:', error);
    res.status(500).json({ error: 'Failed to fetch competitor products' });
  }
});

// POST /api/competitor/products (Add product to database)
router.post('/products', async (req, res) => {
  try {
    const {
      competitor_id = null,
      brand,
      name,
      active_ingredient = '',
      format = 'LV',
      price = 0,
      currency = 'INR',
      claims = [],
      image_url = null,
      target_pests = [],
      pack_size = '',
      product_link = null,
    } = req.body;

    if (!brand || !name) {
      res.status(400).json({ error: 'Brand and product name are required' });
      return;
    }

    const insertQuery = `
      INSERT INTO competitor_products 
      (competitor_id, brand, name, active_ingredient, format, price, currency, claims, image_url, target_pests, pack_size, product_link, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *;
    `;

    const newProduct = await db.queryOne(insertQuery, [
      competitor_id,
      brand,
      name,
      active_ingredient,
      format,
      price,
      currency,
      claims,
      image_url,
      target_pests,
      pack_size,
      product_link,
    ]);

    res.status(201).json(newProduct);
  } catch (error) {
    logger.error('Error creating competitor product:', error);
    res.status(500).json({ error: 'Failed to create competitor product' });
  }
});

// =========================================================================
// PROTECTED COMPETITOR ROUTES (Require Auth Token)
// =========================================================================
router.use(authMiddleware);

// CI-01: List Competitors with accurate SKU count, 90-day launch counts, & patents
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { search, limit = 20, offset = 0 } = req.query;

    let query = `
      SELECT 
        c.*,
        (
          SELECT COUNT(*)::int 
          FROM competitor_products cp 
          LEFT JOIN brand_owners bo ON bo.brand = cp.brand 
          WHERE bo.competitor_id = c.id 
             OR cp.competitor_id = c.id 
             OR cp.brand ILIKE '%' || c.name || '%'
        ) AS sku_count,
        (
          SELECT COUNT(*)::int 
          FROM competitor_products cp 
          LEFT JOIN brand_owners bo ON bo.brand = cp.brand 
          WHERE (bo.competitor_id = c.id OR cp.competitor_id = c.id OR cp.brand ILIKE '%' || c.name || '%')
            AND cp.created_at >= NOW() - INTERVAL '90 days'
        ) AS launch_count,
        (
          SELECT COUNT(*)::int 
          FROM patents p 
          WHERE p.filer ILIKE '%' || c.name || '%'
        ) AS patent_count,
        (
          SELECT COUNT(*)::int 
          FROM patents p 
          WHERE p.filer ILIKE '%' || c.name || '%' 
            AND p.filing_date > NOW() - INTERVAL '18 months'
        ) AS active_filing_count,
        (
          SELECT COUNT(DISTINCT cp.format)::int 
          FROM competitor_products cp
          LEFT JOIN brand_owners bo ON bo.brand = cp.brand
          WHERE bo.competitor_id = c.id OR cp.competitor_id = c.id
        ) AS format_count
      FROM competitors c
    `;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` WHERE c.name ILIKE $${params.length}`;
    }

    query += ` ORDER BY c.threat_score DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const competitors = await db.queryMany(query, params);
    const total = await db.queryOne(
      'SELECT COUNT(*) as count FROM competitors' + (search ? ' WHERE name ILIKE $1' : ''),
      search ? [`%${search}%`] : []
    );

    res.json({
      data: competitors,
      pagination: { limit: Number(limit), offset: Number(offset), total: Number(total?.count || 0) },
    });
  } catch (error) {
    logger.error('Competitor list error:', error);
    res.status(500).json({ error: 'Failed to fetch competitors' });
  }
});

// CI-02: Summary endpoint providing Brand & Format breakdown for 360 view
router.get('/:id/summary', async (req: AuthRequest, res) => {
  try {
    const competitorId = req.params.id;
    const competitor = await db.queryOne('SELECT * FROM competitors WHERE id = $1', [competitorId]);

    if (!competitor) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }

    // SKUs grouped by brand and format (with brand_owners resolution)
    const breakdownQuery = `
      SELECT 
        cp.brand, 
        cp.format, 
        COUNT(*)::int AS skus
      FROM competitor_products cp
      LEFT JOIN brand_owners bo ON bo.brand = cp.brand
      WHERE bo.competitor_id = $1 
         OR cp.competitor_id = $1 
         OR cp.brand ILIKE '%' || $2 || '%'
      GROUP BY cp.brand, cp.format
      ORDER BY skus DESC;
    `;
    const breakdowns = await db.queryMany(breakdownQuery, [competitorId, competitor.name]);

    // Format totals
    const formatTotals: Record<string, number> = {};
    let totalSkus = 0;
    breakdowns.forEach((row: any) => {
      formatTotals[row.format] = (formatTotals[row.format] || 0) + row.skus;
      totalSkus += row.skus;
    });

    // Patent totals & recent 90-day launches
    const patents = await db.queryMany(
      'SELECT id, title, publication_number, filing_date FROM patents WHERE filer ILIKE $1 ORDER BY filing_date DESC LIMIT 10',
      [`%${competitor.name}%`]
    );

    const launches90d = await db.queryOne(
      `SELECT COUNT(*)::int AS count 
       FROM competitor_products cp
       LEFT JOIN brand_owners bo ON bo.brand = cp.brand
       WHERE (bo.competitor_id = $1 OR cp.competitor_id = $1 OR cp.brand ILIKE '%' || $2 || '%')
         AND cp.created_at >= NOW() - INTERVAL '90 days'`,
      [competitorId, competitor.name]
    );

    res.json({
      competitor_id: competitor.id,
      name: competitor.name,
      total_skus: totalSkus,
      launches_90d: launches90d?.count || 0,
      format_split: formatTotals,
      brand_breakdown: breakdowns,
      patents_count: patents.length,
      recent_patents: patents,
    });
  } catch (error) {
    logger.error('Competitor summary error:', error);
    res.status(500).json({ error: 'Failed to fetch competitor summary' });
  }
});

// GET /api/competitor/:id (Detail View)
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const competitor = await db.queryOne('SELECT * FROM competitors WHERE id = $1', [req.params.id]);

    if (!competitor) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }

    const products = await db.queryMany(
      `SELECT DISTINCT name 
       FROM competitor_products cp
       LEFT JOIN brand_owners bo ON bo.brand = cp.brand
       WHERE bo.competitor_id = $1 OR cp.competitor_id = $1 OR cp.brand ILIKE '%' || $2 || '%'`,
      [competitor.id, competitor.name]
    );

    const patents = await db.queryMany(
      'SELECT * FROM patents WHERE filer ILIKE $1 ORDER BY filing_date DESC LIMIT 50',
      [`%${competitor.name}%`]
    );

    const registrations = await db.queryMany(
      `SELECT * FROM regulations 
       WHERE active_ingredient IN (
         SELECT DISTINCT active_ingredient FROM competitor_products WHERE brand ILIKE '%' || $1 || '%'
       )`,
      [competitor.name]
    );

    res.json({
      ...competitor,
      products: products.map((p: any) => p.name),
      patents: patents.length,
      recent_filings: patents.slice(0, 5),
      registrations: registrations.length,
    });
  } catch (error) {
    logger.error('Competitor detail error:', error);
    res.status(500).json({ error: 'Failed to fetch competitor' });
  }
});

router.post('/q-and-a', async (req: AuthRequest, res) => {
  try {
    const { question } = req.body;

    res.json({
      question,
      answer: 'AI answer will be generated here with sources',
      sources: [],
      confidence: 'medium',
    });
  } catch (error) {
    logger.error('Q&A error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

export default router;