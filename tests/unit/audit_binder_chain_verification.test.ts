/**
 * Audit Binder chain verification: binder includes verifyChain result (latestEntryHash, etc.)
 * so a third party can verify audit ledger integrity from binder output.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import * as auditExportService from '../../src/services/audit_export_service.js';
import * as auditLedgerService from '../../src/services/audit_ledger_service.js';
import * as statementRegistry from '../../src/db/repositories/statement_registry_repository.js';
import * as justificationService from '../../src/services/justification_service.js';
import * as env from '../../src/lib/env.js';

const mockPool = {} as Pool;

describe('Audit Binder — chain verification', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('binder includes chainVerification with latestEntryHash when tenantId and pool provided', async () => {
    jest.spyOn(statementRegistry, 'getLatest').mockResolvedValue(null);
    jest.spyOn(justificationService, 'getJustificationsForPeriod').mockResolvedValue([]);
    jest.spyOn(auditLedgerService, 'verifyChain').mockResolvedValue({
      valid: true,
      entryCount: 5,
      verifiedAt: '2025-02-01T12:00:00Z',
      latestEntryHash: 'sha256:abc123def456',
      latestEntryId: 'al-5',
    });

    const binder = await auditExportService.buildAuditBinder({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      tenantId: 'tenant-1',
      pool: mockPool,
    });

    expect(binder.chainVerification).toBeDefined();
    expect(binder.chainVerification?.valid).toBe(true);
    expect(binder.chainVerification?.latestEntryHash).toBe('sha256:abc123def456');
    expect(binder.chainVerification?.latestEntryId).toBe('al-5');
    expect(binder.chainVerification?.entryCount).toBe(5);
    expect(binder.chainVerification?.verifiedAt).toBe('2025-02-01T12:00:00Z');
  });

  it('binder omits chainVerification when pool/tenantId not provided', async () => {
    jest.spyOn(justificationService, 'getJustificationsForPeriod').mockResolvedValue([]);
    jest.spyOn(env, 'disallowMemoryStoreInProduction').mockImplementation(() => {});
    const verifySpy = jest.spyOn(auditLedgerService, 'verifyChain');

    const binder = await auditExportService.buildAuditBinder({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
    });

    expect(binder.chainVerification).toBeUndefined();
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('binder includes chainVerification when chain invalid (brokenAtEntryId, message)', async () => {
    jest.spyOn(statementRegistry, 'getLatest').mockResolvedValue(null);
    jest.spyOn(justificationService, 'getJustificationsForPeriod').mockResolvedValue([]);
    jest.spyOn(auditLedgerService, 'verifyChain').mockResolvedValue({
      valid: false,
      entryCount: 2,
      verifiedAt: '2025-02-01T12:00:00Z',
      brokenAtEntryId: 'al-2',
      message: 'Hash mismatch',
    });

    const binder = await auditExportService.buildAuditBinder({
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      tenantId: 'tenant-1',
      pool: mockPool,
    });

    expect(binder.chainVerification).toBeDefined();
    expect(binder.chainVerification?.valid).toBe(false);
    expect(binder.chainVerification?.latestEntryHash).toBeUndefined();
    expect(binder.chainVerification?.brokenAtEntryId).toBe('al-2');
    expect(binder.chainVerification?.message).toBe('Hash mismatch');
    expect(binder.chainVerification?.entryCount).toBe(2);
    expect(binder.chainVerification?.verifiedAt).toBe('2025-02-01T12:00:00Z');
  });
});
