/**
 * Supervisor — Claude 3.5 Sonnet as reasoning engine with ReAct loop (Thought → Action → Observation).
 * Replaces static runPlanExecuteVerify with dynamic reasoning. Has access to the Toolbox.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { Pool } from 'pg';
import { executeTool, type ToolContext } from './tools/index.js';
import { getProviderFromEnv } from '../llm/provider.js';
import type { ReasoningLogEntry } from '../services/persistence_service.js';
import type { LLMTool } from '../llm/tool_schema.js';
import { toAnthropicTools, toOpenAITools, toMistralTools } from '../llm/tool_schema.js';
import { DATA_GROUNDING_RULE, shouldEscalateToHuman } from '../llm/guardrails.js';
import { SUPERVISOR_TOOLS } from '../services/supervisor_tools.js';
import type { PipelineInput } from '../services/result_generator.js';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_REACT_ITERATIONS = 15;

const SYSTEM_PROMPT = `You are a financial Supervisor. You use a ReAct loop: Thought → Action → Observation.

RULES:
1. Before taking ANY action (including calling a tool), you MUST output a "Thought" explaining your plan. Format: "Thought: <your reasoning>". Only after the Thought may you call a tool.
2. You have access to these tools:
   - classifyAccount: Map a single GL account name to Asset/Liability/Equity/Revenue/Expense. Use when you need to classify an account or verify classification.
   - buildFinancialStatements: Build Balance Sheet and P&L from validated trial balance in the database. Call with sessionId and tenantId only; do not pass entries or numbers. Use when the user asks for financial statements and the session has trial balance data.
   - computeRatios: Compute Current Ratio, Quick Ratio, Debt-to-Equity, ROE, Net Margin from balance sheet and P&L totals. Use when the user asks about liquidity, risk, leverage, or ratios.
   - forensicRescan: When a tool returns an anomaly (e.g. Balance Sheet does not balance: Assets != Liabilities + Equity, or Trial Balance does not balance), do NOT fail. Autonomously decide to run a Forensic Re-scan: call forensicRescan with the same entries to re-parse, re-classify, re-build, and verify. Use the verification result to explain or correct, then continue.
   - lookupVendorMemory: When processing a new file or line item, query semantic memory: "Have I seen this vendor before? How did we categorize it last time?" Use when the user uploads data or asks about a vendor/account to check prior treatment.
   - checkCategoryConsistency: Before applying a category to a vendor/account, call this with (vendor, currentCategory). If it returns consistent: false and promptForUser, you MUST pause and ask the user exactly that prompt (e.g. "Last month you categorized 'Stripe' as 'Software'; should I continue doing that or use the new 'Merchant Services' category?"). Do not override a previous user correction without asking.
   - storeUserCorrection: When the user explicitly confirms or corrects a category (e.g. "Yes, keep Stripe as Software"), call this to store the correction so future runs are consistent.
   - getPortfolioFinalizationPolicy: When the user asks about changing past performance, back-dating, or correcting finalized periods, call this and cite the returned policy in your answer.
   - reconcileCPAwithCFA: When you have called both buildFinancialStatements and computeRatios, you MUST call this with those results before giving your final answer; if it returns a conflict, include that in your response.
   - list_datasets: List available datasets for ad-hoc query. Call when the user asks about data you can query.
   - query_dataset: Run a query on a dataset (datasetId required; optional periodLabel, entityId, limit). Call after list_datasets or resolve_query_intent.
   - resolve_query_intent: Resolve a natural-language question to suggested datasetId and filters. Call when the user asks in plain language (e.g. "What was our runway?").
   - summarize_query_result: Produce a short narrative summary of the last query_dataset result. Call after query_dataset when the user wants a summary.
   - step1CPA: Build Balance Sheet and P&L from trial balance. Input: optional raw_rows; or omit to use pipeline data from session.
   - step2CFA: Compute 5 key ratios from the last step1CPA output. Call after step1CPA.
   - step3Supervisor: Produce Executive Memo from step1CPA and step2CFA. Call after step2CFA.
3. After each Observation (tool result), output a Thought about what you observed and what you will do next (e.g. call another tool, or answer the user). Only stop when you have fully answered the user's core intent.
4. When you have enough information to answer the user, provide a clear, complete response. Do not stop mid-flow; ensure the user's question is fully addressed.

${DATA_GROUNDING_RULE}`;

/** Build Anthropic tool list from toolbox (name, description, input_schema). Includes master tools + catalog/step tools. */
function buildTools(): LLMTool[] {
  const masterTools: LLMTool[] = [
    {
      name: 'classifyAccount',
      description: classifyAccountDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          accountName: { type: 'string', description: 'GL account name to classify (e.g. Cash, Accounts Payable)' },
        },
        required: ['accountName'],
      },
    },
    {
      name: 'buildFinancialStatements',
      description: buildFinancialStatementsDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          sessionId: { type: 'string', description: 'Session ID that holds the validated trial balance (from pipeline/session). Do not pass entries.' },
          tenantId: { type: 'string', description: 'Tenant ID for the session.' },
          standard: { type: 'string', description: 'Optional: ASPE, IFRS, FRS102, or US_GAAP' },
          fullSet: { type: 'boolean', description: 'Optional: include Cash Flow, Equity Changes, Notes' },
        },
        required: ['sessionId', 'tenantId'],
      },
    },
    {
      name: 'computeRatios',
      description: computeRatiosDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          totalAssets: { type: 'number', description: 'Total assets' },
          totalLiabilities: { type: 'number', description: 'Total liabilities' },
          totalEquity: { type: 'number', description: 'Total equity' },
          totalRevenue: { type: 'number', description: 'Total revenue' },
          netIncome: { type: 'number', description: 'Net income' },
          currentAssets: { type: 'number', description: 'Optional: current assets' },
          currentLiabilities: { type: 'number', description: 'Optional: current liabilities' },
          inventory: { type: 'number', description: 'Optional: inventory' },
          accountsReceivable: { type: 'number', description: 'Optional: AR' },
          accountsPayable: { type: 'number', description: 'Optional: AP' },
        },
        required: ['totalAssets', 'totalLiabilities', 'totalEquity', 'totalRevenue', 'netIncome'],
      },
    },
    {
      name: 'forensicRescan',
      description: forensicRescanDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          entries: {
            type: 'array',
            description: 'Trial balance rows to re-scan',
            items: {
              type: 'object',
              properties: {
                accountCode: { type: 'string' },
                accountName: { type: 'string' },
                debit: { type: 'number' },
                credit: { type: 'number' },
              },
              required: ['accountName', 'debit', 'credit'],
            },
          },
        },
        required: ['entries'],
      },
    },
    {
      name: 'lookupVendorMemory',
      description: lookupVendorMemoryDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          vendor: { type: 'string', description: 'Vendor or account name to look up (e.g. Stripe, AWS)' },
        },
        required: ['vendor'],
      },
    },
    {
      name: 'checkCategoryConsistency',
      description: checkCategoryConsistencyDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          vendor: { type: 'string', description: 'Vendor or account name (e.g. Stripe)' },
          currentCategory: { type: 'string', description: 'Category the agent would assign (e.g. Merchant Services, Software)' },
          period: { type: 'string', description: 'Optional period (e.g. 2024-Q1)' },
        },
        required: ['vendor', 'currentCategory'],
      },
    },
    {
      name: 'storeUserCorrection',
      description: storeUserCorrectionDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          vendor: { type: 'string' },
          category: { type: 'string' },
          accountCode: { type: 'string' },
          accountName: { type: 'string' },
          period: { type: 'string' },
          citation: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['vendor', 'category'],
      },
    },
    {
      name: 'getPortfolioFinalizationPolicy',
      description: getPortfolioFinalizationPolicyDescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          topic: { type: 'string', description: 'Optional: "finalization" or "correction". Omit for full policy.' },
        },
        required: [],
      },
    },
    {
      name: 'reconcileCPAwithCFA',
      description: reconcileCPAwithCFADescription,
      inputSchema: {
        type: 'object' as const,
        properties: {
          totalAssets: { type: 'number', description: 'From buildFinancialStatements balanceSheet' },
          totalLiabilities: { type: 'number', description: 'From buildFinancialStatements balanceSheet' },
          totalEquity: { type: 'number', description: 'From buildFinancialStatements balanceSheet' },
          totalRevenue: { type: 'number', description: 'From buildFinancialStatements profitAndLoss' },
          netIncome: { type: 'number', description: 'From buildFinancialStatements profitAndLoss' },
          currentRatio: { type: 'number', description: 'From computeRatios' },
          quickRatio: { type: 'number', description: 'From computeRatios' },
          roe: { type: 'number', description: 'From computeRatios' },
        },
        required: [],
      },
    },
  ];
  return [...masterTools, ...CATALOG_STEP_TOOLS];
}

