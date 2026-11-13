/**
 * Create or update a user: `npm run db:seed -- --email <email> --password <password> [--name <name>] [--role <role>]`
 *
 * POST /api/auth/register always creates a `marketing` user, so this is the way
 * to create the first admin, and the service account the frontend uses to read
 * data (ENTOPEDIA_API_EMAIL / ENTOPEDIA_API_PASSWORD in the frontend's .env).
 * Admins are given `full` access to every module.
 *
 * Roles used by the API: admin, regulatory_specialist, marketing.
 */
import dotenv from 'dotenv';
import bcryptjs from 'bcryptjs';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function run() {
  const email = arg('email');
  const password = arg('password');
  const name = arg('name') || 'Entopedia Admin';
  const role = arg('role') || 'admin';

  if (!email || !password) {
    console.error('Usage: npm run db:seed -- --email <email> --password <password> [--name <name>] [--role admin|regulatory_specialist|marketing]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Use a password of at least 10 characters.');
    process.exit(1);
  }

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const hash = await bcryptjs.hash(password, 10);
    const user = await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, is_active = true, updated_at = NOW()
       RETURNING id, (xmax = 0) AS inserted`,
      [uuidv4(), email, name, hash, role]
    );
    const { id, inserted } = user.rows[0];

    if (role === 'admin') {
      await pool.query(
        `INSERT INTO module_access (user_id, module_id, access_level)
         SELECT $1, id, 'full' FROM modules
         ON CONFLICT (user_id, module_id) DO UPDATE SET access_level = 'full'`,
        [id]
      );
    }

    console.log(`${inserted ? 'Created' : 'Updated'} ${role} user ${email}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
