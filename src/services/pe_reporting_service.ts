/**
 * PE Reporting Service: re-aggregate trial balance data using a custom
 * PE hierarchy. Maps TB accounts to PE lines via pe_line_id on
 * coa_mapping_rules, then rolls up into the hierarchy tree.
 */

import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import type { PEHierarchyLine, PEStatementLine, PEStatementResult } from '../types/pe_hierarchy.js';
import type { CoaMappingRule } from '../types/coa_mapping.js';
import * as peRepo from '../db/repositories/pe_hierarchy_repository.js';
import * as rulesRepo from '../db/repositories/coa_mapping_rules_repository.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getSession } from './close_session_service.js';
import { sumRound2, round2, minus } from '../utils/decimal.js';

/**
 * Generate PE-format statements for a close session.
 * 1. Fetch adjusted TB for the session period.
 * 2. Fetch COA mapping rules (with pe_line_id).
 * 3. Fetch PE hierarchy for the tenant.
 * 4. Map each TB entry to a PE line via matching mapping rule.
 * 5. Aggregate amounts per PE line, then build the tree.
 */
export async function generatePEStatements(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<PEStatementResult[]> {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) throw new Error('Close session not found');

  const periodLabel = (session.periodEnd ?? '').length >= 7
    ? (session.periodEnd ?? '').slice(0, 7)
    : session.periodEnd ?? '';
  const entityId = session.entityId;

  // 1. Adjusted trial balance
  const entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool, closeSessionId);

  // 2. COA mapping rules with pe_line_id
  const rules = await rulesRepo.listCoaMappingRules(pool, tenantId, entityId);

  // 3. PE hierarchy
  const hierarchy = await peRepo.getHierarchy(pool, tenantId);
  if (hierarchy.length === 0) {
    return [];
  }

  // 4. Build account -> pe_line_id map from matching rules
  const accountToPeLine = buildAccountToPeLineMap(entries, rules);

  // 5. Aggregate amounts by pe_line_id
  const amountsByPeLine = new Map<string, number[]>();
  for (const entry of entries) {
    const key = entry.accountCode ?? entry.accountName;
    const peLineId = accountToPeLine.get(key);
    if (!peLineId) continue;
    const net = computeNet(entry);
    if (!amountsByPeLine.has(peLineId)) amountsByPeLine.set(peLineId, []);
    amountsByPeLine.get(peLineId)!.push(net);
  }

  // 6. Group hierarchy by statement
  const statementsSet = new Set(hierarchy.map((h) => h.statement));
  const results: PEStatementResult[] = [];

  for (const statement of statementsSet) {
    const stmtHierarchy = hierarchy.filter((h) => h.statement === statement);
    const lines = buildTree(stmtHierarchy, amountsByPeLine);
    const totalAmount = sumRound2(lines.map((l) => l.amount));
    results.push({
      statement,
      periodLabel,
      lines,
      totalAmount,
    });
  }

  return results;
}

/** Match each TB entry to a PE line ID using COA mapping rules (pattern match). */
function buildAccountToPeLineMap(
  entries: TrialBalanceEntry[],
  rules: CoaMappingRule[]
): Map<string, string> {
  const map = new Map<string, string>();
  const rulesWithPeLine = rules.filter((r) => r.peLineId != null && r.peLineId !== '');

  for (const entry of entries) {
    const key = entry.accountCode ?? entry.accountName;
    for (const rule of rulesWithPeLine) {
      if (ruleMatches(rule, entry.accountName, entry.accountCode)) {
        map.set(key, rule.peLineId!);
        break;
      }
    }
  }
  return map;
}

/** SQL-style pattern match (% = wildcard). */
function ruleMatches(rule: CoaMappingRule, accountName: string, accountCode?: string): boolean {
  const nameRe = patternToRegExp(rule.sourceAccountNamePattern);
  if (!nameRe.test(accountName.trim())) return false;
  if (rule.sourceAccountNumberPattern != null && rule.sourceAccountNumberPattern !== '') {
    const num = (accountCode ?? '').trim();
    const numRe = patternToRegExp(rule.sourceAccountNumberPattern);
    if (!numRe.test(num)) return false;
  }
  return true;
}

// Imported from shared utility
import { patternToRegExp } from '../utils/gl_pattern_matching.js';

/** Compute net amount for a TB entry (sign-normalized by account type). */
function computeNet(entry: TrialBalanceEntry): number {
  const net = minus(entry.debit, entry.credit);
  if (entry.accountType === 'LIABILITY' || entry.accountType === 'EQUITY' || entry.accountType === 'REVENUE') {
    return round2(-net);
  }
  return net;
}

/** Build a tree of PEStatementLine from flat hierarchy + aggregated amounts. */
function buildTree(
  hierarchy: PEHierarchyLine[],
  amountsByPeLine: Map<string, number[]>
): PEStatementLine[] {
  // Index by peLineId
  const lineMap = new Map<string, PEStatementLine>();
  for (const h of hierarchy) {
    const directAmounts = amountsByPeLine.get(h.peLineId) ?? [];
    lineMap.set(h.peLineId, {
      peLineId: h.peLineId,
      peLineName: h.peLineName,
      parentPeLineId: h.parentPeLineId,
      displayOrder: h.displayOrder,
      amount: sumRound2(directAmounts),
      children: [],
    });
  }

  // Build parent-child relationships
  const roots: PEStatementLine[] = [];
  for (const h of hierarchy) {
    const node = lineMap.get(h.peLineId)!;
    if (h.parentPeLineId && lineMap.has(h.parentPeLineId)) {
      lineMap.get(h.parentPeLineId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Roll up child amounts into parents (bottom-up)
  function rollUp(node: PEStatementLine): number {
    if (node.children && node.children.length > 0) {
      const childTotal = sumRound2(node.children.map((c) => rollUp(c)));
      // Parent amount = own direct amount + children
      node.amount = round2(node.amount + childTotal);
    }
    return node.amount;
  }
  for (const root of roots) rollUp(root);

  // Sort by displayOrder
  roots.sort((a, b) => a.displayOrder - b.displayOrder);
  function sortChildren(node: PEStatementLine) {
    if (node.children && node.children.length > 0) {
      node.children.sort((a, b) => a.displayOrder - b.displayOrder);
      node.children.forEach(sortChildren);
    }
  }
  roots.forEach(sortChildren);

  return roots;
}
