/**
 * Cascade Engine
 *
 * The nervous system of the close. Every financial mutation triggers
 * a cascade that updates all downstream state synchronously.
 *
 * Cascade flow:
 * 1. Adjusted TB recalculates (on-demand; no cache — downstream reads fresh)
 * 2. Reconciliation GL balances refresh
 * 3. Statements marked stale (if previously generated)
 * 4. Validation checks re-run (computeReadiness)
 * 5. HITL issues update (auto-verify resolved, create new)
 * 6. Close readiness summary updates (same as step 4)
 *
 * The cascade runs synchronously within the triggering request.
 * Target: < 2000ms for the full cascade.
 *
 * Recursion guard: max depth of 3 to prevent infinite loops.
 *
 * Triggers wired:
 * - AJE_POSTED: journal_entry_service.postJE
 * - AJE_REVERSED: (if reversal exists)
 * - RECON_COMPLETED: period_reconciliation_service.completeReconciliation
 * - RECON_APPROVED: period_reconciliation_service.approveReconciliation
 * - RECON_REJECTED: period_reconciliation_service.rejectReconciliation
 * - MAPPING_CHANGED: coa_mapping_service.upsertCoaRules (when period context available)
 * - TB_REINGESTED: TB ingest routes (when close period exists)
 * - VARIANCE_EXPLAINED: period_reconciliation_service.completeReconciliation (via recon_completed)
 * - ISSUE_RESOLVED: (optional; auto-resolution triggers recon/aje cascades)
 */

import type { Pool } from 'pg';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { setStatementsStaleSince } from '../db/repositories/close_session_repository.js';
import { getMaxVersionByCloseSessionId } from '../db/repositories/statement_package_repository.js';
import { computeReadiness } from './close_checklist_readiness_service.js';
import { runCascade as runIssueCascade } from './issue_auto_resolution_service.js';

const MAX_CASCADE_DEPTH = 3;
const MAX_CASCADE_MS = 2000;

export enum CascadeTriggerType {
  AJE_POSTED = 'aje_posted',
  AJE_REVERSED = 'aje_reversed',
  RECON_COMPLETED = 'recon_completed',
  RECON_APPROVED = 'recon_approved',
  RECON_REJECTED = 'recon_rejected',
  MAPPING_CHANGED = 'mapping_changed',
  TB_REINGESTED = 'tb_reingested',
  VARIANCE_EXPLAINED = 'variance_explained',
  ISSUE_RESOLVED = 'issue_resolved',
}

export interface CascadeTrigger {
  type: CascadeTriggerType;
  period_id: string;
  entity_id: string;
  triggered_by: string;
  affected_accounts: string[];
  details: Record<string, unknown>;
}

export interface ReconStatusChange {
  reconId: string;
  accountCode: string;
  previousStatus: string;
  newStatus: string;
}

export interface ValidationCheck {
  check_name: string;
  check_type: 'hard' | 'soft';
  passes: boolean;
  message: string | null;
  details: unknown;
}

export interface ValidationSummary {
  hard_checks: ValidationCheck[];
  soft_checks: ValidationCheck[];
  all_hard_passing: boolean;
  blocking_count: number;
  warning_count: number;
}

export interface CascadeResult {
  adjusted_tb_recalculated: boolean;
  recon_balances_refreshed: number;
  recon_status_changes: ReconStatusChange[];
  statements_invalidated: boolean;
  validation_results: ValidationSummary;
  issues_auto_verified: string[];
  issues_created: string[];
  issues_reopened: string[];
  duration_ms: number;
}

function emptyResult(durationMs = 0): CascadeResult {
  return {
    adjusted_tb_recalculated: false,
    recon_balances_refreshed: 0,
    recon_status_changes: [],
    statements_invalidated: false,
    validation_results: {
      hard_checks: [],
      soft_checks: [],
      all_hard_passing: true,
      blocking_count: 0,
      warning_count: 0,
    },
    issues_auto_verified: [],
    issues_created: [],
    issues_reopened: [],
    duration_ms: durationMs,
  };
}

function mapToHITLTriggerType(
  type: CascadeTriggerType
): 'aje_posted' | 'recon_completed' | 'mapping_changed' | 'tb_reingested' | 'statement_regenerated' | 'variance_explained' {
  switch (type) {
    case CascadeTriggerType.AJE_POSTED:
    case CascadeTriggerType.AJE_REVERSED:
      return 'aje_posted';
    case CascadeTriggerType.RECON_COMPLETED:
    case CascadeTriggerType.RECON_APPROVED:
    case CascadeTriggerType.RECON_REJECTED:
    case CascadeTriggerType.ISSUE_RESOLVED:
      return 'recon_completed';
    case CascadeTriggerType.MAPPING_CHANGED:
      return 'mapping_changed';
    case CascadeTriggerType.TB_REINGESTED:
      return 'tb_reingested';
    case CascadeTriggerType.VARIANCE_EXPLAINED:
      return 'variance_explained';
    default:
      return 'recon_completed';
  }
}

