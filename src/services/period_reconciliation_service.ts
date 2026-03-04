/**
 * Period Reconciliation Service (Step 5)
 *
 * Manages reconciliation of balance sheet accounts per close period.
 * Workflow:
 * 1. When a close period enters IN_PROGRESS, initialize recons for all required accounts
 * 2. GL balances are auto-populated from the adjusted TB
 * 3. Preparer enters supporting balance and adds reconciling items
 * 4. Variance and unexplained variance are DB-computed (GENERATED columns)
 * 5. When unexplained variance is zero or within tolerance, preparer marks completed
 * 6. Reviewer approves (if required by configuration)
 * 7. Completeness gate checks all required recons before IN_PROGRESS → UNDER_REVIEW
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { withTransaction } from '../db/transaction.js';
import { from, sumRound2 } from '../utils/decimal.js';
import type {
  ReconRequirement,
  PeriodReconciliation,
  ReconItem,
  PeriodReconStatus,
  ReconItemType,
} from '../types/period_reconciliation.js';
import * as reconRepo from '../db/repositories/period_reconciliation_repository.js';
import * as reqRepo from '../db/repositories/recon_requirements_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { getTrialBalanceForCertification } from './adjusted_trial_balance_service.js';
import { createDraftJE } from './journal_entry_service.js';

export class PeriodReconciliationError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'SEGREGATION'
  ) {
    super(message);
    this.name = 'PeriodReconciliationError';
  }
}

/** Get GL balance for an account from adjusted TB (debit - credit). Returns string for DB. */
function getGLBalanceForAccount(
  tb: { accountCode?: string; accountName: string; debit: number; credit: number }[],
  accountCode: string
): string | null {
  const entry = tb.find(
    (e) => (e.accountCode ?? e.accountName ?? '').trim() === accountCode.trim()
  );
  if (!entry) return null;
  const balance = from(entry.debit).minus(entry.credit).toDecimalPlaces(2);
  return balance.toNumber().toString();
}

/**
 * Initialize period reconciliations for all required accounts.
 * Pulls GL balance from adjusted TB; creates one recon per required account.
 * If no requirements exist for this entity, auto-generates them from the TB's
 * balance sheet accounts (ASSET and LIABILITY) with a $100 tolerance.
 */
export async function initializeReconciliations(
  pool: Pool,
  tenantId: string,
  periodId: string,
  entityId: string
): Promise<PeriodReconciliation[]> {
  const session = await getCloseSessionById(pool, tenantId, periodId);
  if (!session) throw new PeriodReconciliationError('Close session not found', 'NOT_FOUND');
  const periodLabel = (session.periodEnd ?? '').slice(0, 7);

  let tb: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }[] = [];
  try {
    const tbResult = await getTrialBalanceForCertification(
      pool,
      tenantId,
      periodLabel,
      periodId
    );
    tb = tbResult.trialBalance;
  } catch {
    // No trial balance yet (e.g. session just advanced before GL/TB ingest). Create recons with null GL balance.
  }

  let requirements = await reqRepo.listRequirements(pool, tenantId, entityId);

  // Auto-generate requirements from balance sheet accounts if none exist
  if (requirements.length === 0 && tb.length > 0) {
    const bsAccounts = tb.filter((row) => {
      const t = (row.accountType ?? '').toUpperCase();
      return t === 'ASSET' || t === 'LIABILITY' || t === 'EQUITY'
        || t === 'CURRENT_ASSET' || t === 'NON_CURRENT_ASSET'
        || t === 'CURRENT_LIABILITY' || t === 'NON_CURRENT_LIABILITY';
    });
    // If no typed accounts, fall back to all accounts (common when classifier hasn't run)
    const accountsToUse = bsAccounts.length > 0 ? bsAccounts : tb;
    for (const account of accountsToUse) {
      const code = (account.accountCode ?? account.accountName ?? '').trim();
      if (!code) continue;
      await reqRepo.insertRequirement(pool, randomUUID(), {
        tenantId,
        entityId,
        accountCode: code,
        accountName: account.accountName || code,
        isRequired: true,
        toleranceAmount: '100.00',
        toleranceType: 'absolute',
        expectedSource: 'other',
        requiresReviewerApproval: false,
      });
    }
    requirements = await reqRepo.listRequirements(pool, tenantId, entityId);
  }

  const required = requirements.filter((r) => r.isRequired);
  if (required.length === 0) return [];

  const existing = await reconRepo.listPeriodReconciliationsByPeriod(pool, tenantId, periodId);
  const existingAccounts = new Set(existing.map((e) => e.accountCode));
  const created: PeriodReconciliation[] = [];

  for (const req of required) {
    if (existingAccounts.has(req.accountCode)) continue;
    const glBalance = getGLBalanceForAccount(tb, req.accountCode);
    const reconId = randomUUID();
    const recon = await reconRepo.insertPeriodReconciliation(pool, reconId, {
      tenantId,
      periodId,
      entityId,
      requirementId: req.requirementId,
      accountCode: req.accountCode,
      glBalance: glBalance ?? null,
      toleranceAmount: req.toleranceAmount,
    });
    created.push(recon);
  }

  // Set prior period reference fields from most recent certified session
  const allRecons = [...existing, ...created];
  if (allRecons.length > 0) {
    const priorRecons = await reconRepo.getPriorPeriodRecons(pool, tenantId, entityId, periodId);
    if (priorRecons.length > 0) {
      const priorByAccount = new Map(priorRecons.map((p) => [p.accountCode, p]));
      for (const recon of allRecons) {
        const prior = priorByAccount.get(recon.accountCode);
        if (prior && !recon.priorPeriodSessionId) {
          await reconRepo.setPriorPeriodRef(
            pool, tenantId, recon.reconId,
            prior.periodId,
            prior.glBalance,
            prior.supportingBalance
          );
        }
      }
    }
  }

  // Return all recons (idempotent — second call returns existing)
  return allRecons;
}

