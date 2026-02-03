/**
 * CPA/CFA Toolbox — tools with tool_definition (name, description, parameters: Zod schema).
 * All tools return structured JSON for LLM parsing.
 */

import type { Pool } from 'pg';
import type { ToolDefinition } from './types.js';
import {
  classifyAccountDefinition,
  runClassifyAccount,
  type ClassifyAccountInput,
} from './classifyAccount.js';
import {
  buildFinancialStatementsDefinition,
  runBuildFinancialStatements,
  type BuildFinancialStatementsInput,
} from './buildFinancialStatements.js';
import {
  computeRatiosDefinition,
  runComputeRatios,
  type ComputeRatiosInput,
} from './computeRatios.js';
import {
  forensicRescanDefinition,
  runForensicRescan,
  type ForensicRescanInput,
} from './forensicRescan.js';
import {
  lookupVendorMemoryDefinition,
  checkCategoryConsistencyDefinition,
  storeUserCorrectionDefinition,
  runLookupVendorMemory,
  runCheckCategoryConsistency,
  runStoreUserCorrection,
  type LookupVendorMemoryInput,
  type CheckCategoryConsistencyInput,
  type StoreUserCorrectionInput,
} from './semanticMemory.js';
import {
  getDataGapsDefinition,
  runGetDataGaps,
  type GetDataGapsInput,
} from './getDataGaps.js';
import {
  leaseLiabilityDefinition,
  runLeaseLiability,
  type LeaseLiabilityInput,
} from './leaseLiability.js';
import {
  getPortfolioFinalizationPolicyDefinition,
  runGetPortfolioFinalizationPolicy,
  type GetPortfolioFinalizationPolicyInput,
} from './portfolioPolicy.js';
import {
  reconcileCPAwithCFADefinition,
  runReconcileCPAwithCFA,
  type ReconcileCPAwithCFAInput,
} from './reconcileCPAwithCFA.js';
import * as persistence from '../../services/persistence_service.js';
import {
  executeTool as executeSupervisorServiceTool,
  type SupervisorToolContext,
} from '../../services/supervisor_tools.js';

export type { ToolDefinition, ToolResult } from './types.js';

const SUPERVISOR_SERVICE_TOOL_NAMES = new Set([
  'list_datasets',
  'query_dataset',
  'resolve_query_intent',
  'summarize_query_result',
  'step1CPA',
  'step2CFA',
  'step3Supervisor',
]);
export {
  postTrialBalanceToPython,
  callPythonMathWorker,
  type TrialBalancePayload,
  type TrialBalanceLinePayload,
  type PythonTrialBalanceResponse,
} from './pythonBridge.js';

/** Entry shape used for buildFinancialStatements / Source of Truth. */
type ValidatedEntry = { accountName: string; debit: number; credit: number; accountCode?: string };

/**
 * When context has sessionId and pool, fetch pipeline_input_snapshot and return entries (raw_rows or statements output).
 * Used for Source of Truth so tools use Postgres snapshot instead of LLM-supplied input.
 */
async function getEntriesFromSession(
  context?: ToolContext
): Promise<ValidatedEntry[] | undefined> {
  if (!context?.sessionId || !context?.pool || !context?.tenantId) return undefined;
  const session = await persistence.getSession(context.pool, context.tenantId, context.sessionId);
  const snap = session?.pipelineInputSnapshot as
    | { type: 'raw_rows'; rawRows?: Array<{ accountName?: string; debit?: number; credit?: number; accountCode?: string }> }
    | { type: 'statements'; output?: { trialBalance?: { entries?: ValidatedEntry[] } } }
    | undefined;
  if (!snap) return undefined;
  if (snap.type === 'raw_rows' && Array.isArray(snap.rawRows) && snap.rawRows.length > 0) {
    return snap.rawRows.map((r) => ({
      accountName: r.accountName ?? '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      accountCode: r.accountCode,
    }));
  }
  if (snap.type === 'statements' && snap.output?.trialBalance?.entries?.length) {
    return snap.output.trialBalance.entries.map((e) => ({
      accountName: e.accountName ?? '',
      debit: Number(e.debit) || 0,
      credit: Number(e.credit) || 0,
      accountCode: e.accountCode,
    }));
  }
  return undefined;
}

/** Ratio-relevant totals for computeRatios (from session snapshot when available). */
interface RatioTotals {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  netIncome: number;
}

