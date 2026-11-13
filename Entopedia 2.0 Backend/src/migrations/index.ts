/**
 * Migration runner: `npm run db:migrate`
 *
 * Applies every *.sql file in this folder in filename order, once each, and
 * records it in `schema_migrations`. Each file runs in its own transaction, so
 * a failing file leaves the database as it was before that file.
 *
 *   npm run db:migrate            schema migrations (01_…, 02_…, …)
 *   npm run db:demo               also loads demo/*.sql (sample rows for a
 *                                 local or staging database — never production)
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';

dotenv.config();

async function getMigrationClient(): Promise<{ pool: Pool; client: PoolClient; source: string }> {
  const supabaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  // 1. Try Primary: Supabase Cloud PostgreSQL
  if (supabaseUrl) {
    const supabasePool = new Pool({
      connectionString: supabaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    try {
      const client = await supabasePool.connect();
      console.log('Connected to PRIMARY database for migrations: Supabase PostgreSQL');
      return { pool: supabasePool, client, source: 'SUPABASE' };
    } catch (err) {
      console.warn(
        `Supabase unreachable (${(err as Error).message}). Falling back to Local Docker PostgreSQL...`
      );
      await supabasePool.end().catch(() => {});
    }
  }

  // 2. Fallback: Local Docker PostgreSQL
  const dockerPool = new Pool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || process.env.DB_PORT || '5432', 10),
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || 'entopedia',
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || 'postgres',
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    connectionTimeoutMillis: 3000,
  });

  const client = await dockerPool.connect();
  console.log('Connected to FALLBACK database for migrations: Local Docker PostgreSQL');
  return { pool: dockerPool, client, source: 'LOCAL_DOCKER' };
}

async function run() {
  const withDemo = process.argv.includes('--demo');
  const { pool, client, source } = await getMigrationClient();

  const dirs = [{ dir: __dirname, prefix: '' }];
  if (withDemo) dirs.push({ dir: path.join(__dirname, 'demo'), prefix: 'demo/' });

  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW())'
    );
    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map(
        (r: { filename: string }) => r.filename
      )
    );

    let count = 0;
    for (const { dir, prefix } of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const name = prefix + file;
        if (applied.has(name)) continue;
        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        process.stdout.write(`[${source}] Applying ${name} … `);
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [name]);
          await client.query('COMMIT');
          console.log('done');
          count++;
        } catch (error) {
          await client.query('ROLLBACK');
          console.log('FAILED');
          throw error;
        }
      }
    }
    console.log(count ? `${count} migration(s) applied on [${source}].` : `[${source}] Database is up to date.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});