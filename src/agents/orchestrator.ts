/**
 * ReAct (Reason + Act) Orchestrator for the Supervisor Agent.
 *
 * Loop: Thought → Action → Observation → Reflect.
 * Termination: only when the agent has a high-confidence answer backed by specific data points.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages.js';
import type { Pool } from 'pg';
import { executeTool } from './tools/index.js';
import type { LLMTool } from '../llm/tool_schema.js';
import { toAnthropicTools, toOpenAITools, toMistralTools } from '../llm/tool_schema.js';
import { getProviderFromEnv } from '../llm/provider.js';

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_REACT_ITERATIONS = 20;

const SYSTEM_PROMPT = `You are a financial Supervisor Agent. You use a strict ReAct loop: Thought → Action → Observation → Reflect.

RULES:
1. **Thought** (hidden reasoning): Before ANY action, output your reasoning in this exact format:
   "Thought: <your reasoning>"
   Example: "Thought: I need to check the monthly P&L and compare it to current cash reserves to assess burn rate sustainability."
   Do not skip the Thought. It must explain what you plan to do and why.

2. **Action**: After the Thought, call exactly one tool. You have:
   - get_financial_statements: Returns Balance Sheet (assets, liabilities, equity, including cash) and P&L (revenue, expenses by category, net income). Input: { "entries": [ { "accountName", "debit", "credit", "accountCode?" } ] }. Use when you need monthly P&L, cash reserves, or expense breakdown (e.g. to spot spikes in Marketing, COGS, etc.).
   - computeRatios: Returns Current Ratio, Quick Ratio, Debt-to-Equity, ROE, Net Margin, burn-relevant metrics. Input: totalAssets, totalLiabilities, totalEquity, totalRevenue, netIncome (and optional currentAssets, currentLiabilities, inventory, accountsReceivable, accountsPayable). Use after you have statement totals to assess sustainability and liquidity.

3. **Observation**: You will receive the tool output as JSON. Read it carefully. Note specific line items (e.g. expense categories like "Marketing", "Salaries"), totals, and any anomalies.

4. **Reflect**: After each Observation, output:
   "Reflect: <your reflection>"
   - If the data shows something that requires further investigation (e.g. a 20% spike in "Marketing", an unbalanced sheet, missing cash), say so and decide your next step. Example: "Reflect: P&L shows a 20% spike in Marketing vs prior. I need to investigate that specific category before answering."
   - If you have enough evidence to answer with high confidence, say so. Example: "Reflect: I have cash, monthly burn, and expense breakdown. I can now answer sustainability with specific numbers."

5. **Termination**: The loop ends ONLY when you have a **high-confidence answer backed by specific data points**.
   - Do NOT give a final answer until you have called the tools you need and have concrete numbers (e.g. cash balance, monthly burn, expense categories).
   - When you are ready to answer, output exactly:
     "Confidence: high"
     "Answer: <your answer citing specific data points, e.g. 'Current cash is $X; monthly burn is $Y; runway is Z months. Burn rate is [not] sustainable because...'>"
   - If you are uncertain or lack data, output "Confidence: low" and continue with another Thought → Action → Observation → Reflect cycle.

6. After "Confidence: high" and "Answer: ...", do not call more tools. End your turn.`;

/** Build tool list for the orchestrator (get_financial_statements + computeRatios). */
function buildOrchestratorTools(): LLMTool[] {
  return [
    {
      name: 'get_financial_statements',
      description:
        'Returns Balance Sheet (assets including cash, liabilities, equity) and P&L (revenue, expenses by category e.g. Marketing/Salaries, net income). Use to get monthly P&L and current cash reserves. Input: entries array of { accountName, debit, credit, accountCode? } (trial balance rows).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entries: {
            type: 'array',
            description: 'Trial balance rows: { accountName, debit, credit, accountCode? }',
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
      name: 'computeRatios',
      description:
        'Compute Current Ratio, Quick Ratio, Debt-to-Equity, ROE, Net Margin and burn-related metrics. Use when you have statement totals to assess burn rate sustainability and liquidity.',
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
  ];
}

export interface OrchestratorInput {
  /** User question (e.g. "Is my current burn rate sustainable?") */
  message: string;
  /** Optional trial balance entries for get_financial_statements */
  entries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
  /** Optional tenant context: when provided, get_financial_statements runs integrity gate with loaded contracts */
  context?: { tenantId: string; pool: Pool };
}

export interface ReActStep {
  thought?: string;
  action?: { name: string; input: unknown };
  observation?: string;
  reflect?: string;
}

export interface OrchestratorOutput {
  /** Final answer (only when Confidence: high) */
  answer: string;
  /** Parsed confidence: "high" | "low" | "unknown" */
  confidence: 'high' | 'low' | 'unknown';
  /** ReAct steps (thought, action, observation, reflect) for transparency */
  steps: ReActStep[];
  /** Raw thoughts collected from the loop */
  thoughts: string[];
  /** Tool calls made */
  toolCalls: Array<{ name: string; input: unknown; result: string }>;
  stopReason: string;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set. Set it in the environment to use the Orchestrator.');
  }
  return key;
}

