/**
 * Conversational Variance Narration (Layer 2) — AI advisory, read-only.
 *
 * Takes controller's question + Layer 1 investigation results, produces
 * a conversational explanation via Claude API. NEVER writes to financial tables.
 * Writes only to ai_call_log (via existing adapter pattern).
 */

import type { Pool } from 'pg';
import { callClaude } from '../ai/adapters/claude_adapter.js';
import { insertCallLog } from '../ai/ai_call_log_repository.js';
import { enterAdvisoryContext, exitAdvisoryContext } from '../lib/ai_boundary.js';
import { validateNumberProvenance } from '../lib/number_provenance_validator.js';
import type {
  ChatParams,
  ChatResponse,
  InvestigationResult,
  AccountDrilldownResult,
  NumberReference,
} from '../types/investigation.js';

/* ── Constants ────────────────────────────────────────────────── */

const AI_MODEL = process.env.AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10) || 30000;
const PILLAR = 'investigation_chat';
const PROMPT_VERSION = 'investigation_chat_v1';

const SYSTEM_PROMPT = `You are a financial analyst assistant embedded in a financial close system.
You help controllers understand variances in their financial statements.

RULES:
1. You may ONLY reference numbers that appear in the structured data provided.
2. You must NEVER invent, estimate, round, or extrapolate any dollar amount or percentage.
3. If the data doesn't answer the controller's question, say so — do not guess.
4. Reference specific accounts by name when explaining what drove a change.
5. When mentioning amounts, always specify whether it's an increase or decrease.
6. Keep explanations concise — 2-4 paragraphs maximum.
7. If you identify patterns (e.g., "3 of the top 5 changes are from new accounts"), mention them.
8. End with a specific, actionable follow-up suggestion (e.g., "Would you like me to look at the individual transactions in Account 4100?").

The structured data below contains the ONLY numbers you are permitted to use.
Any number in your response that does not appear in this data is a hallucination and will be blocked.`;

/* ── Helpers ──────────────────────────────────────────────────── */

function buildUserMessage(
  question: string,
  investigation: InvestigationResult,
  drilldown?: AccountDrilldownResult,
): string {
  const parts: string[] = [
    `Controller's question: "${question}"`,
    '',
    '--- STRUCTURED INVESTIGATION DATA (source of truth for all numbers) ---',
    '',
    JSON.stringify(investigation, null, 2),
  ];
  if (drilldown) {
    parts.push('', '--- ACCOUNT DRILLDOWN DATA ---', '', JSON.stringify(drilldown, null, 2));
  }
  return parts.join('\n');
}

/** Generate a safe template-based fallback when AI provenance fails. */
function buildTemplateFallback(investigation: InvestigationResult): string {
  const { fsLineLabel, currentTotal, priorTotal, changeAmount, changePercent, contributingAccounts } = investigation;
  const direction = parseFloat(changeAmount) >= 0 ? 'increased' : 'decreased';
  const lines: string[] = [
    `${fsLineLabel} ${direction} by $${formatNumber(changeAmount)} (${changePercent}%), ` +
    `from $${formatNumber(priorTotal)} to $${formatNumber(currentTotal)}.`,
  ];

  const top = contributingAccounts.slice(0, 5);
  if (top.length > 0) {
    lines.push('');
    lines.push('Top contributing accounts:');
    for (const a of top) {
      const dir = parseFloat(a.changeAmount) >= 0 ? 'increase' : 'decrease';
      lines.push(
        `- ${a.accountName} (${a.accountCode}): $${formatNumber(a.changeAmount)} ${dir} ` +
        `(${a.percentOfTotalChange}% of total change)`,
      );
    }
  }

  const newAccounts = contributingAccounts.filter((a) => a.direction === 'new');
  if (newAccounts.length > 0) {
    lines.push('');
    lines.push(`${newAccounts.length} new account(s) appeared in the current period.`);
  }

  return lines.join('\n');
}

function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return value;
  const abs = Math.abs(num);
  return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Core AI call (advisory context + logging) ────────────────── */

