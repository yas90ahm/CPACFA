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
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import { validateNumberProvenance } from '../lib/number_provenance_validator.js';
import { getAIModel, getAILongTimeoutMs } from '../ai/ai_config.js';
import type {
  ChatParams,
  ChatResponse,
  InvestigationResult,
  AccountDrilldownResult,
  NumberReference,
} from '../types/investigation.js';

/* ── Constants ────────────────────────────────────────────────── */
const PILLAR = 'investigation_chat';
const PROMPT_VERSION = 'investigation_chat_v2';

const SYSTEM_PROMPT = `You are a senior CPA advising a controller during financial close.

Your role: analyze pre-computed variance data and provide actionable insight.
You are NOT a narrator. You are an analyst. The controller can already see the numbers —
your job is to tell them what the numbers MEAN and what they should DO.

GROUNDING (non-negotiable):
- Every number you mention must come from the structured data provided.
- Do not compute, estimate, or round numbers. Use them exactly as given.
- Do not invent transactions, contracts, customers, or events.
- If you need data that isn't provided, say so explicitly.

ANALYSIS FRAMEWORK:
1. DRIVER ANALYSIS — What accounts drove the change? Is the change concentrated
   or broad-based? Are the drivers recurring or one-time?
2. CROSS-LINE RELATIONSHIPS — Do related line items move consistently?
   (e.g., Revenue up but AR flat could mean better collections or cash sales shift)
   Use the relatedLineChanges data to make these connections.
3. ANOMALY FLAGS — What doesn't make sense? What's inconsistent?
   (e.g., COGS up 30% but Revenue only up 10% means margin compression — investigate)
4. FOLLOW-UP — What specific action should the controller take next?
   (e.g., "Pull the AR aging for Account 1100 to check if the increase
   represents collectible receivables")

TONE: Direct, analytical, like a senior colleague reviewing the workpaper.
Not robotic. Not verbose. No filler. Use account names, not just codes.

FORMAT: 2-4 focused paragraphs. No bullet lists unless listing specific accounts.
End with ONE specific follow-up action, not a generic "review further."`;

/* ── Helpers ──────────────────────────────────────────────────── */

function buildUserMessage(
  question: string,
  investigation: InvestigationResult,
  drilldown?: AccountDrilldownResult,
): string {
  const parts: string[] = [
    `Controller asks: "${question}"`,
    '',
    '=== VARIANCE SUMMARY (all numbers pre-computed, use as-is) ===',
    `Line: ${investigation.fsLineLabel}`,
    `Current: ${investigation.currentTotal} | Prior: ${investigation.priorTotal}`,
    `Change: ${investigation.changeAmount} (${investigation.changePercent}%)`,
    `Period: ${investigation.metadata.periodLabel}`,
    '',
    '=== CONTRIBUTING ACCOUNTS (sorted by impact) ===',
  ];

  for (const a of investigation.contributingAccounts) {
    parts.push(
      `${a.accountName} (${a.accountCode}): ${a.direction} ${a.changeAmount} ` +
      `(${a.changePercent}%), ${a.percentOfTotalChange}% of total change. ` +
      `${a.isRecurring ? 'Recurring' : 'Non-recurring'}. ` +
      `${a.transactionCount ?? 0} transactions. ` +
      `Memos: ${a.topMemos.join('; ') || 'none'}`
    );
  }

  // Analytical signals
  const signals = investigation.analyticalSignals;
  if (signals) {
    parts.push('', '=== ANALYTICAL SIGNALS (pre-computed, use for cross-line analysis) ===');

    if (signals.relatedLineChanges.length > 0) {
      parts.push('Related line items:');
      for (const r of signals.relatedLineChanges) {
        parts.push(`  ${r.fsLineLabel}: change ${r.changeAmount} (${r.changePercent}%)`);
      }
    }

    if (signals.concentrationWarning) {
      parts.push(`Concentration: ${signals.concentrationWarning}`);
    }

    parts.push(`Recurring change total: ${signals.recurringChangeAmount}`);
    parts.push(`Non-recurring change total: ${signals.nonRecurringChangeAmount}`);

    if (signals.newAccountCount > 0) parts.push(`New accounts in period: ${signals.newAccountCount}`);
    if (signals.eliminatedAccountCount > 0) parts.push(`Accounts eliminated: ${signals.eliminatedAccountCount}`);

    parts.push(
      `Directional consistency: ${signals.accountsMovingWithTotal} accounts moved with total, ` +
      `${signals.accountsMovingAgainstTotal} moved against`
    );

    if (signals.topKeywords.length > 0) {
      parts.push(`Common memo keywords: ${signals.topKeywords.join(', ')}`);
    }
  }

  if (drilldown) {
    parts.push('', '=== ACCOUNT DRILLDOWN (individual GL entries) ===', JSON.stringify(drilldown, null, 2));
  }

  return parts.join('\n');
}

