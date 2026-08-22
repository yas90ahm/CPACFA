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
import { isChecklistRequirementSkippable } from './canadian_aspe_close_profile.js';
import { checkRunbookReadiness } from './runbook_readiness_service.js';
import * as statementPackageRepo from '../db/repositories/statement_package_repository.js';
import {
  evaluateErpWritebackCloseGate,
  summarizeUnresolvedErpWritebacks,
} from './erp_writeback_close_gate_service.js';

export interface ChecklistTemplateItemSpec {
  code: CloseChecklistItemCode;
  name: string;
  required: boolean;
}

const DEFAULT_ITEMS: ChecklistTemplateItemSpec[] = [
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
  createdCount: number;
}

/**
 * Initialize checklist items for a close session from the selected template.
 * Idempotent by requirement code and additive when a profile introduces new controls.
 */
export async function initializeChecklistTemplate(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  options?: { items?: readonly ChecklistTemplateItemSpec[] }
): Promise<InitializeChecklistResult> {
  const templateItems = options?.items ?? DEFAULT_ITEMS;
  const existing = await itemRepo.hasChecklistForSession(pool, tenantId, closeSessionId);
  if (existing) {
    const items = await itemRepo.listChecklistItemsBySessionId(pool, tenantId, closeSessionId);
    const existingCodes = new Set(items.map((item) => item.code));
    const missing = templateItems.filter((item) => !existingCodes.has(item.code));
    for (const spec of missing) {
      const id = randomUUID();
      const item = await itemRepo.insertChecklistItem(pool, tenantId, id, closeSessionId, {
        code: spec.code,
        name: spec.name,
        status: 'pending',
        required: spec.required,
      });
      items.push(item);
    }
    return { items, created: missing.length > 0, createdCount: missing.length };
  }
  const items: CloseChecklistItem[] = [];
  for (const spec of templateItems) {
    const id = randomUUID();
    const item = await itemRepo.insertChecklistItem(pool, tenantId, id, closeSessionId, {
      code: spec.code,
      name: spec.name,
      status: 'pending',
      required: spec.required,
    });
    items.push(item);
  }
  return { items, created: true, createdCount: items.length };
}

function checklistItemSatisfied(item: CloseChecklistItem): boolean {
  if (item.status === 'completed') return true;
  return item.status === 'skipped' && isChecklistRequirementSkippable(item.code);
}

