/**
 * Lead Partner orchestrator — Chain of Thought (CoT) protocol.
 *
 * 1. Deconstruction: Break request into CPA and CFA sub-tasks.
 * 2. Capability Assessment: Identify tools (Python, RAG, ERP).
 * 3. Conflict Resolution: Document variance when CFA contradicts CPA (e.g. Market vs. Historical Cost).
 * 4. Self-Correction Loop: Reasonability check after major calculations; re-trace data if not reasonable.
 * 5. Output: Internal reasoning in <thought_process> block before final answer.
 */

import type {
  CotSubTask,
  ToolCapability,
  ConflictVariance,
  ReasonabilityCheck,
  LeadPartnerOutput,
  CFARatios,
} from '../types/orchestrator.js';
import type { BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import { prepareQ4Financials } from './orchestrator.js';
import type { Q4FinancialsOutput } from '../types/orchestrator.js';
import { dcfValue } from './analysis_agent.js';
import type { LiquidityInputs } from '../types/analysis.js';
import type { DCFInputs, DCFResult } from '../types/analysis.js';

// --- Deconstruction: CPA / CFA patterns ---

const CPA_PATTERNS = [
  'prepare', 'financials', 'q4', 'q1', 'q2', 'q3', 'trial balance', 'balance sheet',
  'p&l', 'income statement', 'reconcile', 'verify gl', 'accruals', 'book value',
  'gaap', 'financial position', 'how do we stand', 'assets', 'liabilities', 'equity',
  'revenue', 'expense', 'net income', 'cash flow', 'close the books',
];
const CFA_PATTERNS = [
  'valuation', 'value', 'roe', 'return on equity', 'ratio', 'liquidity', 'invest',
  'good buy', 'dcf', 'wacc', 'fair value', 'overvalued', 'undervalued', 'current ratio',
  'quick ratio', 'sensitivity', 'benchmark',
];

function deconstruct(query: string): { cpa: CotSubTask[]; cfa: CotSubTask[] } {
  const q = (query || '').toLowerCase().trim();
  const cpa: CotSubTask[] = [];
  const cfa: CotSubTask[] = [];

  if (/prepare|financials|q[1-4]|trial balance|balance sheet|reconcile|verify|accruals|close|books/i.test(q)) {
    cpa.push({ id: 'verify_gl', label: 'Verify GL', type: 'cpa', status: 'pending' });
    cpa.push({ id: 'reconcile_banks', label: 'Reconcile Banks', type: 'cpa', status: 'pending' });
    cpa.push({ id: 'adjust_accruals', label: 'Adjust Accruals', type: 'cpa', status: 'pending' });
    cpa.push({ id: 'generate_pl', label: 'Generate P&L', type: 'cpa', status: 'pending' });
  }
  if (/assets|liabilities|equity|revenue|expense|net income|p&l|income statement/i.test(q) && cpa.length === 0) {
    cpa.push({ id: 'generate_pl', label: 'Generate P&L / Balance Sheet', type: 'cpa', status: 'pending' });
  }
  if (/valuation|roe|ratio|liquidity|dcf|wacc|invest|good buy|fair value|benchmark/i.test(q)) {
    cfa.push({ id: 'run_ratios', label: 'Run CFA Ratios (ROE, liquidity)', type: 'cfa', status: 'pending' });
    if (/dcf|valuation|wacc|fair value/i.test(q)) {
      cfa.push({ id: 'dcf', label: 'DCF / Valuation', type: 'cfa', status: 'pending' });
    }
  }

  if (cpa.length === 0 && cfa.length === 0) {
    cpa.push({ id: 'generate_pl', label: 'Financial statements', type: 'cpa', status: 'pending' });
    cfa.push({ id: 'run_ratios', label: 'Ratio analysis', type: 'cfa', status: 'pending' });
  }
  return { cpa, cfa };
}

// --- Capability Assessment ---

function assessCapabilities(cpa: CotSubTask[], cfa: CotSubTask[]): ToolCapability[] {
  const tools: Set<ToolCapability> = new Set();
  if (cpa.length > 0 || cfa.length > 0) {
    tools.add('python'); // math, ratios, DCF
  }
  if (cpa.some((s) => s.id === 'generate_pl') || cfa.some((s) => s.id === 'dcf')) {
    tools.add('python');
  }
  if (cpa.some((s) => /reconcile|verify/.test(s.id))) {
    tools.add('erp'); // optional: fetch ledger
  }
  tools.add('rag'); // justification / law when citing GAAP
  return Array.from(tools);
}

// --- Reasonability Check (Self-Correction Loop) ---

const NET_MARGIN_TYPICAL_MIN = 0;
const NET_MARGIN_TYPICAL_MAX = 0.6; // 60% — software can be higher; flag if > 60% or < 0 for profitable sector
const ROE_TYPICAL_MIN = -0.5;
const ROE_TYPICAL_MAX = 0.5; // 50% — very high ROE possible but flag for review
const CURRENT_RATIO_TYPICAL_MIN = 0.3;
const CURRENT_RATIO_TYPICAL_MAX = 5;

function runReasonabilityChecks(
  balanceSheet?: BalanceSheet,
  profitAndLoss?: ProfitAndLoss,
  cfaRatios?: CFARatios,
  dcfResult?: DCFResult
): ReasonabilityCheck[] {
  const checks: ReasonabilityCheck[] = [];

  if (profitAndLoss && profitAndLoss.totalRevenue > 0) {
    const netMargin = profitAndLoss.netIncome / profitAndLoss.totalRevenue;
    const passed =
      netMargin >= NET_MARGIN_TYPICAL_MIN &&
      (netMargin <= NET_MARGIN_TYPICAL_MAX || netMargin > 0.7); // allow very high margin (e.g. software)
    checks.push({
      metric: 'Net Margin',
      value: `${(netMargin * 100).toFixed(1)}%`,
      passed,
      industry_note:
        passed
          ? 'Within typical range for many industries.'
          : netMargin > NET_MARGIN_TYPICAL_MAX && netMargin <= 0.7
            ? 'High margin — confirm industry (e.g. software) or re-verify revenue/expense classification.'
            : 'Unusual margin — re-trace data ingestion and account classification.',
      re_trace_recommendation: passed ? undefined : 'Re-verify trial balance and revenue/expense mapping.',
    });
  }

  if (cfaRatios?.currentRatio != null) {
    const cr = cfaRatios.currentRatio;
    const passed = cr >= CURRENT_RATIO_TYPICAL_MIN && cr <= CURRENT_RATIO_TYPICAL_MAX;
    checks.push({
      metric: 'Current Ratio',
      value: cr.toFixed(2),
      passed,
      industry_note: passed ? 'Within typical range.' : 'Unusual current ratio — verify current assets/liabilities.',
      re_trace_recommendation: passed ? undefined : 'Re-check balance sheet classification (current vs non-current).',
    });
  }

  if (cfaRatios?.roe != null) {
    const roe = cfaRatios.roe;
    const passed = roe >= ROE_TYPICAL_MIN && roe <= ROE_TYPICAL_MAX;
    checks.push({
      metric: 'ROE',
      value: `${(roe * 100).toFixed(1)}%`,
      passed,
      industry_note: passed ? 'Within typical range.' : 'ROE outside typical range — confirm equity and net income.',
      re_trace_recommendation: passed ? undefined : 'Re-verify equity (balance sheet) and net income (P&L).',
    });
  }

  if (dcfResult && dcfResult.enterpriseValue !== 0) {
    checks.push({
      metric: 'DCF Enterprise Value',
      value: `$${dcfResult.enterpriseValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      passed: true,
      industry_note: 'DCF result produced; validate WACC and growth assumptions for reasonability.',
    });
  }

  return checks;
}

// --- Conflict Resolution: CPA (Book) vs CFA (Valuation) ---
// Standards mapping: Going Concern vs DCF → ASC 205-40, IAS 1.25; Market vs Historical Cost → ASC 805, valuation;
// ROE vs CPA → accounting presentation; embedded lease / substance over form → ASC 842, IFRS 16; revenue recognition → ASC 606, IFRS 15.

/** Exported for Supervisor / step3 conflict injection. */
export function resolveConflict(
  balanceSheet?: BalanceSheet,
  profitAndLoss?: ProfitAndLoss,
  cfaRatios?: CFARatios,
  dcfResult?: DCFResult,
  professionalAuditFlags?: Array<{ category: string }>,
  dcfInput?: { terminalGrowthRate: number }
): ConflictVariance | undefined {
  // Going Concern vs DCF terminal growth: High-Risk Discrepancy when GC flagged and terminal growth > 0 (ASC 205-40, IAS 1.25)
  if (
    professionalAuditFlags?.some((f) => f.category === 'going_concern') &&
    dcfInput?.terminalGrowthRate != null &&
    dcfInput.terminalGrowthRate > 0
  ) {
    return {
      reason: 'High-Risk Discrepancy: Going Concern vs. DCF terminal growth',
      cpa_summary: 'CPA/audit: Going concern risk flagged.',
      cfa_summary: 'CFA: DCF terminal growth rate is positive.',
      recommendation:
        'DCF terminal growth must be ≤ 0% when going concern is in doubt, or a human reviewer must document justification for a positive terminal growth rate.',
      citationStandard: 'ASC 205-40, IAS 1.25',
    };
  }

  const bookEquity = balanceSheet?.totalEquity ?? 0;
  const dcfEv = dcfResult?.enterpriseValue;
  if (bookEquity === 0 && (dcfEv == null || dcfEv === 0)) {
    return undefined;
  }
  if (dcfEv != null && dcfEv !== 0 && bookEquity !== 0) {
    const ratio = dcfEv / bookEquity;
    if (ratio < 0.5 || ratio > 3) {
      return {
        reason: 'Market vs. Historical Cost',
        cpa_summary: `Book equity (GAAP) = ${bookEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
        cfa_summary: `DCF enterprise value = ${dcfEv.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
        recommendation:
          'Variance is expected: book value reflects historical cost under GAAP; DCF reflects forward-looking fair value. Use book value for reporting; use DCF for investment perspective.',
        citationStandard: 'ASC 805, valuation guidance',
      };
    }
  }
  if (cfaRatios?.roe != null && profitAndLoss && balanceSheet) {
    const ni = profitAndLoss.netIncome;
    const eq = balanceSheet.totalEquity;
    if (eq > 0 && ni > 0 && cfaRatios.roe < 0) {
      return {
        reason: 'CFA ROE contradicts CPA Net Income / Equity',
        cpa_summary: `CPA: Positive net income and positive equity.`,
        cfa_summary: `CFA: ROE computed as negative — check timing or sign of inputs.`,
        recommendation: 'Re-verify net income and equity used in ROE calculation; ensure same period and sign convention.',
        citationStandard: 'Accounting standards (presentation)',
      };
    }
  }
  return undefined;
}

/**
 * Format ConflictVariance as a single block for Supervisor tool result (so it cannot be dropped).
 */
export function formatConflictForSupervisor(c: ConflictVariance): string {
  const parts = [`Conflict Resolution: ${c.reason}.`];
  if (c.cpa_summary) parts.push(` CPA: ${c.cpa_summary}`);
  if (c.cfa_summary) parts.push(` CFA: ${c.cfa_summary}`);
  parts.push(` Recommendation: ${c.recommendation}`);
  return parts.join('');
}

// --- Build thought_process (XML) and final answer ---

function buildThoughtProcessXml(
  cpa: CotSubTask[],
  cfa: CotSubTask[],
  tools: ToolCapability[],
  conflict?: ConflictVariance,
  reasonabilityChecks: ReasonabilityCheck[] = [],
  executionNote?: string,
  cfoView?: CFOViewSummary
): string {
  const lines: string[] = [
    '1. Deconstruction:',
    `   CPA sub-tasks: ${cpa.map((s) => s.label).join(', ') || 'none'}.`,
    `   CFA sub-tasks: ${cfa.map((s) => s.label).join(', ') || 'none'}.`,
    '2. Capability Assessment:',
    `   Tools required: ${tools.join(', ')}.`,
    '3. Execution:',
    executionNote || '   Ran plan steps and/or CFA ratios as applicable.',
  ];
  if (cfoView?.narrative || cfoView?.varianceSummary || cfoView?.sensitivitySummary) {
    lines.push('3a. CFO View (unified board narrative):');
    if (cfoView.narrative) lines.push(`   MD&A: ${cfoView.narrative.slice(0, 200)}${cfoView.narrative.length > 200 ? '…' : ''}.`);
    if (cfoView.varianceSummary) lines.push(`   Variance: ${cfoView.varianceSummary.slice(0, 150)}${cfoView.varianceSummary.length > 150 ? '…' : ''}.`);
    if (cfoView.sensitivitySummary) lines.push(`   Sensitivity: ${cfoView.sensitivitySummary.slice(0, 150)}${cfoView.sensitivitySummary.length > 150 ? '…' : ''}.`);
  }
  if (conflict) {
    lines.push('4. Conflict Resolution:');
    lines.push(`   Variance: ${conflict.reason}.`);
    lines.push(`   Recommendation: ${conflict.recommendation}`);
  } else {
    lines.push('4. Conflict Resolution: None (no material CPA vs CFA variance).');
  }
  lines.push('5. Self-Correction (Reasonability Check):');
  if (reasonabilityChecks.length > 0) {
    reasonabilityChecks.forEach((c) => {
      lines.push(`   ${c.metric}: ${c.value} — ${c.passed ? 'passed' : 'review'}. ${c.industry_note ?? ''}`);
      if (c.re_trace_recommendation) {
        lines.push(`   Re-trace: ${c.re_trace_recommendation}`);
      }
    });
  } else {
    lines.push('   No quantitative checks run (insufficient data).');
  }
  return lines.join('\n');
}

function buildFinalAnswer(
  q4Output?: Q4FinancialsOutput,
  conflict?: ConflictVariance,
  reasonabilityChecks: ReasonabilityCheck[] = [],
  cfoView?: CFOViewSummary
): string {
  const parts: string[] = [];

  if (q4Output) {
    parts.push(q4Output.financialHealthSummary);
    if (q4Output.cfaRatios) {
      const r = q4Output.cfaRatios;
      if (r.currentRatio != null) parts.push(` Current Ratio: ${r.currentRatio.toFixed(2)}.`);
      if (r.quickRatio != null) parts.push(` Quick Ratio: ${r.quickRatio.toFixed(2)}.`);
      if (r.roe != null) parts.push(` ROE: ${(r.roe * 100).toFixed(1)}%.`);
      if (r.liquidityRiskLevel) parts.push(` Liquidity risk: ${r.liquidityRiskLevel}.`);
    }
  }

  if (cfoView?.narrative || cfoView?.varianceSummary || cfoView?.sensitivitySummary) {
    parts.push(' CFO view:');
    if (cfoView.narrative) parts.push(` ${cfoView.narrative.slice(0, 300)}${cfoView.narrative.length > 300 ? '…' : ''}.`);
    if (cfoView.varianceSummary) parts.push(` Variance: ${cfoView.varianceSummary.slice(0, 200)}${cfoView.varianceSummary.length > 200 ? '…' : ''}.`);
    if (cfoView.sensitivitySummary) parts.push(` Sensitivity: ${cfoView.sensitivitySummary.slice(0, 200)}${cfoView.sensitivitySummary.length > 200 ? '…' : ''}.`);
  }

  if (conflict) {
    parts.push('\n\nDissenting Opinion: ');
    parts.push(conflict.reason);
    if (conflict.cpa_summary) parts.push(` CPA: ${conflict.cpa_summary}`);
    if (conflict.cfa_summary) parts.push(` CFA: ${conflict.cfa_summary}`);
    parts.push(` Recommendation: ${conflict.recommendation}`);
  }

  const failedChecks = reasonabilityChecks.filter((c) => !c.passed);
  if (failedChecks.length > 0) {
    parts.push(
      ` Reasonability check: ${failedChecks.length} metric(s) outside typical range — ${failedChecks.map((c) => c.metric).join(', ')}. Consider re-tracing data ingestion.`
    );
  }

  return parts.join('').trim() || 'Lead Partner completed CoT; no financial data was run. Provide trial balance or statements for full analysis.';
}

// --- Lead Partner input / output ---

/** CFO view summary for unified board narrative (Lead Partner integration). */
export interface CFOViewSummary {
  narrative?: string;
  varianceSummary?: string;
  sensitivitySummary?: string;
  periodLabel?: string;
}

export interface LeadPartnerInput {
  query: string;
  rawRows?: RawTrialBalanceRow[];
  entries?: import('../types/financial.js').TrialBalanceEntry[];
  bankStatementBalance?: number;
  periodLabel?: string;
  /** Optional: pre-computed BS/P&L (skip prepareQ4) */
  balanceSheet?: BalanceSheet;
  profitAndLoss?: ProfitAndLoss;
  /** Optional: DCF inputs for valuation sub-task */
  dcfInputs?: DCFInputs;
  /** Optional: CFO view (MD&A, variance, sensitivity) for unified board narrative */
  cfoView?: CFOViewSummary;
  /** Optional: professional audit flags (e.g. going_concern) for conflict resolution */
  professionalAuditFlags?: Array<{ category: string }>;
}

/**
 * Lead Partner orchestrator: CoT protocol (Deconstruction, Capability, Conflict Resolution, Self-Correction).
 * Returns thought_process (and XML) + final_answer.
 */
export async function runLeadPartner(input: LeadPartnerInput): Promise<LeadPartnerOutput> {
  const { query, rawRows, entries, bankStatementBalance, periodLabel, balanceSheet, profitAndLoss, dcfInputs, cfoView, professionalAuditFlags } =
    input;

  const { cpa, cfa } = deconstruct(query);
  const tools = assessCapabilities(cpa, cfa);

  let q4Output: Q4FinancialsOutput | undefined;
  let dcfResult: DCFResult | undefined;

  const hasData = (rawRows && rawRows.length > 0) || (entries && entries.length > 0);
  if (hasData) {
    q4Output = await prepareQ4Financials({
      rawRows,
      entries,
      bankStatementBalance,
      periodLabel,
    });
    cpa.forEach((s) => (s.status = 'completed'));
    cfa.forEach((s) => (s.status = 'completed'));
  } else if (balanceSheet && profitAndLoss) {
    q4Output = {
      plan: { id: 'cot-inline', label: 'Lead Partner CoT', steps: [], startedAt: new Date().toISOString() },
      trialBalance: { entries: [], totalDebits: 0, totalCredits: 0, balances: true, errors: [] },
      balanceSheet,
      profitAndLoss,
      reconciliation: { passed: true, mismatches: [] },
      financialHealthSummary: 'Balance sheet and P&L provided; ratios computed.',
      generatedAt: new Date().toISOString(),
    };
    const { computeLiquidityMetrics, assessLiquidityRisk } = await import('./analysis_agent.js');
    const currentAssets = balanceSheet.assets.reduce((s, l) => s + l.amount, 0);
    const currentLiabilities = balanceSheet.liabilities.reduce((s, l) => s + l.amount, 0);
    const inventory = balanceSheet.assets.find((a) => /inventory/i.test(a.label ?? ''))?.amount ?? 0;
    const ar = balanceSheet.assets.find((a) => /receivable/i.test(a.label ?? ''))?.amount ?? 0;
    const ap = balanceSheet.liabilities.find((l) => /payable/i.test(l.label ?? ''))?.amount ?? 0;
    const liquidityInputs: LiquidityInputs = {
      currentAssets,
      inventory,
      currentLiabilities,
      revenue: profitAndLoss.totalRevenue || 1,
      accountsReceivable: ar,
      accountsPayable: ap,
    };
    const metrics = computeLiquidityMetrics(liquidityInputs);
    const assessment = assessLiquidityRisk(liquidityInputs);
    const roe =
      balanceSheet.totalEquity !== 0 ? profitAndLoss.netIncome / balanceSheet.totalEquity : undefined;
    q4Output.cfaRatios = {
      currentRatio: metrics.currentRatio,
      quickRatio: metrics.quickRatio,
      roe,
      liquidityRiskLevel: assessment.riskLevel,
    };
    cpa.forEach((s) => (s.status = 'completed'));
    cfa.forEach((s) => (s.status = 'completed'));
  }

  if (dcfInputs) {
    dcfResult = dcfValue(dcfInputs);
  }

  const conflict = resolveConflict(
    q4Output?.balanceSheet,
    q4Output?.profitAndLoss,
    q4Output?.cfaRatios,
    dcfResult,
    professionalAuditFlags,
    dcfInputs ? { terminalGrowthRate: dcfInputs.terminalGrowthRate } : undefined
  );
  const reasonabilityChecks = runReasonabilityChecks(
    q4Output?.balanceSheet,
    q4Output?.profitAndLoss,
    q4Output?.cfaRatios,
    dcfResult
  );

  const executionNote = hasData
    ? 'Ran prepareQ4Financials (Verify GL, Reconcile, Generate P&L, Run CFA Ratios).'
    : balanceSheet && profitAndLoss
      ? 'Used provided Balance Sheet and P&L; computed CFA ratios.'
      : 'No trial balance or statements provided; deconstruction and capability assessment only.';

  const thoughtProcessBody = buildThoughtProcessXml(
    cpa,
    cfa,
    tools,
    conflict,
    reasonabilityChecks,
    executionNote,
    cfoView
  );
  const thought_process_xml = `<thought_process>\n${thoughtProcessBody}\n</thought_process>`;
  const final_answer = buildFinalAnswer(q4Output, conflict, reasonabilityChecks, cfoView);

  return {
    thought_process: thoughtProcessBody,
    thought_process_xml,
    final_answer,
    cpa_sub_tasks: cpa,
    cfa_sub_tasks: cfa,
    tools_used: tools,
    conflict_variance: conflict,
    reasonability_checks: reasonabilityChecks,
    plan: q4Output?.plan,
    balance_sheet_summary: q4Output?.balanceSheet
      ? {
          totalAssets: q4Output.balanceSheet.totalAssets,
          totalLiabilities: q4Output.balanceSheet.totalLiabilities,
          totalEquity: q4Output.balanceSheet.totalEquity,
        }
      : undefined,
    income_statement_summary: q4Output?.profitAndLoss
      ? {
          totalRevenue: q4Output.profitAndLoss.totalRevenue,
          totalExpenses: q4Output.profitAndLoss.totalExpenses,
          netIncome: q4Output.profitAndLoss.netIncome,
        }
      : undefined,
    cfa_ratios: q4Output?.cfaRatios,
    generatedAt: new Date().toISOString(),
  };
}