const classifyAccountDescription =
  'Map a single GL account name to Asset/Liability/Equity/Revenue/Expense. Use when you need to classify an account or verify classification.';
const buildFinancialStatementsDescription =
  'Build Balance Sheet and P&L from the validated trial balance stored for this session. Pass only sessionId and tenantId; data is loaded from the database. Do not pass entries or invented numbers.';
const computeRatiosDescription =
  'Compute Current Ratio, Quick Ratio, Debt-to-Equity, ROE, Net Margin. Use when the user asks about liquidity, risk, leverage, or ratios.';
const forensicRescanDescription =
  'When a previous tool returned an anomaly (e.g. Assets != Liabilities + Equity), run a Forensic Re-scan with the same entries to re-validate and verify. Do not fail—call this autonomously when you observe such an anomaly.';
const lookupVendorMemoryDescription =
  'Query semantic memory: Have I seen this vendor before? How did we categorize it last time? Use when processing a new file or line item.';
const checkCategoryConsistencyDescription =
  'Check if your proposed category contradicts a previous user correction. If consistent is false, you MUST pause and ask the user the returned promptForUser.';
const storeUserCorrectionDescription =
  'Store a user correction (e.g. user confirmed Stripe -> Software) so future runs are consistent.';
const getPortfolioFinalizationPolicyDescription =
  'Returns the policy on portfolio period finalization and corrections. Call when the user asks about changing past performance, back-dating, or correcting finalized periods. Cite the returned policy in your answer.';
