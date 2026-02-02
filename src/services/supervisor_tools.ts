/**
 * Supervisor tools: wrap CPA/CFA/Supervisor steps as tools callable by Claude (ReAct).
 * Session context holds pipeline input and step outputs so the agent can chain step1 → step2 → step3.
 * Catalog tools (list_datasets, query_dataset) use tenantId and pool from context for ad-hoc analysis.
 */

import type { Pool } from 'pg';
import type { PipelineInput, FiveKeyRatios, ResultGeneratorOutput } from './result_generator.js';
import { step1CPA, step2CFA, step3Supervisor } from './result_generator.js';
import { resolveConflict, formatConflictForSupervisor } from './lead_partner_orchestrator.js';
import type { BalanceSheet, ProfitAndLoss } from '../types/financial.js';
import { computeConfidence } from '../llm/guardrails.js';
import type { LLMTool } from '../llm/tool_schema.js';
import { listDatasetsForTenant } from './data_catalog_service.js';
import { runCatalogQuery } from './catalog_query_service.js';
import { resolveQueryIntentAgentic } from './agentic_query_intent.js';
import { summarizeQueryResultAgentic } from './agentic_query_summary.js';
import type { CatalogQueryResult } from '../types/data_catalog.js';
import { runGetPortfolioFinalizationPolicy } from '../agents/tools/portfolioPolicy.js';
import { assessLiquidityRisk } from './analysis_agent.js';
import type { LiquidityInputs } from '../types/analysis.js';
import { appendLiquidityWarnings, getFlagsForContext, setUnresolvedConflicts } from './risk_context_store.js';
import * as lastDcfRepo from '../db/repositories/risk_context_last_dcf_repository.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { recordObservation } from './audit_ledger_service.js';

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
  step2Output?: FiveKeyRatios;
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
  {
    name: 'step2CFA',
    description:
      'Run the CFA step: compute 5 key ratios (Current Ratio, Quick Ratio, Debt-to-Equity, ROE, Net Margin) from the Balance Sheet and P&L. Call this after step1CPA. No input needed; uses the balance sheet and P&L from the last step1CPA run.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'step3Supervisor',
    description:
      'Run the Supervisor step: produce an Executive Memo summarizing Balance Sheet, P&L, and key ratios. Call after step2CFA. No input needed; uses outputs from step1CPA and step2CFA.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getPortfolioFinalizationPolicy',
    description:
      'Returns the policy on portfolio period finalization and corrections. Call when the user asks about changing past performance, back-dating, correcting finalized periods, or why historical data cannot be overwritten. Cite the returned policy in your answer.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional: "finalization" or "correction". Omit for full policy.' },
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

    if (name === 'step2CFA') {
      const step1 = ctx.step1Output;
      if (!step1) {
        return { success: false, summary: '', error: 'Run step1CPA first to produce Balance Sheet and P&L.' };
      }
      const ratios = step2CFA(step1.balanceSheet, step1.profitAndLoss);
      ctx.step2Output = ratios;
      const currentAssets = step1.balanceSheet.assets.reduce((s, l) => s + l.amount, 0);
      const currentLiabilities = step1.balanceSheet.liabilities.reduce((s, l) => s + l.amount, 0);
      const inventory = step1.balanceSheet.assets.find((a) => /inventory/i.test(a.label ?? ''))?.amount ?? 0;
      const ar = step1.balanceSheet.assets.find((a) => /receivable/i.test(a.label ?? ''))?.amount ?? 0;
      const ap = step1.balanceSheet.liabilities.find((l) => /payable/i.test(l.label ?? ''))?.amount ?? 0;
      const liquidityInputs: LiquidityInputs = {
        currentAssets,
        inventory,
        currentLiabilities,
        revenue: step1.profitAndLoss.totalRevenue || 1,
        accountsReceivable: ar,
        accountsPayable: ap,
      };
      const assessment = assessLiquidityRisk(liquidityInputs);
      if (assessment.riskLevel === 'moderate' || assessment.riskLevel === 'high') {
        const periodLabelForLiquidity = ctx.pipelineInput && 'periodLabel' in ctx.pipelineInput ? (ctx.pipelineInput as { periodLabel?: string }).periodLabel : undefined;
        await appendLiquidityWarnings(ctx.tenantId ?? 'default', periodLabelForLiquidity, [
          {
            source: 'assessLiquidityRisk',
            riskLevel: assessment.riskLevel,
            currentRatio: assessment.metrics?.currentRatio,
            message: assessment.summary ?? `Liquidity risk: ${assessment.riskLevel}.`,
          },
        ], ctx.pool ?? undefined);
      }
      const tenantIdForObs = ctx.tenantId ?? 'default';
      const periodLabelForObs = ctx.pipelineInput && 'periodLabel' in ctx.pipelineInput ? (ctx.pipelineInput as { periodLabel?: string }).periodLabel : undefined;
      if (ctx.pool && periodLabelForObs) {
        await recordObservation(ctx.pool, {
          tenantId: tenantIdForObs,
          periodLabel: periodLabelForObs,
          eventType: 'cfa_recommendation',
          deterministicFlagSnapshot: { source: 'step2CFA', ratios },
        });
      }
      const summary = `Ratios: currentRatio=${ratios.currentRatio.toFixed(2)}, quickRatio=${ratios.quickRatio.toFixed(2)}, debtToEquity=${ratios.debtToEquity.toFixed(2)}, roe=${(ratios.roe * 100).toFixed(1)}%, netMargin=${(ratios.netMargin * 100).toFixed(1)}%.`;
      return { success: true, summary, output: undefined };
    }

    if (name === 'step3Supervisor') {
      const step1 = ctx.step1Output;
      const step2 = ctx.step2Output;
      if (!step1 || !step2) {
        return { success: false, summary: '', error: 'Run step1CPA and step2CFA first.' };
      }
      const tenantId = ctx.tenantId ?? 'default';
      const periodLabel = ctx.pipelineInput?.meta && 'periodLabel' in ctx.pipelineInput.meta
        ? (ctx.pipelineInput.meta as { periodLabel?: string }).periodLabel
        : undefined;
      const professionalAuditFlags = await getFlagsForContext(ctx.pool ?? null, tenantId, periodLabel);
      let dcfInput: { terminalGrowthRate: number } | undefined;
      if (ctx.pool && periodLabel) {
        const lastDcf = await lastDcfRepo.getByTenantPeriod(ctx.pool, tenantId, periodLabel);
        if (lastDcf != null) {
          dcfInput = { terminalGrowthRate: lastDcf.terminalGrowthRate };
        }
      }
      const executiveMemo = step3Supervisor(step1.balanceSheet, step1.profitAndLoss, step2);
      const conflict = resolveConflict(
        step1.balanceSheet,
        step1.profitAndLoss,
        step2,
        undefined,
        professionalAuditFlags.length ? professionalAuditFlags : undefined,
        dcfInput
      );
      if (conflict && ENABLE_INTEGRATED_SUPERVISOR && ctx.pool) {
        await setUnresolvedConflicts(ctx.pool, tenantId, periodLabel, [conflict], periodLabel, undefined);
      }
      const summary = conflict
        ? executiveMemo.slice(0, 500) + (executiveMemo.length > 500 ? '...' : '') + '\n\nConflict detected; see Dissenting Opinion below.'
        : executiveMemo.slice(0, 500) + (executiveMemo.length > 500 ? '...' : '');
      const output: ResultGeneratorOutput = {
        balanceSheet: step1.balanceSheet,
        profitAndLoss: step1.profitAndLoss,
        ratios: step2,
        executiveMemo,
        ...(conflict && { dissentingOpinion: conflict }),
        trialBalance: step1.trialBalance as ResultGeneratorOutput['trialBalance'],
      };
      return { success: true, summary, output };
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

    if (name === 'getPortfolioFinalizationPolicy') {
      const result = runGetPortfolioFinalizationPolicy(
        (args.topic ? { topic: args.topic as 'finalization' | 'correction' } : {}) as Parameters<typeof runGetPortfolioFinalizationPolicy>[0]
      );
      if (!result.success) return { success: false, summary: '', error: result.error };
      const policy = (result.data as { policy: string }).policy;
      return { success: true, summary: policy, output: result.data as unknown as ResultGeneratorOutput };
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
