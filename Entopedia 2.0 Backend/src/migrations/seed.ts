/**
 * Create or update a user: `npm run db:seed -- --email <email> --password <password> [--name <name>] [--role <role>]`
 *
 * Also supports environment variables (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) or defaults
 * so automated cloud deployments (Render) can seed the initial admin account without CLI flags.
 *
 * Roles used by the API: admin, regulatory_specialist, marketing.
 */
import dotenv from 'dotenv';
import bcryptjs from 'bcryptjs';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function getSeedClient(): Promise<{ pool: Pool; client: PoolClient; source: string }> {
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
      console.log('Connected to PRIMARY database for seeding: Supabase PostgreSQL');
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
  console.log('Connected to FALLBACK database for seeding: Local Docker PostgreSQL');
  return { pool: dockerPool, client, source: 'LOCAL_DOCKER' };
}

async function run() {
  const email =
    arg('email') ||
    process.env.SEED_ADMIN_EMAIL ||
    process.env.ENTOPEDIA_API_EMAIL ||
    'admin@entopedia.com';

  const password =
    arg('password') ||
    process.env.SEED_ADMIN_PASSWORD ||
    process.env.ENTOPEDIA_API_PASSWORD ||
    'Entopedia@2026';

  const name = arg('name') || 'Entopedia Admin';
  const role = arg('role') || 'admin';

  if (password.length < 10) {
    console.error('Use a password of at least 10 characters.');
    process.exit(1);
  }

  const { pool, client, source } = await getSeedClient();

  try {
    const hash = await bcryptjs.hash(password, 10);
    const user = await client.query(
      `INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = true,
         updated_at = NOW()
       RETURNING id, (xmax = 0) AS inserted`,
      [uuidv4(), email, name, hash, role]
    );
    const { id, inserted } = user.rows[0];

    if (role === 'admin') {
      await client.query(
        `INSERT INTO module_access (user_id, module_id, access_level)
         SELECT $1, id, 'full' FROM modules
         ON CONFLICT (user_id, module_id) DO UPDATE SET access_level = 'full'`,
        [id]
      );
    }

    console.log(`[${source}] ${inserted ? 'Created' : 'Updated'} ${role} user: ${email}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});