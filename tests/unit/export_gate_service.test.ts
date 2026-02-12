/**
 * Export gate unit tests — verify gate blocks on materiality and chain verification.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { checkExportGate, CRITICAL_TAMPER_ALERT, RESOLUTION_MISMATCH } from '../../src/services/export_gate_service.js';
import * as periodExportChecks from '../../src/db/repositories/period_export_checks_repository.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as riskContextStore from '../../src/services/risk_context_store.js';
import * as conflictsRepo from '../../src/db/repositories/risk_context_conflicts_repository.js';
import * as auditLedgerRepo from '../../src/db/repositories/audit_ledger_repository.js';
import * as adjustedTb from '../../src/services/adjusted_trial_balance_service.js';
import * as materialityConfig from '../../src/services/materiality_config_service.js';
import * as evidenceRepo from '../../src/db/repositories/evidence_repository.js';
import type { Pool } from 'pg';

const mockPool = {} as Pool;

/** Balanced trial balance entries for on-the-fly materiality tests. */
const balancedEntries = [
  { accountName: 'Cash', debit: 10000, credit: 0 },
  { accountName: 'Revenue', debit: 0, credit: 10000 },
];

describe('Export gate — materiality and chain verification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(evidenceRepo, 'listStoredEvidenceForPeriod').mockResolvedValue([]);
  });

  it('blocks export when roundingGapExceedsMateriality is true (from DB)', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue({
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
      roundingGapExceedsMateriality: true,
      aggregateRoundingExceedsMateriality: false,
      updatedAt: '2025-01-01T00:00:00Z',
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(CRITICAL_TAMPER_ALERT);
    expect(result.message).toContain('Rounding gap');
  });

  it('blocks export when aggregateRoundingExceedsMateriality is true (from DB)', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue({
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
      roundingGapExceedsMateriality: false,
      aggregateRoundingExceedsMateriality: true,
      updatedAt: '2025-01-01T00:00:00Z',
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(CRITICAL_TAMPER_ALERT);
    expect(result.message).toContain('Aggregate rounding');
  });

  it('blocks export when audit ledger chain verification fails', async () => {
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({
      valid: false,
      brokenAtEntryId: 'al-123',
      message: 'Hash mismatch',
      entryCount: 1,
      verifiedAt: new Date().toISOString(),
    });
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(CRITICAL_TAMPER_ALERT);
    expect(result.message).toContain('Hash');
  });

  it('allows export when materiality and chain pass', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(balancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 1000,
      relativeThreshold: 0.005,
      roundingToleranceCents: 1,
      defaultThreshold: 0.01,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(riskContextStore, 'getQualitativeEvidenceMissing').mockResolvedValue(false);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(0);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(0);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks export when resolution counts mismatch (resolvedCount !== ledgerResolutionCount)', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(balancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 1000,
      relativeThreshold: 0.005,
      roundingToleranceCents: 1,
      defaultThreshold: 0.01,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(2);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(1);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(RESOLUTION_MISMATCH);
    expect(result.message).toMatch(/Ledger resolution mismatch/);
    expect(result.details).toEqual({ resolvedCount: 2, ledgerResolutionCount: 1 });
  });

  it('allows export when resolution counts match (regression: happy path)', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(balancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 1000,
      relativeThreshold: 0.005,
      roundingToleranceCents: 1,
      defaultThreshold: 0.01,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(riskContextStore, 'getQualitativeEvidenceMissing').mockResolvedValue(false);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(3);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(3);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 'test-tenant',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(true);
  });

  it('materiality computed on-the-fly when period_export_checks is empty', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(balancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 1000,
      relativeThreshold: 0.005,
      roundingToleranceCents: 1,
      defaultThreshold: 0.01,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(riskContextStore, 'getQualitativeEvidenceMissing').mockResolvedValue(false);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(0);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(0);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 't1',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(true);
    expect(adjustedTb.getAdjustedTrialBalance).toHaveBeenCalledWith('t1', '2025-01', mockPool);
    expect(materialityConfig.getEffectiveMateriality).toHaveBeenCalledWith(mockPool, 't1');
  });

  it('materiality uses tenant config when available', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(balancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 2000,
      relativeThreshold: 0.01,
      roundingToleranceCents: 2,
      defaultThreshold: 0.02,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(riskContextStore, 'getQualitativeEvidenceMissing').mockResolvedValue(false);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(0);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(0);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 't1',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(true);
    expect(materialityConfig.getEffectiveMateriality).toHaveBeenCalledWith(mockPool, 't1');
  });

  it('materiality falls back to global defaults when no tenant config', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(balancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 1000,
      relativeThreshold: 0.005,
      roundingToleranceCents: 1,
      defaultThreshold: 0.01,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(riskContextStore, 'getQualitativeEvidenceMissing').mockResolvedValue(false);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(0);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(0);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 't1',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(true);
    expect(materialityConfig.getEffectiveMateriality).toHaveBeenCalledWith(mockPool, 't1');
  });

  it('blocks export when on-the-fly materiality exceeds threshold (imbalanced TB)', async () => {
    jest.spyOn(periodExportChecks, 'getPeriodExportChecks').mockResolvedValue(null);
    const imbalancedEntries = [
      { accountName: 'Cash', debit: 10000, credit: 0 },
      { accountName: 'Revenue', debit: 0, credit: 9989 }, // gap = 11, exceeds effectiveMateriality 10
    ];
    jest.spyOn(adjustedTb, 'getAdjustedTrialBalance').mockResolvedValue(imbalancedEntries);
    jest.spyOn(materialityConfig, 'getEffectiveMateriality').mockResolvedValue({
      absoluteThreshold: 0.5,
      relativeThreshold: 0.001,
      roundingToleranceCents: 1,
      defaultThreshold: 0.01,
    });
    jest.spyOn(auditLedger, 'verifyChain').mockResolvedValue({ valid: true, entryCount: 1, verifiedAt: new Date().toISOString() });
    jest.spyOn(riskContextStore, 'getUnresolvedConflicts').mockResolvedValue([]);
    jest.spyOn(riskContextStore, 'getQualitativeEvidenceMissing').mockResolvedValue(false);
    jest.spyOn(conflictsRepo, 'countResolvedByTenantPeriod').mockResolvedValue(0);
    jest.spyOn(auditLedgerRepo, 'countByTenantPeriodAndEventType').mockResolvedValue(0);
    const result = await checkExportGate({
      pool: mockPool,
      tenantId: 't1',
      periodLabel: '2025-01',
    });
    expect(result.allowed).toBe(false);
    expect(result.alert).toBe(CRITICAL_TAMPER_ALERT);
    expect(result.message).toContain('Rounding gap');
  });
});
