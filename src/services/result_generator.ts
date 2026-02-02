/**
 * Result Generator — connects uploaded data to Specialist Brains.
 *
 * 1. Step 1 (CPA): Take extracted JSON and prepare Standard Balance Sheet and P&L.
 * 2. Step 2 (CFA): Analyze statements to calculate 5 key ratios (Current Ratio, Debt-to-Equity, ROE, Quick Ratio, Net Margin).
 * 3. Step 3 (Supervisor): Summarize findings in an Executive Memo.
 * 4. Trigger: Run automatically as soon as Upload status is marked 'Completed'.
 */

import type { Pool } from 'pg';
import type {
  BalanceSheet,
  ProfitAndLoss,
  TrialBalanceResult,
  FinancialStatementsOutput,
} from '../types/financial.js';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import { parseTrialBalance } from './trialBalanceParser.js';
import { buildFinancialStatements } from './financialStatements.js';
import { generateStatements } from './statementGenerator.js';
import { listContracts } from '../db/repositories/revenue_recognition_repository.js';
import type { IntegrityContractFact } from '../types/integrity.js';
import { buildCashFlowStatement, buildCashFlowFromTransactions } from './cashFlow.js';
import { buildEquityChangesStatement } from './equityChanges.js';
import { buildNotesAndPolicies } from './notesPolicies.js';
import { inferAccountingStandard } from './standard_selector.js';
import { evaluateQualityChecks, type QualityCheck } from './quality_checks.js';
import { shouldEscalateToHuman, submitToStaging } from './hitl_orchestrator.js';
import { runGapAnalysis, type DataGap } from '../agents/cpa_brain.js';
import { analyzeGapsAgentic } from './agentic_gap_analyzer.js';
import { proposePolicyChangesAgentic, type PolicyProposal } from './policy_inference_agentic.js';
import { computeLiquidityMetrics, assessLiquidityRisk } from './analysis_agent.js';
import type { LiquidityInputs } from '../types/analysis.js';
import type { ConflictVariance } from '../types/orchestrator.js';
import { getFlagsForContext } from './risk_context_store.js';
import { resolveConflict } from './lead_partner_orchestrator.js';

/** Optional tenant context for integrity gate (load contracts when building statements). */
export type ResultPipelineContext = { tenantId: string; pool: Pool };

// --- Upload status (trigger) ---

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

let uploadStatus: UploadStatus = 'pending';
const onCompletedCallbacks: Array<(data: PipelineInput) => void> = [];

export function getUploadStatus(): UploadStatus {
  return uploadStatus;
}

export function setUploadStatus(status: UploadStatus): void {
  uploadStatus = status;
}

/**
 * Register a callback to run when Upload status is marked 'completed'.
 * The pipeline runs automatically when markUploadCompleted(extractedData) is called.
 */
export function onUploadCompleted(callback: (data: PipelineInput) => void): () => void {
  onCompletedCallbacks.push(callback);
  return () => {
    const i = onCompletedCallbacks.indexOf(callback);
    if (i >= 0) onCompletedCallbacks.splice(i, 1);
  };
}

/**
 * Mark upload as completed and trigger the Specialist Brains pipeline for all registered callbacks.
 * Call this as soon as upload/ingest finishes (e.g. after trial-balance ingest or parser extract).
 */
export function markUploadCompleted(extractedData: PipelineInput): void {
  uploadStatus = 'completed';
  for (const cb of onCompletedCallbacks) {
    try {
      cb(extractedData);
    } catch (e) {
      console.error('[result_generator] onUploadCompleted callback error:', e);
    }
  }
}

// --- Pipeline input / output ---

