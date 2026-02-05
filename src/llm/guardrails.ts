/**
 * Guardrails — confidence scoring and escalation triggers for agentic workflows.
 * Minimal Stage-1 implementation; integrate into flows as tools mature.
 */

/**
 * Data-grounding rule appended to every LLM system prompt so responses are based only on provided data.
 * Reduces hallucination (inventing facts, amounts, or accounts not in the input).
 */
export const DATA_GROUNDING_RULE =
  'Base your response only on the data provided in the prompt. Do not invent facts, amounts, accounts, or entities not present in the input. If the data is insufficient to answer, say so instead of guessing.';

export interface ConfidenceSignals {
  hasTrialBalance: boolean;
  hasBankStatements: boolean;
  balances: boolean;
  missingIdentity: boolean;
  anomalies: number;
}

export function computeConfidence(signals: ConfidenceSignals): number {
  let score = 1.0;
  if (!signals.hasTrialBalance) score -= 0.25;
  if (!signals.hasBankStatements) score -= 0.15;
  if (!signals.balances) score -= 0.25;
  if (signals.missingIdentity) score -= 0.1;
  if (signals.anomalies > 0) score -= Math.min(0.25, signals.anomalies * 0.05);
  return Math.max(0, Math.min(1, score));
}

export function shouldEscalateToHuman(confidence: number): boolean {
  return confidence < 0.8;
}

/** Keys that indicate monetary/ledger amounts (AI must not produce these). */
const AMOUNT_KEYS = new Set(['debit', 'credit', 'amount', 'debits', 'credits', 'amounts', 'balance', 'total']);

/** Metadata keys we allow (e.g. confidence, count). */
const ALLOWED_KEYS = new Set(['confidence', 'count', 'urgency', 'type', 'title', 'description', 'suggestion', 'rationale', 'id']);

function hasNumericAmount(obj: unknown, path: string): boolean {
  if (obj === null || obj === undefined) return false;
  if (typeof obj === 'number') return true;
  if (Array.isArray(obj)) {
    return obj.some((item, i) => hasNumericAmount(item, `${path}[${i}]`));
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();
      if (AMOUNT_KEYS.has(key) && typeof v === 'number') {
        return true;
      }
      if (!ALLOWED_KEYS.has(key) && typeof v === 'object' && hasNumericAmount(v, `${path}.${k}`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scope guardrail: fail if agent output contains debit/credit/amount (or similar) numeric fields.
 * Call this on any LLM/agent response before using it to drive ledger or adjustments.
 * Allowed: confidence, type, labels, rationale. Forbidden: debit, credit, amount as numbers.
 */
export function assertNoNumericAmountsInAgentOutput(output: unknown, context?: string): void {
  if (hasNumericAmount(output, '')) {
    const msg = context
      ? `Scope violation: agent output contains numeric amounts (debit/credit/amount). ${context}`
      : 'Scope violation: agent output contains numeric amounts (debit/credit/amount). AI must not produce numbers; use HITL only.';
    throw new Error(msg);
  }
}
