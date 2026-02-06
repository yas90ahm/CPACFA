/**
 * Journal Entry service — unit tests: lifecycle (draft → proposed → approved/posted/exported/rejected),
 * validation (balanced, period, materiality), segregation (approved_by !== created_by unless override).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  createDraftJE,
  proposeJE,
  approveJE,
  rejectJE,
  postJE,
  exportJE,
  validateBalanced,
  validatePeriod,
  validateMaterialityWarnings,
  getJournalEntry,
  listPostableJournalEntries,
  JournalEntryError,
} from '../../src/services/journal_entry_service.js';
import * as repo from '../../src/db/repositories/journal_entry_repository.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as triageService from '../../src/services/triage_service.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as findingsRepo from '../../src/db/repositories/tenant_shadow_audit_findings_repository.js';
import * as justificationService from '../../src/services/justification_service.js';
import * as shadowAuditor from '../../src/services/shadow_auditor_service.js';
import * as aiOrchestrator from '../../src/ai/ai_orchestrator.js';

const mockPool = {} as Pool;

const sampleJE = {
  id: 'je-1',
  closeSessionId: 'sess-1',
  tenantId: 't1',
  status: 'draft' as const,
  memo: 'Accrual',
  source: 'accrual' as const,
  createdBy: 'user-a',
  approvedBy: undefined,
  postedAt: undefined,
  reversalDate: undefined,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('Journal Entry — validateBalanced', () => {
  it('returns valid when debits equal credits', () => {
    const result = validateBalanced([
      { accountRef: 'Cash', debit: 100, credit: 0 },
      { accountRef: 'Revenue', debit: 0, credit: 100 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid when debits do not equal credits', () => {
    const result = validateBalanced([
      { accountRef: 'Cash', debit: 100, credit: 0 },
      { accountRef: 'Revenue', debit: 0, credit: 50 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('do not equal');
  });
});

describe('Journal Entry — createDraftJE', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws VALIDATION when lines do not balance', async () => {
    await expect(
      createDraftJE(mockPool, {
        closeSessionId: 'sess-1',
        tenantId: 't1',
        source: 'manual',
        lines: [
          { accountRef: 'Cash', debit: 100 },
          { accountRef: 'Revenue', credit: 50 },
        ],
      })
    ).rejects.toMatchObject({ code: 'VALIDATION', message: /balance/ });
  });

  it('creates draft JE with balanced lines', async () => {
    const humanProvenance = { kind: 'human_entered' as const, enteredBy: 'user-a' };
    jest.spyOn(repo, 'insertJournalEntry').mockResolvedValue({ ...sampleJE });
    jest.spyOn(repo, 'insertJournalEntryLines').mockResolvedValue([]);
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({ ...sampleJE });
    const result = await createDraftJE(mockPool, {
      closeSessionId: 'sess-1',
      tenantId: 't1',
      source: 'manual',
      memo: 'Test',
      createdBy: 'user-a',
      lines: [
        { accountRef: 'Cash', debit: 100, amountProvenance: humanProvenance },
        { accountRef: 'Revenue', credit: 100, amountProvenance: humanProvenance },
      ],
    });
    expect(result.status).toBe('draft');
    expect(repo.insertJournalEntry).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      expect.objectContaining({ closeSessionId: 'sess-1', tenantId: 't1', status: 'draft', source: 'manual' })
    );
    expect(repo.insertJournalEntryLines).toHaveBeenCalled();
  });
});

describe('Journal Entry — proposeJE', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws NOT_FOUND when JE does not exist', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue(null);
    await expect(proposeJE(mockPool, 't1', 'je-missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INVALID_STATUS when JE is not draft', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({ ...sampleJE, status: 'proposed' });
    await expect(proposeJE(mockPool, 't1', 'je-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      message: /Only draft/,
    });
  });

  it('updates status to proposed when draft and balanced', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({ ...sampleJE });
    jest.spyOn(repo, 'listJournalEntryLines').mockResolvedValue([
      { jeId: 'je-1', lineIndex: 0, accountRef: 'Cash', debit: 100, credit: 0 },
      { jeId: 'je-1', lineIndex: 1, accountRef: 'Revenue', debit: 0, credit: 100 },
    ]);
    jest.spyOn(repo, 'updateJournalEntryStatus').mockResolvedValue({ ...sampleJE, status: 'proposed' });
    const result = await proposeJE(mockPool, 't1', 'je-1');
    expect(result.status).toBe('proposed');
    expect(repo.updateJournalEntryStatus).toHaveBeenCalledWith(mockPool, 'je-1', 't1', 'proposed');
  });
});

describe('Journal Entry — approveJE (segregation)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws SEGREGATION when approvedBy equals createdBy (unless override)', async () => {
    const orig = process.env.ALLOW_SAME_USER_APPROVE;
    process.env.ALLOW_SAME_USER_APPROVE = '';
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({
      ...sampleJE,
      status: 'proposed',
      createdBy: 'user-a',
    });
    await expect(approveJE(mockPool, 't1', 'je-1', 'user-a')).rejects.toMatchObject({
      code: 'SEGREGATION',
      message: /Segregation of duties/,
    });
    process.env.ALLOW_SAME_USER_APPROVE = orig;
  });

  it('approves when approvedBy differs from createdBy', async () => {
    jest.spyOn(repo, 'getJournalEntryById')
      .mockResolvedValueOnce({ ...sampleJE, status: 'proposed', createdBy: 'user-a' })
      .mockResolvedValueOnce({ ...sampleJE, status: 'approved', approvedBy: 'user-b' });
    jest.spyOn(repo, 'updateJournalEntryStatus').mockResolvedValue({
      ...sampleJE,
      status: 'approved',
      approvedBy: 'user-b',
    });
    const result = await approveJE(mockPool, 't1', 'je-1', 'user-b');
    expect(result.status).toBe('approved');
    expect(repo.updateJournalEntryStatus).toHaveBeenCalledWith(mockPool, 'je-1', 't1', 'approved', {
      approvedBy: 'user-b',
    });
  });
});

describe('Journal Entry — rejectJE', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects proposed JE', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({ ...sampleJE, status: 'proposed' });
    jest.spyOn(repo, 'updateJournalEntryStatus').mockResolvedValue({
      ...sampleJE,
      status: 'rejected',
    });
    const result = await rejectJE(mockPool, 't1', 'je-1');
    expect(result.status).toBe('rejected');
  });
});

describe('Journal Entry — postJE', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('throws INVALID_STATUS when JE is not approved', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({ ...sampleJE, status: 'proposed' });
    await expect(postJE(mockPool, 't1', 'je-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      message: /Only approved/,
    });
  });

  it('posts approved JE and sets postedAt', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({
      ...sampleJE,
      status: 'approved',
    });
    jest.spyOn(repo, 'listJournalEntryLines').mockResolvedValue([
      { jeId: 'je-1', lineIndex: 0, accountRef: 'Cash', debit: 100, credit: 0 },
      { jeId: 'je-1', lineIndex: 1, accountRef: 'Revenue', debit: 0, credit: 100 },
    ]);
    jest.spyOn(shadowAuditor, 'runPrePostChecksAndStore').mockResolvedValue({ severity: 'ok', flags: [] });
    jest.spyOn(repo, 'updateJournalEntryStatus').mockResolvedValue({
      ...sampleJE,
      status: 'posted',
      postedAt: '2025-01-01T12:00:00Z',
    });
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({ periodEnd: '2025-01-31' } as never);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    jest.spyOn(aiOrchestrator, 'runJustifier').mockResolvedValue({
      ok: true,
      memo_markdown: '',
      irac_json: { issue: '', rule: '', analysis: '', conclusion: '' },
      prompt_version: '1',
      error: undefined,
    });
    jest.spyOn(justificationService, 'createJustificationFromAI').mockResolvedValue({ id: 'j1', createdAt: '2025-01-01T12:00:00Z' });
    const result = await postJE(mockPool, 't1', 'je-1');
    expect(result.journalEntry.status).toBe('posted');
    expect(repo.updateJournalEntryStatus).toHaveBeenCalledWith(
      mockPool,
      'je-1',
      't1',
      'posted',
      expect.objectContaining({ postedAt: expect.any(String) })
    );
  }, 10000);

  it('blocks post when JE hits restricted account and records finding', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({
      ...sampleJE,
      status: 'approved',
    });
    jest.spyOn(repo, 'listJournalEntryLines').mockResolvedValue([
      { jeId: 'je-1', lineIndex: 0, accountRef: 'Related Party Receivable', debit: 500, credit: 0 },
      { jeId: 'je-1', lineIndex: 1, accountRef: 'Revenue', debit: 0, credit: 500 },
    ]);
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({ periodEnd: '2025-01-31' } as never);
    jest.spyOn(shadowAuditor, 'runPrePostChecksAndStore').mockResolvedValue({
      severity: 'block',
      flags: [{ code: 'RESTRICTED_ACCOUNT', message: 'Account "Related Party Receivable" is on the restricted list.', severity: 'block' }],
    });
    const updateStatusSpy = jest.spyOn(repo, 'updateJournalEntryStatus');
    await expect(postJE(mockPool, 't1', 'je-1')).rejects.toMatchObject({
      code: 'SHADOW_AUDIT_BLOCK',
      message: /Shadow Auditor blocked post|restricted/,
    });
    expect(updateStatusSpy).not.toHaveBeenCalled();
  });
});

describe('Journal Entry — exportJE', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('exports posted JE', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue({
      ...sampleJE,
      status: 'posted',
    });
    jest.spyOn(repo, 'updateJournalEntryStatus').mockResolvedValue({
      ...sampleJE,
      status: 'exported',
    });
    const result = await exportJE(mockPool, 't1', 'je-1');
    expect(result.status).toBe('exported');
  });
});

describe('Journal Entry — validatePeriod', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns valid when close session exists', async () => {
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({
      id: 'sess-1',
      tenantId: 't1',
      entityId: 'e1',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      basis: 'accrual',
      standard: 'GAAP',
      status: 'in_progress',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    const result = await validatePeriod(mockPool, 't1', 'sess-1');
    expect(result.valid).toBe(true);
  });

  it('returns invalid when close session not found', async () => {
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue(null);
    const result = await validatePeriod(mockPool, 't1', 'sess-missing');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not found');
  });
});

describe('Journal Entry — validateMaterialityWarnings', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns warnings when line amount exceeds threshold', async () => {
    jest.spyOn(triageService, 'getLatestTriage').mockResolvedValue(null);
    const result = await validateMaterialityWarnings(
      mockPool,
      't1',
      'sess-1',
      [{ debit: 100 }, { credit: 50000 }],
      10000
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
    expect(result.warnings!.some((w) => w.includes('50000'))).toBe(true);
  });
});

describe('Journal Entry — getJournalEntry / listPostableJournalEntries', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('getJournalEntry returns null when not found', async () => {
    jest.spyOn(repo, 'getJournalEntryById').mockResolvedValue(null);
    const result = await getJournalEntry(mockPool, 't1', 'je-missing');
    expect(result).toBeNull();
  });

  it('listPostableJournalEntries filters to approved/posted/exported only', async () => {
    jest.spyOn(repo, 'listJournalEntries').mockResolvedValue([
      { ...sampleJE, id: 'a', status: 'draft' },
      { ...sampleJE, id: 'b', status: 'approved' },
      { ...sampleJE, id: 'c', status: 'posted' },
    ]);
    const result = await listPostableJournalEntries(mockPool, 't1', 'sess-1');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.status)).toEqual(['approved', 'posted']);
  });
});
