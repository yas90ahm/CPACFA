/**
 * Statement package service — unit tests: version increments, diff computed.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  generateStatements,
  computeDiff,
  getStatementPackage,
  listStatementPackages,
  getStatementDiff,
} from '../../src/services/statement_package_service.js';
import * as repo from '../../src/db/repositories/statement_package_repository.js';
import * as closeSessionService from '../../src/services/close_session_service.js';
import * as adjustedTB from '../../src/services/adjusted_trial_balance_service.js';
import * as financialStatements from '../../src/services/financialStatements.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';
import type { StatementLine } from '../../src/types/statement_package.js';

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

const samplePackage = {
  id: 'pkg-1',
  closeSessionId: 'sess-1',
  version: 1,
  inputHash: 'abc123',
  generatedAt: '2025-01-01T00:00:00Z',
  generatedBy: undefined,
  status: 'draft' as const,
  engineVersion: 'financialStatements.v1',
  ruleVersionsSnapshot: undefined,
};

const sampleBalanceSheet = {
  assets: [{ label: 'Cash', amount: 1000 }],
  liabilities: [{ label: 'AP', amount: 200 }],
  equity: [{ label: 'Equity', amount: 800 }],
  totalAssets: 1000,
  totalLiabilities: 200,
  totalEquity: 800,
  balances: true,
  codificationRef: { framework: 'FASB', citation: 'ASC 210' },
};

const sampleProfitAndLoss = {
  revenue: [{ label: 'Revenue', amount: 500 }],
  expenses: [{ label: 'Expenses', amount: 300 }],
  totalRevenue: 500,
  totalExpenses: 300,
  netIncome: 200,
  codificationRef: { framework: 'FASB', citation: 'ASC 220' },
};

describe('Statement package — generateStatements', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates package with version 1 when no previous packages', async () => {
    jest.spyOn(closeSessionService, 'getSession').mockResolvedValue(sampleSession as any);
    jest.spyOn(closeSessionService, 'listSessions').mockResolvedValue([]);
    jest.spyOn(adjustedTB, 'getAdjustedTrialBalance').mockResolvedValue([
      { accountName: 'Cash', debit: 1000, credit: 0 },
      { accountName: 'AP', debit: 0, credit: 200 },
      { accountName: 'Equity', debit: 0, credit: 800 },
    ] as any);
    jest.spyOn(financialStatements, 'buildValidatedStatements').mockReturnValue({
      balanceSheet: sampleBalanceSheet as any,
      profitAndLoss: sampleProfitAndLoss as any,
      classifiedEntries: [],
      riskLevel: 'normal',
    } as any);
    jest.spyOn(repo, 'getMaxVersionByCloseSessionId').mockResolvedValue(0);
    jest.spyOn(repo, 'insertStatementPackage').mockResolvedValue({ ...samplePackage, version: 1 });
    jest.spyOn(repo, 'insertStatementLine').mockResolvedValue();
    jest.spyOn(repo, 'listStatementPackagesByCloseSessionId').mockResolvedValue([
      { ...samplePackage, id: 'pkg-new', version: 1 },
    ]);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const pkg = await generateStatements(mockPool, 't1', 'sess-1');
    expect(pkg.version).toBe(1);
    expect(repo.getMaxVersionByCloseSessionId).toHaveBeenCalledWith(mockPool, 't1', 'sess-1');
    expect(repo.insertStatementPackage).toHaveBeenCalledWith(
      mockPool,
      't1',
      expect.any(String),
      expect.objectContaining({
        closeSessionId: 'sess-1',
        version: 1,
        engineVersion: 'financialStatements.v1',
        validationResults: expect.any(Array),
      })
    );
  });

  it('creates package with version 2 when previous package exists', async () => {
    jest.spyOn(closeSessionService, 'getSession').mockResolvedValue(sampleSession as any);
    jest.spyOn(closeSessionService, 'listSessions').mockResolvedValue([]);
    jest.spyOn(adjustedTB, 'getAdjustedTrialBalance').mockResolvedValue([
      { accountName: 'Cash', debit: 1000, credit: 0 },
      { accountName: 'AP', debit: 0, credit: 200 },
      { accountName: 'Equity', debit: 0, credit: 800 },
    ] as any);
    jest.spyOn(financialStatements, 'buildValidatedStatements').mockReturnValue({
      balanceSheet: sampleBalanceSheet as any,
      profitAndLoss: sampleProfitAndLoss as any,
      classifiedEntries: [],
      riskLevel: 'normal',
    } as any);
    jest.spyOn(repo, 'getMaxVersionByCloseSessionId').mockResolvedValue(1);
    jest.spyOn(repo, 'insertStatementPackage').mockResolvedValue({ ...samplePackage, id: 'pkg-2', version: 2 });
    jest.spyOn(repo, 'insertStatementLine').mockResolvedValue();
    jest.spyOn(repo, 'listStatementPackagesByCloseSessionId').mockResolvedValue([
      { ...samplePackage, id: 'pkg-2', version: 2 },
      { ...samplePackage, id: 'pkg-1', version: 1 },
    ]);
    jest.spyOn(repo, 'listStatementLinesByPackageId').mockResolvedValue([]);
    jest.spyOn(repo, 'upsertStatementDiff').mockResolvedValue({
      fromPackageId: 'pkg-1',
      toPackageId: 'pkg-2',
      diffJson: { added: [], removed: [], changed: [] },
      createdAt: '2025-01-01T00:00:00Z',
    });
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const pkg = await generateStatements(mockPool, 't1', 'sess-1');
    expect(pkg.version).toBe(2);
    expect(repo.getMaxVersionByCloseSessionId).toHaveBeenCalledWith(mockPool, 't1', 'sess-1');
  });
});

describe('Statement package — computeDiff', () => {
  it('returns added when next has new line', () => {
    const prev: StatementLine[] = [
      { packageId: 'p1', fsLineId: 'bs_assets_0', amount: 100, statement: 'balance_sheet', metadata: { label: 'Cash' } },
    ];
    const next: StatementLine[] = [
      { packageId: 'p2', fsLineId: 'bs_assets_0', amount: 100, statement: 'balance_sheet', metadata: { label: 'Cash' } },
      { packageId: 'p2', fsLineId: 'bs_assets_1', amount: 50, statement: 'balance_sheet', metadata: { label: 'AR' } },
    ];
    const diff = computeDiff(prev, next);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].fsLineId).toBe('bs_assets_1');
    expect(diff.added[0].amount).toBe(50);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('returns removed when next drops line', () => {
    const prev: StatementLine[] = [
      { packageId: 'p1', fsLineId: 'bs_assets_0', amount: 100, statement: 'balance_sheet' },
      { packageId: 'p1', fsLineId: 'bs_assets_1', amount: 50, statement: 'balance_sheet' },
    ];
    const next: StatementLine[] = [
      { packageId: 'p2', fsLineId: 'bs_assets_0', amount: 100, statement: 'balance_sheet' },
    ];
    const diff = computeDiff(prev, next);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].fsLineId).toBe('bs_assets_1');
    expect(diff.removed[0].amount).toBe(50);
    expect(diff.added).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('returns changed when amount differs', () => {
    const prev: StatementLine[] = [
      { packageId: 'p1', fsLineId: 'bs_assets_0', amount: 100, statement: 'balance_sheet' },
    ];
    const next: StatementLine[] = [
      { packageId: 'p2', fsLineId: 'bs_assets_0', amount: 150, statement: 'balance_sheet' },
    ];
    const diff = computeDiff(prev, next);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].fsLineId).toBe('bs_assets_0');
    expect(diff.changed[0].prevAmount).toBe(100);
    expect(diff.changed[0].nextAmount).toBe(150);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it('returns empty when identical', () => {
    const lines: StatementLine[] = [
      { packageId: 'p1', fsLineId: 'bs_assets_0', amount: 100, statement: 'balance_sheet' },
    ];
    const nextLines = lines.map((l) => ({ ...l, packageId: 'p2' }));
    const diff = computeDiff(lines, nextLines);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });
});

describe('Statement package — getStatementPackage / listStatementPackages / getStatementDiff', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('getStatementPackage returns null when not found', async () => {
    jest.spyOn(repo, 'getStatementPackageById').mockResolvedValue(null);
    const result = await getStatementPackage(mockPool, 'tenant-1', 'pkg-missing');
    expect(result).toBeNull();
  });

  it('listStatementPackages returns packages', async () => {
    jest.spyOn(repo, 'listStatementPackagesByCloseSessionId').mockResolvedValue([
      { ...samplePackage },
    ]);
    const result = await listStatementPackages(mockPool, 'tenant-1', 'sess-1', 10);
    expect(result).toHaveLength(1);
    expect(result[0].closeSessionId).toBe('sess-1');
  });

  it('getStatementDiff returns null when diff not found', async () => {
    jest.spyOn(repo, 'getStatementDiff').mockResolvedValue(null);
    const result = await getStatementDiff(mockPool, 'tenant-1', 'pkg-1', 'pkg-2');
    expect(result).toBeNull();
  });
});
