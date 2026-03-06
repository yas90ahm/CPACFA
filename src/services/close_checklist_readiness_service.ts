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
import { getBlockingIssuesForPeriod, createIssueForSession } from './issue_service.js';
import * as jeRepo from '../db/repositories/journal_entry_repository.js';
import { verifyChain } from './audit_ledger_service.js';
import { getPeriodExportChecks } from '../db/repositories/period_export_checks_repository.js';
import { checkEvidencePolicyForCertification } from './evidence_policy_service.js';

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
  tenantId: string,
  closeSessionId: string
): Promise<InitializeChecklistResult> {
  const existing = await itemRepo.hasChecklistForSession(pool, tenantId, closeSessionId);
  if (existing) {
    const items = await itemRepo.listChecklistItemsBySessionId(pool, tenantId, closeSessionId);
    return { items, created: false };
  }
  const items: CloseChecklistItem[] = [];
  for (const spec of DEFAULT_ITEMS) {
    const id = randomUUID();
    const item = await itemRepo.insertChecklistItem(pool, tenantId, id, closeSessionId, {
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
export interface ComputeReadinessOptions {
  /**
   * When true, skip expensive checks that are inappropriate for cascade paths:
   * - verifyChain (O(n) hash scan of entire audit ledger)
   * - N+1 evidence loops for recons and JEs
   * - checkMappingCompleteness (recomputes TB, already done in cascade step 2)
   * These are only needed for on-demand readiness queries and certification.
   */
  lightweight?: boolean;
}

export async function computeReadiness(
  pool: Pool,
  tenantId: string,
  session: CloseSession,
  options?: ComputeReadinessOptions
): Promise<CloseReadinessResult> {
  const lightweight = options?.lightweight ?? false;
  const closeSessionId = session.id;
  const periodLabel = periodLabelFromSession(session);
  const hardBlockers: string[] = [];
  const softWarnings: string[] = [];

  let checklistComplete = true;
  const items = await itemRepo.listChecklistItemsBySessionId(pool, tenantId, closeSessionId);
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
  const bankRuns = await reconRepo.listReconRunsByCloseSession(pool, tenantId, closeSessionId, 'bank');
  if (bankRuns.length > 0) {
    const signedOff = await Promise.all(
      bankRuns.map((r) => reconRepo.getReconSignoffByRunId(pool, tenantId, r.id))
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
  const blockingIssues = await getBlockingIssuesForPeriod(pool, closeSessionId, tenantId);
  if (blockingIssues.length > 0) {
    noCriticalIssues = false;
    hardBlockers.push(
      `${blockingIssues.length} critical/blocking issue(s) open; resolve or waive before close.`
    );
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
  if (!lightweight) {
    // verifyChain is O(n) — only run for full readiness checks, not cascade
    const chainResult = await verifyChain(pool, tenantId);
    if (!chainResult.valid) {
      integrityChecksPass = false;
      hardBlockers.push(chainResult.message ?? 'Audit ledger chain verification failed.');
    }
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

  // Evidence policy (Phase 2A): warn_only adds softWarnings; hard_block adds hardBlockers with EVIDENCE_REQUIRED
  const evidenceResult = await checkEvidencePolicyForCertification(pool, tenantId, closeSessionId);
  for (const b of evidenceResult.hardBlockers) {
    hardBlockers.push(b.message);
  }
  for (const w of evidenceResult.softWarnings) {
    softWarnings.push(w.message);
  }

  // Reconciliation completeness gate (Step 5): all required account recons complete and within tolerance
  const { checkReconCompleteness } = await import('./recon_completeness_gate.js');
  const reconResult = await checkReconCompleteness(pool, tenantId, closeSessionId);
  if (!reconResult.passes && reconResult.total_required > 0) {
    hardBlockers.push(
      `${reconResult.blockers.length} reconciliation(s) incomplete: ${reconResult.blockers.slice(0, 3).map((b) => `${b.account_code} (${b.reason})`).join('; ')}${reconResult.blockers.length > 3 ? '…' : ''}`
    );
  }

  // Variance completeness gate: material variances must have human explanation before UNDER_REVIEW
  const { checkVarianceCompleteness } = await import('./variance_analysis_service.js');
  const varianceResult = await checkVarianceCompleteness(pool, tenantId, closeSessionId);
  if (!varianceResult.passes && varianceResult.unexplained.length > 0) {
    hardBlockers.push(
      `${varianceResult.unexplained.length} material variance(s) without explanation; explain or approve before close.`
    );
  }

  // Template completeness gate: proposed AJE templates must be applied or skipped before UNDER_REVIEW
  const { checkTemplateCompleteness } = await import('./template_completeness_gate.js');
  const templateResult = await checkTemplateCompleteness(pool, tenantId, closeSessionId);
  if (!templateResult.passes && templateResult.pending > 0) {
    hardBlockers.push(
      `${templateResult.pending} AJE template(s) proposed but not yet applied or skipped; review and apply or skip before close.`
    );
  }

  if (!lightweight) {
    // N+1 evidence loops — only run for full readiness checks, not cascade
    // Recon evidence completeness (safety net): completed recons must have attachments
    const { listPeriodReconciliationsByPeriod } = await import('../db/repositories/period_reconciliation_repository.js');
    const { listEvidenceForObject } = await import('../db/repositories/evidence_repository.js');
    const reconsForPeriod = await listPeriodReconciliationsByPeriod(pool, tenantId, closeSessionId);
    const completedRecons = reconsForPeriod.filter((r) => r.status === 'completed' || r.status === 'approved');
    for (const recon of completedRecons) {
      const attachments = await listEvidenceForObject(pool, tenantId, 'reconciliation', recon.reconId);
      if (attachments.length === 0) {
        hardBlockers.push(
          `Reconciliation for ${recon.accountCode} is completed but missing supporting documentation. Upload the source document before close.`
        );
      }
    }

    // JE evidence completeness (soft warning): posted JEs above threshold without evidence
    const { getEvidencePolicy } = await import('../db/repositories/evidence_policy_repository.js');
    const { listJournalEntryLines } = await import('../db/repositories/journal_entry_repository.js');
    const jePolicy = await getEvidencePolicy(pool, tenantId);
    const jeThreshold = jePolicy?.materialityThreshold != null && jePolicy.materialityThreshold !== ''
      ? Number(jePolicy.materialityThreshold)
      : 0;
    if (jeThreshold > 0) {
      const postedJes = jes.filter((j) => j.status === 'posted' || j.status === 'exported');
      for (const je of postedJes) {
        const jeLines = await listJournalEntryLines(pool, je.id);
        const { sumRound2 } = await import('../utils/decimal.js');
        const totalAmount = sumRound2(jeLines.map((l) => l.debit ?? 0));
        if (totalAmount >= jeThreshold) {
          const jeAttachments = await listEvidenceForObject(pool, tenantId, 'journal_entry', je.id);
          if (jeAttachments.length === 0) {
            softWarnings.push(
              `Posted journal entry ${je.memo ?? je.id} ($${totalAmount.toFixed(2)}) above threshold lacks supporting documentation.`
            );
          }
        }
      }
    }

    // Mapping completeness gate: all TB accounts must have COA mapping before UNDER_REVIEW
    const { checkMappingCompleteness } = await import('./mapping_completeness_gate.js');
    const mappingResult = await checkMappingCompleteness(
      pool,
      tenantId,
      closeSessionId,
      session.entityId ?? ''
    );
    if (!mappingResult.passes && mappingResult.unmapped_accounts.length > 0) {
      hardBlockers.push(
        `${mappingResult.unmapped_accounts.length} account(s) not mapped to reporting line items: ` +
          mappingResult.unmapped_accounts
            .slice(0, 5)
            .map((u) => `${u.account_code || u.account_name} ($${u.balance})`)
            .join(', ') +
          (mappingResult.unmapped_accounts.length > 5 ? '…' : '')
      );
    }
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
    jeTotal: jes.length,
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
  const items = await itemRepo.listChecklistItemsBySessionId(pool, opts.tenantId, opts.closeSessionId);
  const stuck = items.filter((i) => i.required && i.status !== 'completed' && i.status !== 'skipped');
  if (stuck.length === 0) return null;
  const issue = await createIssueForSession(pool, {
    closeSessionId: opts.closeSessionId,
    tenantId: opts.tenantId,
    category: 'reconciliation',
    severity: 'high',
    title: 'Close checklist: required items incomplete',
    description: `Required items not complete: ${stuck.map((i) => i.name).join(', ')}. Complete or skip before close.`,
    sourceRef: { closeSessionId: opts.closeSessionId, itemCodes: stuck.map((i) => i.code) },
    createdBy: opts.createdBy,
  });
  return { issueId: issue.issueId };
}

export async function getChecklistItems(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<CloseChecklistItem[]> {
  return itemRepo.listChecklistItemsBySessionId(pool, tenantId, closeSessionId);
}

export async function completeChecklistItem(
  pool: Pool,
  tenantId: string,
  itemId: string,
  completedBy: string,
  notes?: string
): Promise<CloseChecklistItem | null> {
  return itemRepo.updateChecklistItemStatus(pool, tenantId, itemId, 'completed', {
    completedBy,
    completedAt: new Date().toISOString(),
    notes,
  });
}

export async function skipChecklistItem(
  pool: Pool,
  tenantId: string,
  itemId: string,
  completedBy: string,
  notes?: string
): Promise<CloseChecklistItem | null> {
  return itemRepo.updateChecklistItemStatus(pool, tenantId, itemId, 'skipped', {
    completedBy,
    notes,
  });
}
