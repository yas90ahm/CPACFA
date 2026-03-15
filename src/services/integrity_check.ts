/**
 * Final integrity check before export (Truth Gate).
 * Runs integrity_gate_service and optional plug/Suspense detection.
 * Extracted from Supervisor so export route does not depend on agent.
 */

import {
  runIntegrityGate,
  detectSuspiciousPlugs,
  type IntegrityGateInput,
  type IntegrityGateResult,
  type SuspiciousPlugResult,
} from './integrity_gate_service.js';
import { sumRound2 } from '../utils/decimal.js';
import { financialEvents, buildEventPacket } from '../events/financial_event_emitter.js';

export interface FinalIntegrityCheckInput {
  trialBalance: IntegrityGateInput['trialBalance'];
  balanceSheet: IntegrityGateInput['balanceSheet'];
  /** Optional entries for plug/Suspense detection. If provided, export fails when Suspense/Misc/Other absorb too much. */
  entriesForPlugDetection?: Array<{ accountName: string; debit: number; credit: number }>;
  tolerance?: number;
}

export interface FinalIntegrityCheckResult {
  passed: boolean;
  error?: string;
  checks?: IntegrityGateResult['checks'];
  suspenseAccounts?: string[];
  plugSuspicious?: boolean;
}

/**
 * Final integrity check before allowing export. Call from export route; if passed is false, return 422.
 */
export function finalIntegrityCheck(input: FinalIntegrityCheckInput): FinalIntegrityCheckResult {
  const gateInput: IntegrityGateInput = {
    trialBalance: input.trialBalance,
    balanceSheet: input.balanceSheet,
    tolerance: input.tolerance,
  };
  const gateResult = runIntegrityGate(gateInput);
  if (!gateResult.passed) {
    return {
      passed: false,
      error: gateResult.error,
      checks: gateResult.checks,
    };
  }
  const entries = input.entriesForPlugDetection;
  if (entries && entries.length > 0) {
    const { totalDebits, totalCredits } =
      'totalDebits' in input.trialBalance && 'totalCredits' in input.trialBalance
        ? input.trialBalance
        : { totalDebits: 0, totalCredits: 0 };
    let totalDebits_ = totalDebits;
    let totalCredits_ = totalCredits;
    if (totalDebits_ === 0 && totalCredits_ === 0) {
      totalDebits_ = sumRound2(entries.map((e) => e.debit ?? 0));
      totalCredits_ = sumRound2(entries.map((e) => e.credit ?? 0));
    }
    const plugResult: SuspiciousPlugResult = detectSuspiciousPlugs(
      entries.map((e) => ({ accountName: e.accountName, debit: e.debit, credit: e.credit })),
      totalDebits_,
      totalCredits_,
      { threshold: 0.9 }
    );
    if (plugResult.isSuspicious) {
      financialEvents.emit('SUSPICIOUS_PLUG', buildEventPacket('SUSPICIOUS_PLUG', {
        errorCode: 'SUSPICIOUS_PLUG_DETECTED',
        conflictingData: { plugAccountNames: plugResult.plugAccountNames, plugShare: plugResult.plugShare },
        metadata: {
          tenantId: 'system',
          accountCodes: plugResult.plugAccountNames ?? [],
        },
        data: {
          plugAccountNames: plugResult.plugAccountNames ?? [],
          plugAmount: plugResult.plugAmount ?? 0,
          plugShare: plugResult.plugShare ?? 0,
          totalNetActivity: totalDebits_ + totalCredits_,
          threshold: 0.9,
        },
      }));
      return {
        passed: false,
        error:
          'Export blocked: ledger contains unclassified Suspense/Miscellaneous/Other accounts that absorb material activity.',
        suspenseAccounts: plugResult.plugAccountNames ?? [],
        plugSuspicious: true,
      };
    }
  }
  return { passed: true, checks: gateResult.checks };
}