function affectsTB(type: CascadeTriggerType): boolean {
  return [
    CascadeTriggerType.AJE_POSTED,
    CascadeTriggerType.AJE_REVERSED,
    CascadeTriggerType.TB_REINGESTED,
    CascadeTriggerType.MAPPING_CHANGED,
  ].includes(type);
}

function mapReadinessToValidationSummary(readiness: {
  ready: boolean;
  hardBlockers: string[];
  softWarnings: string[];
}): ValidationSummary {
  const hard: ValidationCheck[] = readiness.hardBlockers.map((m) => ({
    check_name: 'readiness',
    check_type: 'hard',
    passes: false,
    message: m,
    details: null,
  }));
  if (readiness.ready && readiness.hardBlockers.length === 0) {
    hard.push({
      check_name: 'readiness',
      check_type: 'hard',
      passes: true,
      message: null,
      details: null,
    });
  }
  const soft: ValidationCheck[] = readiness.softWarnings.map((m) => ({
    check_name: 'readiness',
    check_type: 'soft',
    passes: false,
    message: m,
    details: null,
  }));
  return {
    hard_checks: hard,
    soft_checks: soft,
    all_hard_passing: readiness.ready,
    blocking_count: readiness.hardBlockers.length,
    warning_count: readiness.softWarnings.length,
  };
}

/**
 * Execute the full cascade for a financial mutation.
 * Single entry point for all downstream updates.
 */
export async function executeCascade(
  pool: Pool,
  tenantId: string,
  trigger: CascadeTrigger,
  depth = 0
): Promise<CascadeResult> {
  if (depth >= MAX_CASCADE_DEPTH) {
    console.warn(
      `Cascade depth limit reached for period ${trigger.period_id}, trigger ${trigger.type}`
    );
    return emptyResult(0);
  }

  const startTime = Date.now();
  const result = emptyResult(0);

  const session = await getCloseSessionById(pool, tenantId, trigger.period_id);
  if (!session) {
    return emptyResult(Date.now() - startTime);
  }

  const tbAffecting = affectsTB(trigger.type);

  // STEP 1: Adjusted TB — computed on-demand; no cache to update.
  // Downstream steps read fresh via getTrialBalanceForCertification.
  result.adjusted_tb_recalculated = tbAffecting;

  // STEP 2: Refresh reconciliation GL balances
  if (tbAffecting) {
    const { refreshGLBalances } = await import('./period_reconciliation_service.js');
    const { updated, reverted } = await refreshGLBalances(pool, tenantId, trigger.period_id);
    result.recon_balances_refreshed = updated;
    const recons = await import('../db/repositories/period_reconciliation_repository.js').then(
      (m) => m.listPeriodReconciliationsByPeriod(pool, tenantId, trigger.period_id)
    );
    for (const reconId of reverted) {
      const r = recons.find((x) => x.reconId === reconId);
      if (r) {
        result.recon_status_changes.push({
          reconId,
          accountCode: r.accountCode,
          previousStatus: 'completed',
          newStatus: 'in_progress',
        });
      }
    }
  }

  // STEP 3: Invalidate statements (do NOT regenerate)
  if (tbAffecting) {
    const maxVer = await getMaxVersionByCloseSessionId(pool, tenantId, trigger.period_id);
    if (maxVer > 0) {
      await setStatementsStaleSince(pool, tenantId, trigger.period_id);
      result.statements_invalidated = true;
    }
  }

  // STEP 4: Re-run validation checks (computeReadiness)
  const readiness = await computeReadiness(pool, tenantId, session);
  result.validation_results = mapReadinessToValidationSummary(readiness);

  // STEP 5: Update HITL issues (runCascade from Step 4)
  const hitlType = mapToHITLTriggerType(trigger.type);
  const hitlTrigger = {
    type: hitlType,
    affected_accounts: trigger.affected_accounts,
    affected_entity: trigger.entity_id,
    triggered_by: trigger.triggered_by,
    details: trigger.details,
  };
  const issueResult = await runIssueCascade(
    pool,
    tenantId,
    trigger.period_id,
    hitlTrigger,
    depth + 1
  );
  result.issues_auto_verified = issueResult.issues_auto_verified;
  result.issues_created = issueResult.new_issues_created;
  result.issues_reopened = [];

  // STEP 6: Close readiness — already computed in step 4; no additional storage
  result.duration_ms = Date.now() - startTime;

  if (result.duration_ms > MAX_CASCADE_MS) {
    console.warn(
      `Cascade exceeded ${MAX_CASCADE_MS}ms: ${result.duration_ms}ms for trigger ${trigger.type} on period ${trigger.period_id}. ` +
        `TB recalc: ${result.adjusted_tb_recalculated}, Recons refreshed: ${result.recon_balances_refreshed}, ` +
        `Issues updated: ${result.issues_auto_verified.length + result.issues_created.length}`
    );
  }

  return result;
}