/** Generate an analytical template-based fallback when AI is unavailable or provenance fails. */
function buildTemplateFallback(investigation: InvestigationResult): string {
  const { fsLineLabel, changeAmount, changePercent, contributingAccounts, analyticalSignals } = investigation;
  const direction = parseFloat(changeAmount) >= 0 ? 'increased' : 'decreased';
  const parts: string[] = [];

  // Lead with the change
  parts.push(`${fsLineLabel} ${direction} ${changePercent}% period-over-period.`);

  // Top driver
  const top = contributingAccounts[0];
  if (top) {
    parts.push(
      `The primary driver was ${top.accountName} (${top.direction} ${top.percentOfTotalChange}% of total change, ` +
      `${top.isRecurring ? 'recurring' : 'non-recurring'}).`
    );
  }

  // Cross-line insight from analytical signals
  if (analyticalSignals?.relatedLineChanges?.length) {
    const related = analyticalSignals.relatedLineChanges[0];
    const relDir = parseFloat(related.changeAmount) >= 0 ? 'increased' : 'decreased';
    parts.push(`Related line ${related.fsLineLabel} ${relDir} ${related.changePercent}%.`);
  }

  // Concentration
  if (analyticalSignals?.concentrationWarning) {
    parts.push(analyticalSignals.concentrationWarning + '.');
  }

  // Counter-directional accounts
  if (analyticalSignals && analyticalSignals.accountsMovingAgainstTotal > 0) {
    parts.push(
      `${analyticalSignals.accountsMovingAgainstTotal} account(s) moved against the overall direction — review for offsetting entries.`
    );
  }

  // Suggested action
  if (top?.topMemos?.length) {
    parts.push(`Review GL entries for ${top.accountName} — recent memos include: "${top.topMemos[0]}".`);
  }

  return parts.join(' ');
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
    const model = getAIModel();
    const timeoutMs = getAILongTimeoutMs();

    const result = await callClaude({
      model,
      systemPrompt,
      userPrompt,
      timeoutMs,
      pillar: PILLAR,
    });

    let callLogId: string | undefined;
    try {
      const logResult = await insertCallLog(pool, {
        tenantId,
        pillar: PILLAR,
        promptVersion: PROMPT_VERSION,
        model,
        requestJson,
        responseRaw: result.rawText ?? null,
        responseJson: null,
        ok: result.ok,
        error: result.error ?? null,
        latencyMs: result.latencyMs ?? null,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        estimatedCostUsd: result.estimatedCostUsd ?? null,
      });
      callLogId = logResult.id;
    } catch (logErr) {
      console.warn('[variance-chat] Failed to insert call log (non-fatal):', (logErr as Error).message);
    }

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
    // Apply numeric guardrail on raw AI output
    assertNoNumericAmountsInAgentOutput({ text: firstResult.rawText }, 'variance_chat_service');

    const provenance = validateNumberProvenance(
      firstResult.rawText,
      investigationResult,
      accountDrilldown,
    );

    if (provenance.valid) {
      return {
        answer: firstResult.rawText,
        numbersUsed: provenance.numbersFound,
        modelVersion: getAIModel(),
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
      // Apply numeric guardrail on retry output
      assertNoNumericAmountsInAgentOutput({ text: retryResult.rawText }, 'variance_chat_service_retry');

      const retryProvenance = validateNumberProvenance(
        retryResult.rawText,
        investigationResult,
        accountDrilldown,
      );

      if (retryProvenance.valid) {
        return {
          answer: retryResult.rawText,
          numbersUsed: retryProvenance.numbersFound,
          modelVersion: getAIModel(),
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