/**
 * Refresh GL balances for all recons in a period (e.g. after AJE posted).
 * If a completed/approved recon is now over tolerance, set status back to in_progress.
 */
export async function refreshGLBalances(
  pool: Pool,
  tenantId: string,
  periodId: string
): Promise<{ updated: number; reverted: string[] }> {
  const session = await getCloseSessionById(pool, tenantId, periodId);
  if (!session) return { updated: 0, reverted: [] };
  const periodLabel = (session.periodEnd ?? '').slice(0, 7);
  let tb: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }[] = [];
  try {
    const tbResult = await getTrialBalanceForCertification(
      pool,
      tenantId,
      periodLabel,
      periodId
    );
    tb = tbResult.trialBalance;
  } catch {
    // No TB yet — nothing to refresh against
    return { updated: 0, reverted: [] };
  }

  const recons = await reconRepo.listPeriodReconciliationsByPeriod(pool, tenantId, periodId);
  let updated = 0;
  const reverted: string[] = [];

  for (const recon of recons) {
    const glBalance = getGLBalanceForAccount(tb, recon.accountCode);
    const updatedRecon = await reconRepo.updateReconGLBalance(
      pool,
      tenantId,
      recon.reconId,
      glBalance ?? null
    );
    if (updatedRecon) {
      updated++;
      // Check if unexplained variance (after reconciling items) exceeds tolerance.
      // isWithinTolerance checks raw variance (gl-supp) which ignores items;
      // unexplainedVariance = (gl-supp) + items, so use that for revert decision.
      const absUnexplained = updatedRecon.unexplainedVariance != null
        ? Math.abs(Number(updatedRecon.unexplainedVariance))
        : null;
      const tolerance = Number(updatedRecon.toleranceAmount) || 0;
      const overTolerance = absUnexplained != null && absUnexplained > tolerance;
      if (
        (recon.status === 'completed' || recon.status === 'approved') &&
        overTolerance &&
        updatedRecon.supportingBalance != null
      ) {
        await reconRepo.updateReconStatus(pool, tenantId, recon.reconId, 'in_progress');
        reverted.push(recon.reconId);
        const { createIssue } = await import('./issue_service.js');
        await createIssue(pool, {
          tenantId,
          periodId,
          entityId: recon.entityId,
          issueType: 'recon_over_tolerance',
          severity: 'blocking',
          category: 'reconciliation',
          title: `Reconciliation over tolerance: ${recon.accountCode}`,
          description: `GL balance changed; unexplained variance now exceeds tolerance. Reconcile again.`,
          affectedAccounts: [recon.accountCode],
          sourceCheck: 'recon_completeness_gate',
          sourceDetails: { recon_id: recon.reconId },
        });
      }
    }
  }
  return { updated, reverted };
}

