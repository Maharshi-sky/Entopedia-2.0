import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { jwtExpiry, jwtSecret } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

function signToken(user: { id: string; email: string; role: string }) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret(), {
    expiresIn: jwtExpiry(),
  });
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const existing = await db.queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }

    const password_hash = await bcryptjs.hash(password, 10);
    const id = uuidv4();

    await db.query(
      'INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
      [id, email, name, password_hash, 'marketing', true]
    );

    const token = signToken({ id, email, role: 'marketing' });

    res.status(201).json({ id, email, name, token });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Missing email or password' });
      return;
    }

    const user = await db.queryOne(
      'SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (!user || !(await bcryptjs.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.is_active === false) {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    const token = signToken(user);

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, token });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', (req, res) => {
  try {
    const { token } = req.body;
    const decoded = jwt.verify(token, jwtSecret()) as { id: string; email: string; role: string };

    res.json({ token: signToken(decoded) });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
