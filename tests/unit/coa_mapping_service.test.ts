/**
 * COA Mapping service unit tests: rule matching, versioning, deterministic output.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';
import {
  applyCoaRulesToAccounts,
  listTaxonomyLines,
  listCoaRules,
  upsertCoaRules,
} from '../../src/services/coa_mapping_service.js';
import * as taxonomyRepo from '../../src/db/repositories/fs_taxonomy_repository.js';
import * as rulesRepo from '../../src/db/repositories/coa_mapping_rules_repository.js';
import * as auditLedger from '../../src/services/audit_ledger_service.js';

const mockPool = {} as Pool;

const defaultTaxonomy = [
  { id: 'fs_revenue', code: 'PL_REVENUE', name: 'Revenue', statement: 'PL' as const, normalBalance: 'credit' as const },
  { id: 'fs_expense', code: 'PL_EXPENSE', name: 'Expenses', statement: 'PL' as const, normalBalance: 'debit' as const },
  { id: 'fs_asset', code: 'BS_ASSET', name: 'Assets', statement: 'BS' as const, normalBalance: 'debit' as const },
  { id: 'fs_liability', code: 'BS_LIABILITY', name: 'Liabilities', statement: 'BS' as const, normalBalance: 'credit' as const },
  { id: 'fs_equity', code: 'BS_EQUITY', name: 'Equity', statement: 'BS' as const, normalBalance: 'credit' as const },
];

describe('COA Mapping — applyCoaRulesToAccounts', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('fallback to classifier when no rules match', async () => {
    jest.spyOn(rulesRepo, 'listCoaMappingRules').mockResolvedValue([]);
    jest.spyOn(taxonomyRepo, 'listFsTaxonomyLines').mockResolvedValue(defaultTaxonomy as any);
    const accounts = [{ accountName: 'Cash' }, { accountName: 'Product Revenue' }];
    const { results } = await applyCoaRulesToAccounts(mockPool, 't1', 'e1', accounts);
    expect(results).toHaveLength(2);
    expect(results[0].fsLineId).toBe('fs_asset');
    expect(results[0].explanation).toContain('fallback');
    expect(results[1].fsLineId).toBe('fs_revenue');
    expect(results[1].explanation).toContain('fallback');
  });

  it('rule match returns mapped fs_line_id and explanation', async () => {
    const rules = [
      {
        id: 'r1',
        tenantId: 't1',
        entityId: 'e1',
        effectiveFrom: '2025-01-01',
        effectiveTo: undefined as string | undefined,
        version: 1,
        sourceAccountNamePattern: '%Cash%',
        sourceAccountNumberPattern: undefined as string | undefined,
        mappedFsLineId: 'fs_asset',
        confidenceDefault: 1,
        createdAt: '',
      },
    ];
    jest.spyOn(rulesRepo, 'listCoaMappingRules').mockResolvedValue(rules as any);
    jest.spyOn(taxonomyRepo, 'listFsTaxonomyLines').mockResolvedValue(defaultTaxonomy as any);
    const accounts = [{ accountName: 'Cash and equivalents' }];
    const { results, ruleVersionApplied } = await applyCoaRulesToAccounts(mockPool, 't1', 'e1', accounts);
    expect(results).toHaveLength(1);
    expect(results[0].fsLineId).toBe('fs_asset');
    expect(results[0].explanation).toContain('rule:');
    expect(results[0].ruleVersion).toBe(1);
    expect(ruleVersionApplied).toBe(1);
  });

  it('is deterministic: same accounts and rules => same output', async () => {
    const rules = [
      {
        id: 'r1',
        tenantId: 't1',
        entityId: 'e1',
        effectiveFrom: '2025-01-01',
        version: 1,
        sourceAccountNamePattern: 'Revenue',
        mappedFsLineId: 'fs_revenue',
        confidenceDefault: 1,
        createdAt: '',
      } as any,
    ];
    jest.spyOn(rulesRepo, 'listCoaMappingRules').mockResolvedValue(rules);
    jest.spyOn(taxonomyRepo, 'listFsTaxonomyLines').mockResolvedValue(defaultTaxonomy as any);
    const accounts = [{ accountName: 'Product Revenue' }];
    const a = await applyCoaRulesToAccounts(mockPool, 't1', 'e1', accounts);
    const b = await applyCoaRulesToAccounts(mockPool, 't1', 'e1', accounts);
    expect(a.results[0].fsLineId).toBe(b.results[0].fsLineId);
    expect(a.results[0].explanation).toBe(b.results[0].explanation);
  });
});

describe('COA Mapping — upsertCoaRules versioning', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('upsert increments version and returns new version', async () => {
    jest.spyOn(rulesRepo, 'getNextRuleVersion').mockResolvedValue(1);
    jest.spyOn(rulesRepo, 'insertCoaMappingRule').mockResolvedValue({} as any);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const rules = [
      {
        sourceAccountNamePattern: 'Cash%',
        mappedFsLineId: 'fs_asset',
        effectiveFrom: '2025-01-01',
      },
    ];
    const { version, ruleIds } = await upsertCoaRules(mockPool, 't1', 'e1', rules);
    expect(version).toBe(1);
    expect(ruleIds).toHaveLength(1);
    expect(rulesRepo.getNextRuleVersion).toHaveBeenCalledWith(mockPool, 't1', 'e1');
    expect(rulesRepo.insertCoaMappingRule).toHaveBeenCalledWith(
      mockPool,
      expect.any(String),
      't1',
      'e1',
      1,
      expect.objectContaining({
        sourceAccountNamePattern: 'Cash%',
        mappedFsLineId: 'fs_asset',
        effectiveFrom: '2025-01-01',
      })
    );
  });

  it('second upsert returns version 2', async () => {
    jest.spyOn(rulesRepo, 'getNextRuleVersion').mockResolvedValue(2);
    jest.spyOn(rulesRepo, 'insertCoaMappingRule').mockResolvedValue({} as any);
    jest.spyOn(auditLedger, 'recordMaterialEvent').mockResolvedValue();
    const { version } = await upsertCoaRules(mockPool, 't1', 'e1', [
      { sourceAccountNamePattern: 'Payable%', mappedFsLineId: 'fs_liability', effectiveFrom: '2025-01-01' },
    ]);
    expect(version).toBe(2);
  });
});
