/**
 * Close checklist and readiness gating: required controls (cash rec, no critical issues, material JEs approved, integrity).
 * computeReadiness(close_session) -> { ready, hard_blockers[], soft_warnings[] }.
 * Export/finalize enforce hard blockers.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { CloseSession } from '../types/close_session.js';
import type { CloseChecklistItem, CloseReadinessResult, CloseChecklistItemCode } from '../types/close_checklist_item.js';
import * as itemRepo from '../db/repositories/close_checklist_item_repository.js';
import * as reconRepo from '../db/repositories/recon_repository.js';
import { listIssues } from './issue_item_service.js';
import * as jeRepo from '../db/repositories/journal_entry_repository.js';
import { verifyChain } from './audit_ledger_service.js';
import { getPeriodExportChecks } from '../db/repositories/period_export_checks_repository.js';
import { createIssue } from './issue_item_service.js';

const DEFAULT_ITEMS: { code: CloseChecklistItemCode; name: string; required: boolean }[] = [
  { code: 'CASH_REC', name: 'Cash reconciliation complete', required: true },
  { code: 'NO_CRITICAL_ISSUES', name: 'No critical issues open', required: true },
  { code: 'MATERIAL_JES_APPROVED', name: 'All material JEs approved or rejected', required: true },
  { code: 'INTEGRITY_CHECKS', name: 'Integrity checks pass', required: true },
];

/** CloseSession.periodEnd is YYYY-MM-DD; first 7 chars give YYYY-MM. */
function periodLabelFromSession(session: CloseSession): string {
  const end = session.periodEnd ?? '';
  return end.length >= 7 ? end.slice(0, 7) : end;
}

export interface InitializeChecklistResult {
  items: CloseChecklistItem[];
  created: boolean;
}

/**
 * Initialize checklist items for a close session from the default template.
 * Idempotent: if items already exist for session, returns existing list and created: false.
 */
export async function initializeChecklistTemplate(
  pool: Pool,
  closeSessionId: string
): Promise<InitializeChecklistResult> {
  const existing = await itemRepo.hasChecklistForSession(pool, closeSessionId);
  if (existing) {
    const items = await itemRepo.listChecklistItemsBySessionId(pool, closeSessionId);
    return { items, created: false };
  }
  const items: CloseChecklistItem[] = [];
  for (const spec of DEFAULT_ITEMS) {
    const id = randomUUID();
    const item = await itemRepo.insertChecklistItem(pool, id, closeSessionId, {
      code: spec.code,
      name: spec.name,
      status: 'pending',
      required: spec.required,
    });
    items.push(item);
  }
  return { items, created: true };
}

/**
 * Compute readiness for a close session: ready only when no hard blockers.
 * Hard blockers: cash rec not complete (if bank recon exists), critical issues open, draft/proposed JEs, integrity fail, required checklist incomplete.
 */