async function callAIForText(
  pool: Pool,
  tenantId: string,
  systemPrompt: string,
  userPrompt: string,
  requestJson: Record<string, unknown>,
): Promise<{ ok: boolean; rawText?: string; error?: string; callLogId?: string }> {
  enterAdvisoryContext();
  try {
    const model = process.env.AI_MODEL ?? AI_MODEL;
    const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS ?? '', 10) || AI_TIMEOUT_MS;

    const result = await callClaude({
      model,
      systemPrompt,
      userPrompt,
      timeoutMs,
      pillar: PILLAR,
    });

    const { id: callLogId } = await insertCallLog(pool, {
      tenantId,
      pillar: PILLAR,
      promptVersion: PROMPT_VERSION,
      model,
      requestJson,
      responseRaw: result.rawText ?? null,
      responseJson: null,
      ok: result.ok,
      error: result.error ?? null,
    });

    return {
      ok: result.ok,
      rawText: result.rawText,
      error: result.error,
      callLogId,
    };
  } finally {
    exitAdvisoryContext();
  }
}

/* ── Main entry point ─────────────────────────────────────────── */

export async function generateVarianceExplanation(
  pool: Pool,
  params: ChatParams,
): Promise<ChatResponse> {
  const { question, investigationResult, accountDrilldown, conversationHistory, tenantId } = params;

  const userMessage = buildUserMessage(question, investigationResult, accountDrilldown);

  // Build full prompt with conversation history
  let fullUserPrompt = '';
  if (conversationHistory && conversationHistory.length > 0) {
    const historyParts: string[] = [];
    for (const msg of conversationHistory) {
      historyParts.push(`${msg.role === 'user' ? 'Controller' : 'Assistant'}: ${msg.content}`);
    }
    fullUserPrompt = [
      '--- CONVERSATION HISTORY ---',
      historyParts.join('\n\n'),
      '',
      '--- CURRENT QUESTION ---',
      userMessage,
    ].join('\n');
  } else {
    fullUserPrompt = userMessage;
  }

  const requestJson: Record<string, unknown> = {
    question,
    fsLineId: investigationResult.fsLineId,
    periodLabel: investigationResult.metadata.periodLabel,
    historyLength: conversationHistory?.length ?? 0,
  };

  // First attempt
  const firstResult = await callAIForText(pool, tenantId, SYSTEM_PROMPT, fullUserPrompt, requestJson);

  if (firstResult.ok && firstResult.rawText) {
    const provenance = validateNumberProvenance(
      firstResult.rawText,
      investigationResult,
      accountDrilldown,
    );

    if (provenance.valid) {
      return {
        answer: firstResult.rawText,
        numbersUsed: provenance.numbersFound,
        modelVersion: process.env.AI_MODEL ?? AI_MODEL,
        provenanceValid: true,
      };
    }

    // Retry with warning
    const retryPrompt = fullUserPrompt +
      '\n\nWARNING: Your previous response contained numbers not found in the provided data. ' +
      'Use ONLY the exact figures from the structured data.';

    const retryResult = await callAIForText(
      pool, tenantId, SYSTEM_PROMPT, retryPrompt,
      { ...requestJson, retry: true },
    );

    if (retryResult.ok && retryResult.rawText) {
      const retryProvenance = validateNumberProvenance(
        retryResult.rawText,
        investigationResult,
        accountDrilldown,
      );

      if (retryProvenance.valid) {
        return {
          answer: retryResult.rawText,
          numbersUsed: retryProvenance.numbersFound,
          modelVersion: process.env.AI_MODEL ?? AI_MODEL,
          provenanceValid: true,
        };
      }
    }
  }

  // Fallback: deterministic template (no AI)
  const fallbackAnswer = buildTemplateFallback(investigationResult);
  const fallbackProvenance = validateNumberProvenance(
    fallbackAnswer,
    investigationResult,
    accountDrilldown,
  );

  return {
    answer: fallbackAnswer,
    numbersUsed: fallbackProvenance.numbersFound,
    modelVersion: 'template_fallback',
    provenanceValid: fallbackProvenance.valid,
  };
}
