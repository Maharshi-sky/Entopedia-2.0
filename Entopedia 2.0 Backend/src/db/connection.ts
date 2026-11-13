// File: Entopedia 2.0 Backend/src/db/connection.ts

import { Pool, PoolClient, QueryResult, QueryResultRow, Submittable } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

// 1. Primary Pool: Supabase Cloud PostgreSQL (via Transaction/Session Pooler URL)
const rawSupabaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.trim().replace(/^["']|["']$/g, '') : undefined;

const supabasePool = supabaseUrl
  ? new Pool({
      connectionString: supabaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

// 2. Fallback Pool: Local Docker PostgreSQL
const dockerPool = new Pool({
  host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT || process.env.DB_PORT || '5432', 10),
  database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || 'entopedia',
  user: process.env.LOCAL_DB_USER || process.env.DB_USER || 'postgres',
  password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

// Active pool pointer (starts with Supabase if configured, else Docker)
let activePool: Pool = supabasePool || dockerPool;
let activeSource: 'SUPABASE' | 'LOCAL_DOCKER' = supabasePool ? 'SUPABASE' : 'LOCAL_DOCKER';

export const db = {
  async connect(): Promise<void> {
    const maskedHost = supabaseUrl ? supabaseUrl.split('@')[1] || 'configured' : 'NOT_SET';
    console.log(`[DB] Attempting database connection. Supabase target: ${maskedHost}`);

    if (supabasePool) {
      try {
        const client = await supabasePool.connect();
        client.release();
        activePool = supabasePool;
        activeSource = 'SUPABASE';
        console.log('[DB] Connected to PRIMARY database: Supabase PostgreSQL');
        logger.info('Connected to PRIMARY database: Supabase PostgreSQL');
        return;
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[DB] Supabase unreachable (${msg}). Falling back to Local Docker PostgreSQL...`);
        logger.warn(`Supabase unreachable (${msg}). Falling back to Local Docker PostgreSQL...`);
      }
    }

    try {
      const client = await dockerPool.connect();
      client.release();
      activePool = dockerPool;
      activeSource = 'LOCAL_DOCKER';
      console.log('[DB] Connected to FALLBACK database: Local Docker PostgreSQL');
      logger.info('Connected to FALLBACK database: Local Docker PostgreSQL');
    } catch (error) {
      const msg = (error as Error).message;
      console.error(`[DB] Both Supabase and Local Docker databases failed to connect: ${msg}`);
      logger.error('Both Supabase and Local Docker databases failed to connect:', error);
      throw error;
    }
  },

  getSource(): string {
    return activeSource;
  },

  async query<T extends any[] | QueryResultRow | Submittable = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const res = await activePool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug(`Executed query on [${activeSource}]`, { duration, rows: res.rowCount });
      return res;
    } catch (error: any) {
      // Mid-flight failover: if Supabase drops connection during runtime, retry on Local Docker
      const isNetworkError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('Connection terminated');

      if (activeSource === 'SUPABASE' && isNetworkError) {
        console.warn('[DB] Supabase connection dropped mid-query! Switching to Local Docker DB...');
        logger.warn('Supabase connection dropped mid-query! Switching to Local Docker DB...');
        activePool = dockerPool;
        activeSource = 'LOCAL_DOCKER';
        return await activePool.query<T>(text, params);
      }

      logger.error(`Query error on [${activeSource}]:`, { text, error: error.message });
      throw error;
    }
  },

  async queryOne<T extends any[] | QueryResultRow | Submittable = any>(
    text: string,
    params?: any[]
  ): Promise<T | null> {
    const res = await this.query<T>(text, params);
    return res.rows[0] || null;
  },

  async queryMany<T extends any[] | QueryResultRow | Submittable = any>(
    text: string,
    params?: any[]
  ): Promise<T[]> {
    const res = await this.query<T>(text, params);
    return res.rows;
  },

  async getClient(): Promise<PoolClient> {
    return await activePool.connect();
  },

  async close(): Promise<void> {
    if (supabasePool) await supabasePool.end();
    await dockerPool.end();
    logger.info('Database pools closed');
  },
};