export async function computeReadiness(
  pool: Pool,
  tenantId: string,
  session: CloseSession
): Promise<CloseReadinessResult> {
  const closeSessionId = session.id;
  const periodLabel = periodLabelFromSession(session);
  const hardBlockers: string[] = [];
  const softWarnings: string[] = [];

  let checklistComplete = true;
  const items = await itemRepo.listChecklistItemsBySessionId(pool, closeSessionId);
  if (items.length === 0) {
    hardBlockers.push('Checklist not initialized; run initializeChecklistTemplate first.');
    checklistComplete = false;
  } else {
    const requiredIncomplete = items.filter((i) => i.required && i.status !== 'completed' && i.status !== 'skipped');
    if (requiredIncomplete.length > 0) {
      checklistComplete = false;
      hardBlockers.push(
        `Required checklist items not complete: ${requiredIncomplete.map((i) => i.name).join(', ')}`
      );
    }
  }

  let cashRecComplete = true;
  const bankRuns = await reconRepo.listReconRunsByCloseSession(pool, closeSessionId, 'bank');
  if (bankRuns.length > 0) {
    const signedOff = await Promise.all(
      bankRuns.map((r) => reconRepo.getReconSignoffByRunId(pool, r.id))
    );
    const anySignedOff = signedOff.some((s) => s != null);
    if (!anySignedOff) {
      cashRecComplete = false;
      hardBlockers.push('Cash reconciliation not complete; bank recon run(s) require sign-off.');
    }
  } else {
    softWarnings.push('No bank reconciliation run for this session.');
  }

  let noCriticalIssues = true;
  const issues = await listIssues(pool, {
    tenantId,
    closeSessionId,
    severity: 'critical',
  });
  const openCritical = issues.filter((i) => i.status !== 'resolved' && i.status !== 'wont_fix');
  if (openCritical.length > 0) {
    noCriticalIssues = false;
    hardBlockers.push(`${openCritical.length} critical issue(s) open; resolve or waive before close.`);
  }

  let materialJesApproved = true;
  const jes = await jeRepo.listJournalEntries(pool, tenantId, { closeSessionId, limit: 1000 });
  const draftOrProposed = jes.filter((j) => j.status === 'draft' || j.status === 'proposed');
  if (draftOrProposed.length > 0) {
    materialJesApproved = false;
    hardBlockers.push(
      `${draftOrProposed.length} journal entry(ies) in draft or proposed; approve or reject before close.`
    );
  }

  let integrityChecksPass = true;
  const chainResult = await verifyChain(pool, tenantId);
  if (!chainResult.valid) {
    integrityChecksPass = false;
    hardBlockers.push(chainResult.message ?? 'Audit ledger chain verification failed.');
  }
  const exportChecks = await getPeriodExportChecks(pool, tenantId, periodLabel);
  if (exportChecks?.roundingGapExceedsMateriality === true) {
    integrityChecksPass = false;
    hardBlockers.push('Rounding gap exceeds materiality; resolve before close.');
  }
  if (exportChecks?.aggregateRoundingExceedsMateriality === true) {
    integrityChecksPass = false;
    hardBlockers.push('Aggregate rounding exceeds materiality; resolve before close.');
  }

  const ready = hardBlockers.length === 0;
  return {
    ready,
    hardBlockers,
    softWarnings,
    checklistComplete,
    cashRecComplete,
    noCriticalIssues,
    materialJesApproved,
    integrityChecksPass,
  };
}

/**
 * Emit issues for stuck checklist items (required items still pending).
 * Call periodically or before finalize; creates one issue per session if any required item is incomplete.
 */
export async function emitIssuesForStuckChecklist(
  pool: Pool,
  opts: { tenantId: string; closeSessionId: string; createdBy?: string }
): Promise<{ issueId: string } | null> {
  const items = await itemRepo.listChecklistItemsBySessionId(pool, opts.closeSessionId);
  const stuck = items.filter((i) => i.required && i.status !== 'completed' && i.status !== 'skipped');
  if (stuck.length === 0) return null;
  const issue = await createIssue(pool, {
    closeSessionId: opts.closeSessionId,
    tenantId: opts.tenantId,
    category: 'reconciliation',
    severity: 'high',
    title: 'Close checklist: required items incomplete',
    description: `Required items not complete: ${stuck.map((i) => i.name).join(', ')}. Complete or skip before close.`,
    sourceRef: { closeSessionId: opts.closeSessionId, itemCodes: stuck.map((i) => i.code) },
    createdBy: opts.createdBy,
  });
  return { issueId: issue.id };
}

export async function getChecklistItems(
  pool: Pool,
  closeSessionId: string
): Promise<CloseChecklistItem[]> {
  return itemRepo.listChecklistItemsBySessionId(pool, closeSessionId);
}

export async function completeChecklistItem(
  pool: Pool,
  itemId: string,
  completedBy: string,
  notes?: string
): Promise<CloseChecklistItem | null> {
  return itemRepo.updateChecklistItemStatus(pool, itemId, 'completed', {
    completedBy,
    completedAt: new Date().toISOString(),
    notes,
  });
}

export async function skipChecklistItem(
  pool: Pool,
  itemId: string,
  completedBy: string,
  notes?: string
): Promise<CloseChecklistItem | null> {
  return itemRepo.updateChecklistItemStatus(pool, itemId, 'skipped', {
    completedBy,
    notes,
  });
}
