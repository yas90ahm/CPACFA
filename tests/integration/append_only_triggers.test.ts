/**
 * Integration tests: database-level append-only / immutability triggers.
 * Ensures tamper-proof enforcement for audit_ledger, ledger_snapshots, and period_trial_balance.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { isDbConfigured, getTenantPool, queryControl } from '../../src/db/index.js';
import { recordMaterialEvent } from '../../src/services/audit_ledger_service.js';
import { randomUUID } from 'crypto';

const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? 'append-only-triggers-tenant';

describe('Append-only / immutability triggers', () => {
  beforeAll(async () => {
    if (!isDbConfigured()) {
      console.warn('Append-only triggers: DATABASE_URL not set; skipping.');
      return;
    }
    await queryControl(
      'INSERT INTO tenants (id, name, database_url) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING',
      [TEST_TENANT_ID, `Test ${TEST_TENANT_ID}`]
    );
  });

  describe('audit_ledger', () => {
    it('INSERT succeeds', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await recordMaterialEvent(pool, {
        tenantId: TEST_TENANT_ID,
        periodLabel: '2025-10',
        eventType: 'certify_close',
        deterministicFlagSnapshot: { closeSessionId: 'sess-trigger-test', periodLabel: '2025-10' },
        createdBy: 'test',
      });
      const r = await pool.query(
        'SELECT id FROM audit_ledger WHERE tenant_id = $1 AND period_label = $2',
        [TEST_TENANT_ID, '2025-10']
      );
      expect(r.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('UPDATE throws exception', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      const r = await pool.query<{ id: string }>(
        'SELECT id FROM audit_ledger WHERE tenant_id = $1 LIMIT 1',
        [TEST_TENANT_ID]
      );
      const id = r.rows[0]?.id;
      if (!id) {
        console.warn('No audit_ledger entries; skipping UPDATE test.');
        return;
      }
      await expect(
        pool.query('UPDATE audit_ledger SET user_prompt_rationale = $1 WHERE id = $2', [
          'tampered',
          id,
        ])
      ).rejects.toThrow(/append-only|prohibited/i);
    });

    it('DELETE throws exception', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      const r = await pool.query<{ id: string }>(
        'SELECT id FROM audit_ledger WHERE tenant_id = $1 LIMIT 1',
        [TEST_TENANT_ID]
      );
      const id = r.rows[0]?.id;
      if (!id) {
        console.warn('No audit_ledger entries; skipping DELETE test.');
        return;
      }
      await expect(pool.query('DELETE FROM audit_ledger WHERE id = $1', [id])).rejects.toThrow(
        /append-only|prohibited/i
      );
    });
  });

  describe('ledger_snapshots', () => {
    let snapshotId: string | null = null;

    beforeAll(async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      const id = randomUUID();
      await pool.query(
        `INSERT INTO ledger_snapshots (id, tenant_id, period_label, source, snapshot_payload_json, snapshot_hash, hash_version)
         VALUES ($1, $2, $3, $4, $5, $6, 1)`,
        [
          id,
          TEST_TENANT_ID,
          '2025-10',
          'precheck',
          JSON.stringify({ entries: [] }),
          'abc123hash',
        ]
      );
      snapshotId = id;
    });

    it('INSERT succeeds', async () => {
      if (!isDbConfigured()) return;
      expect(snapshotId).toBeTruthy();
    });

    it('UPDATE throws exception', async () => {
      if (!isDbConfigured() || !snapshotId) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await expect(
        pool.query('UPDATE ledger_snapshots SET snapshot_hash = $1 WHERE id = $2', [
          'tampered_hash',
          snapshotId,
        ])
      ).rejects.toThrow(/immutable|prohibited/i);
    });

    it('DELETE throws exception', async () => {
      if (!isDbConfigured() || !snapshotId) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await expect(
        pool.query('DELETE FROM ledger_snapshots WHERE id = $1', [snapshotId])
      ).rejects.toThrow(/immutable|prohibited/i);
    });
  });

  describe('period_trial_balance (certified session)', () => {
    const PERIOD = '2099-01';
    const PERIOD_INSERT = '2099-02'; // Different period for Test D
    const ENTITY_ID = 'entity-tb-trigger-' + Date.now();
    const sessionId = 'sess-certified-tb-trigger-' + Date.now();
    const sessionIdInsert = 'sess-certified-tb-insert-' + Date.now();

    beforeAll(async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      // Clean slate: delete sessions for our test periods first (by period_start), then TB
      await pool.query(
        `DELETE FROM close_sessions WHERE tenant_id = $1 AND to_char(period_start, 'YYYY-MM') IN ($2, $3)`,
        [TEST_TENANT_ID, PERIOD, PERIOD_INSERT]
      );
      await pool.query(
        'DELETE FROM period_trial_balance WHERE tenant_id = $1 AND period_label IN ($2, $3)',
        [TEST_TENANT_ID, PERIOD, PERIOD_INSERT]
      );
      // Test A: Insert TB when session is NOT certified → succeeds
      await pool.query(
        `INSERT INTO close_sessions (id, tenant_id, entity_id, period_start, period_end, basis, standard, status)
         VALUES ($1, $2, $3, $4::date, $5::date, 'accrual', 'GAAP', 'draft')`,
        [sessionId, TEST_TENANT_ID, ENTITY_ID, `${PERIOD}-01`, `${PERIOD}-28`]
      );
      await pool.query(
        `INSERT INTO period_trial_balance (tenant_id, period_label, source, entries)
         VALUES ($1, $2, 'uploaded', $3)`,
        [TEST_TENANT_ID, PERIOD, JSON.stringify([{ accountName: 'Cash', debit: 1000, credit: 0 }])]
      );
      // Now certify the session so UPDATE/DELETE are blocked
      await pool.query(
        `UPDATE close_sessions SET status = 'certified' WHERE id = $1 AND tenant_id = $2`,
        [sessionId, TEST_TENANT_ID]
      );
    });

    it('A) INSERT succeeds when session is NOT certified', async () => {
      if (!isDbConfigured()) return;
      // Already verified in beforeAll: INSERT when draft succeeds
      const pool = await getTenantPool(TEST_TENANT_ID);
      const r = await pool.query(
        'SELECT 1 FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
        [TEST_TENANT_ID, PERIOD]
      );
      expect(r.rows.length).toBe(1);
    });

    it('B) UPDATE throws when session certified', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await expect(
        pool.query(
          'UPDATE period_trial_balance SET entries = $1 WHERE tenant_id = $2 AND period_label = $3',
          [JSON.stringify([{ accountName: 'Cash', debit: 9999, credit: 0 }]), TEST_TENANT_ID, PERIOD]
        )
      ).rejects.toThrow(/immutable when linked close_session is certified|prohibited/i);
    });

    it('C) DELETE throws when session certified', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await expect(
        pool.query('DELETE FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2', [
          TEST_TENANT_ID,
          PERIOD,
        ])
      ).rejects.toThrow(/immutable when linked close_session is certified|prohibited/i);
    });

    it('D) INSERT new row when session certified succeeds (trigger blocks UPDATE/DELETE only)', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await pool.query(
        `INSERT INTO close_sessions (id, tenant_id, entity_id, period_start, period_end, basis, standard, status)
         VALUES ($1, $2, $3, $4::date, $5::date, 'accrual', 'GAAP', 'certified')`,
        [sessionIdInsert, TEST_TENANT_ID, ENTITY_ID, `${PERIOD_INSERT}-01`, `${PERIOD_INSERT}-28`]
      );
      await pool.query(
        `INSERT INTO period_trial_balance (tenant_id, period_label, source, entries)
         VALUES ($1, $2, 'uploaded', $3)`,
        [TEST_TENANT_ID, PERIOD_INSERT, JSON.stringify([{ accountName: 'Cash', debit: 500, credit: 0 }])]
      );
      const r = await pool.query(
        'SELECT 1 FROM period_trial_balance WHERE tenant_id = $1 AND period_label = $2',
        [TEST_TENANT_ID, PERIOD_INSERT]
      );
      expect(r.rows.length).toBe(1);
    });

    it('E) ON CONFLICT DO UPDATE when session certified throws', async () => {
      if (!isDbConfigured()) return;
      const pool = await getTenantPool(TEST_TENANT_ID);
      await expect(
        pool.query(
          `INSERT INTO period_trial_balance (tenant_id, period_label, source, entries)
           VALUES ($1, $2, 'uploaded', $3)
           ON CONFLICT (tenant_id, period_label) DO UPDATE SET entries = EXCLUDED.entries`,
          [TEST_TENANT_ID, PERIOD, JSON.stringify([{ accountName: 'Cash', debit: 8888, credit: 0 }])]
        )
      ).rejects.toThrow(/immutable when linked close_session is certified|prohibited/i);
    });
  });
});
