/**
 * Supervisor Agent: ReAct loop with Claude 3.5 Sonnet.
 * REASON → ACT (call tools) → OBSERVE (tool results) → repeat until final answer.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages.js';
import { toAnthropicTools, executeTool, SUPERVISOR_TOOLS, type SupervisorToolContext } from './supervisor_tools.js';
import { formatConflictForSupervisor } from './lead_partner_orchestrator.js';
import type { ConflictVariance } from '../types/orchestrator.js';
import { getProviderFromEnv } from '../llm/provider.js';
import { toOpenAITools, toMistralTools } from '../llm/tool_schema.js';
import { shouldEscalateToHuman } from '../llm/guardrails.js';
import { updatePolicyMemory } from '../memory/index.js';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_REACT_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are a financial Supervisor Agent. You orchestrate CPA and CFA specialist tools and ad-hoc catalog tools to answer the user's questions.

Work in a ReAct loop:
1. REASON: Decide what you need (e.g. "I need to see the balance sheet" or "I need to query revenue data").
2. ACT: Call the appropriate tool.
3. OBSERVE: Look at the tool result and decide if you have enough to answer, or if you need more analysis.

Tools:
- list_datasets: List available datasets (trial_balance, balance_sheet, profit_and_loss, budget_version, cash_forecast, ar_aging, ap_aging, data_quality_exceptions). Call when the user asks about data you can query.
- query_dataset: Run a query on a dataset. Input: datasetId (required), optional periodLabel, entityId, limit. Call after list_datasets (or after resolve_query_intent).
- resolve_query_intent: Resolve a natural-language question to suggested datasetId and filters. Input: question. Use when the user asks in plain language (e.g. "What was our runway?") then call query_dataset with the suggested params.
- summarize_query_result: Produce a short narrative summary of the last query_dataset result. No input. Call after query_dataset when the user wants a summary in plain language.
- step1CPA: Build Balance Sheet and P&L from trial balance. Pass raw_rows if the user or context provided trial balance data; otherwise the session may have pipeline input.
- step2CFA: Compute 5 key ratios (Current Ratio, Quick Ratio, Debt-to-Equity, ROE, Net Margin). Call after step1CPA.
- step3Supervisor: Produce Executive Memo. Call after step2CFA.
- getPortfolioFinalizationPolicy: When the user asks about changing past performance, back-dating, or correcting finalized periods, call this and cite the returned policy in your answer.

After you have enough information, answer the user clearly. Cite specific numbers and ratios when relevant. Do not invent data; only use what the tools returned.`;

export interface SupervisorChatInput {
  message: string;
  pipelineInput?: SupervisorToolContext['pipelineInput'];
  tenantId?: string;
  pool?: import('pg').Pool | null;
}

export interface SupervisorChatOutput {
  response: string;
  toolCalls: Array<{ name: string; summary: string }>;
  stopReason: string;
  /** When step3Supervisor detected CPA vs CFA conflict (e.g. Going Concern vs DCF terminal growth) */
  dissentingOpinion?: ConflictVariance;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set. Set it in the environment to use the Supervisor Agent.');
  }
  return key;
}

