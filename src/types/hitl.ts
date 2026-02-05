/**
 * HITL staging types (shared by routes and services).
 * JournalEntryProposal is used for resolve-ingest adjustment; kept here so production does not depend on agentic_gap_analyzer.
 * Amounts require valid amountProvenance (ledger_exact | engine_calculation | human_entered) to be accepted.
 */

import type { AmountProvenance } from './amount_provenance.js';

/** Proposed correcting line for trial balance (debits = credits). Used in HITL resolve-ingest. */
export interface JournalEntryProposal {
  accountName: string;
  debit?: number;
  credit?: number;
  memo?: string;
  /** Required for any non-zero amount. Reject AI output without valid provenance. */
  amountProvenance?: AmountProvenance;
}