/** Set supporting balance (preparer). */
export async function setSupportingBalance(
  pool: Pool,
  tenantId: string,
  reconId: string,
  amount: number | string,
  source: string | null,
  userId: string
): Promise<PeriodReconciliation> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  const amountStr = from(amount).toDecimalPlaces(2).toNumber().toString();
  const updated = await reconRepo.updateReconSupportingBalance(
    pool,
    tenantId,
    reconId,
    amountStr,
    source
  );
  if (!updated) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  return updated;
}

/** Add a reconciling item and recalc reconciling_items_total (Decimal.js sum). */
export async function addReconcilingItem(
  pool: Pool,
  tenantId: string,
  reconId: string,
  item: { description: string; amount: number | string; itemType: ReconItemType; needsAje?: boolean },
  userId: string
): Promise<ReconItem> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  const itemId = randomUUID();
  const created = await reconRepo.insertReconItem(pool, itemId, {
    reconId,
    description: item.description,
    amount: item.amount,
    itemType: item.itemType,
    needsAje: item.needsAje ?? false,
    createdBy: userId,
  });
  const items = await reconRepo.listReconItemsByReconId(pool, reconId);
  const total = sumRound2(items.map((i) => Number(i.amount)));
  await reconRepo.updateReconReconcilingItemsTotal(pool, tenantId, reconId, total.toFixed(2));
  return created;
}

/** Remove a reconciling item and recalc total. */
export async function removeReconcilingItem(
  pool: Pool,
  tenantId: string,
  itemId: string,
  _userId: string
): Promise<void> {
  const item = await reconRepo.getReconItemById(pool, itemId);
  if (!item) throw new PeriodReconciliationError('Recon item not found', 'NOT_FOUND');
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, item.reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  await reconRepo.deleteReconItem(pool, itemId);
  const items = await reconRepo.listReconItemsByReconId(pool, item.reconId);
  const total = sumRound2(items.map((i) => Number(i.amount)));
  await reconRepo.updateReconReconcilingItemsTotal(
    pool,
    tenantId,
    item.reconId,
    total.toFixed(2)
  );
}

/** Complete reconciliation (preparer). Checks: supporting balance set; unexplained within tolerance; if over tolerance, explanation required. */
export async function completeReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string,
  userId: string,
  varianceExplanation?: string | null
): Promise<PeriodReconciliation> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  if (recon.status === 'approved') {
    throw new PeriodReconciliationError('Reconciliation already approved', 'VALIDATION');
  }

  if (recon.supportingBalance == null) {
    throw new PeriodReconciliationError('Supporting balance is required to complete', 'VALIDATION');
  }

  const unexplained = recon.unexplainedVariance != null ? Number(recon.unexplainedVariance) : null;
  const tolerance = Number(recon.toleranceAmount);
  const absUnexplained = unexplained != null ? Math.abs(unexplained) : null;

  if (absUnexplained != null && absUnexplained > tolerance) {
    throw new PeriodReconciliationError(
      `Unexplained variance ${recon.unexplainedVariance} exceeds tolerance ${recon.toleranceAmount}`,
      'VALIDATION'
    );
  }
  if (
    absUnexplained != null &&
    absUnexplained > 0 &&
    absUnexplained <= tolerance &&
    !(varianceExplanation ?? recon.varianceExplanation ?? '').trim()
  ) {
    throw new PeriodReconciliationError(
      'Variance explanation is required when unexplained variance is within tolerance but not zero',
      'VALIDATION'
    );
  }

  const { listEvidenceForObject } = await import('../db/repositories/evidence_repository.js');
  const attachments = await listEvidenceForObject(pool, tenantId, 'reconciliation', reconId);
  if (attachments.length === 0) {
    throw new PeriodReconciliationError(
      'Supporting documentation is required to complete. Upload the source document (bank statement, subledger export, loan statement, etc.) that supports the reconciled balance.',
      'VALIDATION'
    );
  }

  // Wrap status update + cascade in a single transaction
  const updated = await withTransaction(pool, async (client) => {
    const result = await reconRepo.updateReconStatus(
      client as unknown as Pool,
      tenantId,
      reconId,
      'completed',
      {
        varianceExplanation: varianceExplanation ?? recon.varianceExplanation,
        preparedBy: userId,
        preparedAt: new Date().toISOString(),
      }
    );
    if (!result) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');

    const { executeCascade, CascadeTriggerType } = await import('./cascade_engine.js');
    await executeCascade(client as unknown as Pool, tenantId, {
      type: CascadeTriggerType.RECON_COMPLETED,
      period_id: recon.periodId,
      entity_id: recon.entityId,
      triggered_by: userId,
      affected_accounts: [recon.accountCode],
      details: { recon_id: recon.reconId },
    });

    return result;
  });

  return updated;
}

