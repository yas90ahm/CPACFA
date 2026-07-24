import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import { verifyChain } from '../../src/db/repositories/audit_ledger_repository.js';

describe('audit ledger checkpoints', () => {
  it('persists text audit entry IDs without coercing them to UUIDs', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM audit_chain_checkpoints')) {
        return {
          rows: [{
            last_verified_entry_id: 'al-1700000000000-abc1234',
            last_verified_hash: 'checkpoint-hash',
            entries_verified: 1,
          }],
        };
      }
      if (sql.includes('SELECT created_at FROM audit_ledger')) {
        return { rows: [{ created_at: '2025-01-01T00:00:00.000Z' }] };
      }
      return { rows: [] };
    });
    const pool = { query } as unknown as Pool;

    const result = await verifyChain(pool, 'tenant-1');

    expect(result.valid).toBe(true);
    expect(result.latestEntryId).toBe('al-1700000000000-abc1234');

    const checkpointWrite = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO audit_chain_checkpoints')
    );
    expect(checkpointWrite).toBeDefined();
    expect(String(checkpointWrite?.[0])).not.toContain('::uuid');
    expect(checkpointWrite?.[1]).toEqual([
      'tenant-1',
      'al-1700000000000-abc1234',
      'checkpoint-hash',
      1,
      expect.any(String),
    ]);
  });
});
