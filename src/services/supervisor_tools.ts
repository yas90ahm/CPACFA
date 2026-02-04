/**
 * Supervisor tools: CPA step and catalog tools callable by Claude (ReAct).
 * Session context holds pipeline input and step outputs. Focus: CPA judgment and math verification.
 */

import type { Pool } from 'pg';
import type { PipelineInput, ResultGeneratorOutput } from './result_generator.js';
import { step1CPA } from './result_generator.js';
import type { BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import { computeConfidence } from '../llm/guardrails.js';
import type { LLMTool } from '../llm/tool_schema.js';
import { listDatasetsForTenant } from './data_catalog_service.js';
import { runCatalogQuery } from './catalog_query_service.js';
import { resolveQueryIntentAgentic } from './agentic_query_intent.js';
import { summarizeQueryResultAgentic } from './agentic_query_summary.js';
import type { CatalogQueryResult } from '../types/data_catalog.js';

/** Run-scoped context: pipeline input and step outputs for the ReAct loop; tenantId/pool for catalog tools */
export interface SupervisorToolContext {
  pipelineInput?: PipelineInput;
  step1Output?: {
    balanceSheet: BalanceSheet;
    profitAndLoss: ProfitAndLoss;
    trialBalance: unknown;
    reasoningChain?: unknown;
    confidence?: number;
  };
  tenantId?: string;
  pool?: Pool | null;
  /** Last catalog query result (for summarize_query_result) */
  lastCatalogResult?: CatalogQueryResult;
}

/** Claude tool definition (input_schema per Messages API) */
export const SUPERVISOR_TOOLS: LLMTool[] = [
  {
    name: 'list_datasets',
    description: 'List available datasets for ad-hoc query (trial_balance, balance_sheet, profit_and_loss, budget_version, cash_forecast, ar_aging, ap_aging, data_quality_exceptions). Call this to see what data you can query.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_dataset',
    description: 'Run a query on a dataset. Call after list_datasets. Input: datasetId (required), optional periodLabel, entityId, limit.',
    inputSchema: {
      type: 'object',
      properties: {
        datasetId: { type: 'string', description: 'Dataset id from list_datasets (e.g. balance_sheet, profit_and_loss)' },
        periodLabel: { type: 'string', description: 'Optional period filter (e.g. 2025-01)' },
        entityId: { type: 'string', description: 'Optional entity filter' },
        limit: { type: 'number', description: 'Optional row limit' },
      },
      required: ['datasetId'],
    },
  },
  {
    name: 'resolve_query_intent',
    description: 'Resolve a natural-language question to a suggested dataset and filters. Input: question (string). Returns suggested datasetId, periodLabel, entityId. Call before query_dataset when the user asks in plain language (e.g. "What was our runway?").',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural-language question (e.g. "What was revenue last quarter?")' },
      },
      required: ['question'],
    },
  },
  {
    name: 'summarize_query_result',
    description: 'Produce a short narrative summary of the last query_dataset result. No input. Call after query_dataset when the user wants a summary in plain language.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'step1CPA',
    description:
      'Run the CPA step: build Standard Balance Sheet and P&L from trial balance data. Call this when you need to see the balance sheet or P&L before answering a financial/tax question. Input: either raw_rows (array of { accountName, debit, credit, accountCode? }) or omit to use pipeline data already provided in this session.',
    inputSchema: {
      type: 'object',
      properties: {
        raw_rows: {
          type: 'array',
          description: 'Optional. Raw trial balance rows: [{ accountName, debit, credit, accountCode? }]. If omitted, uses pipeline input from session.',
        },
      },
      required: [],
    },
  },
];

function buildPipelineInputFromArgs(args: Record<string, unknown>, ctx: SupervisorToolContext): PipelineInput | null {
  if (args.raw_rows && Array.isArray(args.raw_rows) && args.raw_rows.length > 0) {
    const rawRows = args.raw_rows as Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
    return { type: 'raw_rows', rawRows };
  }
  return ctx.pipelineInput ?? null;
}