const reconcileCPAwithCFADescription =
  'Compare CPA (Balance Sheet / P&L) and CFA (ratios) outputs for conflicts. Call after both buildFinancialStatements and computeRatios; pass those results. If a conflict is returned, include it in your final response.';

/** Catalog and step tools (from supervisor_tools); getPortfolioFinalizationPolicy is already in buildTools above. */
const CATALOG_STEP_TOOLS = SUPERVISOR_TOOLS.filter((t) => t.name !== 'getPortfolioFinalizationPolicy');

export interface SupervisorInput {
  message: string;
  /** Optional trial balance entries to include in context (e.g. for buildFinancialStatements or forensicRescan). */
  entries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
}

export interface SupervisorOutput {
  response: string;
  thoughts: string[];
  toolCalls: Array<{ name: string; input: unknown; result: string }>;
  stopReason: string;
  /** When step3Supervisor (or reconcile) detected CPA vs CFA conflict. */
  dissentingOpinion?: unknown;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set. Set it in the environment to use the Supervisor.');
  }
  return key;
}

/**
 * Run the Supervisor: ReAct loop (Thought → Action → Observation) with Claude 3.5 Sonnet and the Toolbox.
 * Replaces the static runPlanExecuteVerify flow with dynamic reasoning. Only stops when the user's core intent is answered.
 * When context (tenantId + pool) is provided, buildFinancialStatements runs the integrity gate with loaded contracts.
 */
