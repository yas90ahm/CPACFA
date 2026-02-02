/**
 * Audit ledger service — record human overrides with deterministic flag + agent dissent + user rationale.
 */

import type { Pool } from 'pg';
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

/**
 * Verify hash chain for tenant. Used by export gate before allowing PDF/CSV.
 */
export async function verifyChain(pool: Pool, tenantId: string): Promise<{ valid: boolean; brokenAtEntryId?: string; message?: string }> {
  return auditLedgerRepo.verifyChain(pool, tenantId);
}