/**
 * Execute a supervisor tool by name. Mutates ctx with step outputs so subsequent tools can run without re-passing data.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SupervisorToolContext
): Promise<{ success: boolean; summary: string; output?: ResultGeneratorOutput; error?: string }> {
  try {
    if (name === 'step1CPA') {
      const input = buildPipelineInputFromArgs(args, ctx);
      if (!input) {
        return {
          success: false,
          summary: '',
          error: 'No pipeline input: provide raw_rows in the tool input, or ensure the session had pipelineInput set (e.g. from the chat request).',
        };
      }
      const out = await step1CPA(
        input,
        ctx.pool && ctx.tenantId ? { tenantId: ctx.tenantId, pool: ctx.pool } : undefined
      );
      ctx.step1Output = {
        balanceSheet: out.balanceSheet,
        profitAndLoss: out.profitAndLoss,
        trialBalance: out.trialBalance,
        reasoningChain: out.reasoningChain,
      };
      const trialBalance = out.trialBalance;
      const confidence = computeConfidence({
        hasTrialBalance: true,
        hasBankStatements: false,
        balances: trialBalance?.balances ?? true,
        missingIdentity: false,
        anomalies: 0,
      });
      ctx.step1Output.confidence = confidence;
      const summary = `Balance Sheet: totalAssets=${out.balanceSheet.totalAssets}, totalLiabilities=${out.balanceSheet.totalLiabilities}, totalEquity=${out.balanceSheet.totalEquity}; P&L: totalRevenue=${out.profitAndLoss.totalRevenue}, netIncome=${out.profitAndLoss.netIncome}. Confidence=${(confidence * 100).toFixed(0)}%.`;
      return { success: true, summary, output: undefined };
    }

    if (name === 'list_datasets') {
      const tenantId = ctx.tenantId ?? 'default';
      const datasets = await listDatasetsForTenant(ctx.pool ?? null, tenantId);
      const summary = `Available datasets: ${datasets.map((d) => d.id).join(', ')} (${datasets.length} total).`;
      return { success: true, summary, output: { datasets } as unknown as ResultGeneratorOutput };
    }

    if (name === 'query_dataset') {
      const datasetId = args.datasetId as string;
      if (!datasetId) return { success: false, summary: '', error: 'Missing datasetId' };
      const tenantId = ctx.tenantId ?? 'default';
      const result = await runCatalogQuery(
        tenantId,
        datasetId,
        {
          periodLabel: args.periodLabel as string | undefined,
          entityId: args.entityId as string | undefined,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        },
        ctx.pool ?? null
      );
      if (!result) return { success: false, summary: '', error: `Dataset not found or no data: ${datasetId}` };
      ctx.lastCatalogResult = result;
      const previewRows = result.rows.slice(0, 15).map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join('; '));
      const summary = `Query returned ${result.rows.length} row(s). Columns: ${result.columns.map((c) => c.name).join(', ')}.\nPreview:\n${previewRows.join('\n')}`;
      return { success: true, summary, output: { catalogResult: result } as unknown as ResultGeneratorOutput };
    }

    if (name === 'resolve_query_intent') {
      const question = args.question as string;
      if (!question?.trim()) return { success: false, summary: '', error: 'Missing question' };
      const intent = await resolveQueryIntentAgentic(question.trim());
      if (!intent) {
        return { success: true, summary: 'Could not resolve intent; use list_datasets and query_dataset with your best guess.', output: undefined };
      }
      const summary = `Suggested: datasetId=${intent.datasetId}${intent.periodLabel ? `, periodLabel=${intent.periodLabel}` : ''}${intent.entityId ? `, entityId=${intent.entityId}` : ''}.`;
      return { success: true, summary, output: { queryIntent: intent } as unknown as ResultGeneratorOutput };
    }

    if (name === 'summarize_query_result') {
      const last = ctx.lastCatalogResult;
      if (!last) return { success: false, summary: '', error: 'No prior query result to summarize. Run query_dataset first.' };
      const narrative = await summarizeQueryResultAgentic(last);
      return { success: true, summary: narrative, output: { querySummary: narrative } as unknown as ResultGeneratorOutput };
    }

    return { success: false, summary: '', error: `Unknown tool: ${name}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, summary: '', error: message };
  }
}

/** Convert to Anthropic Messages API tool shape (name, description, input_schema with type). */
export function toAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}> {
  return SUPERVISOR_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: { type: 'object' as const, properties: t.inputSchema.properties, required: t.inputSchema.required },
  }));
}