/** Parse final turn for "Confidence: high" and "Answer: ..." */
function parseFinalAnswer(text: string): { confidence: 'high' | 'low' | 'unknown'; answer: string } {
  const confidenceMatch = text.match(/Confidence:\s*(high|low)/i);
  const answerMatch = text.match(/Answer:\s*([\s\S]*?)(?=\n\n|$)/i);
  const confidence = confidenceMatch ? (confidenceMatch[1].toLowerCase() as 'high' | 'low') : 'unknown';
  const answer = answerMatch ? answerMatch[1].trim() : text.trim();
  return { confidence, answer };
}

/** Extract Thought and Reflect from assistant text block. */
function extractThoughtAndReflect(text: string): { thought?: string; reflect?: string } {
  const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=Reflect:|Action:|Confidence:|$)/i);
  const reflectMatch = text.match(/Reflect:\s*([\s\S]*?)(?=Thought:|Action:|Confidence:|$)/i);
  return {
    thought: thoughtMatch ? thoughtMatch[1].trim() : undefined,
    reflect: reflectMatch ? reflectMatch[1].trim() : undefined,
  };
}

/**
 * Run the ReAct Orchestrator: Thought → Action → Observation → Reflect.
 * Terminates only when the agent outputs Confidence: high and an Answer backed by data.
 */
