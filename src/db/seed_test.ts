/**
 * Seed minimal test data (tenants) for integration tests. Idempotent.
 * Loads .env from project root. No destructive actions.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getControlPool } from './index.js';

function loadEnv(): void {
  const rootEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Set it in .env or the environment.');
    process.exit(1);
  }
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
