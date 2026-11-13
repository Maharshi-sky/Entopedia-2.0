import { Router } from 'express';
import { authMiddleware, AuthRequest, roleBasedAccess } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { toInterval } from '../utils/range';

const router = Router();

router.use(authMiddleware);
router.use(roleBasedAccess(['admin']));

router.get('/users', async (req: AuthRequest, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // `modules` lists the module names each user can open (access_level <> 'none').
    const users = await db.queryMany(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at,
              COALESCE(ARRAY_AGG(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL), '{}') AS modules,
              COALESCE(ARRAY_AGG(DISTINCT ma.access_level) FILTER (WHERE ma.access_level IS NOT NULL), '{}') AS access_levels
         FROM users u
         LEFT JOIN module_access ma ON ma.user_id = u.id AND ma.access_level <> 'none'
         LEFT JOIN modules m ON m.id = ma.module_id
        GROUP BY u.id
        ORDER BY u.created_at ASC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = await db.queryOne('SELECT COUNT(*) as count FROM users');

    res.json({
      data: users,
      pagination: { limit, offset, total: total?.count || 0 },
    });
  } catch (error) {
    logger.error('Users list error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users/:id/access', async (req: AuthRequest, res) => {
  try {
    const { module_id, access_level } = req.body;

    await db.query(
      'INSERT INTO module_access (user_id, module_id, access_level) VALUES ($1, $2, $3) ON CONFLICT (user_id, module_id) DO UPDATE SET access_level = $3',
      [req.params.id, module_id, access_level]
    );

    res.json({ message: 'Access updated' });
  } catch (error) {
    logger.error('Access update error:', error);
    res.status(500).json({ error: 'Failed to update access' });
  }
});

router.get('/users/:id/access', async (req: AuthRequest, res) => {
  try {
    const access = await db.queryMany(
      'SELECT module_id, access_level FROM module_access WHERE user_id = $1',
      [req.params.id]
    );

    res.json({ access });
  } catch (error) {
    logger.error('Access fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch access' });
  }
});

// "group" is a reserved word in SQL and must be quoted.
router.get('/modules', async (_req: AuthRequest, res) => {
  try {
    const modules = await db.queryMany('SELECT id, name, slug, "group" FROM modules ORDER BY "group", name');

    res.json({ modules });
  } catch (error) {
    logger.error('Modules list error:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Postgres does not accept a bind parameter after INTERVAL, so the period is
// passed as text and cast: NOW() - $1::interval.
router.get('/usage-metrics', async (req: AuthRequest, res) => {
  try {
    const period = (req.query.period as string) || '30d';
    const interval = toInterval(period);

    const activeUsers = await db.queryOne(
      'SELECT COUNT(DISTINCT user_id)::int as count FROM ai_queries WHERE created_at > NOW() - $1::interval',
      [interval]
    );

    const totalQueries = await db.queryOne(
      'SELECT COUNT(*)::int as count FROM ai_queries WHERE created_at > NOW() - $1::interval',
      [interval]
    );

    const moduleUsage = await db.queryMany(
      'SELECT module, COUNT(*)::int as count FROM ai_queries, UNNEST(modules) AS module WHERE created_at > NOW() - $1::interval GROUP BY module ORDER BY count DESC',
      [interval]
    );

    const totals = await db.queryOne(
      'SELECT (SELECT COUNT(*)::int FROM users WHERE is_active) AS active_accounts, (SELECT COUNT(*)::int FROM modules) AS modules_total'
    );

    res.json({
      period,
      active_users: activeUsers?.count || 0,
      total_queries: totalQueries?.count || 0,
      active_accounts: totals?.active_accounts || 0,
      modules_total: totals?.modules_total || 0,
      modules_active: moduleUsage.length,
      module_usage: moduleUsage,
    });
  } catch (error) {
    logger.error('Usage metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch usage metrics' });
  }
});

export default router;
