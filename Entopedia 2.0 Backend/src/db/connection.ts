// File: Entopedia 2.0 Backend/src/db/connection.ts

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

// SEC-03: Fail-fast check for critical database environment variables
const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingVars.length > 0 && !process.env.DATABASE_URL) {
  logger.error(
    `[FATAL] Missing required database environment variables: ${missingVars.join(', ')}. Refusing to start with insecure fallbacks.`
  );
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export const db = {
  async connect(): Promise<void> {
    try {
      const client = await pool.connect();
      client.release();
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Failed to establish database connection:', error);
      throw error;
    }
  },

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const res = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Query error:', { text, error });
      throw error;
    }
  },

  async queryOne<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T | null> {
    const res = await this.query<T>(text, params);
    return res.rows[0] || null;
  },

  async queryMany<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> {
    const res = await this.query<T>(text, params);
    return res.rows;
  },

  async getClient(): Promise<PoolClient> {
    return await pool.connect();
  },

  async close(): Promise<void> {
    await pool.end();
    logger.info('Database pool closed');
  },
};