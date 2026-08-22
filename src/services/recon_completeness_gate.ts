/**
 * Reconciliation Completeness Gate (Step 5)
 *
 * Hard gate for IN_PROGRESS → UNDER_REVIEW transition.
 *
 * Checks:
 * - Every required account has a reconciliation record
 * - Every recon is completed or approved
 * - Unexplained variance is zero or within tolerance
 * - Over-tolerance recons have variance explanations
 * - Recons requiring reviewer approval are approved
 *
 * GL balance: pulled automatically from adjusted TB
 * Supporting balance: entered manually by preparer
 * Variance: computed by database (GENERATED ALWAYS column)
 *
 * Bank pipeline integration is NOT required.
 * The reconciliation system is self-contained.
 */

import type { Pool } from 'pg';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import * as reqRepo from '../db/repositories/recon_requirements_repository.js';
import * as reconRepo from '../db/repositories/period_reconciliation_repository.js';

export interface ReconBlocker {
  recon_id: string;
  account_code: string;
  account_name: string;
  reason: string;
}

export interface ReconGateResult {
  passes: boolean;
  total_required: number;
  completed: number;
  approved: number;
  not_started: number;
  in_progress: number;
  over_tolerance_unexplained: number;
  awaiting_approval: number;
  blockers: ReconBlocker[];
}

export async function checkReconCompleteness(
  pool: Pool,
  tenantId: string,
  periodId: string
): Promise<ReconGateResult> {
  const session = await getCloseSessionById(pool, tenantId, periodId);
  if (!session) {
    return {
      passes: false,
      total_required: 0,
      completed: 0,
      approved: 0,
      not_started: 0,
      in_progress: 0,
      over_tolerance_unexplained: 0,
      awaiting_approval: 0,
      blockers: [],
    };
  }

  const entityId = session.entityId;
  const requirements = await reqRepo.listRequirements(pool, tenantId, entityId);
  const required = requirements.filter((r) => r.isRequired);
  if (required.length === 0) {
    return {
      passes: false,
      total_required: 0,
      completed: 0,
      approved: 0,
      not_started: 0,
      in_progress: 0,
      over_tolerance_unexplained: 0,
      awaiting_approval: 0,
      blockers: [{
        recon_id: '',
        account_code: '',
        account_name: 'Reconciliation population',
        reason: 'No required reconciliation accounts are configured for this entity',
      }],
    };
  }

  const recons = await reconRepo.listPeriodReconciliationsByPeriod(pool, tenantId, periodId);
  const byAccount = new Map(recons.map((r) => [r.accountCode, r]));

  const blockers: ReconBlocker[] = [];
  let completed = 0;
  let approved = 0;
  let not_started = 0;
  let in_progress = 0;
  let over_tolerance_unexplained = 0;
  let awaiting_approval = 0;

  for (const req of required) {
    const recon = byAccount.get(req.accountCode);
    const accountName = req.accountName ?? req.accountCode;

    if (!recon) {
      blockers.push({
        recon_id: '',
        account_code: req.accountCode,
        account_name: accountName,
        reason: 'Not initialized',
      });
      not_started++;
      continue;
    }

    if (recon.status === 'not_started') {
      blockers.push({
        recon_id: recon.reconId,
        account_code: req.accountCode,
        account_name: accountName,
        reason: 'Not started',
      });
      not_started++;
      continue;
    }

    if (recon.status === 'in_progress') {
      const unexplained = recon.unexplainedVariance != null ? Number(recon.unexplainedVariance) : null;
      const tolerance = Number(recon.toleranceAmount);
      const absUnexplained = unexplained != null ? Math.abs(unexplained) : null;

      if (absUnexplained != null && absUnexplained > tolerance) {
        blockers.push({
          recon_id: recon.reconId,
          account_code: req.accountCode,
          account_name: accountName,
          reason: `Unexplained variance of $${recon.unexplainedVariance ?? '?'}`,
        });
        over_tolerance_unexplained++;
      } else if (
        absUnexplained != null &&
        absUnexplained > 0 &&
        absUnexplained <= tolerance &&
        !(recon.varianceExplanation ?? '').trim()
      ) {
        blockers.push({
          recon_id: recon.reconId,
          account_code: req.accountCode,
          account_name: accountName,
          reason: 'Variance explanation required',
        });
        in_progress++;
      } else {
        blockers.push({
          recon_id: recon.reconId,
          account_code: req.accountCode,
          account_name: accountName,
          reason: 'In progress',
        });
        in_progress++;
      }
      continue;
    }

    if (recon.status === 'completed') {
      if (req.requiresReviewerApproval) {
        blockers.push({
          recon_id: recon.reconId,
          account_code: req.accountCode,
          account_name: accountName,
          reason: 'Awaiting reviewer approval',
        });
        awaiting_approval++;
      } else {
        completed++;
      }
      continue;
    }

    if (recon.status === 'approved') {
      approved++;
    }
  }

  return {
    passes: blockers.length === 0,
    total_required: required.length,
    completed,
    approved,
    not_started,
    in_progress,
    over_tolerance_unexplained,
    awaiting_approval,
    blockers,
  };
}