export async function runReActOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const provider = getProviderFromEnv();

  const userContent = input.entries?.length
    ? `${input.message}\n\n[Trial balance entries available: ${input.entries.length} rows. Use get_financial_statements with { "entries": <these entries> } to retrieve P&L and Balance Sheet including cash.]`
    : input.message;

  const messages: MessageParam[] = [{ role: 'user', content: userContent }];

  const steps: ReActStep[] = [];
  const thoughts: string[] = [];
  const toolCalls: Array<{ name: string; input: unknown; result: string }> = [];
  let lastStopReason = 'end_turn';
  let finalText = '';

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: getApiKey() });
    const tools: Tool[] = toAnthropicTools(buildOrchestratorTools()) as Tool[];

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
          finalText = block.text;
          const { thought, reflect } = extractThoughtAndReflect(block.text);
          if (thought) {
            thoughts.push(thought);
            steps.push({ thought, reflect });
          } else if (reflect) {
            steps.push({ reflect });
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

      // No tool use: check for high-confidence answer and terminate
      if (lastStopReason === 'end_turn' && toolUseBlocks.length === 0) {
        const { confidence, answer } = parseFinalAnswer(finalText);
        return {
          answer: confidence === 'high' ? answer : finalText.trim() || 'No answer generated.',
          confidence,
          steps,
          thoughts,
          toolCalls,
          stopReason: lastStopReason,
        };
      }

      if (toolUseBlocks.length === 0) {
        const { confidence, answer } = parseFinalAnswer(finalText);
        return {
          answer: confidence === 'high' ? answer : finalText.trim() || 'No answer generated.',
          confidence,
          steps,
          thoughts,
          toolCalls,
          stopReason: lastStopReason,
        };
      }

      // Observation: run tools and append results
      const toolResults: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];

      for (const use of toolUseBlocks) {
        const toolResult = await executeTool(use.name, use.input, input.context);
        const contentStr =
          toolResult.success
            ? JSON.stringify(toolResult.data, null, 2)
            : `Error: ${toolResult.error}`;
        const truncated = contentStr.slice(0, 4000) + (contentStr.length > 4000 ? '...' : '');
        toolCalls.push({
          name: use.name,
          input: use.input,
          result: truncated,
        });
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.observation === undefined) {
          lastStep.action = { name: use.name, input: use.input };
          lastStep.observation = truncated;
        } else {
          steps.push({
            action: { name: use.name, input: use.input },
            observation: truncated,
          });
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: contentStr,
          is_error: !toolResult.success,
        });
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
    const tools = toOpenAITools(buildOrchestratorTools());
    const messagesO: Array<Record<string, unknown>> = [{ role: 'user', content: userContent }];

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
      const contentText = msg.content?.toString() ?? '';
      if (contentText) {
        finalText = contentText;
        const { thought, reflect } = extractThoughtAndReflect(contentText);
        if (thought) {
          thoughts.push(thought);
          steps.push({ thought, reflect });
        } else if (reflect) {
          steps.push({ reflect });
        }
      }
      messagesO.push(msg as Record<string, unknown>);
      const toolCallsResp = msg.tool_calls ?? [];
      if (!toolCallsResp.length) {
        const { confidence, answer } = parseFinalAnswer(finalText);
        return { answer: confidence === 'high' ? answer : finalText.trim(), confidence, steps, thoughts, toolCalls, stopReason: 'end_turn' };
      }
      for (const call of toolCallsResp) {
        const name = call.function?.name;
        let inputObj: Record<string, unknown> = {};
        try {
          inputObj = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          inputObj = {};
        }
        const toolResult = await executeTool(name, inputObj);
        const contentStr = toolResult.success ? JSON.stringify(toolResult.data, null, 2) : `Error: ${toolResult.error}`;
        toolCalls.push({ name, input: inputObj, result: contentStr.slice(0, 4000) });
        messagesO.push({ role: 'tool', tool_call_id: call.id, content: contentStr });
      }
    }
    return { answer: 'Reached maximum iterations.', confidence: 'unknown', steps, thoughts, toolCalls, stopReason: 'max_iterations' };
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
    const tools = toMistralTools(buildOrchestratorTools());
    const messagesM: Array<Record<string, unknown>> = [{ role: 'user', content: userContent }];

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
      const contentText = msg.content?.toString() ?? '';
      if (contentText) {
        finalText = contentText;
        const { thought, reflect } = extractThoughtAndReflect(contentText);
        if (thought) {
          thoughts.push(thought);
          steps.push({ thought, reflect });
        } else if (reflect) {
          steps.push({ reflect });
        }
      }
      messagesM.push(msg as Record<string, unknown>);
      const toolCallsResp = msg.tool_calls ?? [];
      if (!toolCallsResp.length) {
        const { confidence, answer } = parseFinalAnswer(finalText);
        return { answer: confidence === 'high' ? answer : finalText.trim(), confidence, steps, thoughts, toolCalls, stopReason: 'end_turn' };
      }
      for (const call of toolCallsResp) {
        const name = call.function?.name;
        let inputObj: Record<string, unknown> = {};
        try {
          inputObj = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          inputObj = {};
        }
        const toolResult = await executeTool(name, inputObj, input.context);
        const contentStr = toolResult.success ? JSON.stringify(toolResult.data, null, 2) : `Error: ${toolResult.error}`;
        toolCalls.push({ name, input: inputObj, result: contentStr.slice(0, 4000) });
        messagesM.push({ role: 'tool', tool_call_id: call.id, content: contentStr });
      }
    }
    return { answer: 'Reached maximum iterations.', confidence: 'unknown', steps, thoughts, toolCalls, stopReason: 'max_iterations' };
  }

  const { confidence, answer } = parseFinalAnswer(finalText);
  return {
    answer: confidence === 'high' ? answer : finalText.trim() || 'Reached max iterations without high-confidence answer.',
    confidence,
    steps,
    thoughts,
    toolCalls,
    stopReason: lastStopReason,
  };
}
