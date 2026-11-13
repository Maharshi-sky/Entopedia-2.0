// File: Entopedia 2.0 Backend/src/routes/patent.routes.ts

import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// CI-03: Patent Landscape chart aggregation (by assignee and year)
router.get('/landscape', async (req: AuthRequest, res) => {
  try {
    const topLimit = Number(req.query.top) || 8;

    // 1. Group filings by assignee and year
    const landscapeQuery = `
      SELECT 
        COALESCE(NULLIF(TRIM(filer), ''), 'Unknown') AS assignee,
        EXTRACT(YEAR FROM COALESCE(priority_date, filing_date))::int AS year,
        COUNT(*)::int AS filings
      FROM patents
      WHERE COALESCE(priority_date, filing_date) IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2;
    `;

    // 2. Fetch top assignees for series mapping
    const topAssigneesQuery = `
      SELECT 
        COALESCE(NULLIF(TRIM(filer), ''), 'Unknown') AS assignee,
        COUNT(*)::int AS total
      FROM patents
      GROUP BY 1
      ORDER BY total DESC
      LIMIT $1;
    `;

    const [rows, topAssignees] = await Promise.all([
      db.queryMany(landscapeQuery),
      db.queryMany(topAssigneesQuery, [topLimit]),
    ]);

    const allowedSet = new Set(topAssignees.map((a: any) => a.assignee));

    // Filter rows to top assignees or lump into "Others"
    const filteredRows = rows.map((r: any) => ({
      assignee: allowedSet.has(r.assignee) ? r.assignee : 'Others',
      year: r.year,
      filings: r.filings,
    }));

    res.json({
      top_assignees: topAssignees,
      data: filteredRows,
    });
  } catch (error) {
    logger.error('Patent landscape error:', error);
    res.status(500).json({ error: 'Failed to fetch patent landscape data' });
  }
});

// PA-06: Batch save/upsert parsed patents into database
router.post('/upload-csv', async (req: AuthRequest, res) => {
  try {
    const { patents } = req.body;

    if (!Array.isArray(patents) || patents.length === 0) {
      res.status(400).json({ error: 'Array of patent records is required' });
      return;
    }

    let inserted = 0;
    let updated = 0;
    const skipped: any[] = [];

    for (let i = 0; i < patents.length; i++) {
      const p = patents[i];
      const patentNumber = p.patentNumber || p.publication_number || p.patent_number || p.id;

      if (!patentNumber) {
        skipped.push({ row: i + 1, reason: 'Missing patent publication number' });
        continue;
      }

      const filer = p.assignee || p.filer || 'Unknown Assignee';
      const title = p.title || 'Untitled Patent Application';
      const filingDate = p.filingDate || p.filing_date || null;
      const actives = p.activeIngredient || p.active_ingredients || [];
      const activesArray = Array.isArray(actives) ? actives : [actives].filter(Boolean);

      try {
        const query = `
          INSERT INTO patents (
            publication_number, filer, title, filing_date, active_ingredients, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (publication_number) DO UPDATE SET
            filer = EXCLUDED.filer,
            title = EXCLUDED.title,
            filing_date = COALESCE(EXCLUDED.filing_date, patents.filing_date),
            active_ingredients = EXCLUDED.active_ingredients
          RETURNING (xmax = 0) AS is_insert;
        `;

        const result = await db.queryOne(query, [
          patentNumber,
          filer,
          title,
          filingDate ? new Date(filingDate) : null,
          JSON.stringify(activesArray),
        ]);

        if (result?.is_insert) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err: any) {
        skipped.push({ row: i + 1, reason: err.message });
      }
    }

    res.json({
      success: true,
      inserted,
      updated,
      skipped,
      total_processed: patents.length,
    });
  } catch (error) {
    logger.error('Patent batch save error:', error);
    res.status(500).json({ error: 'Failed to save patents' });
  }
});

// Existing Patent search and list route
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { filer, active, target_pest, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM patents WHERE 1=1';
    const params: any[] = [];

    if (filer) {
      params.push(`%${filer}%`);
      query += ` AND filer ILIKE $${params.length}`;
    }

    if (active) {
      params.push(JSON.stringify([active]));
      query += ` AND active_ingredients @> $${params.length}`;
    }

    if (target_pest) {
      params.push(JSON.stringify([target_pest]));
      query += ` AND target_pests @> $${params.length}`;
    }

    query += ` ORDER BY filing_date DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const patents = await db.queryMany(query, params);
    const total = await db.queryOne('SELECT COUNT(*) as count FROM patents');

    res.json({
      data: patents,
      pagination: { limit: Number(limit), offset: Number(offset), total: Number(total?.count || 0) },
    });
  } catch (error) {
    logger.error('Patent list error:', error);
    res.status(500).json({ error: 'Failed to fetch patents' });
  }
});

// GET /api/patent/:id
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const patent = await db.queryOne('SELECT * FROM patents WHERE id = $1', [req.params.id]);

    if (!patent) {
      res.status(404).json({ error: 'Patent not found' });
      return;
    }

    res.json(patent);
  } catch (error) {
    logger.error('Patent detail error:', error);
    res.status(500).json({ error: 'Failed to fetch patent' });
  }
});

export default router;