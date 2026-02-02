/**
 * Integrity gate — Fact Data boundary for TB vs contract cross-check.
 * Deterministic totals only; no inferred/agentic data in gate input.
 */

import type { TrialBalanceEntry } from './financial.js';

/** Contract total for integrity check (Fact Data). */
export interface IntegrityContractFact {
  /** Source identifier (e.g. contract id). */
  id?: string;
  /** Total contract value (deterministic). */
  totalContractValue: number;
  /** Optional: period-recognized revenue when available. */
  periodRecognizedRevenue?: number;
}

/** Input to integrity gate: classified TB entries + contracts (Fact Data only). */
export interface IntegrityGateInput {
  /** Classified trial balance entries (must have accountType set). */
  trialBalanceEntries: TrialBalanceEntry[];
  /** Revenue contracts with totalContractValue (and optionally period-recognized). */
  contracts: IntegrityContractFact[];
  /** Allowed variance: 0 = zero-variance; small number = materiality. */
  tolerance?: number;
}

/** Output of integrity gate when pass. */
export interface IntegrityGateResult {
  passed: true;
  tbRevenue: number;
  contractRevenue: number;
  variance: number;
}

/** Thrown when TB revenue vs contract revenue exceeds tolerance. */
export class IntegrityGateViolation extends Error {
  readonly code = 'INTEGRITY_VIOLATION' as const;
  readonly tbRevenue: number;
  readonly contractRevenue: number;
  readonly variance: number;

  constructor(message: string, tbRevenue: number, contractRevenue: number, variance: number) {
    super(message);
    this.name = 'IntegrityGateViolation';
    this.tbRevenue = tbRevenue;
    this.contractRevenue = contractRevenue;
    this.variance = variance;
  }
}
