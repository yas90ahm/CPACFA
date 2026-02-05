/**
 * Audit ledger service — tamper detection and chain verification tests.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { recordMaterialEvent, verifyChain } from '../../src/services/audit_ledger_service.js';
import * as auditLedgerRepo from '../../src/db/repositories/audit_ledger_repository.js';
import type { Pool } from 'pg';

const mockPool = {
  query: jest.fn(),
} as unknown as Pool;

describe('Audit ledger — chain verification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('verifyChain returns valid when chain is intact', async () => {
    jest.spyOn(auditLedgerRepo, 'verifyChain').mockResolvedValue({
      valid: true,
      entryCount: 3,
      verifiedAt: '2025-01-01T00:00:00Z',
      latestEntryHash: 'abc123',
      latestEntryId: 'al-3',
    });
    const result = await verifyChain(mockPool, 'tenant-1');
    expect(result.valid).toBe(true);
    expect(result.brokenAtEntryId).toBeUndefined();
    expect(result.entryCount).toBe(3);
    expect(result.latestEntryHash).toBe('abc123');
  });

  it('verifyChain returns invalid when chain is broken (hash mismatch)', async () => {
    jest.spyOn(auditLedgerRepo, 'verifyChain').mockResolvedValue({
      valid: false,
      brokenAtEntryId: 'al-123',
      message: 'Hash mismatch',
      entryCount: 2,
      verifiedAt: '2025-01-01T00:00:00Z',
    });
    const result = await verifyChain(mockPool, 'tenant-1');
    expect(result.valid).toBe(false);
    expect(result.brokenAtEntryId).toBe('al-123');
    expect(result.message).toContain('Hash');
  });

  it('verifyChain returns invalid when chain link broken (previous_entry_hash)', async () => {
    jest.spyOn(auditLedgerRepo, 'verifyChain').mockResolvedValue({
      valid: false,
      brokenAtEntryId: 'al-456',
      message: 'Chain link broken (previous_entry_hash)',
      entryCount: 1,
      verifiedAt: '2025-01-01T00:00:00Z',
    });
    const result = await verifyChain(mockPool, 'tenant-1');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Chain link');
  });
});

describe('Audit ledger — recordMaterialEvent', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('recordMaterialEvent appends entry via repository', async () => {
    const appendSpy = jest.spyOn(auditLedgerRepo, 'appendEntry').mockResolvedValue({
      id: 'al-1',
      tenantId: 't1',
      periodLabel: '2025-01',
      eventType: 'export_event',
      deterministicFlagSnapshot: { format: 'pdf' },
      agentDissentSnapshot: null,
      userPromptRationale: 'Material event: export_event',
      previousEntryHash: null,
      entryHash: 'abc123',
      createdAt: '2025-01-01T00:00:00Z',
      createdBy: null,
    });
    await recordMaterialEvent(mockPool, {
      tenantId: 't1',
      periodLabel: '2025-01',
      eventType: 'export_event',
      deterministicFlagSnapshot: { format: 'pdf' },
    });
    expect(appendSpy).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        tenantId: 't1',
        periodLabel: '2025-01',
        eventType: 'export_event',
        deterministicFlagSnapshot: { format: 'pdf' },
        userPromptRationale: 'Material event: export_event',
      })
    );
  });
});

describe('Audit ledger — tamper detection (repository-level)', () => {
  it('verifyChain detects altered records via hash recomputation', async () => {
    // The repository recomputes hash from row data; if row was tampered, computed !== stored
    const { verifyChain: repoVerifyChain } = await import(
      '../../src/db/repositories/audit_ledger_repository.js'
    );
    const queryMock = jest.fn<() => Promise<{ rows: unknown[] }>>();
    const pool = { query: queryMock } as unknown as Pool;
    // Simulate one row with wrong entry_hash (tampered)
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'al-1',
          tenant_id: 't1',
          period_label: '2025-01',
          event_type: 'export_event',
          deterministic_flag_snapshot: { format: 'pdf' },
          agent_dissent_snapshot: null,
          user_prompt_rationale: 'Material event: export_event',
          previous_entry_hash: null,
          entry_hash: 'wrong-hash-intentionally-tampered',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
    } as { rows: unknown[] });
    const result = await repoVerifyChain(pool, 't1');
    expect(result.valid).toBe(false);
    expect(result.brokenAtEntryId).toBe('al-1');
    expect(result.message).toBe('Hash mismatch');
  });
});