/** Approve reconciliation (reviewer). Segregation: reviewer must not be preparer. */
export async function approveReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string,
  userId: string
): Promise<PeriodReconciliation> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  if (recon.status !== 'completed') {
    throw new PeriodReconciliationError(
      `Only completed reconciliations can be approved; current: ${recon.status}`,
      'VALIDATION'
    );
  }
  if (recon.preparedBy === userId) {
    throw new PeriodReconciliationError(
      'Reviewer cannot approve a reconciliation they prepared (segregation of duties)',
      'SEGREGATION'
    );
  }

  // Wrap status update + cascade in a single transaction
  const updated = await withTransaction(pool, async (client) => {
    const result = await reconRepo.updateReconStatus(
      client as unknown as Pool,
      tenantId,
      reconId,
      'approved',
      { reviewedBy: userId, reviewedAt: new Date().toISOString() }
    );
    if (!result) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');

    const { executeCascade, CascadeTriggerType } = await import('./cascade_engine.js');
    await executeCascade(client as unknown as Pool, tenantId, {
      type: CascadeTriggerType.RECON_APPROVED,
      period_id: recon.periodId,
      entity_id: recon.entityId,
      triggered_by: userId,
      affected_accounts: [recon.accountCode],
      details: { recon_id: recon.reconId, approved: true },
    });

    return result;
  });

  return updated;
}

/** Reject reconciliation (reviewer). Puts back to in_progress. */
export async function rejectReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string,
  _reason: string,
  userId: string
): Promise<PeriodReconciliation> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  if (recon.status !== 'completed') {
    throw new PeriodReconciliationError(
      `Only completed reconciliations can be rejected; current: ${recon.status}`,
      'VALIDATION'
    );
  }

  const updated = await reconRepo.updateReconStatus(pool, tenantId, reconId, 'in_progress');
  if (!updated) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');

  const { executeCascade, CascadeTriggerType } = await import('./cascade_engine.js');
  await executeCascade(pool, tenantId, {
    type: CascadeTriggerType.RECON_REJECTED,
    period_id: recon.periodId,
    entity_id: recon.entityId,
    triggered_by: userId,
    affected_accounts: [recon.accountCode],
    details: { recon_id: recon.reconId, reason: _reason },
  });

  return updated;
}

/** Reopen an approved reconciliation (e.g. new information discovered). Requires reason. */
export async function reopenApprovedReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string,
  reason: string,
  userId: string
): Promise<PeriodReconciliation> {
  if (!reason || reason.trim().length < 10) {
    throw new PeriodReconciliationError(
      'Reason is required (minimum 10 characters) to reopen an approved reconciliation',
      'VALIDATION'
    );
  }

  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  if (recon.status !== 'approved') {
    throw new PeriodReconciliationError(
      `Only approved reconciliations can be reopened; current: ${recon.status}`,
      'VALIDATION'
    );
  }

  const updated = await reconRepo.updateReconStatus(pool, tenantId, reconId, 'in_progress');
  if (!updated) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');

  const { executeCascade, CascadeTriggerType } = await import('./cascade_engine.js');
  await executeCascade(pool, tenantId, {
    type: CascadeTriggerType.RECON_REJECTED,
    period_id: recon.periodId,
    entity_id: recon.entityId,
    triggered_by: userId,
    affected_accounts: [recon.accountCode],
    details: { recon_id: recon.reconId, reason, reopened_from: 'approved' },
  });

  return updated;
}

