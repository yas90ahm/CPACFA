/**
 * Reset + migrate + optional seed + verify for a target database.
 * Destructive; only runs when explicitly allowed (NODE_ENV=test or ALLOW_DB_RESET=true).
 * Refuses to run against production-like DATABASE_URL.
 * No production runtime behavior; tooling only.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { getControlPool, runTenantMigrations } from './index.js';
import { verifySchema } from './schema_verify.js';
import { isAllowedForDestructive, looksLikeProduction } from './destructive_guards.js';

const { Pool } = pg;

function loadEnvFromProjectRoot(): void {
  const rootEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
}

function parseDatabaseUrl(url: string): { host: string; database: string; user: string; redacted: string } {
  try {
    const u = new URL(url);
    const redacted =
      u.password !== ''
        ? `${u.protocol}//${u.username}:****@${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`
        : url.replace(/:[^:@]+@/, ':****@');
    return {
      host: u.hostname,
      database: u.pathname?.slice(1) || '',
      user: u.username || '',
      redacted,
    };
  } catch {
    return { host: '', database: '', user: '', redacted: '[invalid URL]' };
  }
}


/** Reset mode: full (DROP SCHEMA) or soft (drop tables/types/functions only). */
export type ResetMode = 'full' | 'soft';

async function wipeSchemaFull(pool: pg.Pool): Promise<void> {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO postgres');
  await pool.query('GRANT ALL ON SCHEMA public TO public');
}

/**
 * Soft reset: drop all tables in public, then app-created types/enums, then app-created functions.
 * Does not drop schema or extensions (keeps Supabase-managed extension objects intact).
 * Used when full reset (DROP SCHEMA public CASCADE) fails due to permissions.
 */
async function softResetPublicSchema(pool: pg.Pool): Promise<void> {
  // A) Tables: drop each with CASCADE (order does not matter)
  const tables = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public'`
  );
  for (const row of tables.rows) {
    await pool.query(`DROP TABLE IF EXISTS public."${row.tablename}" CASCADE`);
  }

  // B) Types/enums: drop custom types in public that are NOT extension-owned
  const types = await pool.query<{ typname: string }>(
    `SELECT t.typname
     FROM pg_type t
     JOIN pg_namespace n ON t.typnamespace = n.oid
     WHERE n.nspname = 'public'
       AND t.typtype IN ('e', 'c')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')`
  );
  for (const row of types.rows) {
    await pool.query(`DROP TYPE IF EXISTS public."${row.typname}" CASCADE`);
  }

  // C) Functions: drop functions in public that are NOT extension-owned
  const funcs = await pool.query<{ proname: string; args: string }>(
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`
  );
  for (const row of funcs.rows) {
    const args = row.args ? `(${row.args})` : '()';
    await pool.query(`DROP FUNCTION IF EXISTS public."${row.proname}"${args} CASCADE`);
  }
}

async function ensureExtensions(pool: pg.Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await pool.query('CREATE EXTENSION IF NOT EXISTS "btree_gist"');
}

async function seedForTests(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING`,
    ['certification-pipeline-tenant', 'Test certification-pipeline-tenant']
  );
}

/** After connecting, log connection context (redact password). */
async function logConnectionContext(pool: pg.Pool, identity: ReturnType<typeof parseDatabaseUrl>): Promise<void> {
  const schema = await pool.query<{ current_schema: string }>('SELECT current_schema() AS current_schema');
  const searchPath = await pool.query<{ search_path: string }>('SHOW search_path');
  console.log('  host:', identity.host || '(unknown)');
  console.log('  database:', identity.database || '(unknown)');
  console.log('  user:', identity.user || '(unknown)');
  console.log('  current_schema():', schema.rows[0]?.current_schema ?? '(unknown)');
  console.log('  search_path:', searchPath.rows[0]?.search_path ?? '(unknown)');
  console.log('  URL (redacted):', identity.redacted);
}

/** Ensure public schema is empty or near-empty after reset; throw if unexpected objects remain. */
async function assertPublicSchemaEmptyAfterReset(pool: pg.Pool): Promise<void> {
  const tables = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'`
  );
  const n = parseInt(tables.rows[0]?.count ?? '0', 10);
  if (n > 0) {
    throw new Error(
      `Reset smoke check failed: public schema still has ${n} table(s). Reset may not have completed. Aborting.`
    );
  }
}

async function main(): Promise<void> {
  loadEnvFromProjectRoot();
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    console.error('DATABASE_URL is not set. Set it in .env or the environment.');
    process.exit(1);
  }

  const identity = parseDatabaseUrl(url);

  if (!isAllowedForDestructive()) {
    console.error(
      'Refusing to reset DB. Set ALLOW_DB_RESET=true or run with NODE_ENV=test.'
    );
    process.exit(1);
  }

  if (looksLikeProduction(url)) {
    console.error('[FATAL] Refusing to run: DATABASE_URL looks like production. Aborting to prevent data loss.');
    process.exit(1);
  }

  console.log('=== DB RESET START ===');
  console.log('Confirmed: ALLOW_DB_RESET or NODE_ENV=test set; URL does not look like production.');
  console.log(
    'Target:',
    [identity.host || '?', identity.database || '?', identity.user || '?'].join(' / ')
  );
  const tempPool = new Pool({ connectionString: url, max: 1 });
  let resetMode: ResetMode = 'full';

  try {
    await logConnectionContext(tempPool, identity);

    try {
      await wipeSchemaFull(tempPool);
      console.log('Reset mode: full');
    } catch (fullErr) {
      console.warn('Full reset failed:', fullErr instanceof Error ? fullErr.message : String(fullErr));
      await softResetPublicSchema(tempPool);
      resetMode = 'soft';
      console.log('Reset mode: soft');
    }

    await tempPool.query('SET search_path TO public');
    console.log('Creating extensions (if not present)...');
    await ensureExtensions(tempPool);
    await assertPublicSchemaEmptyAfterReset(tempPool);
  } finally {
    await tempPool.end();
  }

  console.log('Running migrations...');
  await runMigrations();
  const controlPool = getControlPool();
  await runTenantMigrations(controlPool);

  if (process.env.SEED_FOR_TESTS === 'true') {
    console.log('Seeding test data (SEED_FOR_TESTS=true)...');
    await seedForTests(controlPool);
  }

  console.log('Verifying schema...');
  const result = await verifySchema(controlPool);
  if (!result.ok) {
    console.error('Schema verification failed:');
    result.errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  console.log('Schema verification passed.');
  console.log('=== DB RESET COMPLETE ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