export type PipelineInput =
  | {
      type: 'raw_rows';
      rawRows: RawTrialBalanceRow[];
      meta?: {
        entityId?: string;
        periodLabel?: string;
        standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
        fullSet?: boolean;
        /** When true with fullSet, priorRawRows are required for cash flow and equity roll-forward. */
        comparative?: boolean;
        priorRawRows?: RawTrialBalanceRow[];
        country?: string;
        jurisdiction?: string;
        currency?: string;
        taxId?: string;
        businessNumber?: string;
        publiclyAccountable?: boolean;
        transactions?: Array<{
          date?: string;
          amount: number;
          description?: string;
          counterparty?: string;
          debit?: number;
          credit?: number;
          category?: 'operating' | 'investing' | 'financing';
        }>;
      };
    }
  | {
      type: 'statements';
      output: FinancialStatementsOutput;
      meta?: {
        entityId?: string;
        periodLabel?: string;
        standard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP';
        fullSet?: boolean;
        comparative?: boolean;
        priorRawRows?: RawTrialBalanceRow[];
        country?: string;
        jurisdiction?: string;
        currency?: string;
        taxId?: string;
        businessNumber?: string;
        publiclyAccountable?: boolean;
        transactions?: Array<{
          date?: string;
          amount: number;
          description?: string;
          counterparty?: string;
          debit?: number;
          credit?: number;
          category?: 'operating' | 'investing' | 'financing';
        }>;
      };
    };

/** 5 key ratios (CFA Level) */
export interface FiveKeyRatios {
  currentRatio: number;
  debtToEquity: number;
  roe: number; // return on equity (decimal, e.g. 0.15 = 15%)
  quickRatio: number;
  netMargin: number; // decimal, e.g. 0.10 = 10%
}

export interface ResultGeneratorOutput {
  /** Step 1 (CPA): Standard Balance Sheet */
  balanceSheet: BalanceSheet;
  /** Step 1 (CPA): P&L */
  profitAndLoss: ProfitAndLoss;
  cashFlow?: import('../types/financial.js').CashFlowStatement;
  equityChanges?: import('../types/financial.js').EquityChangesStatement;
  notesAndPolicies?: import('../types/financial.js').NotesAndPolicies;
  /** Step 2 (CFA): 5 key ratios */
  ratios: FiveKeyRatios;
  /** Step 3 (Supervisor): Executive Memo */
  executiveMemo: string;
  /** When CPA vs CFA conflict (e.g. Going Concern vs DCF terminal growth), distinct Dissenting Opinion section */
  dissentingOpinion?: ConflictVariance;
  trialBalance?: TrialBalanceResult;
  reasoningChain?: FinancialStatementsOutput['reasoningChain'];
  qualityChecks?: QualityCheck[];
  dataGaps?: DataGap[];
  policyProposals?: PolicyProposal[];
  hitl?: { escalated: boolean; stagingId?: string };
}

// --- Step 1 (CPA): Standard Balance Sheet + P&L ---

