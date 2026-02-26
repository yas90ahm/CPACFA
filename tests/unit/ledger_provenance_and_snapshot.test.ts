/**
 * Tests: provenance stored on JE lines; lineId and provenance in snapshot payload; binder includes line_id/provenance.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createSnapshotFromTrialBalanceAndEntries } from '../../src/services/ledger_snapshot_service.js';
import type { Pool } from 'pg';

// Mock pool for snapshot creation (no DB in unit test for snapshot payload shape)
const mockPool = {
  query: async () => ({ rows: [{ id: 'snap-uuid', tenant_id: 't1', period_label: '2025-01', created_at: new Date().toISOString(), created_by: null, source: 'precheck', snapshot_payload_json: {}, snapshot_hash: 'h', hash_version: 1, close_session_id: null }] }),
} as unknown as Pool;

describe('ledger provenance and snapshot', () => {
  describe('snapshot payload includes lineId and amountProvenance', () => {
    it('createSnapshotFromTrialBalanceAndEntries includes lineId in trialBalance entries', async () => {
      const insertCalls: { payload: unknown }[] = [];
      const capturePool = {
        query: async (sql: string, params?: unknown[]) => {
          if (sql.includes('INSERT INTO ledger_snapshots') && params && params[4] != null) {
            const payload = params[4];
            if (typeof payload === 'string') insertCalls.push({ payload: JSON.parse(payload) });
          }
          return {
            rows: [
              {
                id: 'snap-1',
                tenant_id: 't1',
                period_label: '2025-01',
                created_at: new Date().toISOString(),
                created_by: null,
                source: 'precheck',
                snapshot_payload_json: {},
                snapshot_hash: 'abc',
                hash_version: 1,
                close_session_id: null,
              },
            ],
          };
        },
      } as unknown as Pool;

      await createSnapshotFromTrialBalanceAndEntries(capturePool, {
        tenantId: 't1',
        periodLabel: '2025-01',
        source: 'precheck',
        trialBalance: {
          entries: [
            { lineId: 'line-uuid-1', accountName: 'Cash', debit: 1000, credit: 0 },
            { lineId: 'line-uuid-2', accountName: 'Revenue', debit: 0, credit: 1000 },
          ],
          totalDebits: 1000,
          totalCredits: 1000,
        },
      });

      expect(insertCalls.length).toBeGreaterThan(0);
      const payload = insertCalls[0].payload as { trialBalance?: { entries?: Array<{ lineId?: string }> } };
      expect(payload.trialBalance?.entries).toHaveLength(2);
      expect(payload.trialBalance?.entries?.[0].lineId).toBe('line-uuid-1');
      expect(payload.trialBalance?.entries?.[1].lineId).toBe('line-uuid-2');
    });

    it('snapshot payload includes amountProvenance on optional entries', async () => {
      const insertCalls: { payload: unknown }[] = [];
      const capturePool = {
        query: async (sql: string, params?: unknown[]) => {
          if (sql.includes('INSERT INTO ledger_snapshots') && params?.[4] != null) {
            const raw = params[4];
            const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
            insertCalls.push({ payload });
          }
          return {
            rows: [
              {
                id: 'snap-2',
                tenant_id: 't1',
                period_label: '2025-01',
                created_at: new Date().toISOString(),
                created_by: null,
                source: 'close_session',
                snapshot_payload_json: {},
                snapshot_hash: 'def',
                hash_version: 1,
                close_session_id: 'cs-1',
              },
            ],
          };
        },
      } as unknown as Pool;

      await createSnapshotFromTrialBalanceAndEntries(capturePool, {
        tenantId: 't1',
        periodLabel: '2025-01',
        source: 'close_session',
        closeSessionId: 'cs-1',
        trialBalance: {
          entries: [{ lineId: 'tb-1', accountName: 'Cash', debit: 1000, credit: 0 }],
          totalDebits: 1000,
          totalCredits: 1000,
        },
        entries: [
          {
            accountName: 'Revenue',
            debit: 0,
            credit: 100,
            amountProvenance: { kind: 'human_entered', enteredBy: 'user-1' },
          },
        ],
      });

      expect(insertCalls.length).toBeGreaterThan(0);
      const payload = insertCalls[0].payload as { entries?: Array<{ amountProvenance?: { kind: string } }> };
      expect(payload.entries).toHaveLength(1);
      expect(payload.entries?.[0].amountProvenance).toEqual({ kind: 'human_entered', enteredBy: 'user-1' });
    });
  });
});
