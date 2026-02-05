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
  proposeTrialBalanceAdjustmentDefinition,
  runProposeTrialBalanceAdjustment,
  proposeTrialBalanceAdjustmentSchema,
  type ProposeTrialBalanceAdjustmentInput,
} from './proposeTrialBalanceAdjustment.js';
import * as persistence from '../../services/persistence_service.js';

export type { ToolDefinition, ToolResult } from './types.js';

/** Tool names that were delegated to supervisor_tools (removed per DEAD_CODE_AND_PURGE_PLAN). Return clear error if invoked. */
const QUARANTINED_TOOL_NAMES = new Set([
  'list_datasets',
  'query_dataset',
  'resolve_query_intent',
  'summarize_query_result',
  'step1CPA',
]);

/** Trial balance → statements: use buildFinancialStatements tool (calls financialStatements.buildValidatedStatements). */

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
  proposeTrialBalanceAdjustmentDefinition,
  computeRatiosDefinition,
  forensicRescanDefinition,
  getDataGapsDefinition,
  leaseLiabilityDefinition,
  lookupVendorMemoryDefinition,
  checkCategoryConsistencyDefinition,
  storeUserCorrectionDefinition,
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
  /** Pipeline input (optional; supervisor_tools removed per purge plan). */
  pipelineInput?: import('../../services/result_generator.js').PipelineInput;
  /** Uncommitted Save for Later drafts (hydrated workspace). Never used by buildFinancialStatements or export; only committed data is exported. */
  draftAdjustments?: Array<{ kind: string; [k: string]: unknown }>;
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
  if (QUARANTINED_TOOL_NAMES.has(name)) {
    return { success: false, error: `Tool "${name}" is not available (Supervisor/catalog quarantined per purge plan).` };
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
        fullSet: raw.fullSet !== undefined && raw.fullSet !== null ? Boolean(raw.fullSet) : false,
        ...(raw.standard != null && { standard: raw.standard as BuildFinancialStatementsInput['standard'] }),
        ...(raw.lease != null && typeof raw.lease === 'object' && { lease: raw.lease as BuildFinancialStatementsInput['lease'] }),
      };
      try {
        return await runBuildFinancialStatements(effectiveInput, buildContext!);
      } catch (e) {
        console.log('TRACE 2: Hard Crash in Tool Execution:', e instanceof Error ? e.message : String(e));
        throw e;
      }
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
    case 'proposeTrialBalanceAdjustment': {
      if (!context?.tenantId || !context?.pool) {
        return {
          success: false,
          error: 'Grounding Violation: tenantId and pool are required. Use this tool in a session with trial balance data.',
        };
      }
      const parsed = proposeTrialBalanceAdjustmentSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: `Amount provenance required: ${parsed.error.message}` };
      }
      const ptb = parsed.data;
      for (const line of [...ptb.debits, ...ptb.credits]) {
        if (line.amountProvenance == null || !['SOURCE_LINE_AMOUNT', 'HUMAN_ENTERED_AMOUNT', 'DETERMINISTIC_ENGINE_AMOUNT'].includes(line.amountProvenance)) {
          return { success: false, error: 'AMOUNT_PROVENANCE_REQUIRED: Every line must have amountProvenance (SOURCE_LINE_AMOUNT | HUMAN_ENTERED_AMOUNT | DETERMINISTIC_ENGINE_AMOUNT). Advisor may not invent or estimate amounts.' };
        }
        if (line.amount != null && line.amountProvenance === 'DETERMINISTIC_ENGINE_AMOUNT') {
          return { success: false, error: 'Advisor must not provide amount when amountProvenance is DETERMINISTIC_ENGINE_AMOUNT; TS core computes it.' };
        }
      }
      return runProposeTrialBalanceAdjustment(ptb, {
        tenantId: context.tenantId,
        pool: context.pool,
      });
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}
