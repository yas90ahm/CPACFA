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

export type { ToolDefinition, ToolResult } from './types.js';

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
}

/** Execute a tool by name with parsed input. Returns JSON-serializable result. Async for semantic memory tools. */
export async function executeTool(
  name: string,
  input: unknown,
  context?: ToolContext
): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  const buildContext = context?.tenantId && context?.pool ? { tenantId: context.tenantId, pool: context.pool } : undefined;
  switch (name) {
    case 'classifyAccount':
      return runClassifyAccount(input as ClassifyAccountInput);
    case 'buildFinancialStatements':
      return runBuildFinancialStatements(input as BuildFinancialStatementsInput, buildContext);
    case 'get_financial_statements':
      return runBuildFinancialStatements(input as BuildFinancialStatementsInput, buildContext);
    case 'computeRatios':
      return runComputeRatios(input as ComputeRatiosInput);
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