export async function step1CPA(
  input: PipelineInput,
  context?: ResultPipelineContext
): Promise<{
  balanceSheet: BalanceSheet;
  profitAndLoss: ProfitAndLoss;
  trialBalance: TrialBalanceResult;
  reasoningChain?: FinancialStatementsOutput['reasoningChain'];
  cashFlow?: import('../types/financial.js').CashFlowStatement;
  equityChanges?: import('../types/financial.js').EquityChangesStatement;
  notesAndPolicies?: import('../types/financial.js').NotesAndPolicies;
}> {
  if (input.type === 'raw_rows') {
    const trialBalance = parseTrialBalance(input.rawRows);
    const meta = input.meta ?? {};
    const fullSet = meta.fullSet ?? false;
    const comparative = meta.comparative === true;
    if (fullSet && comparative && (!Array.isArray(meta.priorRawRows) || meta.priorRawRows.length === 0)) {
      throw new Error('Prior period trial balance required for cash flow and equity roll-forward.');
    }
    const priorTB = meta.priorRawRows ? parseTrialBalance(meta.priorRawRows) : undefined;
    const standard =
      meta.standard ??
      await inferAccountingStandard({
        standard: meta.standard,
        entityId: meta.entityId,
        country: meta.country,
        jurisdiction: meta.jurisdiction,
        currency: meta.currency,
        taxId: meta.taxId,
        businessNumber: meta.businessNumber,
        publiclyAccountable: meta.publiclyAccountable,
      });
    if (standard) {
      const stmtOpts: { fullSet: boolean; priorTrialBalance?: TrialBalanceResult; tenantId?: string; loadContracts?: (tid: string) => Promise<IntegrityContractFact[]> } = {
        fullSet,
        priorTrialBalance: priorTB,
      };
      if (context) {
        stmtOpts.tenantId = context.tenantId;
        stmtOpts.loadContracts = async (tid: string) => {
          const rows = await listContracts(context.pool, tid);
          return rows.map((r) => ({ id: r.id, totalContractValue: r.totalContractValue, periodRecognizedRevenue: undefined }));
        };
      }
      const res = await generateStatements(trialBalance, standard, stmtOpts);
      return {
        balanceSheet: res.balanceSheet,
        profitAndLoss: res.profitAndLoss,
        cashFlow: res.cashFlow,
        equityChanges: res.equityChanges,
        notesAndPolicies: res.notesAndPolicies,
        trialBalance: { ...trialBalance, entries: res.classifiedEntries },
      };
    }
    const { balanceSheet, profitAndLoss, classifiedEntries } = await buildFinancialStatements(trialBalance);
    const cashFlow = fullSet
      ? meta.transactions && meta.transactions.length > 0
        ? buildCashFlowFromTransactions(meta.transactions)
        : buildCashFlowStatement(trialBalance, profitAndLoss, priorTB)
      : undefined;
    const priorBalanceSheet = priorTB ? (await buildFinancialStatements(priorTB)).balanceSheet : undefined;
    const equityChanges = fullSet ? buildEquityChangesStatement(balanceSheet, priorBalanceSheet, profitAndLoss) : undefined;
    const notesAndPolicies = fullSet && meta.standard ? buildNotesAndPolicies(meta.standard) : undefined;
    return {
      balanceSheet,
      profitAndLoss,
      cashFlow,
      equityChanges,
      notesAndPolicies,
      trialBalance: { ...trialBalance, entries: classifiedEntries },
    };
  }
  const { balanceSheet, profitAndLoss, trialBalance } = input.output;
  return {
    balanceSheet,
    profitAndLoss,
    trialBalance: trialBalance as TrialBalanceResult,
    reasoningChain: input.output.reasoningChain,
    cashFlow: input.output.cashFlow,
    equityChanges: input.output.equityChanges,
    notesAndPolicies: input.output.notesAndPolicies,
  };
}

// --- Step 2 (CFA): 5 key ratios ---

export function step2CFA(
  balanceSheet: BalanceSheet,
  profitAndLoss: ProfitAndLoss
): FiveKeyRatios {
  const currentAssets = balanceSheet.assets.reduce((s, l) => s + l.amount, 0);
  const currentLiabilities = balanceSheet.liabilities.reduce((s, l) => s + l.amount, 0);
  const totalLiabilities = balanceSheet.totalLiabilities;
  const totalEquity = balanceSheet.totalEquity;
  const inventory = balanceSheet.assets.find((a) => /inventory/i.test(a.label ?? ''))?.amount ?? 0;
  const ar = balanceSheet.assets.find((a) => /receivable/i.test(a.label ?? ''))?.amount ?? 0;
  const ap = balanceSheet.liabilities.find((l) => /payable/i.test(l.label ?? ''))?.amount ?? 0;
  const revenue = profitAndLoss.totalRevenue || 1;
  const netIncome = profitAndLoss.netIncome ?? 0;

  const liquidityInputs: LiquidityInputs = {
    currentAssets,
    inventory,
    currentLiabilities,
    revenue,
    accountsReceivable: ar,
    accountsPayable: ap,
  };
  const metrics = computeLiquidityMetrics(liquidityInputs);
  assessLiquidityRisk(liquidityInputs); // optional: use for risk level in memo

  const currentRatio = metrics.currentRatio;
  const quickRatio = metrics.quickRatio;
  const debtToEquity = totalEquity !== 0 ? totalLiabilities / totalEquity : 0;
  const roe = totalEquity !== 0 ? netIncome / totalEquity : 0;
  const netMargin = revenue !== 0 ? netIncome / revenue : 0;

  return {
    currentRatio,
    debtToEquity,
    roe,
    quickRatio,
    netMargin,
  };
}

