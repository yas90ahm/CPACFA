/**
 * One-off: DROP SCHEMA public CASCADE, CREATE SCHEMA public, GRANT, and extensions.
 * Use when you want a clean schema before running migrations (e.g. no psql available).
 * Requires DATABASE_URL in .env. No ALLOW_DB_RESET check (run explicitly).
 */
import dotenv from 'dotenv';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: url });
  try {
    console.log('Dropping schema public CASCADE...');
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    console.log('Creating schema public...');
    await pool.query('CREATE SCHEMA public');
    await pool.query('GRANT ALL ON SCHEMA public TO postgres');
    await pool.query('GRANT ALL ON SCHEMA public TO public');
    console.log('Creating extensions...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "btree_gist"');
    console.log('Done. Schema is clean. Run: npm run migrate');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