async function getRatioTotalsFromSession(context?: ToolContext): Promise<RatioTotals | undefined> {
  if (!context?.sessionId || !context?.pool || !context?.tenantId) return undefined;
  const session = await persistence.getSession(context.pool, context.tenantId, context.sessionId);
  const snap = session?.pipelineInputSnapshot as
    | { type: 'statements'; output?: { balanceSheet?: { totalAssets?: number; totalLiabilities?: number; totalEquity?: number }; profitAndLoss?: { totalRevenue?: number; netIncome?: number } } }
    | undefined;
  if (snap?.type !== 'statements' || !snap.output) return undefined;
  const bs = snap.output.balanceSheet;
  const pl = snap.output.profitAndLoss;
  if (!bs || !pl) return undefined;
  const totalAssets = Number(bs.totalAssets);
  const totalLiabilities = Number(bs.totalLiabilities);
  const totalEquity = Number(bs.totalEquity);
  const totalRevenue = Number(pl.totalRevenue);
  const netIncome = Number(pl.netIncome);
  if (!Number.isFinite(totalAssets) || !Number.isFinite(totalLiabilities) || !Number.isFinite(totalEquity) || !Number.isFinite(totalRevenue) || !Number.isFinite(netIncome))
    return undefined;
  return { totalAssets, totalLiabilities, totalEquity, totalRevenue, netIncome };
}

// --- Tool definitions (metadata for LLM / orchestration) ---

export const toolDefinitions: ToolDefinition[] = [
  classifyAccountDefinition,
  buildFinancialStatementsDefinition,
  computeRatiosDefinition,
  forensicRescanDefinition,
  getDataGapsDefinition,
  leaseLiabilityDefinition,
  lookupVendorMemoryDefinition,
  checkCategoryConsistencyDefinition,
  storeUserCorrectionDefinition,
  getPortfolioFinalizationPolicyDefinition,
  reconcileCPAwithCFADefinition,
];

export { classifyAccountDefinition, runClassifyAccount };
export type { ClassifyAccountInput };

export { buildFinancialStatementsDefinition, runBuildFinancialStatements };
export type { BuildFinancialStatementsInput };

export { computeRatiosDefinition, runComputeRatios };
export type { ComputeRatiosInput };

export { forensicRescanDefinition, runForensicRescan };
export type { ForensicRescanInput };

export { getDataGapsDefinition, runGetDataGaps };
export type { GetDataGapsInput };

export { leaseLiabilityDefinition, runLeaseLiability };
export type { LeaseLiabilityInput };

export { getPortfolioFinalizationPolicyDefinition, runGetPortfolioFinalizationPolicy };
export type { GetPortfolioFinalizationPolicyInput };

export { reconcileCPAwithCFADefinition, runReconcileCPAwithCFA };
export type { ReconcileCPAwithCFAInput };

export { lookupVendorMemoryDefinition, checkCategoryConsistencyDefinition, storeUserCorrectionDefinition };
export type { LookupVendorMemoryInput, CheckCategoryConsistencyInput, StoreUserCorrectionInput };

/** Optional request context for tools that need tenant/pool (e.g. integrity gate for buildFinancialStatements). */
export interface ToolContext {
  tenantId?: string;
  pool?: Pool;
  /** Validated entries from request/session; used for pre-flight and as Source of Truth. */
  validatedEntries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
  /** Session id for Source of Truth lookup (pipeline_input_snapshot) when present. */
  sessionId?: string;
  /** Pipeline input for step1CPA/step2CFA/step3Supervisor and catalog tools (delegated to supervisor_tools). */
  pipelineInput?: import('../../services/result_generator.js').PipelineInput;
  /** Mutated by supervisor_tools when step1CPA/step2CFA/step3Supervisor or catalog tools run. */
  step1Output?: SupervisorToolContext['step1Output'];
  step2Output?: SupervisorToolContext['step2Output'];
  lastCatalogResult?: SupervisorToolContext['lastCatalogResult'];
}

const DATA_GROUNDING_VIOLATION = 'Data Grounding Violation: No source data found to perform this calculation.';

function hasValidEntries(context: ToolContext | undefined, input: unknown): boolean {
  if (context?.validatedEntries && context.validatedEntries.length > 0) return true;
  const entries = (input as { entries?: unknown[] })?.entries;
  return Array.isArray(entries) && entries.length > 0;
}

function hasValidRatioInput(input: unknown): boolean {
  const o = input as Record<string, unknown>;
  const totalAssets = typeof o?.totalAssets === 'number' && Number.isFinite(o.totalAssets);
  const totalLiabilities = typeof o?.totalLiabilities === 'number' && Number.isFinite(o.totalLiabilities);
  const totalEquity = typeof o?.totalEquity === 'number' && Number.isFinite(o.totalEquity);
  const totalRevenue = typeof o?.totalRevenue === 'number' && Number.isFinite(o.totalRevenue);
  const netIncome = typeof o?.netIncome === 'number' && Number.isFinite(o.netIncome);
  return !!(totalAssets && totalLiabilities && totalEquity && totalRevenue && netIncome);
}