// --- Step 3 (Supervisor): Executive Memo ---

export function step3Supervisor(
  balanceSheet: BalanceSheet,
  profitAndLoss: ProfitAndLoss,
  ratios: FiveKeyRatios
): string {
  const parts: string[] = [];

  parts.push('EXECUTIVE MEMO — Specialist Brains Summary');
  parts.push('');

  parts.push('1. Standard Balance Sheet (CPA)');
  parts.push(
    `   Total Assets: ${formatNum(balanceSheet.totalAssets)} | Liabilities: ${formatNum(balanceSheet.totalLiabilities)} | Equity: ${formatNum(balanceSheet.totalEquity)}.`
  );
  parts.push(
    `   Equation check: ${balanceSheet.balances ? 'Assets = Liabilities + Equity (passed).' : 'Variance noted; review required.'}`
  );
  parts.push('');

  parts.push('2. P&L (CPA)');
  parts.push(
    `   Revenue: ${formatNum(profitAndLoss.totalRevenue)} | Expenses: ${formatNum(profitAndLoss.totalExpenses)} | Net Income: ${formatNum(profitAndLoss.netIncome)}.`
  );
  parts.push('');

  parts.push('3. Key Ratios (CFA)');
  parts.push(`   Current Ratio: ${ratios.currentRatio.toFixed(2)} (benchmark >1.5 for adequate liquidity).`);
  parts.push(`   Quick Ratio: ${ratios.quickRatio.toFixed(2)}.`);
  parts.push(`   Debt-to-Equity: ${ratios.debtToEquity.toFixed(2)}.`);
  parts.push(`   ROE: ${(ratios.roe * 100).toFixed(1)}%.`);
  parts.push(`   Net Margin: ${(ratios.netMargin * 100).toFixed(1)}%.`);
  parts.push('');

  parts.push('4. Supervisor Summary');
  const liquidityOk = ratios.currentRatio >= 1.5;
  const leverageOk = ratios.debtToEquity <= 2;
  const profitabilityOk = ratios.netMargin >= 0;
  const summary =
    liquidityOk && leverageOk && profitabilityOk
      ? 'Financial position is sound. Liquidity and leverage are within typical benchmarks; profitability is positive.'
      : !liquidityOk
        ? 'Liquidity warrants attention (Current Ratio below 1.5). Monitor working capital and short-term obligations.'
        : !leverageOk
          ? 'Leverage is elevated (Debt-to-Equity above 2). Consider debt reduction or equity strengthening.'
          : 'Review P&L and ratios with management for strategic alignment.';
  parts.push(`   ${summary}`);
  parts.push('');
  parts.push('— Generated automatically upon upload completion (CPA → CFA → Supervisor).');

  return parts.join('\n');
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(2) + 'k';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// --- Main loop: CPA → CFA → Supervisor ---

/**
 * Run the full pipeline: CPA (Balance Sheet + P&L) → CFA (5 ratios) → Supervisor (Executive Memo).
 * Call this when upload is completed, or use markUploadCompleted(extractedData) after registering with onUploadCompleted.
 * When context (tenantId + pool) is provided, statement build runs the integrity gate with loaded contracts.
 */
export async function runResultPipeline(
  input: PipelineInput,
  context?: ResultPipelineContext
): Promise<ResultGeneratorOutput> {
  const step1 = await step1CPA(input, context);
  const ratios = step2CFA(step1.balanceSheet, step1.profitAndLoss);
  const executiveMemo = step3Supervisor(step1.balanceSheet, step1.profitAndLoss, ratios);
  let dissentingOpinion: ConflictVariance | undefined;
  if (context) {
    const periodLabel = (input.meta && 'periodLabel' in input.meta ? (input.meta as { periodLabel?: string }).periodLabel : undefined);
    const flags = await getFlagsForContext(context.pool, context.tenantId, periodLabel);
    dissentingOpinion = resolveConflict(
      step1.balanceSheet,
      step1.profitAndLoss,
      ratios,
      undefined,
      flags.length ? flags : undefined,
      undefined
    );
  }
  const qualityChecks = evaluateQualityChecks(
    step1.balanceSheet,
    step1.profitAndLoss,
    step1.cashFlow,
    step1.equityChanges
  );
  const ledgerEntries = (step1.trialBalance?.entries ?? []).map((e) => ({
    accountName: e.accountName,
    debit: e.debit,
    credit: e.credit,
    accountCode: e.accountCode,
    accountType: e.accountType,
  }));
  const meta = input.meta ?? {};
  const dataGaps = runGapAnalysis(ledgerEntries, {
    taxId: meta.taxId,
    businessNumber: meta.businessNumber,
    transactions: meta.transactions?.map((t) => ({
      payee: t.counterparty,
      amount: t.amount,
      date: t.date,
      description: t.description,
    })),
  });
  const ledgerSummary = ledgerEntries.slice(0, 200).map((e) => `${e.accountName}: ${e.debit - e.credit}`).join('; ');
  const agenticGaps = await analyzeGapsAgentic({
    ledgerSummary,
    metadata: {
      taxId: meta.taxId,
      businessNumber: meta.businessNumber,
      transactionCount: meta.transactions?.length ?? 0,
    },
  });
  const allGaps = [...dataGaps, ...agenticGaps];
  const critical = qualityChecks.filter((c) => c.severity === 'critical');
  const highGaps = allGaps.filter((g) => g.urgency === 'high');
  let hitl: ResultGeneratorOutput['hitl'] = { escalated: false };
  if (critical.length > 0 || highGaps.length > 0) {
    const escalated = shouldEscalateToHuman({ isCriticalAccountingPolicyChange: true });
    if (escalated) {
      const item = submitToStaging({
        proposedAction: 'Review statement quality flags and data gaps',
        justification: [
          ...critical.map((c) => `${c.title}: ${c.message}`),
          ...highGaps.map((g) => `${g.title}: ${g.description}`),
        ].join(' | '),
        type: 'other',
      });
      hitl = { escalated: true, stagingId: item.id };
    }
  }

  const policyProposals = await proposePolicyChangesAgentic({
    standard: meta.standard,
    balanceSheet: step1.balanceSheet,
    profitAndLoss: step1.profitAndLoss,
    qualityChecks,
    dataGaps: allGaps,
  });

  return {
    balanceSheet: step1.balanceSheet,
    profitAndLoss: step1.profitAndLoss,
    cashFlow: step1.cashFlow,
    equityChanges: step1.equityChanges,
    notesAndPolicies: step1.notesAndPolicies,
    ratios,
    executiveMemo,
    dissentingOpinion,
    trialBalance: step1.trialBalance,
    reasoningChain: step1.reasoningChain,
    qualityChecks,
    dataGaps: allGaps,
    policyProposals,
    hitl,
  };
}

/**
 * Run the pipeline automatically when Upload status is marked 'Completed'.
 * Register this with onUploadCompleted so that as soon as markUploadCompleted(extractedData) is called, the pipeline runs and returns the full result.
 * Alternatively, call runResultPipeline(extractedData) directly after ingest completes.
 */
export async function runPipelineOnUploadCompleted(
  input: PipelineInput
): Promise<ResultGeneratorOutput> {
  return runResultPipeline(input);
}
