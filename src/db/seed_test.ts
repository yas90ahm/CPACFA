/**
 * Seed minimal test data (tenants) for integration tests. Idempotent.
 * Destructive guard: refuses unless NODE_ENV=test or ALLOW_DB_RESET=true; refuses prod-like DATABASE_URL.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getControlPool } from './index.js';
import { isAllowedForDestructive, looksLikeProduction } from './destructive_guards.js';

function loadEnv(): void {
  const rootEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('DATABASE_URL is not set. Set it in .env or the environment.');
    process.exit(1);
  }

  if (!isAllowedForDestructive()) {
    console.error(
      '[FATAL] Refusing to run db:seed:test: requires NODE_ENV=test or ALLOW_DB_RESET=true. Set explicitly to confirm.'
    );
    process.exit(1);
  }

  if (looksLikeProduction(url)) {
    console.error('[FATAL] Refusing to run db:seed:test: DATABASE_URL looks like production. Aborting.');
    process.exit(1);
  }

  console.log('Confirmed: seed allowed; URL does not look like production.');
  const pool = getControlPool();
  await pool.query(
    `INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING`,
    ['certification-pipeline-tenant', 'Test certification-pipeline-tenant']
  );
  console.log('Test seed data inserted (certification-pipeline-tenant).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
