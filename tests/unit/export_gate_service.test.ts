/**
 * Export gate unit tests — verify gate blocks on materiality and chain verification.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { checkExportGate, CRITICAL_TAMPER_ALERT } from '../../src/services/export_gate_service.js';
import * as periodExportChecks from '../../src/db/repositories/period_export_checks_repository.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import * as riskContextStore from '../../src/services/risk_context_store.js';
import * as conflictsRepo from '../../src/db/repositories/risk_context_conflicts_repository.js';
import * as auditLedgerRepo from '../../src/db/repositories/audit_ledger_repository.js';
import type { Pool } from 'pg';

const mockPool = {} as Pool;

describe('Export gate — materiality and chain verification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
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
});