/** Execute a tool by name with parsed input. Returns JSON-serializable result. Async for semantic memory tools. */
export async function executeTool(
  name: string,
  input: unknown,
  context?: ToolContext
): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  if (SUPERVISOR_SERVICE_TOOL_NAMES.has(name)) {
    const ctx: SupervisorToolContext = {
      pipelineInput: context?.pipelineInput,
      tenantId: context?.tenantId,
      pool: context?.pool ?? null,
      step1Output: context?.step1Output,
      step2Output: context?.step2Output,
      lastCatalogResult: context?.lastCatalogResult,
    };
    const result = await executeSupervisorServiceTool(name, input as Record<string, unknown>, ctx);
    if (context) {
      context.step1Output = ctx.step1Output;
      context.step2Output = ctx.step2Output;
      context.lastCatalogResult = ctx.lastCatalogResult;
    }
    if (result.success) {
      return { success: true, data: result.output ?? { summary: result.summary } };
    }
    return { success: false, error: result.error ?? result.summary ?? 'Unknown error' };
  }

  const buildContext = context?.tenantId && context?.pool ? { tenantId: context.tenantId, pool: context.pool } : undefined;
  switch (name) {
    case 'classifyAccount':
      return runClassifyAccount(input as ClassifyAccountInput);
    case 'buildFinancialStatements':
    case 'get_financial_statements': {
      const GROUNDING_MSG =
        'Grounding Violation: buildFinancialStatements accepts only sessionId and tenantId. Do not pass entries or invented numbers. Data is loaded from the database.';
      const raw = input as Record<string, unknown>;
      if (raw.entries != null && (Array.isArray(raw.entries) || typeof raw.entries === 'object')) {
        return { success: false, error: GROUNDING_MSG };
      }
      if (raw.prior_entries != null && (Array.isArray(raw.prior_entries) || typeof raw.prior_entries === 'object')) {
        return { success: false, error: GROUNDING_MSG };
      }
      if (!context?.sessionId || !context?.tenantId || !context?.pool) {
        return {
          success: false,
          error: 'Grounding Violation: sessionId, tenantId, and pool are required. Start a session with trial balance data (e.g. chat-verified with raw_rows) so the tool can load validated data from the database.',
        };
      }
      const effectiveInput: BuildFinancialStatementsInput = {
        sessionId: context.sessionId,
        tenantId: context.tenantId,
        ...(raw.standard != null && { standard: raw.standard as BuildFinancialStatementsInput['standard'] }),
        ...(raw.fullSet != null && { fullSet: Boolean(raw.fullSet) }),
        ...(raw.lease != null && typeof raw.lease === 'object' && { lease: raw.lease as BuildFinancialStatementsInput['lease'] }),
      };
      return runBuildFinancialStatements(effectiveInput, buildContext!);
    }
    case 'computeRatios': {
      const ratioInput = input as ComputeRatiosInput & Record<string, unknown>;
      const sessionTotals = await getRatioTotalsFromSession(context);
      const hasInput = hasValidRatioInput(input);
      if (!sessionTotals && !hasInput) {
        return { success: false, error: DATA_GROUNDING_VIOLATION };
      }
      const effectiveInput: ComputeRatiosInput = sessionTotals && !hasInput
        ? {
            totalAssets: sessionTotals.totalAssets,
            totalLiabilities: sessionTotals.totalLiabilities,
            totalEquity: sessionTotals.totalEquity,
            totalRevenue: sessionTotals.totalRevenue,
            netIncome: sessionTotals.netIncome,
            ...(ratioInput.currentAssets != null && { currentAssets: ratioInput.currentAssets as number }),
            ...(ratioInput.currentLiabilities != null && { currentLiabilities: ratioInput.currentLiabilities as number }),
            ...(ratioInput.inventory != null && { inventory: ratioInput.inventory as number }),
            ...(ratioInput.accountsReceivable != null && { accountsReceivable: ratioInput.accountsReceivable as number }),
            ...(ratioInput.accountsPayable != null && { accountsPayable: ratioInput.accountsPayable as number }),
          }
        : (input as ComputeRatiosInput);
      return runComputeRatios(effectiveInput);
    }
    case 'forensicRescan':
      return runForensicRescan(input as ForensicRescanInput);
    case 'get_data_gaps':
      return runGetDataGaps(input as GetDataGapsInput);
    case 'calculateLeaseLiability':
      return runLeaseLiability(input as LeaseLiabilityInput);
    case 'lookupVendorMemory':
      return runLookupVendorMemory(input as LookupVendorMemoryInput);
    case 'checkCategoryConsistency':
      return runCheckCategoryConsistency(input as CheckCategoryConsistencyInput);
    case 'storeUserCorrection':
      return runStoreUserCorrection(input as StoreUserCorrectionInput);
    case 'getPortfolioFinalizationPolicy':
      return runGetPortfolioFinalizationPolicy(input as GetPortfolioFinalizationPolicyInput);
    case 'reconcileCPAwithCFA':
      return runReconcileCPAwithCFA(input as ReconcileCPAwithCFAInput);
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}
