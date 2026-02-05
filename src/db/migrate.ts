/**
 * Migrations: control DB only on startup; tenant DB via script or lazy.
 * Loads .env so MIGRATE_TENANT_URL or DATABASE_URL can be used from .env.
 */

import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { getControlPool, queryControl, isDbConfigured, runTenantMigrations } from './index.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/** Control DB migrations only (001, 002, 010, 075). Do not run 003 on control. */
const CONTROL_MIGRATION_FILES = [
  '001_initial.sql',
  '002_control_add_database_url.sql',
  '010_scheduler_lock.sql',
  '075_jobs.sql',
];

async function getAppliedVersionsControl(): Promise<number[]> {
  try {
    const r = await queryControl<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    return r.rows.map((row) => row.version);
  } catch {
    return [];
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await queryControl(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Run control DB migrations only (001, 002). */
export async function runMigrations(): Promise<void> {
  if (!isDbConfigured()) {
    console.log('DATABASE_URL not set; skipping migrations.');
    return;
  }
  const pool = getControlPool();
  await ensureMigrationsTable();
  const applied = await getAppliedVersionsControl();
  for (const file of CONTROL_MIGRATION_FILES) {
    const version = parseInt(file.replace(/^(\d+).*\.sql$/, '$1'), 10);
    if (Number.isNaN(version) || applied.includes(version)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Running control migration ${file} (version ${version})...`);
    await pool.query(sql);
    await queryControl('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
  }
  console.log('Control migrations complete.');
}

/**
 * Run tenant schema (003–063) on a given database URL.
 * URL is read from (in order): MIGRATE_TENANT_URL, DATABASE_URL (.env), or last CLI arg.
 * With Supabase URL in .env: set DATABASE_URL (or MIGRATE_TENANT_URL) then run: npx tsx src/db/migrate.ts --tenant
 */
export async function runTenantMigrationsForUrl(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  try {
    await runTenantMigrations(pool);
    console.log('Tenant migrations complete.');
  } finally {
    await pool.end();
  }
}

const isRunDirectly = process.argv[1]?.includes('migrate');
const isTenantMigrate = process.argv.includes('--tenant') || process.env.MIGRATE_TENANT_URL;

if (isRunDirectly) {
  if (isTenantMigrate) {
    const url = process.env.MIGRATE_TENANT_URL || process.env.DATABASE_URL || process.argv[process.argv.length - 1];
    if (!url || url.startsWith('-')) {
      console.error('Usage: Set MIGRATE_TENANT_URL or DATABASE_URL in .env, or run: MIGRATE_TENANT_URL=<url> tsx src/db/migrate.ts --tenant');
      process.exit(1);
    }
    runTenantMigrationsForUrl(url).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    runMigrations().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
