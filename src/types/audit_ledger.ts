/**
 * Immutable audit ledger — hash-chained log of human overrides.
 * Fact Data: deterministic flag snapshot, user rationale, hashes.
 */

export type AuditLedgerEventType =
  | 'flag_override'
  | 'staging_approval'
  | 'staging_rejection'
  | 'integrity_gate_bypass'
  | 'user_induced_variance'
  | 'cpa_observation'
  | 'cfa_recommendation'
  | 'mapping_rule_update'
  | 'issue_status_change'
  | 'recon_confirmation'
  | 'recon_signoff'
  | 'je_approval'
  | 'je_posting'
  | 'statement_package_generation'
  | 'export_event'
  | 'certify_close'
  | 'bridge_command';

/** Payload for appending one ledger entry (append-only). */
export interface AuditLedgerEntryInput {
  tenantId: string;
  periodLabel?: string;
  eventType: AuditLedgerEventType;
  /** Copy of the flag or check that was overridden. */
  deterministicFlagSnapshot: Record<string, unknown>;
  /** Optional: agent message or flag recommendation. */
  agentDissentSnapshot?: Record<string, unknown>;
  /** User-provided rationale for override (required). */
  userPromptRationale: string;
  /** Set by repository: hash of previous entry (null for first). */
  previousEntryHash?: string | null;
  /** Set by repository after insert. */
  entryHash?: string;
  createdBy?: string;
}

/** Row returned from DB (read-only). */
export interface AuditLedgerEntry {
  id: string;
  tenantId: string;
  periodLabel: string | null;
  eventType: AuditLedgerEventType;
  deterministicFlagSnapshot: Record<string, unknown>;
  agentDissentSnapshot: Record<string, unknown> | null;
  userPromptRationale: string;
  previousEntryHash: string | null;
  entryHash: string;
  createdAt: string;
  createdBy: string | null;
}

/** Result of chain verification. When valid and entries exist, includes summary for binder/third-party verification. */
export interface AuditLedgerVerifyResult {
  valid: boolean;
  brokenAtEntryId?: string;
  message?: string;
  /** Last entry's hash (when valid and chain non-empty); enables third-party verification */
  latestEntryHash?: string;
  /** Last entry's id (when valid and chain non-empty) */
  latestEntryId?: string;
  /** Total entries in chain */
  entryCount: number;
  /** ISO timestamp when verification was run */
  verifiedAt: string;
}
