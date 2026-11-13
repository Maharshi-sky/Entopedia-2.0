import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { clampInt, toInterval } from '../utils/range';

const router = Router();

router.use(authMiddleware);

const count = async (sql: string, params: unknown[]) => Number((await db.queryOne(sql, params))?.count ?? 0);

// Weekly counts for the last `weeks` weeks, oldest first, zero-filled.
async function weeklyTrend(table: string, column: string, where = 'TRUE', weeks = 10): Promise<number[]> {
  const rows = await db.queryMany(
    `SELECT w.week, COUNT(t.${column})::int AS count
       FROM generate_series(DATE_TRUNC('week', NOW()) - ($1::int - 1) * INTERVAL '1 week', DATE_TRUNC('week', NOW()), INTERVAL '1 week') AS w(week)
       LEFT JOIN ${table} t ON DATE_TRUNC('week', t.${column}) = w.week AND ${where}
      GROUP BY w.week
      ORDER BY w.week ASC`,
    [weeks]
  );
  return rows.map((r: { count: number }) => Number(r.count));
}

router.get('/kpis', async (req: AuthRequest, res) => {
  try {
    const timeRange = (req.query.range as string) || '30d';
    const interval = toInterval(timeRange);

    const [competitors, patents, news, threats, claims, alerts] = await Promise.all([
      count('SELECT COUNT(*) AS count FROM competitors WHERE last_updated > NOW() - $1::interval', [interval]),
      count('SELECT COUNT(*) AS count FROM patents WHERE filing_date > NOW() - $1::interval', [interval]),
      count('SELECT COUNT(*) AS count FROM news WHERE published_date > NOW() - $1::interval', [interval]),
      // threat_score is DECIMAL(3,2) on a 0–1 scale, so "high threat" is >= 0.7 (not > 7).
      count('SELECT COUNT(*) AS count FROM patents WHERE threat_score >= 0.7 AND filing_date > NOW() - $1::interval', [interval]),
      count('SELECT COUNT(*) AS count FROM product_claims WHERE created_at > NOW() - $1::interval', [interval]),
      count(
        "SELECT COUNT(*) AS count FROM alerts WHERE severity IN ('high', 'critical') AND created_at > NOW() - $1::interval AND (user_id = $2 OR user_id IS NULL)",
        [interval, req.user?.id]
      ),
    ]);

    const [patentTrend, newsTrend, claimTrend, alertTrend] = await Promise.all([
      weeklyTrend('patents', 'filing_date'),
      weeklyTrend('news', 'published_date'),
      weeklyTrend('product_claims', 'created_at'),
      weeklyTrend('alerts', 'created_at', "t.severity IN ('high', 'critical')"),
    ]);

    res.json({
      metrics: { competitors, patents, news, threats, claims, alerts },
      trends: { patents: patentTrend, news: newsTrend, claims: claimTrend, alerts: alertTrend },
      timeRange,
    });
  } catch (error) {
    logger.error('KPI fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

router.get('/launch-momentum', async (_req: AuthRequest, res) => {
  try {
    // patents has no competitor_name column; the filing company is `filer`.
    const data = await db.queryMany(`
      SELECT filer AS competitor_name, COUNT(*)::int AS filing_count, DATE_TRUNC('month', filing_date)::date AS month
      FROM patents
      WHERE filer IS NOT NULL AND filing_date IS NOT NULL
      GROUP BY filer, DATE_TRUNC('month', filing_date)
      ORDER BY month DESC
      LIMIT 500
    `);

    res.json({ data });
  } catch (error) {
    logger.error('Launch momentum error:', error);
    res.status(500).json({ error: 'Failed to fetch launch momentum' });
  }
});

// Default: weekly counts for the last 90 days (original behaviour).
// ?granularity=month&months=6 → monthly counts for the last N calendar months.
router.get('/news-flow', async (req: AuthRequest, res) => {
  try {
    if (req.query.granularity === 'month') {
      const months = clampInt(req.query.months, 6, 1, 24);
      const data = await db.queryMany(
        `SELECT category, COUNT(*)::int AS count, DATE_TRUNC('month', published_date)::date AS month
           FROM news
          WHERE published_date >= DATE_TRUNC('month', NOW()) - ($1::int - 1) * INTERVAL '1 month'
          GROUP BY category, DATE_TRUNC('month', published_date)
          ORDER BY month ASC`,
        [months]
      );
      res.json({ data, granularity: 'month', months });
      return;
    }

    const data = await db.queryMany(`
      SELECT category, COUNT(*)::int AS count, DATE_TRUNC('week', published_date)::date AS week
      FROM news
      WHERE published_date > NOW() - INTERVAL '90 days'
      GROUP BY category, DATE_TRUNC('week', published_date)
      ORDER BY week ASC
    `);

    res.json({ data });
  } catch (error) {
    logger.error('News flow error:', error);
    res.status(500).json({ error: 'Failed to fetch news flow' });
  }
});

router.get('/competitor-matrix', async (_req: AuthRequest, res) => {
  try {
    const data = await db.queryMany(`
      SELECT competitor_name, category, COUNT(*) as claim_count
      FROM (
        SELECT DISTINCT p.filer as competitor_name, pc.category
        FROM patents p
        JOIN product_claims pc ON p.id = pc.patent_id
      ) t
      GROUP BY competitor_name, category
    `);

    res.json({ data });
  } catch (error) {
    logger.error('Competitor matrix error:', error);
    res.status(500).json({ error: 'Failed to fetch competitor matrix' });
  }
});

router.get('/top-movers', async (_req: AuthRequest, res) => {
  try {
    const data = await db.queryMany(`
      SELECT name, threat_score, recent_filings_count
      FROM competitors
      ORDER BY threat_score DESC
      LIMIT 10
    `);

    res.json({ data });
  } catch (error) {
    logger.error('Top movers error:', error);
    res.status(500).json({ error: 'Failed to fetch top movers' });
  }
});

// The user's own alerts plus organisation-wide alerts (user_id IS NULL).
router.get('/alerts', async (req: AuthRequest, res) => {
  try {
    const data = await db.queryMany(`
      SELECT id, title, message, severity, created_at, source_module
      FROM alerts
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.user?.id]);

    res.json({ alerts: data });
  } catch (error) {
    logger.error('Alerts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export default router;
