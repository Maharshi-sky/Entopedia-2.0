// File: Entopedia 2.0 Backend/src/index.ts

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { db } from './db/connection';
import { redis } from './db/redis';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import competitorRoutes from './routes/competitor.routes';
import patentRoutes from './routes/patent.routes';
import regulatoryRoutes from './routes/regulatory.routes';
import newsRoutes from './routes/news.routes';
import claimRoutes from './routes/claim.routes';
import pestVisionRoutes from './routes/pestVision.routes';
import papersRoutes from './routes/papers.routes';
import aiRoutes from './routes/ai.routes';
import adminRoutes from './routes/admin.routes';
import auditRoutes from './routes/audit.routes';
import userRoutes from './routes/user.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// SEC-01: Strict CORS Origin Allow-list
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server, curl, Next.js internal auth proxy (no origin header)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`Blocked unauthorized CORS access attempt from origin: ${origin}`);
      return callback(new Error('CORS policy violation: origin not permitted'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route Registrations
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/competitor', competitorRoutes);
app.use('/api/competitors', competitorRoutes);

app.use('/api/patent', patentRoutes);
app.use('/api/patents', patentRoutes);

app.use('/api/regulatory', regulatoryRoutes);
app.use('/api/news', newsRoutes);

app.use('/api/claim', claimRoutes);
app.use('/api/claims', claimRoutes);

app.use('/api/pest-vision', pestVisionRoutes);
app.use('/api/papers', papersRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit', auditRoutes);

app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes);

// 404 Handler
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled request error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

async function startServer() {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not configured. Terminating process.');
    process.exit(1);
  }

  try {
    await db.connect();
    logger.info('Database connected successfully');

    try {
      await redis.connect();
    } catch (error) {
      logger.warn(`Redis cache unavailable, running in direct mode: ${(error as Error).message}`);
    }

    app.listen(PORT, () => {
      logger.info(`Entopedia 2.0 API engine running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Fatal startup error:', error);
    process.exit(1);
  }
}

startServer();

export default app;