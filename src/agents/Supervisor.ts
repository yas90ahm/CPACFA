/**
 * Supervisor — STUB (full implementation quarantined in /experimental/agents/Supervisor.ts).
 * Exports types and a runSupervisor that throws so in-scope code (e.g. auditor_agent) compiles.
 * finalIntegrityCheck is in-scope (integrity gate only) and implemented here.
 */

import { runIntegrityGate } from '../services/integrity_gate_service.js';
import type { IntegrityGateInput, IntegrityGateResult } from '../services/integrity_gate_service.js';
import { detectSuspiciousPlugs } from '../services/integrity_gate_service.js';

export interface SupervisorInput {
  message: string;
  entries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
}

export interface SupervisorOutput {
  response: string;
  thoughts: string[];
  toolCalls: Array<{ name: string; input: unknown; result: string }>;
  stopReason: string;
  dissentingOpinion?: unknown;
}

export interface FinalIntegrityCheckInput {
  trialBalance: IntegrityGateInput['trialBalance'];
  balanceSheet: IntegrityGateInput['balanceSheet'];
  tolerance?: number;
  entriesForPlugDetection?: Array<{ accountName: string; debit: number; credit: number }>;
}

export interface FinalIntegrityCheckResult {
  passed: boolean;
  error?: string;
  checks?: IntegrityGateResult['checks'];
}

/**
 * Final integrity check before export. Runs integrity gate + optional plug detection.
 */
export function finalIntegrityCheck(input: FinalIntegrityCheckInput): FinalIntegrityCheckResult {
  const gateResult = runIntegrityGate({
    trialBalance: input.trialBalance,
    balanceSheet: input.balanceSheet,
    tolerance: input.tolerance,
  });
  if (!gateResult.passed) {
    return { passed: false, error: gateResult.error, checks: gateResult.checks };
  }
  if (input.entriesForPlugDetection?.length) {
    const { totalDebits, totalCredits } =
      'totalDebits' in input.trialBalance && 'totalCredits' in input.trialBalance
        ? input.trialBalance
        : { totalDebits: 0, totalCredits: 0 };
    const plug = detectSuspiciousPlugs(
      input.entriesForPlugDetection,
      totalDebits ?? 0,
      totalCredits ?? 0,
      { threshold: 0.9 }
    );
    if (plug.isSuspicious) {
      return {
        passed: false,
        error: `Suspicious plug accounts (${plug.plugAccountNames.join(', ')}) represent ${(plug.plugShare * 100).toFixed(0)}% of net activity.`,
        checks: gateResult.checks,
      };
    }
  }
  return { passed: true, checks: gateResult.checks };
}

/**
 * Stub: Supervisor is quarantined. Callers get a clear error if they invoke it.
 */
export async function runSupervisor(
  _input: SupervisorInput,
  _context?: unknown
): Promise<SupervisorOutput> {
  throw new Error(
    'Supervisor is quarantined in /experimental. Use experimental/agents/Supervisor.ts for the full ReAct implementation.'
  );
}
