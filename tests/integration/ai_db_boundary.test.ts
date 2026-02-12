/**
 * Regression test: AI pool cannot physically write to core tables (DB-enforced boundary).
 *
 * When migration 093 has run, ai_writer role has NO privileges on core.*.
 * This test uses SET ROLE to assume ai_writer and attempts INSERT into core;
 * we expect permission denied.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { isDbConfigured, getControlPool } from '../../src/db/index.js';

describe('AI DB boundary: ai_writer cannot write core tables', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) return;
  });

  it('ai_writer role cannot INSERT into core.period_trial_balance', async () => {
    if (!isDbConfigured()) return;

    const pool = getControlPool();
    // Check if migration 093 has run (schemas exist)
    const schemaCheck = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.schemata WHERE schema_name IN ('core','ai','audit')`
    );
    const schemaCount = parseInt(schemaCheck.rows[0]?.n ?? '0', 10);
    if (schemaCount < 3) {
      console.warn('AI DB boundary: migration 093 not applied (core/ai/audit schemas missing). Skipping.');
      return;
    }

    // Check if ai_writer role exists
    const roleCheck = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_roles WHERE rolname = 'ai_writer'`
    );
    if (parseInt(roleCheck.rows[0]?.n ?? '0', 10) < 1) {
      console.warn('AI DB boundary: ai_writer role not found. Skipping.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('SET ROLE ai_writer');
      const tenantId = `ai-boundary-test-${Date.now()}`;
      const periodLabel = '2025-01';

      let thrown: unknown;
      try {
        await client.query(
          `INSERT INTO core.period_trial_balance (tenant_id, period_label, entries, created_at, updated_at)
           VALUES ($1, $2, '[]'::jsonb, NOW(), NOW())`,
          [tenantId, periodLabel]
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
