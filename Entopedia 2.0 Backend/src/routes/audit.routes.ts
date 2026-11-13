import { Router } from 'express';
import { authMiddleware, AuthRequest, roleBasedAccess } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

const router = Router();

router.use(authMiddleware);
router.use(roleBasedAccess(['admin', 'regulatory_specialist']));

router.get('/ai-queries', async (req: AuthRequest, res) => {
  try {
    const { user_id, module, limit = 50, offset = 0 } = req.query;
    const params: any[] = [];
    // Each row carries the asking user's name and the titles of its sources,
    // so the audit view can render without a request per row.
    let query = `SELECT q.*, u.name AS user_name,
        COALESCE((SELECT ARRAY_AGG(s.title ORDER BY s.relevance_score DESC NULLS LAST) FROM ai_sources s WHERE s.query_id = q.id), '{}') AS source_titles
      FROM ai_queries q LEFT JOIN users u ON u.id = q.user_id WHERE 1=1`;

    if (user_id) {
      query += ' AND q.user_id = $' + (params.length + 1);
      params.push(user_id);
    }

    if (module) {
      query += ' AND $' + (params.length + 1) + ' = ANY(q.modules)';
      params.push(module);
    }

    query += ' ORDER BY q.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const queries = await db.queryMany(query, params);
    const total = await db.queryOne('SELECT COUNT(*) as count FROM ai_queries', []);

    res.json({
      data: queries,
      pagination: { limit, offset, total: total?.count || 0 },
    });
  } catch (error) {
    logger.error('AI queries audit error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

router.get('/ai-queries/:id', async (req: AuthRequest, res) => {
  try {
    const query = await db.queryOne('SELECT * FROM ai_queries WHERE id = $1', [req.params.id]);

    if (!query) {
      res.status(404).json({ error: 'Query not found' });
      return;
    }

    const sources = await db.queryMany(
      'SELECT * FROM ai_sources WHERE query_id = $1',
      [req.params.id]
    );

    res.json({ ...query, sources });
  } catch (error) {
    logger.error('AI query detail error:', error);
    res.status(500).json({ error: 'Failed to fetch query details' });
  }
});

router.get('/access-log', async (req: AuthRequest, res) => {
  try {
    const { user_id, module_id, limit = 50, offset = 0 } = req.query;
    const params: any[] = [];
    let query = 'SELECT * FROM access_log WHERE 1=1';

    if (user_id) {
      query += ' AND q.user_id = $' + (params.length + 1);
      params.push(user_id);
    }

    if (module_id) {
      query += ' AND module_id = $' + (params.length + 1);
      params.push(module_id);
    }

    query += ' ORDER BY accessed_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const logs = await db.queryMany(query, params);
    const total = await db.queryOne('SELECT COUNT(*) as count FROM access_log', []);

    res.json({
      data: logs,
      pagination: { limit, offset, total: total?.count || 0 },
    });
  } catch (error) {
    logger.error('Access log error:', error);
    res.status(500).json({ error: 'Failed to fetch access log' });
  }
});

router.get('/data-provenance/:source_id', async (req: AuthRequest, res) => {
  try {
    const provenance = await db.queryOne(
      'SELECT * FROM data_provenance WHERE source_id = $1',
      [req.params.source_id]
    );

    if (!provenance) {
      res.status(404).json({ error: 'Provenance not found' });
      return;
    }

    res.json(provenance);
  } catch (error) {
    logger.error('Provenance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch provenance' });
  }
});

export default router;
