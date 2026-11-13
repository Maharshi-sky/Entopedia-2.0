import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { category, limit = 50, offset = 0, saved_only = false } = req.query;
    const params: any[] = [];
    let query = 'SELECT * FROM news WHERE 1=1';

    if (category) {
      query += ' AND category = $' + (params.length + 1);
      params.push(category);
    }

    if (saved_only) {
      query += ' AND id = ANY((SELECT news_id FROM saved_news WHERE user_id = $' + (params.length + 1) + '))';
      params.push(req.user?.id);
    }

    query += ' ORDER BY published_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const news = await db.queryMany(query, params);
    const total = await db.queryOne('SELECT COUNT(*) as count FROM news', []);

    res.json({
      data: news,
      pagination: { limit, offset, total: total?.count || 0 },
    });
  } catch (error) {
    logger.error('News list error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const news = await db.queryOne('SELECT * FROM news WHERE id = $1', [req.params.id]);

    if (!news) {
      res.status(404).json({ error: 'News not found' });
      return;
    }

    res.json(news);
  } catch (error) {
    logger.error('News detail error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.post('/:id/save', async (req: AuthRequest, res) => {
  try {
    await db.query(
      'INSERT INTO saved_news (user_id, news_id, saved_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
      [req.user?.id, req.params.id]
    );

    res.json({ message: 'News saved' });
  } catch (error) {
    logger.error('Save news error:', error);
    res.status(500).json({ error: 'Failed to save news' });
  }
});

router.post('/:id/add-to-newsletter', async (req: AuthRequest, res) => {
  try {
    const { newsletter_id } = req.body;

    await db.query(
      'INSERT INTO newsletter_items (newsletter_id, news_id, position) VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM newsletter_items WHERE newsletter_id = $1))',
      [newsletter_id, req.params.id]
    );

    res.json({ message: 'Added to newsletter' });
  } catch (error) {
    logger.error('Add to newsletter error:', error);
    res.status(500).json({ error: 'Failed to add to newsletter' });
  }
});

router.get('/categories/list', async (_req: AuthRequest, res) => {
  try {
    const categories = await db.queryMany(
      'SELECT DISTINCT category FROM news ORDER BY category'
    );

    res.json({
      categories: categories.map((c: any) => c.category),
    });
  } catch (error) {
    logger.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
