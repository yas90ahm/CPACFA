/**
 * Audit ledger service — record human overrides with deterministic flag + agent dissent + user rationale.
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or client (for transactional writes). Both expose .query(). */
type Queryable = Pool | PoolClient;
import * as auditLedgerRepo from '../db/repositories/audit_ledger_repository.js';
import type { AuditLedgerEventType } from '../types/audit_ledger.js';

export interface RecordOverrideInput {
  tenantId: string;
  periodLabel?: string;
  eventType: AuditLedgerEventType;
  /** Snapshot of the flag or check that was overridden. */
  deterministicFlagSnapshot: Record<string, unknown>;
  /** Optional: agent message or recommendation. */
  agentDissentSnapshot?: Record<string, unknown>;
  /** User-provided rationale (required). */
  userPromptRationale: string;
  createdBy?: string;
}

/**
 * Append one override entry to the audit ledger (hash-chained). Call before updating flag status or staging.
 */
export async function recordOverride(pool: Pool, input: RecordOverrideInput): Promise<void> {
  if (!input.userPromptRationale?.trim()) {
    throw new Error('userPromptRationale is required for audit ledger override');
  }
  await auditLedgerRepo.appendEntry(pool, {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot,
    userPromptRationale: input.userPromptRationale.trim(),
    createdBy: input.createdBy,
  });
}

/** Snapshot may include citationStandard (CPA) or standard (e.g. "DCF / valuation practice") for CFA. */
export interface RecordObservationInput {
  tenantId: string;
  periodLabel?: string;
  eventType: 'cpa_observation' | 'cfa_recommendation';
  deterministicFlagSnapshot: Record<string, unknown>;
  agentDissentSnapshot?: Record<string, unknown>;
  createdBy?: string;
}

const OBSERVATION_RATIONALE: Record<RecordObservationInput['eventType'], string> = {
  cpa_observation: 'System observation.',
  cfa_recommendation: 'System recommendation.',
};

/**
 * Append one observation/recommendation entry (professional origin). Uses system rationale so professional origin is clear.
 */
export async function recordObservation(pool: Pool, input: RecordObservationInput): Promise<void> {
  const userPromptRationale = OBSERVATION_RATIONALE[input.eventType];
  await auditLedgerRepo.appendEntry(pool, {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot,
    userPromptRationale,
    createdBy: input.createdBy,
  });
}

export interface RecordMaterialEventInput {
  tenantId: string;
  periodLabel?: string;
  eventType: Extract<
    AuditLedgerEventType,
    | 'mapping_rule_update'
    | 'issue_status_change'
    | 'recon_confirmation'
    | 'recon_signoff'
    | 'je_approval'
    | 'je_posting'
    | 'statement_package_generation'
    | 'export_event'
    | 'close_lock'
    | 'certify_close'
    | 'bridge_command'
    | 'evidence_link'
    | 'legacy_certified_source_used'
  >;
  /** Snapshot of the event for audit trail. */
  deterministicFlagSnapshot: Record<string, unknown>;
  agentDissentSnapshot?: Record<string, unknown>;
  createdBy?: string;
}

/**
 * Append a material event to the audit ledger (hash-chained).
 * Uses system rationale; no user prompt required.
 */
export async function recordMaterialEvent(client: Queryable, input: RecordMaterialEventInput): Promise<void> {
  const rationale = `Material event: ${input.eventType}`;
  await auditLedgerRepo.appendEntry(client, {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot,
    userPromptRationale: rationale,
    createdBy: input.createdBy,
  });
}

/**
 * Record that a certified binder/export used legacy source (last registered statements) instead of session snapshot.
 * Call when result.source === 'legacy' from getCertifiedStatementsForBinder.
 */
export async function recordLegacyCertifiedSourceUsed(
  client: Queryable,
  input: { tenantId: string; closeSessionId: string; periodLabel?: string; createdBy?: string }
): Promise<void> {
  await recordMaterialEvent(client, {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    eventType: 'legacy_certified_source_used',
    deterministicFlagSnapshot: {
      closeSessionId: input.closeSessionId,
      tenantId: input.tenantId,
      resolvedSource: 'legacy',
    },
    createdBy: input.createdBy,
  });
}

/**
 * Verify hash chain for tenant. Used by export gate before allowing PDF/CSV and by audit binder for cryptographic verification.
 */
export async function verifyChain(pool: Pool, tenantId: string): Promise<import('../types/audit_ledger.js').AuditLedgerVerifyResult> {
  return auditLedgerRepo.verifyChain(pool, tenantId);
}