export async function runSupervisor(
  input: SupervisorInput,
  context?: {
    tenantId?: string;
    pool?: Pool;
    sessionId?: string;
    validatedEntries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
    /** Pipeline input for step1CPA/step2CFA/step3Supervisor and catalog tools. */
    pipelineInput?: PipelineInput;
    /** When set, each Thought or Tool step is appended to the session reasoning_logs (audit trail). */
    onReasoningStep?: (entry: ReasoningLogEntry) => void | Promise<void>;
    /** When set, after each Observation (tool result) the session row is updated with last_step and last_result_summary. */
    onObservationPersisted?: (lastStep: string, lastResultSummary: string) => void | Promise<void>;
    /** When set, after each turn the full message history is saved for resume-after-restart. */
    onMessageHistoryPersisted?: (payload: { provider: string; messages: unknown[] }) => void | Promise<void>;
    /** When set, used as initial messages for resume (provider must match current LLM). */
    initialMessageHistory?: { provider: string; messages: unknown[] };
    /** Read-only CPA Historical Snapshot (Revenue CAGR, EBITDA Margin, Net Debt) for CFA tasks; must be cited, forbidden to invent starting points. */
    accountingContext?: string;
  }
): Promise<SupervisorOutput> {
  const provider = getProviderFromEnv();
  const toolContext = {
    ...context,
    validatedEntries: context?.validatedEntries ?? (input.entries?.length ? input.entries : undefined),
    sessionId: context?.sessionId,
    pipelineInput: context?.pipelineInput,
    step1Output: undefined,
    step2Output: undefined,
    lastCatalogResult: undefined,
  };
  let lastDissentingOpinion: unknown;
  /** Persistence reliability: await so a crash never loses the last thought/observation. */
  const fireReasoningStep = async (entry: ReasoningLogEntry): Promise<void> => {
    const ts = { ...entry, timestamp: entry.timestamp || new Date().toISOString() };
    try {
      await Promise.resolve(context?.onReasoningStep?.(ts));
    } catch {
      // Log but do not fail the loop
    }
  };
  const fireObservationPersisted = async (lastStep: string, lastResultSummary: string): Promise<void> => {
    try {
      await Promise.resolve(context?.onObservationPersisted?.(lastStep, lastResultSummary));
    } catch {
      // Log but do not fail the loop
    }
  };
  const fireMessageHistoryPersisted = async (providerName: string, messagesArray: unknown[]): Promise<void> => {
    try {
      await Promise.resolve(context?.onMessageHistoryPersisted?.({ provider: providerName, messages: messagesArray }));
    } catch {
      // Log but do not fail the loop
    }
  };

  const userContent = input.entries?.length
    ? `${input.message}\n\n[Trial balance available in this session. Use buildFinancialStatements with sessionId and tenantId only (from context)—do not pass entries. Or use forensicRescan with entries if you need to re-validate.]`
    : input.message;

  const defaultFirstMessage: MessageParam[] = [{ role: 'user', content: userContent }];
  const initialMessagesRaw: unknown[] =
    context?.initialMessageHistory?.provider === provider &&
    Array.isArray(context.initialMessageHistory.messages) &&
    context.initialMessageHistory.messages.length > 0
      ? context.initialMessageHistory.messages
      : defaultFirstMessage;

  const messages: MessageParam[] = initialMessagesRaw as MessageParam[];

  const thoughts: string[] = [];
  const toolCalls: Array<{ name: string; input: unknown; result: string }> = [];
  let lastStopReason = 'end_turn';

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: getApiKey() });
    const tools: Tool[] = toAnthropicTools(buildTools()) as Tool[];

    for (let iter = 0; iter < MAX_REACT_ITERATIONS; iter++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools,
        tool_choice: { type: 'auto' },
      });

      lastStopReason = response.stop_reason ?? 'unknown';

      const content = response.content;
      const textBlocks: string[] = [];
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of content) {
        if (block.type === 'text') {
          textBlocks.push(block.text);
          const thoughtMatch = block.text.match(/Thought:\s*([\s\S]*?)(?=Action:|$)/i);
          if (thoughtMatch) {
            const thoughtText = thoughtMatch[1].trim();
            thoughts.push(thoughtText);
            await fireReasoningStep({
              stepType: 'thought',
              timestamp: new Date().toISOString(),
              thought: thoughtText,
              rawDataSeen: toolContext.validatedEntries?.length ? { entriesCount: toolContext.validatedEntries.length, sample: toolContext.validatedEntries.slice(0, 5) } : undefined,
            });
          }
        }
        if (block.type === 'tool_use') {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      messages.push({
        role: 'assistant',
        content,
      });

      if (lastStopReason === 'end_turn' && toolUseBlocks.length === 0) {
        await fireMessageHistoryPersisted('anthropic', messages);
        return {
          response: textBlocks.join('\n').trim() || 'No response generated.',
          thoughts,
          toolCalls,
          stopReason: lastStopReason,
          dissentingOpinion: lastDissentingOpinion,
        };
      }

      if (toolUseBlocks.length === 0) {
        await fireMessageHistoryPersisted('anthropic', messages);
        return {
          response: textBlocks.join('\n').trim() || 'No response generated.',
          thoughts,
          toolCalls,
          stopReason: lastStopReason,
          dissentingOpinion: lastDissentingOpinion,
        };
      }

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];

      for (const use of toolUseBlocks) {
        const toolResult = await executeTool(use.name, use.input, toolContext as ToolContext);
        const contentStr =
          toolResult.success
            ? JSON.stringify(toolResult.data, null, 2)
            : `Error: ${toolResult.error}`;
        const resultSummary = contentStr.slice(0, 2000) + (contentStr.length > 2000 ? '...' : '');
        toolCalls.push({
          name: use.name,
          input: use.input,
          result: resultSummary,
        });
        const data = toolResult.success ? (toolResult.data as Record<string, unknown>) : undefined;
        if (data?.dissentingOpinion != null) lastDissentingOpinion = data.dissentingOpinion;
        const reasoningChain = data?.reasoningChain as { plan?: string; verification?: { passed: boolean; checks: string[] } } | undefined;
        await fireReasoningStep({
          stepType: 'tool',
          timestamp: new Date().toISOString(),
          toolName: use.name,
          toolInput: use.input as Record<string, unknown>,
          toolResult: resultSummary,
          rawDataSeen: toolContext.validatedEntries?.length ? { entriesCount: toolContext.validatedEntries.length, sample: toolContext.validatedEntries.slice(0, 5) } : (use.name === 'buildFinancialStatements' || use.name === 'forensicRescan' ? (use.input as Record<string, unknown>) : undefined),
          ruleApplied: reasoningChain?.plan,
          verificationResult: reasoningChain?.verification,
        });
        await fireObservationPersisted(use.name, resultSummary);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: contentStr,
          is_error: !toolResult.success,
        });
      }

      const step1Conf = (toolContext as { step1Output?: { confidence?: number } }).step1Output?.confidence;
      if (step1Conf != null && shouldEscalateToHuman(step1Conf)) {
        fireMessageHistoryPersisted('anthropic', messages);
        return {
          response: 'Low confidence in the input data. Please review the trial balance and confirm any missing bank statements or identity details before proceeding.',
          thoughts,
          toolCalls,
          stopReason: 'low_confidence',
          dissentingOpinion: lastDissentingOpinion,
        };
      }

      messages.push({
        role: 'user',
        content: toolResults,
      });
      await fireMessageHistoryPersisted('anthropic', messages);
    }
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
    // @ts-expect-error — optional dependency
    const mod = await import('openai').catch(() => null);
    if (!mod?.default) throw new Error('OpenAI SDK not installed. Add "openai" to dependencies.');
    const client = new mod.default({ apiKey });
    const tools = toOpenAITools(buildTools());
    const messagesO: Array<Record<string, unknown>> = initialMessagesRaw as Array<Record<string, unknown>>;

    for (let iter = 0; iter < MAX_REACT_ITERATIONS; iter++) {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        max_tokens: 2048,
        messages: messagesO,
        tools,
        tool_choice: 'auto',
      });
      const msg = response.choices?.[0]?.message;
      if (!msg) break;
      messagesO.push(msg as Record<string, unknown>);
      const toolCallsResp = msg.tool_calls ?? [];
      if (!toolCallsResp.length) {
        await fireMessageHistoryPersisted('openai', messagesO);
        return { response: msg.content?.trim() ?? '', thoughts, toolCalls, stopReason: 'end_turn', dissentingOpinion: lastDissentingOpinion };
      }
      for (const call of toolCallsResp) {
        const name = call.function?.name;
        let inputObj: Record<string, unknown> = {};
        try {
          inputObj = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          inputObj = {};
        }
        const result = await executeTool(name, inputObj, toolContext as ToolContext);
        const resultStr = result.success ? JSON.stringify(result.data).slice(0, 2000) : `Error: ${result.error}`;
        toolCalls.push({ name, input: inputObj, result: resultStr });
        const data = result.success ? (result.data as Record<string, unknown>) : undefined;
        if (data?.dissentingOpinion != null) lastDissentingOpinion = data.dissentingOpinion;
        const reasoningChain = data?.reasoningChain as { plan?: string; verification?: { passed: boolean; checks: string[] } } | undefined;
        await fireReasoningStep({
          stepType: 'tool',
          timestamp: new Date().toISOString(),
          toolName: name,
          toolInput: inputObj,
          toolResult: resultStr,
          rawDataSeen: toolContext.validatedEntries?.length ? { entriesCount: toolContext.validatedEntries.length, sample: toolContext.validatedEntries.slice(0, 5) } : (name === 'buildFinancialStatements' || name === 'forensicRescan' ? inputObj : undefined),
          ruleApplied: reasoningChain?.plan,
          verificationResult: reasoningChain?.verification,
        });
        await fireObservationPersisted(name, resultStr);
        messagesO.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.success
            ? JSON.stringify(result.data)
            : `Error: ${result.error}`,
        });
      }
      const step1ConfO = (toolContext as { step1Output?: { confidence?: number } }).step1Output?.confidence;
      if (step1ConfO != null && shouldEscalateToHuman(step1ConfO)) {
        return {
          response: 'Low confidence in the input data. Please review the trial balance and confirm any missing bank statements or identity details before proceeding.',
          thoughts,
          toolCalls,
          stopReason: 'low_confidence',
          dissentingOpinion: lastDissentingOpinion,
        };
      }
      await fireMessageHistoryPersisted('openai', messagesO);
    }
    await fireMessageHistoryPersisted('openai', messagesO);
    return { response: 'Reached maximum iterations.', thoughts, toolCalls, stopReason: 'max_iterations', dissentingOpinion: lastDissentingOpinion };
  }

  if (provider === 'mistral') {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY is not set.');
    // @ts-expect-error — optional dependency
    const mod = await import('@mistralai/mistralai').catch(() => null);
    if (!mod) throw new Error('Mistral SDK not installed. Add "@mistralai/mistralai" to dependencies.');
    const client = new mod.Mistral({ apiKey });
    const tools = toMistralTools(buildTools());
    const messagesM: Array<Record<string, unknown>> = initialMessagesRaw as Array<Record<string, unknown>>;

    for (let iter = 0; iter < MAX_REACT_ITERATIONS; iter++) {
      const response = await client.chat.complete({
        model: process.env.MISTRAL_MODEL ?? 'mistral-large-latest',
        max_tokens: 2048,
        messages: messagesM,
        tools,
        tool_choice: 'auto',
      });
      const msg = response.choices?.[0]?.message;
      if (!msg) break;
      messagesM.push(msg as Record<string, unknown>);
      const toolCallsResp = msg.tool_calls ?? [];
      if (!toolCallsResp.length) {
        await fireMessageHistoryPersisted('mistral', messagesM);
        return { response: msg.content?.trim() ?? '', thoughts, toolCalls, stopReason: 'end_turn', dissentingOpinion: lastDissentingOpinion };
      }
      for (const call of toolCallsResp) {
        const name = call.function?.name;
        let inputObj: Record<string, unknown> = {};
        try {
          inputObj = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          inputObj = {};
        }
        const result = await executeTool(name, inputObj, toolContext as ToolContext);
        const resultStr = result.success ? JSON.stringify(result.data).slice(0, 2000) : `Error: ${result.error}`;
        toolCalls.push({ name, input: inputObj, result: resultStr });
        const data = result.success ? (result.data as Record<string, unknown>) : undefined;
        if (data?.dissentingOpinion != null) lastDissentingOpinion = data.dissentingOpinion;
        const reasoningChain = data?.reasoningChain as { plan?: string; verification?: { passed: boolean; checks: string[] } } | undefined;
        await fireReasoningStep({
          stepType: 'tool',
          timestamp: new Date().toISOString(),
          toolName: name,
          toolInput: inputObj,
          toolResult: resultStr,
          rawDataSeen: toolContext.validatedEntries?.length ? { entriesCount: toolContext.validatedEntries.length, sample: toolContext.validatedEntries.slice(0, 5) } : (name === 'buildFinancialStatements' || name === 'forensicRescan' ? inputObj : undefined),
          ruleApplied: reasoningChain?.plan,
          verificationResult: reasoningChain?.verification,
        });
        await fireObservationPersisted(name, resultStr);
        messagesM.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.success
            ? JSON.stringify(result.data)
            : `Error: ${result.error}`,
        });
      }
      const step1ConfM = (toolContext as { step1Output?: { confidence?: number } }).step1Output?.confidence;
      if (step1ConfM != null && shouldEscalateToHuman(step1ConfM)) {
        return {
          response: 'Low confidence in the input data. Please review the trial balance and confirm any missing bank statements or identity details before proceeding.',
          thoughts,
          toolCalls,
          stopReason: 'low_confidence',
          dissentingOpinion: lastDissentingOpinion,
        };
      }
      await fireMessageHistoryPersisted('mistral', messagesM);
    }
    await fireMessageHistoryPersisted('mistral', messagesM);
    return { response: 'Reached maximum iterations.', thoughts, toolCalls, stopReason: 'max_iterations', dissentingOpinion: lastDissentingOpinion };
  }

  const lastAssistant = messages.filter((m) => m.role === 'assistant').pop();
  let finalText = '';
  if (lastAssistant && Array.isArray(lastAssistant.content)) {
    for (const block of lastAssistant.content) {
      if (typeof block === 'object' && block !== null && 'type' in block && (block as { type: string }).type === 'text') {
        finalText += (block as { text: string }).text;
      }
    }
  }

  return {
    response: finalText.trim() || 'Reached maximum ReAct iterations. Review tool results above.',
    thoughts,
    toolCalls,
    stopReason: lastStopReason,
    dissentingOpinion: lastDissentingOpinion,
  };
}
