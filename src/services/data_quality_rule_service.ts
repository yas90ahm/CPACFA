/**
 * Data quality rules: CRUD and evaluate rules against TB/BS/input.
 */

import type { Pool } from 'pg';
import type { DataQualityRule, DataQualityRuleConfig, DataQualityScope } from '../types/data_quality.js';
import type { BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import {
  createRule as createRuleRepo,
  getRule,
  listRules,
} from '../db/repositories/data_quality_repository.js';

export interface RuleEvaluationContext {
  scope: DataQualityScope;
  periodLabel?: string;
  sourceId?: string;
  balanceSheet?: BalanceSheet;
  profitAndLoss?: ProfitAndLoss;
  trialBalanceEntries?: { accountName: string; debit: number; credit: number }[];
}

export interface RuleEvaluationResult {
  ruleId: string;
  passed: boolean;
  message?: string;
  metric?: number;
}

function evaluateBalanceRule(
  rule: DataQualityRule,
  ctx: RuleEvaluationContext
): RuleEvaluationResult {
  if (rule.scope !== 'balance_sheet' || !ctx.balanceSheet) {
    return { ruleId: rule.id, passed: true };
  }
  const bs = ctx.balanceSheet;
  const config = rule.config as DataQualityRuleConfig & { accountPattern?: string };
  if (rule.type === 'balance') {
    const balances = bs.balances;
    if (!balances) {
      return { ruleId: rule.id, passed: false, message: 'Balance sheet does not balance', metric: undefined };
    }
    return { ruleId: rule.id, passed: true };
  }
  if (rule.type === 'threshold' && config.threshold != null) {
    const totalAssets = bs.assets.reduce((s, a) => s + (a.amount ?? 0), 0);
    if (totalAssets > config.threshold) {
      return {
        ruleId: rule.id,
        passed: false,
        message: `Total assets ${totalAssets} exceeds threshold ${config.threshold}`,
        metric: totalAssets,
      };
    }
    return { ruleId: rule.id, passed: true };
  }
  return { ruleId: rule.id, passed: true };
}

export function evaluateRule(rule: DataQualityRule, ctx: RuleEvaluationContext): RuleEvaluationResult {
  if (!rule.enabled) return { ruleId: rule.id, passed: true };
  if (rule.scope === 'balance_sheet') return evaluateBalanceRule(rule, ctx);
  if (rule.scope === 'trial_balance' && ctx.trialBalanceEntries) {
    const entries = ctx.trialBalanceEntries;
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      return {
        ruleId: rule.id,
        passed: false,
        message: `Trial balance does not balance: debits ${totalDebit}, credits ${totalCredit}`,
        metric: diff,
      };
    }
    return { ruleId: rule.id, passed: true };
  }
  return { ruleId: rule.id, passed: true };
}

export async function createRule(
  pool: Pool,
  tenantId: string,
  rule: Omit<DataQualityRule, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DataQualityRule> {
  return createRuleRepo(pool, tenantId, rule);
}

export async function getRuleById(pool: Pool, id: string, tenantId: string): Promise<DataQualityRule | null> {
  return getRule(pool, id, tenantId);
}

export async function listRulesForTenant(pool: Pool, tenantId: string): Promise<DataQualityRule[]> {
  return listRules(pool, tenantId);
}
