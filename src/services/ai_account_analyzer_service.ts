/**
 * AI Account Analyzer Service — Pass 2 analysis for ambiguous accounts.
 *
 * After Pass 1 (deterministic detection in account_intelligence_service),
 * accounts that need human-level judgment are sent to an LLM for classification.
 *
 * AI boundary: this service runs inside advisory context. It reads GL data and
 * XBRL taxonomy matches, then returns structured findings. It NEVER writes to
 * financial tables or computes dollar amounts for adjustments.
 *
 * AI OUTPUT GUARDRAIL: assertNoNumericAmountsInAgentOutput is applied to
 * the AI response before parsing. Dollar amounts that exist in the GL data
 * are allowed (passthrough references), but AI must not invent new amounts.
 */

import type { Pool } from 'pg';
import { runInBoundaryScope, enterAdvisoryContext, exitAdvisoryContext } from '../lib/ai_boundary.js';
import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import { needsAIAnalysis, type AccountAnalysis } from './account_intelligence_service.js';

/* ── Public interfaces ─────────────────────────────────────────── */

export interface AIAccountFinding {
  accountCode: string;
  verdict: 'clean' | 'investigate' | 'reclassify' | 'exclude' | 'split';
  confidence: number;
  reasoning: string;
  suggestedClassification?: {
    xbrlElement: string;
    rationale: string;
  };
  investigationReason?: string;
  excludeReason?: string;
  suspiciousEntries?: Array<{
    date: string;
    description: string;
    amount: string;
    reason: string;
  }>;
}

/* ── Prompt construction ───────────────────────────────────────── */

function buildAccountAnalysisPrompt(
  account: AccountAnalysis,
  glEntries: Array<{ date: string; description: string; debit: string; credit: string }>,
  xbrlMatches: Array<{ id: string; label: string; similarity: number }>,
): { system: string; prompt: string } {
  const system = `You are a financial statement auditor analyzing a general ledger account.
Your task is to classify the account and identify any suspicious activity.

RULES:
- Return ONLY valid JSON matching the schema below.
- You may reference dollar amounts that appear in the GL entries provided. Do NOT invent new dollar amounts.
- Do NOT suggest specific adjustment amounts or journal entries.
- Focus on classification, risk assessment, and investigation guidance.
- If the account appears clean, say so with confidence.

JSON schema:
{
  "verdict": "clean" | "investigate" | "reclassify" | "exclude" | "split",
  "confidence": <number 0-1>,
  "reasoning": "<string>",
  "suggestedClassification": { "xbrlElement": "<string>", "rationale": "<string>" } | null,
  "investigationReason": "<string>" | null,
  "excludeReason": "<string>" | null,
  "suspiciousEntries": [{ "date": "<string>", "description": "<string>", "amount": "<string>", "reason": "<string>" }] | null
}`;

  const flagSummary = account.flags.length > 0
    ? account.flags.map((f) => `  - [${f.severity}] ${f.type}: ${f.message}`).join('\n')
    : '  (none)';

  const entrySummary = glEntries.length > 0
    ? glEntries.slice(0, 20).map((e) => `  ${e.date} | ${e.description} | DR ${e.debit} | CR ${e.credit}`).join('\n')
    : '  (no entries available)';

  const xbrlSummary = xbrlMatches.length > 0
    ? xbrlMatches.slice(0, 5).map((m) => `  ${m.id}: ${m.label} (similarity: ${(m.similarity * 100).toFixed(0)}%)`).join('\n')
    : '  (no XBRL matches)';

  const prompt = `Analyze the following GL account:

Account Code: ${account.accountCode}
Account Name: ${account.accountName}
Balance: Debit ${account.balance.debit}, Credit ${account.balance.credit}, Net ${account.balance.net}

Deterministic flags already detected:
${flagSummary}

Top GL entries by amount (most recent 20):
${entrySummary}

XBRL taxonomy matches:
${xbrlSummary}

Provide your analysis as JSON.`;

  return { system, prompt };
}

/* ── Single account analysis ───────────────────────────────────── */

export async function analyzeAccountWithAI(
  _pool: Pool,
  _tenantId: string,
  _sessionId: string,
  account: AccountAnalysis,
  glEntries: Array<{ date: string; description: string; debit: string; credit: string }>,
  xbrlMatches: Array<{ id: string; label: string; similarity: number }>,
): Promise<AIAccountFinding> {
  const { system, prompt } = buildAccountAnalysisPrompt(account, glEntries, xbrlMatches);

  const fallback: AIAccountFinding = {
    accountCode: account.accountCode,
    verdict: 'investigate',
    confidence: 0,
    reasoning: 'AI analysis unavailable; flagged for manual review.',
    investigationReason: 'AI service did not return a valid response.',
  };

  return runInBoundaryScope(async () => {
    enterAdvisoryContext();
    try {
      const result = await callLLMWithFallback<AIAccountFinding>({
        system,
        prompt,
        maxTokens: 1024,
        parse: (raw: string) => {
          // Parse JSON from response (handle markdown code blocks)
          let jsonStr = raw.trim();
          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1]!.trim();
          }

          const parsed = JSON.parse(jsonStr);

          // Apply guardrail: AI must not produce numeric debit/credit/amount fields
          // (the guardrail checks for structured amount keys, not text references)
          try {
            assertNoNumericAmountsInAgentOutput(parsed, 'ai_account_analyzer');
          } catch {
            return {
              ...fallback,
              reasoning: 'AI response contained unverified numeric amounts; falling back to manual review.',
            };
          }

          // Validate required fields
          if (!parsed.verdict || !parsed.reasoning) {
            return fallback;
          }

          return {
            accountCode: account.accountCode,
            verdict: parsed.verdict,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
            reasoning: parsed.reasoning,
            suggestedClassification: parsed.suggestedClassification ?? undefined,
            investigationReason: parsed.investigationReason ?? undefined,
            excludeReason: parsed.excludeReason ?? undefined,
            suspiciousEntries: parsed.suspiciousEntries ?? undefined,
          };
        },
        fallback,
      });

      return result;
    } finally {
      exitAdvisoryContext();
    }
  });
}

/* ── Batch AI pass ─────────────────────────────────────────────── */

export async function runAIPass(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  accounts: AccountAnalysis[],
  concurrencyLimit: number = 5,
): Promise<AIAccountFinding[]> {
  const needsAI = accounts.filter(needsAIAnalysis);

  if (needsAI.length === 0) return [];

  const results: AIAccountFinding[] = [];

  // Process in batches with concurrency limit
  for (let i = 0; i < needsAI.length; i += concurrencyLimit) {
    const batch = needsAI.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map((account) =>
        analyzeAccountWithAI(pool, tenantId, sessionId, account, [], []),
      ),
    );
    results.push(...batchResults);
  }

  return results;
}

/** Re-export for convenience. */
export { needsAIAnalysis };
