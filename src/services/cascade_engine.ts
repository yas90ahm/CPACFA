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
 *
 * Performance optimizations:
 * - computeReadiness uses lightweight mode (skips verifyChain O(n) scan, N+1 evidence loops, mapping recompute)
 * - Steps 3 (invalidate statements), 4 (readiness), and 5 (issues) run in parallel
 * - Timing logs on each step for diagnostics
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
  const timings: Record<string, number> = {};
  const result = emptyResult(0);

  let t0 = Date.now();
  const session = await getCloseSessionById(pool, tenantId, trigger.period_id);
  timings['step0_get_session'] = Date.now() - t0;
  if (!session) {
    return emptyResult(Date.now() - startTime);
  }

  const tbAffecting = affectsTB(trigger.type);

  // STEP 1: Adjusted TB — computed on-demand; no cache to update.
  // Downstream steps read fresh via getTrialBalanceForCertification.
  result.adjusted_tb_recalculated = tbAffecting;

  // STEP 2: Refresh reconciliation GL balances (must complete before steps 3-5)
  if (tbAffecting) {
    t0 = Date.now();
    const { refreshGLBalances } = await import('./period_reconciliation_service.js');
    let updated = 0;
    let reverted: string[] = [];
    try {
      ({ updated, reverted } = await refreshGLBalances(pool, tenantId, trigger.period_id));
    } catch {
      // No TB yet (e.g. mapping changed before GL uploaded) — skip recon refresh
    }
    result.recon_balances_refreshed = updated;
    if (reverted.length > 0) {
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
      // Notify: reconciliations reverted due to GL balance change
      try {
        const { notify } = await import('./notification_service.js');
        const accountNames = reverted
          .map((id) => recons.find((x) => x.reconId === id)?.accountName ?? id)
          .slice(0, 3);
        await notify({
          tenantId,
          eventType: 'recon_out_of_tolerance',
          title: 'Reconciliation needs attention',
          body: `${reverted.length} reconciliation${reverted.length === 1 ? '' : 's'} reopened — GL balance changed (${accountNames.join(', ')})`,
          data: { sessionId: trigger.period_id, revertedCount: reverted.length, accounts: accountNames },
        });
      } catch { /* non-fatal */ }
    }
    timings['step2_refresh_gl_balances'] = Date.now() - t0;
  }

  // STEPS 3, 4, 5 run in parallel — they are independent of each other
  const hitlType = mapToHITLTriggerType(trigger.type);
  const hitlTrigger = {
    type: hitlType,
    affected_accounts: trigger.affected_accounts,
    affected_entity: trigger.entity_id,
    triggered_by: trigger.triggered_by,
    details: trigger.details,
  };

  const [step3Result, readiness, issueResult] = await Promise.all([
    // STEP 3: Invalidate statements (do NOT regenerate)
    (async () => {
      if (!tbAffecting) return false;
      const t3 = Date.now();
      const maxVer = await getMaxVersionByCloseSessionId(pool, tenantId, trigger.period_id);
      if (maxVer > 0) {
        await setStatementsStaleSince(pool, tenantId, trigger.period_id);
        timings['step3_invalidate_statements'] = Date.now() - t3;
        return true;
      }
      timings['step3_invalidate_statements'] = Date.now() - t3;
      return false;
    })(),

    // STEP 4: Re-run validation checks (lightweight — skips verifyChain, evidence N+1, mapping recompute)
    (async () => {
      const t4 = Date.now();
      const r = await computeReadiness(pool, tenantId, session, { lightweight: true });
      timings['step4_compute_readiness'] = Date.now() - t4;
      return r;
    })(),

    // STEP 5: Update HITL issues (auto-verify resolved, create new)
    (async () => {
      const t5 = Date.now();
      const r = await runIssueCascade(
        pool,
        tenantId,
        trigger.period_id,
        hitlTrigger,
        depth + 1
      );
      timings['step5_issue_cascade'] = Date.now() - t5;
      return r;
    })(),
  ]);

  result.statements_invalidated = step3Result;
  result.validation_results = mapReadinessToValidationSummary(readiness);
  result.issues_auto_verified = issueResult.issues_auto_verified;
  result.issues_created = issueResult.new_issues_created;
  result.issues_reopened = [];

  // Notify on new gate failures (hard blockers found after cascade)
  if (readiness.hardBlockers.length > 0 && depth === 0) {
    try {
      const { notify } = await import('./notification_service.js');
      await notify({
        tenantId,
        eventType: 'gate_failed',
        title: 'Close blocked',
        body: `${readiness.hardBlockers.length} gate${readiness.hardBlockers.length === 1 ? '' : 's'} failing — ${readiness.hardBlockers[0]}`,
        data: { sessionId: trigger.period_id, blockers: readiness.hardBlockers.slice(0, 5) },
      });
    } catch { /* non-fatal */ }
  }

  result.duration_ms = Date.now() - startTime;

  // Always log cascade timing for diagnostics
  console.log(
    `[cascade] ${trigger.type} on ${trigger.period_id}: ${result.duration_ms}ms | ` +
      Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(', ')
  );

  if (result.duration_ms > MAX_CASCADE_MS) {
    console.warn(
      `Cascade exceeded ${MAX_CASCADE_MS}ms: ${result.duration_ms}ms for trigger ${trigger.type} on period ${trigger.period_id}. ` +
        `TB recalc: ${result.adjusted_tb_recalculated}, Recons refreshed: ${result.recon_balances_refreshed}, ` +
        `Issues updated: ${result.issues_auto_verified.length + result.issues_created.length}`
    );
  }

  // Emit real-time event so connected clients see the cascade result instantly
  try {
    const { emitSessionEvent } = await import('../realtime/index.js');
    emitSessionEvent({
      type: 'cascade_complete',
      sessionId: trigger.period_id,
      tenantId,
      triggeredBy: trigger.triggered_by,
      data: {
        triggerType: trigger.type,
        affectedAccounts: trigger.affected_accounts,
        reconRefreshed: result.recon_balances_refreshed,
        reconStatusChanges: result.recon_status_changes.length,
        statementsInvalidated: result.statements_invalidated,
        issuesCreated: result.issues_created.length,
        issuesVerified: result.issues_auto_verified.length,
        durationMs: result.duration_ms,
        validationPassing: result.validation_results.all_hard_passing,
      },
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* non-fatal: realtime not initialized */
  }

  // Readiness notification: if all gates pass, notify controller (never auto-advance)
  if (depth === 0 && result.validation_results.all_hard_passing) {
    try {
      const { checkAndNotifyReadiness } = await import('./auto_advance_service.js');
      const readinessResult = await checkAndNotifyReadiness(pool, tenantId, trigger.period_id, result);
      if (readinessResult.ready && readinessResult.notified) {
        console.log(`[cascade] All gates passed for ${trigger.period_id} — controller notified (manual advance required)`);
      }
    } catch {
      /* non-fatal: readiness check failed */
    }
  }

  return result;
}
