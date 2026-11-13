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
import { Pool } from 'pg';

dotenv.config();

async function run() {
  const withDemo = process.argv.includes('--demo');
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  const dirs = [{ dir: __dirname, prefix: '' }];
  if (withDemo) dirs.push({ dir: path.join(__dirname, 'demo'), prefix: 'demo/' });

  const client = await pool.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW())'
    );
    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r: { filename: string }) => r.filename)
    );

    let count = 0;
    for (const { dir, prefix } of dirs) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const name = prefix + file;
        if (applied.has(name)) continue;
        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        process.stdout.write(`Applying ${name} … `);
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
    console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
