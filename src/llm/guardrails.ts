/**
 * Guardrails — confidence scoring and escalation triggers for agentic workflows.
 * Minimal Stage-1 implementation; integrate into flows as tools mature.
 */

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