export async function runSupervisorChat(input: SupervisorChatInput): Promise<SupervisorChatOutput> {
  const provider = getProviderFromEnv();
  const ctx: SupervisorToolContext = {
    pipelineInput: input.pipelineInput,
    tenantId: input.tenantId,
    pool: input.pool ?? null,
  };
  const meta = input.pipelineInput?.meta;
  if (meta?.entityId) {
    const opts = input.pool && input.tenantId ? { pool: input.pool, tenantId: input.tenantId } : undefined;
    await updatePolicyMemory(meta.entityId, {
      ...(meta.standard ? { standard: meta.standard } : {}),
      country: meta.country,
      jurisdiction: meta.jurisdiction,
      currency: meta.currency,
      taxId: meta.taxId,
      businessNumber: meta.businessNumber,
    }, undefined, opts);
  }

  const messages: MessageParam[] = [
    { role: 'user', content: input.message },
  ];

  const toolCalls: Array<{ name: string; summary: string }> = [];
  let lastStopReason: string = 'end_turn';
  let lastDissentingOpinion: ConflictVariance | undefined;

  function buildToolResultContent(result: Awaited<ReturnType<typeof executeTool>>): string {
    if (!result.success) return `Error: ${result.error}`;
    const out = result.output as { executiveMemo?: string; dissentingOpinion?: ConflictVariance } | undefined;
    let content = result.summary;
    if (out?.executiveMemo) content += `\n\nFull executive memo:\n${out.executiveMemo}`;
    if (out?.dissentingOpinion) {
      lastDissentingOpinion = out.dissentingOpinion;
      content += `\n\n--- Dissenting Opinion ---\n${formatConflictForSupervisor(out.dissentingOpinion)}`;
    }
    return content;
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: getApiKey() });
    const tools: Tool[] = toAnthropicTools() as Tool[];

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
        }
        if (block.type === 'tool_use') {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      // Append assistant turn (including any text + tool_use)
      messages.push({
        role: 'assistant',
        content,
      });

      if (lastStopReason === 'end_turn' && toolUseBlocks.length === 0) {
        return {
          response: textBlocks.join('\n').trim() || 'No response generated.',
          toolCalls,
          stopReason: lastStopReason,
          dissentingOpinion: lastDissentingOpinion,
        };
      }

      if (toolUseBlocks.length === 0) {
        return {
          response: textBlocks.join('\n').trim() || 'No response generated.',
          toolCalls,
          stopReason: lastStopReason,
          dissentingOpinion: lastDissentingOpinion,
        };
      }

      // Execute each tool and append tool_result
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const use of toolUseBlocks) {
        const result = await executeTool(use.name, use.input, ctx);
        toolCalls.push({ name: use.name, summary: result.success ? result.summary : (result.error ?? '') });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: buildToolResultContent(result),
          is_error: !result.success,
        });
      }

      if (ctx.step1Output?.confidence != null && shouldEscalateToHuman(ctx.step1Output.confidence)) {
        return {
          response: 'Low confidence in the input data. Please review the trial balance and confirm any missing bank statements or identity details before proceeding.',
          toolCalls,
          stopReason: 'low_confidence',
          dissentingOpinion: lastDissentingOpinion,
        };
      }

      messages.push({
        role: 'user',
        content: toolResults,
      });
    }
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
    // @ts-expect-error — optional dependency
    const mod = await import('openai').catch(() => null);
    if (!mod?.default) {
      throw new Error('OpenAI SDK not installed. Add "openai" to dependencies.');
    }
    const client = new mod.default({ apiKey });
    const tools = toOpenAITools(SUPERVISOR_TOOLS);
    const openaiMessages: Array<Record<string, unknown>> = [{ role: 'user', content: input.message }];

    for (let iter = 0; iter < MAX_REACT_ITERATIONS; iter++) {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        max_tokens: 2048,
        messages: openaiMessages,
        tools,
        tool_choice: 'auto',
      });
      const msg = response.choices?.[0]?.message;
      if (!msg) break;
      openaiMessages.push(msg as Record<string, unknown>);
      const toolCallsResp = msg.tool_calls ?? [];
      if (!toolCallsResp.length) {
        return { response: msg.content?.trim() ?? '', toolCalls, stopReason: 'end_turn' };
      }
      for (const call of toolCallsResp) {
        const name = call.function?.name;
        let inputObj: Record<string, unknown> = {};
        try {
          inputObj = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          inputObj = {};
        }
        const result = await executeTool(name, inputObj, ctx);
        toolCalls.push({ name, summary: result.success ? result.summary : (result.error ?? '') });
        openaiMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: buildToolResultContent(result),
        });
      }
      if (ctx.step1Output?.confidence != null && shouldEscalateToHuman(ctx.step1Output.confidence)) {
        return {
          response: 'Low confidence in the input data. Please review the trial balance and confirm any missing bank statements or identity details before proceeding.',
          toolCalls,
          stopReason: 'low_confidence',
          dissentingOpinion: lastDissentingOpinion,
        };
      }
    }
    return { response: 'Reached maximum iterations.', toolCalls, stopReason: 'max_iterations', dissentingOpinion: lastDissentingOpinion };
  }

  if (provider === 'mistral') {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY is not set.');
    // @ts-expect-error — optional dependency
    const mod = await import('@mistralai/mistralai').catch(() => null);
    if (!mod) {
      throw new Error('Mistral SDK not installed. Add "@mistralai/mistralai" to dependencies.');
    }
    const client = new mod.Mistral({ apiKey });
    const tools = toMistralTools(SUPERVISOR_TOOLS);
    const messagesM: Array<Record<string, unknown>> = [{ role: 'user', content: input.message }];

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
        return { response: msg.content?.trim() ?? '', toolCalls, stopReason: 'end_turn', dissentingOpinion: lastDissentingOpinion };
      }
      for (const call of toolCallsResp) {
        const name = call.function?.name;
        let inputObj: Record<string, unknown> = {};
        try {
          inputObj = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          inputObj = {};
        }
        const result = await executeTool(name, inputObj, ctx);
        toolCalls.push({ name, summary: result.success ? result.summary : (result.error ?? '') });
        messagesM.push({
          role: 'tool',
          tool_call_id: call.id,
          content: buildToolResultContent(result),
        });
      }
      if (ctx.step1Output?.confidence != null && shouldEscalateToHuman(ctx.step1Output.confidence)) {
        return {
          response: 'Low confidence in the input data. Please review the trial balance and confirm any missing bank statements or identity details before proceeding.',
          toolCalls,
          stopReason: 'low_confidence',
          dissentingOpinion: lastDissentingOpinion,
        };
      }
    }
    return { response: 'Reached maximum iterations.', toolCalls, stopReason: 'max_iterations', dissentingOpinion: lastDissentingOpinion };
  }

  // Max iterations reached; get final text from last assistant turn if any
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
    toolCalls,
    stopReason: lastStopReason,
    dissentingOpinion: lastDissentingOpinion,
  };
}
