/**
 * COA Mapping Engine: apply rules to accounts → fs_line_id + explanation.
 * Fallback to existing classifier when no rule matches. Deterministic.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { AccountType } from '../types/financial.js';
import type {
  AccountForMapping,
  CoaMappingResult,
  CoaMappingRule,
  FsTaxonomyLine,
  UpsertCoaRuleInput,
} from '../types/coa_mapping.js';
import { ruleMatchesAccount } from '../utils/gl_pattern_matching.js';
import { classifyAccount } from './accountClassifier.js';
import * as taxonomyRepo from '../db/repositories/fs_taxonomy_repository.js';
import * as rulesRepo from '../db/repositories/coa_mapping_rules_repository.js';
import { recordMaterialEvent } from './audit_service.js';

/** Default fs_line_id by account type (seeded in 068). */
const DEFAULT_FS_LINE_BY_TYPE: Record<AccountType, string> = {
  ASSET: 'fs_asset',
  LIABILITY: 'fs_liability',
  EQUITY: 'fs_equity',
  REVENUE: 'fs_revenue',
  EXPENSE: 'fs_expense',
};

/** @deprecated Use ruleMatchesAccount from utils/gl_pattern_matching. Thin wrapper for compat. */
function ruleMatches(rule: CoaMappingRule, accountName: string, accountNumber?: string): boolean {
  return ruleMatchesAccount(rule, accountName, accountNumber);
}

/**
 * Apply COA rules to accounts; fallback to classifier when no rule matches.
 * Returns one result per account. Deterministic: same inputs => same outputs.
 */
export async function applyCoaRulesToAccounts(
  pool: Pool,
  tenantId: string,
  entityId: string,
  accounts: AccountForMapping[],
  options?: { asOfDate?: string }
): Promise<{ results: CoaMappingResult[]; ruleVersionApplied?: number }> {
  const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
  const rules = await rulesRepo.listCoaMappingRules(pool, tenantId, entityId, { asOfDate });
  const taxonomyMap = new Map<string, FsTaxonomyLine>();
  const taxonomyList = await taxonomyRepo.listFsTaxonomyLines(pool);
  for (const t of taxonomyList) taxonomyMap.set(t.id, t);

  let ruleVersionApplied: number | undefined;
  const results: CoaMappingResult[] = [];

  for (const acc of accounts) {
    let matched: CoaMappingResult | null = null;
    for (const rule of rules) {
      if (ruleMatches(rule, acc.accountName, acc.accountNumber)) {
        const line = taxonomyMap.get(rule.mappedFsLineId);
        ruleVersionApplied = rule.version;
        matched = {
          fsLineId: rule.mappedFsLineId,
          fsLineCode: line?.code,
          explanation: `rule:${rule.id} name_pattern="${rule.sourceAccountNamePattern}"`,
          ruleVersion: rule.version,
          confidence: rule.confidenceDefault,
        };
        break;
      }
    }
    if (!matched) {
      let { accountType } = classifyAccount(acc.accountName);
      // Account code range overrides name-based classification when available
      // 1000-1999 = ASSET, 2000-2999 = LIABILITY, 3000-3999 = EQUITY,
      // 4000-4999 = REVENUE, 5000+ = EXPENSE
      const codeNum = acc.accountNumber ? parseInt(acc.accountNumber, 10) : NaN;
      if (!isNaN(codeNum)) {
        let codeType: AccountType | null = null;
        if (codeNum >= 1000 && codeNum < 2000) codeType = 'ASSET';
        else if (codeNum >= 2000 && codeNum < 3000) codeType = 'LIABILITY';
        else if (codeNum >= 3000 && codeNum < 4000) codeType = 'EQUITY';
        else if (codeNum >= 4000 && codeNum < 5000) codeType = 'REVENUE';
        else if (codeNum >= 5000) codeType = 'EXPENSE';
        // Code range takes precedence when it disagrees with name-based BS/PL split
        if (codeType && codeType !== accountType) {
          const codeBs = codeType === 'ASSET' || codeType === 'LIABILITY' || codeType === 'EQUITY';
          const nameBs = accountType === 'ASSET' || accountType === 'LIABILITY' || accountType === 'EQUITY';
          if (codeBs !== nameBs) {
            accountType = codeType;
          }
        }
      }
      const fsLineId = DEFAULT_FS_LINE_BY_TYPE[accountType];
      const line = taxonomyMap.get(fsLineId);
      matched = {
        fsLineId,
        fsLineCode: line?.code,
        explanation: `fallback:classifier accountType=${accountType}${!isNaN(codeNum) ? ` code=${acc.accountNumber}` : ''}`,
        confidence: 0.8,
      };
    }
    results.push(matched);
  }

  return { results, ruleVersionApplied };
}