/**
 * Compute readiness for a close session: ready only when no hard blockers.
 * Hard blockers: cash rec not complete (if bank recon exists), critical issues open,
 * unapproved JEs, integrity fail, required checklist incomplete.
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
  const hasCanadianAspeProfile = items.some((item) => item.code === 'CA_SCOPE_CONFIRMED');
  if (items.length === 0) {
    hardBlockers.push('Checklist not initialized; run initializeChecklistTemplate first.');
    checklistComplete = false;
  } else {
    const codeCounts = new Map<CloseChecklistItemCode, number>();
    for (const item of items) {
      codeCounts.set(item.code, (codeCounts.get(item.code) ?? 0) + 1);
    }
    const duplicateCodes = [...codeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([code]) => code);
    if (duplicateCodes.length > 0) {
      checklistComplete = false;
      hardBlockers.push(`Duplicate checklist control codes detected: ${duplicateCodes.join(', ')}`);
    }
    const requiredIncomplete = items.filter((i) => i.required && !checklistItemSatisfied(i));
    if (requiredIncomplete.length > 0) {
      checklistComplete = false;
      hardBlockers.push(
        `Required checklist items not complete: ${requiredIncomplete.map((i) => i.name).join(', ')}`
      );
    }
  }

  const runbookReadiness = await checkRunbookReadiness(
    pool,
    tenantId,
    closeSessionId,
    session.entityId
  );
  if (!runbookReadiness.passing) {
    hardBlockers.push(`Approved close runbook incomplete: ${runbookReadiness.detail}.`);
  }

  let cashRecComplete = true;
  const bankRuns = await reconRepo.listReconRunsByCloseSession(pool, tenantId, closeSessionId, 'bank');
  if (bankRuns.length > 0) {
    const signedOff = await Promise.all(
      bankRuns.map((r) => reconRepo.getReconSignoffByRunId(pool, tenantId, r.id))
    );
    const allSignedOff = signedOff.every((s) => s != null);
    if (!allSignedOff) {
      cashRecComplete = false;
      const unsignedCount = signedOff.filter((s) => s == null).length;
      hardBlockers.push(`Cash reconciliation not complete; ${unsignedCount} bank reconciliation run(s) require sign-off.`);
    }
  } else {
    if (hasCanadianAspeProfile) {
      cashRecComplete = false;
      hardBlockers.push('No bank reconciliation run exists for this Canadian ASPE close session.');
    } else {
      softWarnings.push('No bank reconciliation run for this session.');
    }
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
  const unapprovedJournalEntries = jes.filter((journalEntry) =>
    ['draft', 'proposed', 'pending_approval'].includes(journalEntry.status)
  );
  if (unapprovedJournalEntries.length > 0) {
    materialJesApproved = false;
    hardBlockers.push(
      `${unapprovedJournalEntries.length} journal entry(ies) remain unapproved; approve or reject before close.`
    );
  }

  // When approved ERP writeback is enabled, internal "posted" status is not
  // enough: certification requires a conclusive receipt from the external ERP.
  try {
    const writebackGate = await evaluateErpWritebackCloseGate(
      pool,
      tenantId,
      session.entityId,
      closeSessionId
    );
    if (writebackGate.unresolved.length > 0) {
      materialJesApproved = false;
      hardBlockers.push(
        `${writebackGate.unresolved.length} approved journal entry ERP writeback(s) unresolved ` +
        `(${summarizeUnresolvedErpWritebacks(writebackGate.unresolved)}); ` +
        'obtain a confirmed ERP posting receipt or reconcile the external ledger before close.'
      );
    }
  } catch (error) {
    const { isStrictTrustMode } = await import('../lib/runtime_mode.js');
    if (isStrictTrustMode()) {
      materialJesApproved = false;
      hardBlockers.push('ERP writeback gate could not be verified; resolve the control failure before close.');
    } else {
      console.warn('[close] non-fatal: ERP writeback gate query failed:', error instanceof Error ? error.message : String(error));
    }
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
  if (reconResult.total_required === 0) {
    hardBlockers.push(
      'No required reconciliation population is configured; generate and review reconciliation requirements before close.'
    );
  } else if (!reconResult.passes) {
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

  // Module proposals gate: all module proposals must be resolved (approved, skipped, or not_applicable)
  try {
    const unresolvedModules = await pool.query<{ module_name: string; status: string }>(
      `SELECT module_name, status FROM tenant_module_proposals
       WHERE tenant_id = $1 AND close_session_id = $2 AND status IN ('failed', 'needs_review', 'pending', 'proposed')`,
      [tenantId, closeSessionId]
    );
    if (unresolvedModules.rows.length > 0) {
      const names = unresolvedModules.rows.map((r) => `${r.module_name} (${r.status})`).join(', ');
      hardBlockers.push(
        `${unresolvedModules.rows.length} module proposal(s) unresolved: ${names}. Approve, skip with reason, or mark not applicable before advancing.`
      );
    }
  } catch (err) {
    // Fail-closed in strict modes (prod/staging): if we can't verify module status, block advancement
    const { isStrictTrustMode } = await import('../lib/runtime_mode.js');
    if (isStrictTrustMode()) {
      hardBlockers.push('Module proposal gate check failed — cannot verify module status. Resolve before advancing.');
    } else {
      console.warn('[close] non-fatal: module proposal gate query failed:', err instanceof Error ? err.message : String(err));
    }
  }

  if (!lightweight) {
    // Batched evidence checks — single query per object type instead of N+1
    const { listPeriodReconciliationsByPeriod } = await import('../db/repositories/period_reconciliation_repository.js');
    const { getObjectIdsWithEvidence } = await import('../db/repositories/evidence_repository.js');
    const { listJournalEntryLinesBatch } = await import('../db/repositories/journal_entry_repository.js');

    // Recon evidence completeness: batch check all completed recons at once
    const reconsForPeriod = await listPeriodReconciliationsByPeriod(pool, tenantId, closeSessionId);
    const completedRecons = reconsForPeriod.filter((r) => r.status === 'completed' || r.status === 'approved');
    if (completedRecons.length > 0) {
      const reconIdsWithEvidence = await getObjectIdsWithEvidence(
        pool, tenantId, 'reconciliation', completedRecons.map((r) => r.reconId)
      );
      for (const recon of completedRecons) {
        if (!reconIdsWithEvidence.has(recon.reconId)) {
          hardBlockers.push(
            `Reconciliation for ${recon.accountCode} is completed but missing supporting documentation. Upload the source document before close.`
          );
        }
      }
    }

    // JE evidence completeness: batch check posted JEs above threshold
    const { getEvidencePolicy } = await import('../db/repositories/evidence_policy_repository.js');
    const jePolicy = await getEvidencePolicy(pool, tenantId);
    const jeThreshold = jePolicy?.materialityThreshold != null && jePolicy.materialityThreshold !== ''
      ? Number(jePolicy.materialityThreshold)
      : 0;
    if (jeThreshold > 0) {
      const postedJes = jes.filter((j) => j.status === 'posted' || j.status === 'exported');
      if (postedJes.length > 0) {
        // Batch fetch all JE lines in one query
        const allLinesByJe = await listJournalEntryLinesBatch(pool, postedJes.map((j) => j.id));
        const { sumRound2 } = await import('../utils/decimal.js');
        // Find JEs above threshold
        const materialJeIds: string[] = [];
        const materialJeLabels = new Map<string, { memo: string; total: number }>();
        for (const je of postedJes) {
          const jeLines = allLinesByJe.get(je.id) ?? [];
          const totalAmount = sumRound2(jeLines.map((l) => Number(l.debit ?? 0)));
          if (totalAmount >= jeThreshold) {
            materialJeIds.push(je.id);
            materialJeLabels.set(je.id, { memo: je.memo ?? je.id, total: totalAmount });
          }
        }
        // Batch check evidence for all material JEs in one query
        if (materialJeIds.length > 0) {
          const jeIdsWithEvidence = await getObjectIdsWithEvidence(pool, tenantId, 'journal_entry', materialJeIds);
          for (const jeId of materialJeIds) {
            if (!jeIdsWithEvidence.has(jeId)) {
              const info = materialJeLabels.get(jeId)!;
              softWarnings.push(
                `Posted journal entry ${info.memo} ($${info.total.toFixed(2)}) above threshold lacks supporting documentation.`
              );
            }
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
    if (mappingResult.total_accounts === 0) {
      hardBlockers.push(
        'No session-anchored trial balance is available; sync or upload the accounting source before close.'
      );
    } else if (!mappingResult.passes && mappingResult.unmapped_accounts.length > 0) {
      hardBlockers.push(
        `${mappingResult.unmapped_accounts.length} account(s) not mapped to reporting line items: ` +
          mappingResult.unmapped_accounts
            .slice(0, 5)
            .map((u) => `${u.account_code || u.account_name} ($${u.balance})`)
            .join(', ') +
          (mappingResult.unmapped_accounts.length > 5 ? '…' : '')
      );
    }

    const statementPackages = await statementPackageRepo.listStatementPackagesByCloseSessionId(
      pool,
      tenantId,
      closeSessionId,
      1,
      'standard'
    );
    if (statementPackages.length === 0) {
      hardBlockers.push(
        'No financial statement package has been generated for this close session.'
      );
    } else if (session.statementsStaleSince) {
      hardBlockers.push(
        'Financial statements are stale after an accounting change; regenerate them before close.'
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
    runbookComplete: runbookReadiness.passing,
    runbookDetail: runbookReadiness.detail,
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
  const stuck = items.filter((i) => i.required && !checklistItemSatisfied(i));
  if (stuck.length === 0) return null;
  const issue = await createIssueForSession(pool, {
    closeSessionId: opts.closeSessionId,
    tenantId: opts.tenantId,
    category: 'reconciliation',
    severity: 'high',
    title: 'Close checklist: required items incomplete',
    description: `Required items not complete: ${stuck.map((i) => i.name).join(', ')}. Complete each core control or document an allowed not-applicable disposition before close.`,
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

export async function getChecklistItem(
  pool: Pool,
  tenantId: string,
  itemId: string
): Promise<CloseChecklistItem | null> {
  return itemRepo.getChecklistItemById(pool, tenantId, itemId);
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
  const item = await itemRepo.getChecklistItemById(pool, tenantId, itemId);
  if (!item) return null;
  if (!isChecklistRequirementSkippable(item.code)) {
    throw new ChecklistDispositionError(
      `${item.name} is a core close control and cannot be skipped.`,
      'SKIP_NOT_PERMITTED'
    );
  }
  if (!notes?.trim()) {
    throw new ChecklistDispositionError(
      'A documented not-applicable reason is required to skip a conditional close control.',
      'SKIP_REASON_REQUIRED'
    );
  }
  return itemRepo.updateChecklistItemStatus(pool, tenantId, itemId, 'skipped', {
    completedBy,
    notes: notes.trim(),
  });
}

export class ChecklistDispositionError extends Error {
  constructor(
    message: string,
    public readonly code: 'SKIP_NOT_PERMITTED' | 'SKIP_REASON_REQUIRED'
  ) {
    super(message);
    this.name = 'ChecklistDispositionError';
  }
}
