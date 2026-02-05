/**
 * Close checklist and readiness — unit tests: initialize template, computeReadiness (hard/soft blockers),
 * readiness changes as items complete, export blocked when hard blockers exist.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  initializeChecklistTemplate,
  computeReadiness,
  getChecklistItems,
  completeChecklistItem,
  emitIssuesForStuckChecklist,
} from '../../src/services/close_checklist_readiness_service.js';
import * as itemRepo from '../../src/db/repositories/close_checklist_item_repository.js';
import * as reconRepo from '../../src/db/repositories/recon_repository.js';
import * as issueService from '../../src/services/issue_item_service.js';
import * as jeRepo from '../../src/db/repositories/journal_entry_repository.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as periodExportChecks from '../../src/db/repositories/period_export_checks_repository.js';

const mockPool = {} as Pool;

const sampleSession = {
  id: 'sess-1',
  tenantId: 't1',
  entityId: 'e1',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  basis: 'accrual' as const,
  standard: 'GAAP',
  status: 'in_progress' as const,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const sampleItem = {
  id: 'item-1',
  closeSessionId: 'sess-1',
  code: 'CASH_REC' as const,
  name: 'Cash reconciliation complete',
  status: 'pending' as const,
  required: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('Close checklist readiness — initializeChecklistTemplate', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates 4 default items when none exist', async () => {
    jest.spyOn(itemRepo, 'hasChecklistForSession').mockResolvedValue(false);
    jest.spyOn(itemRepo, 'insertChecklistItem').mockResolvedValue({ ...sampleItem });
    const result = await initializeChecklistTemplate(mockPool, 'sess-1');
    expect(result).toHaveLength(4);
    expect(itemRepo.insertChecklistItem).toHaveBeenCalledTimes(4);
  });

  it('returns existing items when checklist already exists', async () => {
    jest.spyOn(itemRepo, 'hasChecklistForSession').mockResolvedValue(true);
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem },
      { ...sampleItem, id: 'item-2', code: 'NO_CRITICAL_ISSUES' },
    ]);
    const insertSpy = jest.spyOn(itemRepo, 'insertChecklistItem');
    const result = await initializeChecklistTemplate(mockPool, 'sess-1');
    expect(result).toHaveLength(2);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe('Close checklist readiness — computeReadiness', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ready: false and hard_blockers when checklist not initialized', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([]);
    jest.spyOn(reconRepo, 'listReconRunsByCloseSession').mockResolvedValue([]);
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([]);
    jest.spyOn(jeRepo, 'listJournalEntries').mockResolvedValue([]);
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true });
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const result = await computeReadiness(mockPool, 't1', sampleSession);
    expect(result.ready).toBe(false);
    expect(result.hardBlockers).toContainEqual(expect.stringContaining('Checklist not initialized'));
  });

  it('returns ready: false when required checklist items incomplete', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'pending' },
      { ...sampleItem, id: 'item-2', code: 'NO_CRITICAL_ISSUES', status: 'pending' },
    ]);
    jest.spyOn(reconRepo, 'listReconRunsByCloseSession').mockResolvedValue([]);
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([]);
    jest.spyOn(jeRepo, 'listJournalEntries').mockResolvedValue([]);
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true });
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const result = await computeReadiness(mockPool, 't1', sampleSession);
    expect(result.ready).toBe(false);
    expect(result.checklistComplete).toBe(false);
    expect(result.hardBlockers.some((b) => b.includes('Required checklist'))).toBe(true);
  });

  it('returns ready: true when all controls pass', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'completed' },
      { ...sampleItem, id: 'item-2', code: 'NO_CRITICAL_ISSUES', status: 'completed' },
      { ...sampleItem, id: 'item-3', code: 'MATERIAL_JES_APPROVED', status: 'completed' },
      { ...sampleItem, id: 'item-4', code: 'INTEGRITY_CHECKS', status: 'completed' },
    ]);
    jest.spyOn(reconRepo, 'listReconRunsByCloseSession').mockResolvedValue([]);
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([]);
    jest.spyOn(jeRepo, 'listJournalEntries').mockResolvedValue([]);
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true });
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const result = await computeReadiness(mockPool, 't1', sampleSession);
    expect(result.ready).toBe(true);
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.checklistComplete).toBe(true);
  });

  it('returns hard_blocker when critical issues open', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'completed' },
      { ...sampleItem, id: 'item-2', code: 'NO_CRITICAL_ISSUES', status: 'completed' },
      { ...sampleItem, id: 'item-3', code: 'MATERIAL_JES_APPROVED', status: 'completed' },
      { ...sampleItem, id: 'item-4', code: 'INTEGRITY_CHECKS', status: 'completed' },
    ]);
    jest.spyOn(reconRepo, 'listReconRunsByCloseSession').mockResolvedValue([]);
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([
      {
        id: 'iss-1',
        closeSessionId: 'sess-1',
        tenantId: 't1',
        category: 'reconciliation',
        severity: 'critical',
        status: 'open',
        title: 'Unmatched cash',
        createdAt: '',
        updatedAt: '',
      } as any,
    ]);
    jest.spyOn(jeRepo, 'listJournalEntries').mockResolvedValue([]);
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true });
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const result = await computeReadiness(mockPool, 't1', sampleSession);
    expect(result.ready).toBe(false);
    expect(result.noCriticalIssues).toBe(false);
    expect(result.hardBlockers.some((b) => b.includes('critical issue'))).toBe(true);
  });

  it('returns hard_blocker when draft/proposed JEs exist', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'completed' },
      { ...sampleItem, id: 'item-2', code: 'NO_CRITICAL_ISSUES', status: 'completed' },
      { ...sampleItem, id: 'item-3', code: 'MATERIAL_JES_APPROVED', status: 'completed' },
      { ...sampleItem, id: 'item-4', code: 'INTEGRITY_CHECKS', status: 'completed' },
    ]);
    jest.spyOn(reconRepo, 'listReconRunsByCloseSession').mockResolvedValue([]);
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([]);
    jest.spyOn(jeRepo, 'listJournalEntries').mockResolvedValue([
      { id: 'je-1', closeSessionId: 'sess-1', tenantId: 't1', status: 'draft' } as any,
    ]);
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true });
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const result = await computeReadiness(mockPool, 't1', sampleSession);
    expect(result.ready).toBe(false);
    expect(result.materialJesApproved).toBe(false);
    expect(result.hardBlockers.some((b) => b.includes('journal entry'))).toBe(true);
  });

  it('returns hard_blocker when integrity (chain) fails', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'completed' },
      { ...sampleItem, id: 'item-2', code: 'NO_CRITICAL_ISSUES', status: 'completed' },
      { ...sampleItem, id: 'item-3', code: 'MATERIAL_JES_APPROVED', status: 'completed' },
      { ...sampleItem, id: 'item-4', code: 'INTEGRITY_CHECKS', status: 'completed' },
    ]);
    jest.spyOn(reconRepo, 'listReconRunsByCloseSession').mockResolvedValue([]);
    jest.spyOn(issueService, 'listIssues').mockResolvedValue([]);
    jest.spyOn(jeRepo, 'listJournalEntries').mockResolvedValue([]);
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: false, message: 'Chain broken' });
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const result = await computeReadiness(mockPool, 't1', sampleSession);
    expect(result.ready).toBe(false);
    expect(result.integrityChecksPass).toBe(false);
    expect(result.hardBlockers.some((b) => b.toLowerCase().includes('chain') || b.toLowerCase().includes('integrity'))).toBe(true);
  });
});

describe('Close checklist readiness — completeChecklistItem / getChecklistItems', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('completeChecklistItem updates status to completed', async () => {
    jest.spyOn(itemRepo, 'updateChecklistItemStatus').mockResolvedValue({
      ...sampleItem,
      status: 'completed',
      completedBy: 'user-1',
      completedAt: '2025-01-01T12:00:00Z',
    });
    const result = await completeChecklistItem(mockPool, 'item-1', 'user-1', 'Done');
    expect(result?.status).toBe('completed');
    expect(itemRepo.updateChecklistItemStatus).toHaveBeenCalledWith(
      mockPool,
      'item-1',
      'completed',
      expect.objectContaining({ completedBy: 'user-1', notes: 'Done' })
    );
  });
});

describe('Close checklist readiness — emitIssuesForStuckChecklist', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when no stuck required items', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'completed' },
    ]);
    const result = await emitIssuesForStuckChecklist(mockPool, {
      tenantId: 't1',
      closeSessionId: 'sess-1',
    });
    expect(result).toBeNull();
  });

  it('creates issue when required items are stuck', async () => {
    jest.spyOn(itemRepo, 'listChecklistItemsBySessionId').mockResolvedValue([
      { ...sampleItem, status: 'pending' },
    ]);
    jest.spyOn(issueService, 'createIssue').mockResolvedValue({
      id: 'issue-1',
      closeSessionId: 'sess-1',
      tenantId: 't1',
      category: 'reconciliation',
      severity: 'high',
      status: 'open',
      title: 'Close checklist: required items incomplete',
      createdAt: '',
      updatedAt: '',
    } as any);
    const result = await emitIssuesForStuckChecklist(mockPool, {
      tenantId: 't1',
      closeSessionId: 'sess-1',
    });
    expect(result).not.toBeNull();
    expect(result?.issueId).toBe('issue-1');
    expect(issueService.createIssue).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({
        title: expect.stringContaining('required items incomplete'),
        severity: 'high',
      })
    );
  });
});