/** List taxonomy lines. */
export async function listTaxonomyLines(pool: Pool): Promise<FsTaxonomyLine[]> {
  return taxonomyRepo.listFsTaxonomyLines(pool);
}

/** List COA rules for tenant/entity (optional version or asOfDate). */
export async function listCoaRules(
  pool: Pool,
  tenantId: string,
  entityId: string,
  opts?: { version?: number; asOfDate?: string }
): Promise<CoaMappingRule[]> {
  return rulesRepo.listCoaMappingRules(pool, tenantId, entityId, opts);
}

/**
 * Enrich trial balance entries with fs_line_id from COA mapping (or classifier fallback).
 * Call before buildValidatedStatements so statement builder groups by fs_line_id.
 */
export async function enrichEntriesWithCoaMapping(
  pool: Pool,
  tenantId: string,
  entityId: string,
  entries: Array<{ accountName: string; accountCode?: string; debit: number; credit: number; accountType?: AccountType; [k: string]: unknown }>,
  options?: { asOfDate?: string }
): Promise<Array<typeof entries[0] & { fsLineId?: string; fsLineCode?: string; mappingExplanation?: string; ruleVersion?: number }>> {
  const accounts = entries.map((e) => ({ accountName: e.accountName, accountNumber: e.accountCode }));
  const { results } = await applyCoaRulesToAccounts(pool, tenantId, entityId, accounts, options);
  return entries.map((entry, i) => ({
    ...entry,
    fsLineId: results[i].fsLineId,
    fsLineCode: results[i].fsLineCode,
    mappingExplanation: results[i].explanation,
    ruleVersion: results[i].ruleVersion,
  }));
}

/** Upsert rule set: increments version and inserts all rules. Returns new version. */
export async function upsertCoaRules(
  pool: Pool,
  tenantId: string,
  entityId: string,
  rules: UpsertCoaRuleInput[]
): Promise<{ version: number; ruleIds: string[] }> {
  const version = await rulesRepo.getNextRuleVersion(pool, tenantId, entityId);
  const ruleIds: string[] = [];
  for (const r of rules) {
    const id = randomUUID();
    await rulesRepo.insertCoaMappingRule(pool, id, tenantId, entityId, version, {
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo ?? null,
      sourceAccountNamePattern: r.sourceAccountNamePattern,
      sourceAccountNumberPattern: r.sourceAccountNumberPattern ?? null,
      mappedFsLineId: r.mappedFsLineId,
      confidenceDefault: r.confidenceDefault ?? 1,
    });
    ruleIds.push(id);
  }
  await recordMaterialEvent(pool, {
    tenantId,
    eventType: 'mapping_rule_update',
    deterministicFlagSnapshot: { entityId, version, ruleCount: rules.length, ruleIds },
  });
  // Fire MAPPING_CHANGED cascade so unmapped_account issues can auto-resolve
  const { executeCascade, CascadeTriggerType } = await import('./cascade_engine.js');
  const { listCloseSessions } = await import('../db/repositories/close_session_repository.js');
  const sessions = await listCloseSessions(pool, tenantId, entityId);
  const affectedAccounts = rules.map((r) => r.sourceAccountNamePattern);
  for (const s of sessions) {
    if (['open', 'in_progress', 'under_review'].includes(s.status ?? '')) {
      await executeCascade(pool, tenantId, {
        type: CascadeTriggerType.MAPPING_CHANGED,
        period_id: s.id,
        entity_id: entityId,
        triggered_by: 'upsertCoaRules',
        affected_accounts: affectedAccounts,
        details: { version, ruleIds },
      });
    }
  }
  return { version, ruleIds };
}
