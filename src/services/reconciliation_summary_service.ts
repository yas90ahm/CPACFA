/**
 * Stage 3 — Reconciliation summary: single artifact for auditors.
 * TB balance, BS balance, CF tie, equity tie, and list of failed/passed checks.
 * Optionally merges configurable data quality rule results when pool/tenantId provided.
 */

import type { Pool } from 'pg';
import type { FinancialStatementsOutput } from '../types/financial.js';
import { getLastStatementGeneration } from './audit_export_service.js';
import { evaluateQualityChecks } from './quality_checks.js';
import type { QualityCheck } from './quality_checks.js';
import { listRulesForTenant, evaluateRule, type RuleEvaluationContext } from './data_quality_rule_service.js';

export interface ReconciliationSummary {
  /** Trial balance: debits = credits */
  trialBalanceBalances: boolean;
  /** Balance sheet: assets = liabilities + equity */
  balanceSheetBalances: boolean;
  /** Cash flow net change ties to beginning/ending cash and BS cash (when CF present) */
  cashFlowTiesToBS: boolean | null;
  /** Equity changes closing = BS total equity (when equity statement present) */
  equityConsistent: boolean | null;
  /** All quality checks run on the statements */
  checks: QualityCheck[];
  /** Whether every check passed (no critical/warning) */
  passed: boolean;
  /** Checks that failed (severity critical or warning) */
  failedChecks: QualityCheck[];
  generatedAt: string;
}

/**
 * Build reconciliation summary from provided statements (sync core).
 */
function buildReconciliationSummaryFromStatements(st: FinancialStatementsOutput | null): ReconciliationSummary | null {
  if (!st) return null;

  const trialBalanceBalances = st.trialBalance?.balances ?? false;
  const balanceSheetBalances = st.balanceSheet?.balances ?? false;

  const checks = evaluateQualityChecks(
    st.balanceSheet,
    st.profitAndLoss,
    st.cashFlow,
    st.equityChanges
  );

  const failedChecks = checks.filter((c) => c.severity === 'critical' || c.severity === 'warning');
  const passed = failedChecks.length === 0;

  const cashFlowTiesToBS =
    st.cashFlow?.beginningCash != null && st.cashFlow?.endingCash != null
      ? !checks.some((c) => c.id === 'cashflow-recon' || c.id === 'cashflow-bs-cash')
      : null;

  const equityConsistent =
    st.equityChanges?.closingEquity != null
      ? !checks.some((c) => c.id === 'equity-rollforward')
      : null;

  return {
    trialBalanceBalances,
    balanceSheetBalances,
    cashFlowTiesToBS,
    equityConsistent,
    checks,
    passed,
    failedChecks,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build reconciliation summary from last registered statement generation (or provided statements).
 * When statements is null and tenantId/pool provided, fetches from tenant DB.
 */
export async function buildReconciliationSummary(
  statements?: FinancialStatementsOutput | null,
  tenantId?: string,
  pool?: Pool | null
): Promise<ReconciliationSummary | null> {
  const st =
    statements ??
    (tenantId && pool ? ((await getLastStatementGeneration(tenantId, pool))?.statements ?? null) : null) ??
    null;
  return buildReconciliationSummaryFromStatements(st);
}

/**
 * Build reconciliation summary and optionally merge configurable data quality rule results.
 * When pool and tenantId are provided, runs tenant rules with balance_sheet scope and appends failures to checks.
 */
export async function buildReconciliationSummaryWithConfigurableRules(
  statements: FinancialStatementsOutput | null | undefined,
  pool: Pool | null,
  tenantId: string
): Promise<ReconciliationSummary | null> {
  const resolvedStatements =
    statements ?? (pool ? (await getLastStatementGeneration(tenantId, pool))?.statements ?? null : null);
  const summary = buildReconciliationSummaryFromStatements(resolvedStatements);
  if (!summary || !pool || !resolvedStatements?.balanceSheet) return summary;

  const rules = await listRulesForTenant(pool, tenantId);
  const ctx: RuleEvaluationContext = {
    scope: 'balance_sheet',
    balanceSheet: resolvedStatements.balanceSheet,
    profitAndLoss: resolvedStatements.profitAndLoss,
    trialBalanceEntries: resolvedStatements.trialBalance?.entries?.map((e) => ({
      accountName: e.accountName ?? '',
      debit: e.debit ?? 0,
      credit: e.credit ?? 0,
    })),
  };
  const mergedChecks = [...summary.checks];
  for (const rule of rules) {
    const result = evaluateRule(rule, ctx);
    if (!result.passed) {
      mergedChecks.push({
        id: `dq-${rule.id}`,
        severity: rule.severity,
        title: rule.name,
        message: result.message ?? rule.name,
        metric: result.metric,
      });
    }
  }
  const failedChecks = mergedChecks.filter((c) => c.severity === 'critical' || c.severity === 'warning');
  return {
    ...summary,
    checks: mergedChecks,
    failedChecks,
    passed: failedChecks.length === 0,
  };
}
