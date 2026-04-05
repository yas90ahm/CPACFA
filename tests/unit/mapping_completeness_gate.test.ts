/**
 * Mapping completeness gate — unit tests: blocks when accounts unmapped, passes when all mapped.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { checkMappingCompleteness } from '../../src/services/mapping_completeness_gate.js';
import * as closeSessionRepo from '../../src/db/repositories/close_session_repository.js';
import * as adjustedTB from '../../src/services/adjusted_trial_balance_service.js';
import * as coaRulesRepo from '../../src/db/repositories/coa_mapping_rules_repository.js';

const mockPool = {} as Pool;

describe('Mapping completeness gate', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks when accounts unmapped', async () => {
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
    jest.spyOn(adjustedTB, 'getTrialBalanceForCertification').mockResolvedValue({
      trialBalance: [
        { accountCode: '1000', accountName: 'Cash', debit: 1000, credit: 0, accountType: 'ASSET' },
        { accountCode: '1200', accountName: 'AR', debit: 500, credit: 0, accountType: 'ASSET' },
        { accountCode: '2000', accountName: 'AP', debit: 0, credit: 200, accountType: 'LIABILITY' },
        { accountCode: '9000', accountName: 'Misc', debit: 100, credit: 0, accountType: 'ASSET' },
        { accountCode: '9999', accountName: 'Other', debit: 0, credit: 50, accountType: 'EQUITY' },
      ],
      source: 'adjusted',
      hasGL: false,
    });
    // Only Cash and AP have rules; AR, Misc, Other are unmapped
    jest.spyOn(coaRulesRepo, 'listCoaMappingRules').mockResolvedValue([
      {
        id: 'r1',
        tenantId: 't1',
        entityId: 'e1',
        effectiveFrom: '2020-01-01',
        version: 1,
        sourceAccountNamePattern: 'Cash',
        sourceAccountNumberPattern: undefined,
        mappedFsLineId: 'fs_asset',
        confidenceDefault: 1,
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'r2',
        tenantId: 't1',
        entityId: 'e1',
        effectiveFrom: '2020-01-01',
        version: 1,
        sourceAccountNamePattern: 'AP',
        sourceAccountNumberPattern: undefined,
        mappedFsLineId: 'fs_liability',
        confidenceDefault: 1,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const result = await checkMappingCompleteness(mockPool, 't1', 'sess-1', 'e1');

    expect(result.passes).toBe(false);
    expect(result.total_accounts).toBe(5);
    expect(result.unmapped_accounts).toHaveLength(3);
    expect(result.unmapped_accounts.map((u) => u.account_code || u.account_name)).toEqual(
      expect.arrayContaining(['1200', '9000', '9999'])
    );
    expect(result.unmapped_accounts[0]).toMatchObject({
      account_code: expect.any(String),
      account_name: expect.any(String),
      balance: expect.stringMatching(/^-?\d+\.\d{2}$/),
    });
  });

  it('passes when all accounts mapped', async () => {
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
    jest.spyOn(adjustedTB, 'getTrialBalanceForCertification').mockResolvedValue({
      trialBalance: [
        { accountCode: '1000', accountName: 'Cash', debit: 1000, credit: 0, accountType: 'ASSET' },
        { accountCode: '2000', accountName: 'AP', debit: 0, credit: 200, accountType: 'LIABILITY' },
      ],
      source: 'adjusted',
      hasGL: false,
    });
    jest.spyOn(coaRulesRepo, 'listCoaMappingRules').mockResolvedValue([
      {
        id: 'r1',
        tenantId: 't1',
        entityId: 'e1',
        effectiveFrom: '2020-01-01',
        version: 1,
        sourceAccountNamePattern: '%',
        sourceAccountNumberPattern: undefined,
        mappedFsLineId: 'fs_asset',
        confidenceDefault: 1,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const result = await checkMappingCompleteness(mockPool, 't1', 'sess-1', 'e1');

    expect(result.passes).toBe(true);
    expect(result.total_accounts).toBe(2);
    expect(result.unmapped_accounts).toHaveLength(0);
  });

  it('returns passes when no TB (empty period)', async () => {
    jest.spyOn(closeSessionRepo, 'getCloseSessionById').mockResolvedValue({
      id: 'sess-1',
      tenantId: 't1',
      entityId: 'e1',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      basis: 'accrual',
      standard: 'GAAP',
      status: 'open',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
    jest.spyOn(adjustedTB, 'getTrialBalanceForCertification').mockResolvedValue({
      trialBalance: [],
      source: 'adjusted',
      hasGL: false,
    });

    const result = await checkMappingCompleteness(mockPool, 't1', 'sess-1', 'e1');

    expect(result.passes).toBe(true);
    expect(result.total_accounts).toBe(0);
    expect(result.unmapped_accounts).toHaveLength(0);
  });
});
