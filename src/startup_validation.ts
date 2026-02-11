/**
 * Startup validation: checks all prerequisites before server.listen().
 * On any fatal failure: log clear error, exit with code 1.
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';
import pg from 'pg';
import { getMode, getAppMode } from './lib/runtime_mode.js';
import { isSigningConfigured } from './lib/cert_signing.js';
import { isDbConfigured } from './db/index.js';
import { runMigrations } from './db/migrate.js';

const STORAGE_BASE = process.env.STORAGE_LOCAL_BASE_PATH ?? join(process.cwd(), 'storage');

function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/** Validation result for testability. */
export interface StartupValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Pure env checks (no DB, no FS). Testable with mocked process.env.
 */
export function validateEnv(): StartupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mode = getMode();

  if (!process.env.DATABASE_URL?.trim()) {
    errors.push('DATABASE_URL is not set. Set it in .env or environment.');
  }

  if (process.env.REQUIRE_AUTH === 'true' && !process.env.JWT_SECRET?.trim()) {
    errors.push('JWT_SECRET is required when REQUIRE_AUTH=true.');
  }

  if (mode === 'prod') {
    if (process.env.REQUIRE_AUTH === 'false') {
      errors.push('MODE=prod requires REQUIRE_AUTH=true.');
    }
    if (process.env.ALLOW_IMBALANCED_DRAFT_EXPORT === 'true') {
      errors.push('MODE=prod requires ALLOW_IMBALANCED_DRAFT_EXPORT=false.');
    }
    if (process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true') {
      errors.push('MODE=prod requires ALLOW_LEGACY_CERTIFIED_SOURCE=false.');
    }
  }

  if (mode === 'prod') {
    const devSecret = 'dev-secret-change-in-production';
    const jwtSecret = process.env.JWT_SECRET?.trim();
    if (!jwtSecret || jwtSecret === devSecret) {
      errors.push('Production requires a real JWT_SECRET (not the dev default). Set JWT_SECRET in the environment.');
    }
    const priv = process.env.CERT_SIGNING_PRIVATE_KEY?.trim();
    const pub = process.env.CERT_SIGNING_PUBLIC_KEY?.trim();
    if (!priv || !pub) {
      errors.push(
        'FATAL: Ed25519 signing keys required in production. Run npx tsx src/crypto/keygen.ts to generate.'
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check database connection. Creates temp pool, does not use global pool.
 */
async function checkDatabaseConnection(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('SELECT 1');
  } finally {
    await pool.end();
  }
}

/**
 * Ensure storage base path exists or can be created.
 */
async function checkStoragePath(): Promise<void> {
  await mkdir(STORAGE_BASE, { recursive: true });
}

/**
 * Full startup validation. Throws on fatal error; warnings are logged only.
 * Call before server.listen().
 */
export async function runStartupValidation(): Promise<void> {
  if (isTest()) return;

  const envResult = validateEnv();
  if (!envResult.ok) {
    for (const e of envResult.errors) {
      console.error(`[FATAL] ${e}`);
    }
    console.error('[FATAL] Startup validation failed. Refusing to start.');
    process.exit(1);
  }

  if (!isDbConfigured()) {
    console.error('[FATAL] DATABASE_URL is not set. Refusing to start.');
    process.exit(1);
  }

  try {
    await checkDatabaseConnection();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FATAL] Cannot connect to database: ${msg}`);
    process.exit(1);
  }

  try {
    await runMigrations();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FATAL] Migrations failed: ${msg}`);
    process.exit(1);
  }

  try {
    await checkStoragePath();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FATAL] Storage path cannot be created: ${STORAGE_BASE}. ${msg}`);
    process.exit(1);
  }
}

/** Print startup banner: APP_MODE, REQUIRE_AUTH, Ed25519, DB status. */
export function printStartupBanner(): void {
  const appMode = getAppMode();
  const mode = getMode();
  const authEnforced = mode === 'prod' || mode === 'demo' ? 'true (always in demo/production)' : process.env.REQUIRE_AUTH !== 'false';
  const ed25519Status = isSigningConfigured() ? 'configured' : 'not configured (auto-generated in dev)';
  const dbStatus = isDbConfigured() ? 'connected' : 'not configured';

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FinOS Agent — Startup');
  console.log(`  APP_MODE:        ${appMode}`);
  console.log(`  REQUIRE_AUTH:    ${authEnforced}`);
  console.log(`  Ed25519 keys:    ${ed25519Status}`);
  console.log(`  Database:        ${dbStatus}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}
