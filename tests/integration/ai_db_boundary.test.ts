/**
 * Regression test: DB-enforced AI boundary (migration 093).
 *
 * - ai_writer cannot write core.* (permission denied)
 * - core_writer can perform required operations (SELECT on core tables)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { isDbConfigured, getControlPool } from '../../src/db/index.js';

async function has093Applied(pool: { query: (q: string) => Promise<{ rows: { n: string }[] }> }): Promise<boolean> {
  const schemaCheck = await pool.query(
    `SELECT count(*)::text AS n FROM information_schema.schemata WHERE schema_name IN ('core','ai','audit')`
  );
  const schemaCount = parseInt(schemaCheck.rows[0]?.n ?? '0', 10);
  if (schemaCount < 3) return false;
  const roleCheck = await pool.query(
    `SELECT count(*)::text AS n FROM pg_roles WHERE rolname IN ('core_writer','ai_writer')`
  );
  const roleCount = parseInt(roleCheck.rows[0]?.n ?? '0', 10);
  return roleCount >= 2;
}

describe('AI DB boundary: ai_writer cannot write core tables', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
  });

  it('ai_writer role cannot INSERT into core.period_trial_balance', async () => {
    if (!isDbConfigured()) return;

    const pool = getControlPool();
    if (!(await has093Applied(pool))) {
      console.warn('AI DB boundary: migration 093 not applied. Skipping.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('SET ROLE ai_writer');
      const tenantId = `ai-boundary-test-${Date.now()}`;

      let thrown: unknown;
      try {
        await client.query(
          `INSERT INTO core.period_trial_balance (tenant_id, period_label, entries, created_at, updated_at)
           VALUES ($1, $2, '[]'::jsonb, NOW(), NOW())`,
          [tenantId, '2025-01']
        );
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeDefined();
      const err = thrown as { code?: string; message?: string };
      expect(err?.code).toBe('42501');
      expect(String(err?.message ?? '').toLowerCase()).toMatch(/permission denied|denied/);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });
});

describe('AI DB boundary: core_writer can perform required operations', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
  });

  it('core_writer role can SELECT from core tables', async () => {
    if (!isDbConfigured()) return;

    const pool = getControlPool();
    if (!(await has093Applied(pool))) {
      console.warn('AI DB boundary: migration 093 not applied. Skipping.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('SET ROLE core_writer');
      const r = await client.query(`SELECT 1 FROM core.period_trial_balance LIMIT 1`);
      expect(r.rows).toBeDefined();
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });
});
