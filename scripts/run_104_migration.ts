/**
 * One-off: run only migration 104 (audit_ledger before_state/after_state).
 * Use when full tenant migrate fails due to other migrations.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getControlPool, queryControl, isDbConfigured } from '../src/db/index.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const VERSION = 104;
const FILE = '104_audit_ledger_before_after_state.sql';

async function main() {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL not set.');
    process.exit(1);
  }
  const pool = getControlPool();
  const applied = await queryControl<{ version: number }>(
    'SELECT version FROM schema_migrations WHERE version = $1',
    [VERSION]
  );
  if (applied.rows.length > 0) {
    console.log(`Migration ${VERSION} already applied.`);
    process.exit(0);
  }
  const sql = readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8');
  console.log(`Running migration ${FILE}...`);
  await pool.query(sql);
  await queryControl('INSERT INTO schema_migrations (version) VALUES ($1)', [VERSION]);
  console.log(`Migration ${VERSION} applied.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
