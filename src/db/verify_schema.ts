/**
 * Run schema verification only. Exits non-zero if any required table/column is missing.
 * Loads .env from project root. No destructive actions.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getControlPool } from './index.js';
import { verifySchema } from './schema_verify.js';

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
  const result = await verifySchema(pool);
  if (!result.ok) {
    console.error('Schema verification failed:');
    result.errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  console.log('Schema verification passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
