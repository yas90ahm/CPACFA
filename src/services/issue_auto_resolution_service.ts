/**
 * Issue Auto-Resolution Service
 *
 * Automatically verifies or reopens issues based on state changes.
 * Called after mutations (AJE posted, recon completed, mapping changed, etc.).
 *
 * Cascade: re-run detection for the period; auto-verify issues whose check now passes;
 * create new issues for newly detected problems. Max depth guard to prevent loops.
 *
 * Wired today:
 * - journal_entry_service.postJE → runCascade(..., 'aje_posted', ...)
 *
 * To wire when periodId/entityId are available:
 * - After reconciliation completed → 'recon_completed'
 * - After COA mapping rules upsert (per period) → 'mapping_changed'
 * - After TB reingested for a close period → 'tb_reingested'
 * - After variance explanation saved → 'variance_explained'
 */

import type { Pool } from 'pg';
import { getOpenIssuesForPeriod } from './issue_service.js';
import * as detection from './issue_detection_service.js';

export type CascadeTriggerType =
  | 'aje_posted'
  | 'recon_completed'
  | 'mapping_changed'
  | 'tb_reingested'
  | 'statement_regenerated'
  | 'variance_explained';

export interface CascadeTrigger {
  type: CascadeTriggerType;
  affected_accounts: string[];
  affected_entity: string;
  triggered_by: string;
  details: Record<string, unknown>;
}

export interface CascadeResult {
  issues_auto_verified: string[];
  new_issues_created: string[];
}

const MAX_CASCADE_DEPTH = 3;

/** Run detection and auto-verify; create new issues. Idempotent; no duplicate issues. */
export async function runCascade(
  pool: Pool,
  tenantId: string,
  periodId: string,
  _trigger: CascadeTrigger,
  depth = 0
): Promise<CascadeResult> {
  const result: CascadeResult = { issues_auto_verified: [], new_issues_created: [] };
  if (depth >= MAX_CASCADE_DEPTH) return result;

  const ctx: detection.DetectionContext = { pool, tenantId, periodId };
  const openBefore = await getOpenIssuesForPeriod(pool, periodId, tenantId);
  const openIdsBefore = new Set(openBefore.map((i) => i.issueId));

  await detection.detectUnmappedAccounts(ctx);
  await detection.detectBalanceSheetImbalance(ctx);
  await detection.detectIncompleteReconciliations(ctx);
  await detection.detectPendingAjeTemplates(ctx);
  await detection.detectUnexplainedVariances(ctx);

  const { getIssue } = await import('./issue_service.js');
  for (const issue of openBefore) {
    const current = await getIssue(pool, tenantId, issue.issueId);
    if (current?.status === 'verified') result.issues_auto_verified.push(issue.issueId);
  }

  const openAfter = await getOpenIssuesForPeriod(pool, periodId, tenantId);
  for (const i of openAfter) {
    if (!openIdsBefore.has(i.issueId)) result.new_issues_created.push(i.issueId);
  }

  return result;
}
