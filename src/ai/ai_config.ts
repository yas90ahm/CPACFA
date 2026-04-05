/**
 * Central AI configuration — single source of truth for model, timeouts, and pricing.
 *
 * AI Philosophy for Sovereign CPA Engine:
 *   AI is advisory-only glass — it sees, classifies, explains, and flags,
 *   but never computes or mutates financial data.
 *
 * 1. AI never produces dollar amounts (not in JSON, narrative, or few-shot examples)
 * 2. AI never writes to financial tables (only advisory: ai_call_log, ai_coa_suggestions, staging)
 * 3. AI fails safe for compliance, fails open for UX (Shadow Auditor BLOCKS on failure)
 * 4. Every AI call is logged (model, tokens, cost, latency, full request/response)
 * 5. AI output is always validated (Zod schemas + guardrails + provenance checks)
 */

/* ── Model ─────────────────────────────────────────────────────── */

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/** Returns the configured AI model. Reads fresh from env on each call. */
export function getAIModel(): string {
  return process.env.AI_MODEL ?? DEFAULT_MODEL;
}

/* ── Timeouts ──────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LONG_TIMEOUT_MS = 30_000;

/** Standard AI timeout (classifier, justifier, shadow auditor). Default: 15 s. */
export function getAITimeoutMs(): number {
  return parseInt(process.env.AI_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
}

/** Extended timeout for longer AI tasks (variance chat, export narratives). Default: 30 s. */
export function getAILongTimeoutMs(): number {
  return parseInt(process.env.AI_LONG_TIMEOUT_MS ?? String(DEFAULT_LONG_TIMEOUT_MS), 10) || DEFAULT_LONG_TIMEOUT_MS;
}

/* ── Pricing ───────────────────────────────────────────────────── */

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Pricing map keyed by model prefix. Longest prefix match wins.
 * Update when Anthropic/OpenAI/Mistral publish new pricing.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4':   { inputPerMillion: 3,    outputPerMillion: 15 },
  'claude-opus-4':     { inputPerMillion: 15,   outputPerMillion: 75 },
  'claude-haiku-3':    { inputPerMillion: 0.80, outputPerMillion: 4 },
  'gpt-4o-mini':       { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'gpt-4o':            { inputPerMillion: 2.50, outputPerMillion: 10 },
  'mistral-large':     { inputPerMillion: 2,    outputPerMillion: 6 },
};

/**
 * Estimate cost in USD for an AI call. Uses longest-prefix match on model name.
 * Returns undefined if model is unrecognized (caller should log a warning).
 */
export function estimateCost(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | undefined {
  if (inputTokens == null || outputTokens == null) return undefined;

  // Find longest prefix match
  let bestPrefix = '';
  for (const prefix of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(prefix) && prefix.length > bestPrefix.length) {
      bestPrefix = prefix;
    }
  }
  if (!bestPrefix) return undefined;

  const pricing = MODEL_PRICING[bestPrefix];
  return (inputTokens / 1_000_000) * pricing.inputPerMillion
       + (outputTokens / 1_000_000) * pricing.outputPerMillion;
}
