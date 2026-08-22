// @ts-nocheck — pool query mocks intentionally return only fields used by each repository method.
import { describe, expect, it, jest } from '@jest/globals';
import type { Pool } from 'pg';
import {
  beginPosting,
  markTerminal,
} from '../../src/db/repositories/journal_entry_erp_writeback_repository.js';
import {
  erpWritebackJobId,
  journalEntryErpIdempotencyKey,
} from '../../src/services/journal_entry_erp_writeback_service.js';

describe('approved ERP journal-entry writeback', () => {
  it('generates stable, tenant-scoped duplicate-prevention keys', () => {
    const first = journalEntryErpIdempotencyKey('tenant-1', 'je-1');
    expect(first).toBe(journalEntryErpIdempotencyKey('tenant-1', 'je-1'));
    expect(first).not.toBe(journalEntryErpIdempotencyKey('tenant-2', 'je-1'));
    expect(first.length).toBeLessThanOrEqual(50);

    expect(erpWritebackJobId('tenant-1', 'je-1')).toBe(
      erpWritebackJobId('tenant-1', 'je-1')
    );
  });

  it('claims only a pending outbox row before any external call', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    const result = await beginPosting(pool, 'tenant-1', 'je-1');

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      ['tenant-1', 'je-1']
    );
  });

  it('moves an ambiguous posting attempt to reconciliation-required, never back to pending', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await markTerminal(
      pool,
      'tenant-1',
      'je-1',
      'reconciliation_required',
      'ERP result unknown'
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'posting')"),
      ['tenant-1', 'je-1', 'reconciliation_required', 'ERP result unknown']
    );
  });
});
