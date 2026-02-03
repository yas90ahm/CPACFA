/**
 * Task Decomposition loop: "Prepare the Q4 Financials"
 * Plan: [Verify GL, Reconcile Banks, Adjust Accruals, Generate P&L, Run CFA Ratios]
 * Reconciliation Worker flags mismatches; Self-Correction re-scans TB if Assets != Liabilities + Equity.
 * Final output: structured JSON for frontend + natural language Financial Health summary.
 */

import type {
  Plan,
  PlanStep,
  PlanStepId,
  ReconciliationResult,
  ReconciliationMismatch,
  SelfCorrectionResult,
  DiscrepancyFinding,
  CFARatios,
  Q4FinancialsOutput,
} from '../types/orchestrator.js';
import type { TrialBalanceResult, TrialBalanceEntry, BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import { parseTrialBalance } from './trialBalanceParser.js';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import { buildValidatedStatements } from './financialStatements.js';
import { classifyTrialBalance } from './accountClassifier.js';
import { computeLiquidityMetrics, assessLiquidityRisk } from './analysis_agent.js';
import type { LiquidityInputs } from '../types/analysis.js';

const PLAN_STEP_IDS: PlanStepId[] = [
  'verify_gl',
  'reconcile_banks',
  'adjust_accruals',
  'generate_pl',
  'run_cfa_ratios',
];

const PLAN_STEP_LABELS: Record<PlanStepId, string> = {
  verify_gl: 'Verify GL',
  reconcile_banks: 'Reconcile Banks',
  adjust_accruals: 'Adjust Accruals',
  generate_pl: 'Generate P&L',
  run_cfa_ratios: 'Run CFA Ratios',
};

const TOLERANCE = 0.02;

// --- Plan initialization ---

function createPlan(): Plan {
  const id = `plan-${Date.now()}`;
  const steps: PlanStep[] = PLAN_STEP_IDS.map((id) => ({
    id,
    label: PLAN_STEP_LABELS[id],
    status: 'pending',
  }));
  return {
    id,
    label: 'Prepare Q4 Financials',
    steps,
    startedAt: new Date().toISOString(),
  };
}

function setStepStatus(plan: Plan, stepId: PlanStepId, status: PlanStep['status'], result?: unknown, error?: string): void {
  const step = plan.steps.find((s) => s.id === stepId);
  if (step) {
    step.status = status;
    step.result = result;
    step.error = error;
  }
}

// --- Reconciliation Worker ---

function runReconciliationWorker(
  trialBalance: TrialBalanceResult,
  balanceSheet: BalanceSheet,
  bankStatementBalance?: number
): ReconciliationResult {
  const mismatches: ReconciliationMismatch[] = [];

  if (!trialBalance.balances) {
    mismatches.push({
      type: 'trial_balance',
      message: 'Trial balance does not balance',
      detail: `Total debits: ${trialBalance.totalDebits}; Total credits: ${trialBalance.totalCredits}`,
      suggestedAction: 'Re-scan GL entries; ensure every debit has a matching credit.',
    });
  }

  const rhs = balanceSheet.totalLiabilities + balanceSheet.totalEquity;
  const diff = balanceSheet.totalAssets - rhs;
  if (Math.abs(diff) > TOLERANCE) {
    mismatches.push({
      type: 'balance_sheet_equation',
      message: 'Assets != Liabilities + Equity',
      detail: `Assets: ${balanceSheet.totalAssets}; L+E: ${rhs}; Difference: ${diff}`,
      suggestedAction: 'Self-correction will re-scan Trial Balance to find discrepancy.',
    });
  }

  if (bankStatementBalance != null) {
    const cashEntry = trialBalance.entries.find(
      (e) => /cash|bank/i.test(e.accountName ?? '')
    );
    if (cashEntry) {
      const glCash = cashEntry.debit - cashEntry.credit;
      if (Math.abs(glCash - bankStatementBalance) > TOLERANCE) {
        mismatches.push({
          type: 'bank_reconciliation',
          message: 'Bank reconciliation mismatch',
          detail: `GL Cash: ${glCash}; Bank statement: ${bankStatementBalance}`,
          suggestedAction: 'Review outstanding items and bank fees.',
        });
      }
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

// --- Self-Correction: re-scan TB when Assets != Liabilities + Equity ---

async function selfCorrectBalanceSheet(
  entries: TrialBalanceEntry[],
  balanceSheet: BalanceSheet
): Promise<SelfCorrectionResult> {
  const rhs = balanceSheet.totalLiabilities + balanceSheet.totalEquity;
  const discrepancyAmount = balanceSheet.totalAssets - rhs;
  const findings: DiscrepancyFinding[] = [];

  if (Math.abs(discrepancyAmount) <= TOLERANCE) {
    return {
      corrected: true,
      discrepancyAmount: 0,
      findings: [],
      message: 'Balance sheet already balances; no correction needed.',
    };
  }

  const classified = classifyTrialBalanceDeterministic(entries);
  const totalDebits = classified.reduce((s, e) => s + e.debit, 0);
  const totalCredits = classified.reduce((s, e) => s + e.credit, 0);
  const tbImbalance = totalDebits - totalCredits;

  if (Math.abs(tbImbalance) > TOLERANCE) {
    findings.push({
      accountName: '(Trial Balance total)',
      debit: totalDebits,
      credit: totalCredits,
      suggestedFix: `Trial balance is out of balance by ${tbImbalance}. Ensure all entries are double-entry (debits = credits).`,
    });
  }

  for (const e of classified) {
    const net = e.debit - e.credit;
    if (!e.accountType) continue;
    if (e.accountType === 'ASSET' && Math.abs(net - discrepancyAmount) < TOLERANCE) {
      findings.push({
        accountCode: e.accountCode,
        accountName: e.accountName,
        debit: e.debit,
        credit: e.credit,
        suggestedFix: `Asset account may be misstated by ~${discrepancyAmount}. Verify posting.`,
      });
    }
    if ((e.accountType === 'LIABILITY' || e.accountType === 'EQUITY') && Math.abs(-net - discrepancyAmount) < TOLERANCE) {
      findings.push({
        accountCode: e.accountCode,
        accountName: e.accountName,
        debit: e.debit,
        credit: e.credit,
        suggestedFix: `Liability/Equity account may be misstated by ~${discrepancyAmount}. Verify posting.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      accountName: '(Aggregate)',
      debit: balanceSheet.totalAssets,
      credit: rhs,
      suggestedFix: `Difference of ${discrepancyAmount} may be due to misclassification. Review account types for assets, liabilities, and equity.`,
    });
  }

  return {
    corrected: false,
    discrepancyAmount,
    findings,
    message: `Re-scanned Trial Balance. Found ${findings.length} potential cause(s) for Assets != L+E (difference: ${discrepancyAmount}). Review suggested fixes before reporting.`,
  };
}

// --- CFA Ratios from BS/P&L ---

function runCFARatios(
  balanceSheet: BalanceSheet,
  profitAndLoss: ProfitAndLoss
): CFARatios {
  const currentAssets = balanceSheet.assets.reduce((s, l) => s + l.amount, 0);
  const currentLiabilities = balanceSheet.liabilities.reduce((s, l) => s + l.amount, 0);
  const inventory = balanceSheet.assets.find((a) => /inventory/i.test(a.label ?? ''))?.amount ?? 0;
  const cash = balanceSheet.assets.find((a) => /cash/i.test(a.label ?? ''))?.amount ?? 0;
  const ar = balanceSheet.assets.find((a) => /receivable/i.test(a.label ?? ''))?.amount ?? 0;
  const ap = balanceSheet.liabilities.find((l) => /payable/i.test(l.label ?? ''))?.amount ?? 0;

  const inputs: LiquidityInputs = {
    currentAssets,
    inventory,
    currentLiabilities,
    revenue: profitAndLoss.totalRevenue || 1,
    accountsReceivable: ar,
    accountsPayable: ap,
  };
  const metrics = computeLiquidityMetrics(inputs);
  const assessment = assessLiquidityRisk(inputs);

  const roe =
    balanceSheet.totalEquity !== 0
      ? profitAndLoss.netIncome / balanceSheet.totalEquity
      : undefined;

  return {
    currentRatio: metrics.currentRatio,
    quickRatio: metrics.quickRatio,
    roe,
    liquidityRiskLevel: assessment.riskLevel,
  };
}

// --- Financial Health summary (natural language) ---

function buildFinancialHealthSummary(
  balanceSheet: BalanceSheet,
  profitAndLoss: ProfitAndLoss,
  reconciliation: ReconciliationResult,
  selfCorrection?: SelfCorrectionResult,
  cfaRatios?: CFARatios
): string {
  const parts: string[] = [];

  if (!reconciliation.passed) {
    parts.push(
      `Reconciliation flagged ${reconciliation.mismatches.length} issue(s): ${reconciliation.mismatches.map((m) => m.message).join('; ')}.`
    );
    if (selfCorrection && !selfCorrection.corrected) {
      parts.push(
        `Self-correction re-scanned the Trial Balance: ${selfCorrection.message}`
      );
    }
  } else {
    parts.push('All reconciliation checks passed.');
  }

  parts.push(
    `Balance Sheet: Total Assets ${balanceSheet.totalAssets.toLocaleString()}, Liabilities ${balanceSheet.totalLiabilities.toLocaleString()}, Equity ${balanceSheet.totalEquity.toLocaleString()}.`
  );
  parts.push(
    `P&L: Revenue ${profitAndLoss.totalRevenue.toLocaleString()}, Expenses ${profitAndLoss.totalExpenses.toLocaleString()}, Net Income ${profitAndLoss.netIncome.toLocaleString()}.`
  );

  if (cfaRatios) {
    if (cfaRatios.currentRatio != null) {
      parts.push(`Current Ratio: ${cfaRatios.currentRatio.toFixed(2)}.`);
    }
    if (cfaRatios.quickRatio != null) {
      parts.push(`Quick Ratio: ${cfaRatios.quickRatio.toFixed(2)}.`);
    }
    if (cfaRatios.roe != null) {
      parts.push(`ROE: ${(cfaRatios.roe * 100).toFixed(1)}%.`);
    }
    if (cfaRatios.liquidityRiskLevel) {
      parts.push(`Liquidity risk: ${cfaRatios.liquidityRiskLevel}.`);
    }
  }

  const health =
    reconciliation.passed && (cfaRatios?.liquidityRiskLevel === 'low' || !cfaRatios?.liquidityRiskLevel)
      ? 'Financial health is sound for the period.'
      : reconciliation.passed
        ? 'Financial health is adequate; review liquidity and ratios.'
        : 'Financial health cannot be confirmed until reconciliation issues are resolved.';

  parts.push(health);
  return parts.join(' ');
}

// --- Task Decomposition: main loop ---

export interface PrepareQ4FinancialsInput {
  /** Trial balance entries (raw or pre-parsed). If rows provided, will parse. */
  entries?: TrialBalanceEntry[];
  rawRows?: RawTrialBalanceRow[];
  /** Optional: bank statement balance for reconciliation */
  bankStatementBalance?: number;
  /** Period label (e.g. "Q4 2024") */
  periodLabel?: string;
}

/**
 * Task Decomposition loop: Initialize Plan, run steps, Reconciliation Worker, Self-Correction, final output.
 */
export async function prepareQ4Financials(
  input: PrepareQ4FinancialsInput
): Promise<Q4FinancialsOutput> {
  const plan = createPlan();

  let trialBalance: TrialBalanceResult;
  if (input.entries && input.entries.length > 0) {
    const totalDebits = input.entries.reduce((s, e) => s + e.debit, 0);
    const totalCredits = input.entries.reduce((s, e) => s + e.credit, 0);
    const tolerance = 0.01;
    trialBalance = {
      entries: input.entries,
      totalDebits,
      totalCredits,
      balances: Math.abs(totalDebits - totalCredits) < tolerance,
      errors: Math.abs(totalDebits - totalCredits) >= tolerance ? ['Trial balance does not balance'] : [],
    };
  } else if (input.rawRows && input.rawRows.length > 0) {
    trialBalance = parseTrialBalance(input.rawRows);
  } else {
    trialBalance = {
      entries: [],
      totalDebits: 0,
      totalCredits: 0,
      balances: true,
      errors: ['No trial balance data provided'],
    };
  }

  setStepStatus(plan, 'verify_gl', 'running');
  setStepStatus(plan, 'verify_gl', trialBalance.balances ? 'completed' : 'failed', trialBalance, trialBalance.errors[0]);

  setStepStatus(plan, 'adjust_accruals', 'running');
  setStepStatus(plan, 'adjust_accruals', 'completed', { note: 'Accruals assumed adjusted in GL; no automated adjustments applied.' });

  setStepStatus(plan, 'generate_pl', 'running');
  const { balanceSheet, profitAndLoss, classifiedEntries } = await buildValidatedStatements(trialBalance);
  setStepStatus(plan, 'generate_pl', 'completed', { balanceSheet, profitAndLoss });

  setStepStatus(plan, 'reconcile_banks', 'running');
  const reconciliationWorkerResult = runReconciliationWorker(
    trialBalance,
    balanceSheet,
    input.bankStatementBalance
  );
  setStepStatus(plan, 'reconcile_banks', 'completed', reconciliationWorkerResult);

  const reconciliation = runReconciliationWorker(
    trialBalance,
    balanceSheet,
    input.bankStatementBalance
  );

  let selfCorrection: SelfCorrectionResult | undefined;
  if (!balanceSheet.balances && Math.abs(balanceSheet.totalAssets - (balanceSheet.totalLiabilities + balanceSheet.totalEquity)) > TOLERANCE) {
    selfCorrection = await selfCorrectBalanceSheet(classifiedEntries, balanceSheet);
  }

  setStepStatus(plan, 'run_cfa_ratios', 'running');
  const cfaRatios = runCFARatios(balanceSheet, profitAndLoss);
  setStepStatus(plan, 'run_cfa_ratios', 'completed', cfaRatios);

  plan.completedAt = new Date().toISOString();

  const financialHealthSummary = buildFinancialHealthSummary(
    balanceSheet,
    profitAndLoss,
    reconciliation,
    selfCorrection,
    cfaRatios
  );

  return {
    plan,
    trialBalance,
    balanceSheet,
    profitAndLoss,
    reconciliation,
    selfCorrection,
    cfaRatios,
    financialHealthSummary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Detect if user intent is "Prepare the Q4 Financials" (or similar).
 */
export function isPrepareFinancialsIntent(query: string): boolean {
  const q = (query || '').toLowerCase().trim();
  return (
    /prepare\s*(the\s*)?q[1-4]\s*financials/i.test(q) ||
    /prepare\s*(the\s*)?financials/i.test(q) ||
    /q[1-4]\s*financials/i.test(q) ||
    /close\s*(the\s*)?books/i.test(q) ||
    /quarter\s*end\s*financials/i.test(q)
  );
}
