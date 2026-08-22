/**
 * Unified Audit Service
 *
 * Single entry point for all audit logging in the system.
 * Records every state change to financial data with:
 * - Who performed the action
 * - When it happened
 * - What changed (before_state and after_state)
 * - Hash chain linking to previous event
 *
 * The underlying audit_ledger table is append-only.
 * DB triggers prevent UPDATE and DELETE.
 *
 * Use recordAuditEvent for state changes with before/after.
 * Use recordMaterialEvent for simpler events that don't need explicit before/after.
 * Use recordAuditLogAction for audit_log-style events (actor, action, resource).
 */

import type { Pool, PoolClient } from 'pg';
import * as auditLedgerRepo from '../db/repositories/audit_ledger_repository.js';
import type { AuditLedgerEventType } from '../types/audit_ledger.js';

/** Pool or client for transactional writes. */
type Queryable = Pool | PoolClient;

/** Material event input (writes directly to audit_ledger with hash chain). */
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
    | 'close_session_transition'
    | 'close_session_reopened'
    | 'close_session_locked'
    | 'bridge_command'
    | 'evidence_link'
    | 'legacy_certified_source_used'
    | 'recon_supporting_balance_set'
    | 'subsequent_event_created'
    | 'subsequent_event_disposition_set'
    | 'subsequent_events_confirmed_none'
    | 'accounting_correction'
    | 'accounting_memory_change'
    | 'close_orchestrator_event'
  >;
  deterministicFlagSnapshot: Record<string, unknown>;
  agentDissentSnapshot?: Record<string, unknown>;
  createdBy?: string;
}

export type AuditEventType =
  | 'close_initiated'
  | 'close_advanced'
  | 'close_rejected'
  | 'close_certified'
  | 'close_reopened'
  | 'close_locked'
  | 'aje_created'
  | 'aje_submitted'
  | 'aje_approved'
  | 'aje_rejected'
  | 'aje_posted'
  | 'aje_reversed'
  | 'aje_corrected'
  | 'recon_started'
  | 'recon_updated'
  | 'recon_completed'
  | 'recon_approved'
  | 'recon_rejected'
  | 'recon_reverted'
  | 'recon_item_added'
  | 'recon_item_removed'
  | 'mapping_created'
  | 'mapping_updated'
  | 'mapping_deleted'
  | 'tb_ingested'
  | 'tb_snapshot_created'
  | 'statements_generated'
  | 'statements_invalidated'
  | 'issue_created'
  | 'issue_resolved'
  | 'issue_verified'
  | 'issue_waived'
  | 'issue_reopened'
  | 'variance_explanation_saved'
  | 'variance_explanation_approved'
  | 'audit_log_action'; // catch-all for audit_log-style events

export interface AuditEvent {
  eventType: AuditEventType;
  entityId?: string;
  periodId?: string;
  periodLabel?: string;
  userId: string;
  targetType: string;
  targetId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  details: Record<string, unknown>;
}

/** Map AuditEventType to AuditLedgerEventType for the underlying ledger. */
function mapToLedgerEventType(eventType: AuditEventType): AuditLedgerEventType {
  const map: Partial<Record<AuditEventType, AuditLedgerEventType>> = {
    aje_posted: 'je_posting',
    aje_approved: 'je_approval',
    aje_corrected: 'accounting_correction',
    close_certified: 'certify_close',
    close_initiated: 'close_session_transition',
    close_advanced: 'close_session_transition',
    close_reopened: 'close_session_reopened',
    close_locked: 'close_session_locked',
    mapping_updated: 'mapping_rule_update',
    mapping_created: 'mapping_rule_update',
    statements_generated: 'statement_package_generation',
    issue_created: 'issue_status_change',
    issue_resolved: 'issue_status_change',
    issue_verified: 'issue_status_change',
    recon_completed: 'recon_confirmation',
    recon_approved: 'recon_signoff',
    audit_log_action: 'audit_log_action',
  };
  return (map[eventType] ?? 'mapping_rule_update') as AuditLedgerEventType;
}

/**
 * Record an audit event with before/after state.
 * Uses the hash-chained audit_ledger.
 */
export async function recordAuditEvent(
  client: Queryable,
  tenantId: string,
  event: AuditEvent
): Promise<void> {
  const ledgerEventType = mapToLedgerEventType(event.eventType);
  const deterministicFlagSnapshot: Record<string, unknown> = {
    ...event.details,
    eventType: event.eventType,
    targetType: event.targetType,
    targetId: event.targetId,
    userId: event.userId,
    entityId: event.entityId,
    periodId: event.periodId,
    periodLabel: event.periodLabel,
  };

  await auditLedgerRepo.appendEntry(client, {
    tenantId,
    periodLabel: event.periodLabel ?? event.periodId ?? undefined,
    eventType: ledgerEventType,
    deterministicFlagSnapshot,
    userPromptRationale: `Audit: ${event.eventType} on ${event.targetType} ${event.targetId}`,
    createdBy: event.userId,
    beforeState: event.beforeState,
    afterState: event.afterState,
  });
}

/**
 * Record a material event (hash-chained audit_ledger).
 * Use when before/after state is not available.
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
 * Record that a certified binder/export used legacy source.
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

/** Audit-log-style entry (actor, action, resource). */
export interface AuditLogActionEntry {
  actor: string;
  action: string;
  resource?: string;
  detail?: string;
  payload?: Record<string, unknown>;
  entityId?: string;
  periodId?: string;
  periodLabel?: string;
}

/**
 * Record an audit-log-style event to the hash-chained audit_ledger.
 * Migrates from appendAuditLog (audit_log table) to audit_ledger.
 */
export async function recordAuditLogAction(
  client: Queryable,
  tenantId: string,
  entry: AuditLogActionEntry
): Promise<void> {
  await recordAuditEvent(client, tenantId, {
    eventType: 'audit_log_action',
    entityId: entry.entityId,
    periodId: entry.periodId,
    periodLabel: entry.periodLabel,
    userId: entry.actor,
    targetType: 'audit_log',
    targetId: entry.resource ?? entry.action,
    beforeState: null,
    afterState: null,
    details: {
      action: entry.action,
      resource: entry.resource,
      detail: entry.detail,
      payload: entry.payload,
    },
  });
}
