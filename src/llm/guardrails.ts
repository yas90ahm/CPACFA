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

