import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

const router = Router();

router.use(authMiddleware);

router.get('/profile', async (req: AuthRequest, res) => {
  try {
    const user = await db.queryOne(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [req.user?.id]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const access = await db.queryMany(
      'SELECT module_id, access_level FROM module_access WHERE user_id = $1',
      [req.user?.id]
    );

    res.json({ ...user, module_access: access });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;

    await db.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, req.user?.id]);

    res.json({ message: 'Profile updated' });
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/notification-preferences', async (req: AuthRequest, res) => {
  try {
    const { preferences } = req.body;

    await db.query(
      'INSERT INTO notification_preferences (user_id, preferences) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET preferences = $2',
      [req.user?.id, JSON.stringify(preferences)]
    );

    res.json({ message: 'Preferences updated' });
  } catch (error) {
    logger.error('Preferences update error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.get('/saved-searches', async (req: AuthRequest, res) => {
  try {
    const searches = await db.queryMany(
      'SELECT id, name, query, modules, created_at FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user?.id]
    );

    res.json({ searches });
  } catch (error) {
    logger.error('Saved searches fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch saved searches' });
  }
});

router.post('/saved-searches', async (req: AuthRequest, res) => {
  try {
    const { name, query, modules } = req.body;
    const { v4: uuidv4 } = require('uuid');

    const id = uuidv4();
    await db.query(
      'INSERT INTO saved_searches (id, user_id, name, query, modules, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [id, req.user?.id, name, query, modules]
    );

    res.json({ id, message: 'Search saved' });
  } catch (error) {
    logger.error('Save search error:', error);
    res.status(500).json({ error: 'Failed to save search' });
  }
});

router.delete('/saved-searches/:id', async (req: AuthRequest, res) => {
  try {
    await db.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [req.params.id, req.user?.id]);

    res.json({ message: 'Search deleted' });
  } catch (error) {
    logger.error('Delete search error:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

router.get('/alerts', async (req: AuthRequest, res) => {
  try {
    const alerts = await db.queryMany(
      'SELECT id, title, message, severity, read, created_at FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user?.id]
    );

    res.json({ alerts });
  } catch (error) {
    logger.error('Alerts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export default router;