/** Get prior period recon data for an entity. */
export async function getPriorPeriodData(
  pool: Pool,
  tenantId: string,
  entityId: string,
  currentSessionId: string
): Promise<PeriodReconciliation[]> {
  return reconRepo.getPriorPeriodRecons(pool, tenantId, entityId, currentSessionId);
}

/** Copy prior period data into a current reconciliation. */
export async function copyPriorPeriod(
  pool: Pool,
  tenantId: string,
  reconId: string,
  entityId: string,
  currentSessionId: string
): Promise<PeriodReconciliation> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  if (recon.copiedFromPrior) {
    throw new PeriodReconciliationError('Already copied from prior period', 'VALIDATION');
  }

  const priorRecons = await reconRepo.getPriorPeriodRecons(pool, tenantId, entityId, currentSessionId);
  const priorRecon = priorRecons.find((p) => p.accountCode === recon.accountCode);
  if (!priorRecon) {
    throw new PeriodReconciliationError('No prior period data found for this account', 'NOT_FOUND');
  }

  const updated = await reconRepo.copyFromPriorPeriod(pool, tenantId, reconId, priorRecon);
  if (!updated) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  return updated;
}

/** Update notes on a reconciliation. */
export async function updateReconNotes(
  pool: Pool,
  tenantId: string,
  reconId: string,
  notes: string
): Promise<PeriodReconciliation> {
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  const updated = await reconRepo.updateReconNotes(pool, tenantId, reconId, notes);
  if (!updated) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');
  return updated;
}

export async function getPeriodReconciliation(
  pool: Pool,
  tenantId: string,
  reconId: string
): Promise<PeriodReconciliation | null> {
  return reconRepo.getPeriodReconciliationById(pool, tenantId, reconId);
}

export async function listPeriodReconciliations(
  pool: Pool,
  tenantId: string,
  periodId: string
): Promise<PeriodReconciliation[]> {
  return reconRepo.listPeriodReconciliationsByPeriod(pool, tenantId, periodId);
}

export async function listReconcilingItems(
  pool: Pool,
  reconId: string
): Promise<ReconItem[]> {
  return reconRepo.listReconItemsByReconId(pool, reconId);
}

/**
 * Create a draft AJE from a reconciling item (e.g. bank fee).
 * Debit: expense account (expenseAccountRef); Credit: recon's GL account.
 * Links the JE back to the recon item.
 */
export async function createAJEFromReconItem(
  pool: Pool,
  tenantId: string,
  itemId: string,
  userId: string,
  opts: { expenseAccountRef: string }
): Promise<{ jeId: string; item: ReconItem }> {
  const item = await reconRepo.getReconItemById(pool, itemId);
  if (!item) throw new PeriodReconciliationError('Recon item not found', 'NOT_FOUND');
  const recon = await reconRepo.getPeriodReconciliationById(pool, tenantId, item.reconId);
  if (!recon) throw new PeriodReconciliationError('Reconciliation not found', 'NOT_FOUND');

  const amount = from(item.amount).toNumber();
  const session = await getCloseSessionById(pool, tenantId, recon.periodId);
  if (!session) throw new PeriodReconciliationError('Close session not found', 'NOT_FOUND');

  const provenance = { kind: 'human_entered' as const, enteredBy: userId };
  const je = await createDraftJE(pool, {
    closeSessionId: recon.periodId,
    tenantId,
    memo: `From recon item: ${item.description}`,
    source: 'recon',
    createdBy: userId,
    lines: [
      {
        accountRef: opts.expenseAccountRef,
        debit: amount,
        description: item.description,
        amountProvenance: provenance,
      },
      {
        accountRef: recon.accountCode,
        credit: amount,
        description: item.description,
        amountProvenance: provenance,
      },
    ],
  });

  await reconRepo.updateReconItemAjeId(pool, itemId, je.id);
  const updatedItem = await reconRepo.getReconItemById(pool, itemId);
  if (!updatedItem) throw new PeriodReconciliationError('Recon item not found after update', 'NOT_FOUND');
  return { jeId: je.id, item: updatedItem };
}
