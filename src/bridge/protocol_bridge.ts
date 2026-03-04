/**
 * Protocol Bridge — single entrypoint for financial mutations.
 * Accepts strict JSON commands (Zod), enforces invariants (period lock, balance, attribution),
 * calls internal services/repositories, records audit event for every mutation.
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import type { CloseRole } from '../types/close_and_controls.js';
import { assertPeriodNotLocked, lockPeriod, PeriodLockedError } from '../services/period_lock_service.js';
import { saveUnadjustedFromUpload, saveUnadjustedFromSync } from '../services/trial_balance_store_service.js';
import {
  createDraftJE,
  proposeJE,
  approveJE,
  postJE,
  getJournalEntry,
  JournalEntryError,
} from '../services/journal_entry_service.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { recordMaterialEvent } from '../services/audit_service.js';
import { addJEAsAdjustments, addAccrualsAsAdjustments, getAdjustment } from '../services/close_adjustments_service.js';
import { updateCloseAdjustmentStatus } from '../services/close_adjustment_update_service.js';
import type { JournalEntrySuggestion } from '../types/close_and_controls.js';
import type { AccrualSuggestion } from '../types/accrual_deferral.js';
import { ProvenanceValidationError } from '../services/close_adjustments_service.js';
import { canPerform } from '../services/segregation_service.js';
import { parseTrialBalance } from '../services/trialBalanceParser.js';
import { computeLineId } from '../utils/line_id.js';
import { getRoundingTolerance } from '../services/rules_registry.js';
import { absGt, sumRound2 } from '../utils/decimal.js';
import * as persistence from '../services/persistence_service.js';
import type { TrialBalanceEntry } from '../types/financial.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';

// ---------------------------------------------------------------------------
// Bridge context
// ---------------------------------------------------------------------------

export interface BridgeContext {
  pool: Pool;
  /** AI-scoped pool for insertCallLog; when set, postJE uses it for runJustifier. */
  aiPool?: Pool;
  tenantId: string;
  actor: string;
  actorRole?: CloseRole;
}

// ---------------------------------------------------------------------------
// Zod schemas for commands (strict JSON; no hallucinated math)
// ---------------------------------------------------------------------------

const trialBalanceEntrySchema = z.object({
  accountName: z.string().min(1),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  accountCode: z.string().optional(),
});

const saveTrialBalanceSchema = z.object({
  commandType: z.literal('SaveTrialBalance'),
  periodLabel: z.string().min(1),
  entries: z.array(trialBalanceEntrySchema).min(1),
  fileName: z.string().optional(),
  /** When 'synced', uses saveUnadjustedFromSync; requires connectionId. */
  source: z.enum(['uploaded', 'synced']).optional().default('uploaded'),
  connectionId: z.string().optional(),
  syncedBy: z.string().optional(),
});

const amountProvenanceSchema = z.union([
  z.object({ kind: z.literal('ledger_exact'), sourceTbRowId: z.string().optional(), sourceLedgerLineId: z.string().optional() }),
  z.object({ kind: z.literal('engine_calculation'), ruleId: z.string(), ruleVersion: z.string(), inputs: z.record(z.unknown()).optional() }),
  z.object({ kind: z.literal('human_entered'), enteredBy: z.string(), enteredAt: z.string().optional() }),
]);

const jeLineSchema = z.object({
  accountRef: z.string().min(1),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  description: z.string().optional(),
  amountProvenance: amountProvenanceSchema.optional(),
});

const createDraftJESchema = z.object({
  commandType: z.literal('CreateDraftJE'),
  closeSessionId: z.string().uuid(),
  memo: z.string().min(5, 'Memo must be at least 5 characters'),
  source: z.enum(['manual', 'suggestion', 'recon', 'accrual']),
  createdBy: z.string().optional(),
  lines: z.array(jeLineSchema).min(1),
});

const proposeJESchema = z.object({
  commandType: z.literal('ProposeJE'),
  journalEntryId: z.string().uuid(),
});

const approveJESchema = z.object({
  commandType: z.literal('ApproveJE'),
  journalEntryId: z.string().uuid(),
  approvedBy: z.string().min(1),
});

const postJESchema = z.object({
  commandType: z.literal('PostJE'),
  journalEntryId: z.string().uuid(),
});

const hitlAdjustmentLineSchema = z.object({
  accountName: z.string().min(1),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
});

const applyHitlAdjustmentSchema = z.object({
  commandType: z.literal('ApplyHitlAdjustmentToTrialBalance'),
  stagedId: z.string().min(1),
  periodLabel: z.string().min(1),
  adjustment: z.array(hitlAdjustmentLineSchema).min(1),
  fileName: z.string().optional(),
});

const lockPeriodSchema = z.object({
  commandType: z.literal('LockPeriod'),
  periodLabel: z.string().min(1),
  lockedBy: z.string().min(1),
  reason: z.string().optional(),
});

const debitCreditLineSchema = z.object({
  account: z.string().min(1),
  amount: z.number(),
  amountProvenance: amountProvenanceSchema.optional(),
});

const journalEntrySuggestionSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  description: z.string().min(1),
  debits: z.array(debitCreditLineSchema).optional().default([]),
  credits: z.array(debitCreditLineSchema).optional().default([]),
  source: z.enum(['gap', 'reconciliation', 'manual']),
  sourceDetail: z.string().optional(),
  confidence: z.number().optional(),
});

const accrualSuggestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['accrual', 'deferral']),
  description: z.string().min(1),
  debitAccount: z.string().min(1),
  creditAccount: z.string().min(1),
  amount: z.number(),
  periodEnd: z.string().min(1),
  source: z.enum(['open_ar', 'open_ap', 'payroll', 'manual', 'agentic']),
  sourceDetail: z.string().optional(),
  confidence: z.number().optional(),
});

const createCloseAdjustmentsFromJESchema = z.object({
  commandType: z.literal('CreateCloseAdjustmentsFromJE'),
  periodLabel: z.string().min(1),
  suggestions: z.array(journalEntrySuggestionSchema).min(1),
});

const createCloseAdjustmentsFromAccrualsSchema = z.object({
  commandType: z.literal('CreateCloseAdjustmentsFromAccruals'),
  periodLabel: z.string().min(1),
  suggestions: z.array(accrualSuggestionSchema).min(1),
});

const updateCloseAdjustmentSchema = z.object({
  commandType: z.literal('UpdateCloseAdjustment'),
  adjustmentId: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'posted']),
  approvedBy: z.string().optional(),
  connectionId: z.string().optional(),
});

export const bridgeCommandSchema = z.discriminatedUnion('commandType', [
  saveTrialBalanceSchema,
  createDraftJESchema,
  proposeJESchema,
  approveJESchema,
  postJESchema,
  applyHitlAdjustmentSchema,
  lockPeriodSchema,
  createCloseAdjustmentsFromJESchema,
  createCloseAdjustmentsFromAccrualsSchema,
  updateCloseAdjustmentSchema,
]);

export type BridgeCommand = z.infer<typeof bridgeCommandSchema>;

// ---------------------------------------------------------------------------
// Result types (deterministic)
// ---------------------------------------------------------------------------

export type BridgeResult =
  | { ok: true; commandType: 'SaveTrialBalance'; periodLabel: string }
  | { ok: true; commandType: 'CreateDraftJE'; journalEntry: { id: string; status: string } }
  | { ok: true; commandType: 'ProposeJE'; journalEntry: { id: string; status: string } }
  | { ok: true; commandType: 'ApproveJE'; journalEntry: { id: string; status: string } }
  | { ok: true; commandType: 'PostJE'; journalEntry: { id: string; status: string }; aiWarnings?: Array<{ ai_status: string; reason: string; pillar: string }> }
  | { ok: true; commandType: 'ApplyHitlAdjustmentToTrialBalance'; periodLabel: string; stagedId: string }
  | { ok: true; commandType: 'LockPeriod'; periodLabel: string; lockedAt: string }
  | { ok: true; commandType: 'CreateCloseAdjustmentsFromJE'; added: import('../types/close_and_controls.js').CloseAdjustment[] }
  | { ok: true; commandType: 'CreateCloseAdjustmentsFromAccruals'; added: import('../types/close_and_controls.js').CloseAdjustment[] }
  | { ok: true; commandType: 'UpdateCloseAdjustment'; updated: import('../types/close_and_controls.js').CloseAdjustment }
  | { ok: false; error: string; code: string; statusCode?: number; periodLabel?: string; approvalRequestId?: string; errors?: string[] };

// ---------------------------------------------------------------------------
// Audit: record every mutation with command type + actor
// ---------------------------------------------------------------------------

async function recordBridgeMutation(
  ctx: BridgeContext,
  commandType: BridgeCommand['commandType'],
  snapshot: Record<string, unknown>
): Promise<void> {
  await recordMaterialEvent(ctx.pool, {
    tenantId: ctx.tenantId,
    periodLabel: snapshot.periodLabel as string | undefined,
    eventType: 'bridge_command',
    deterministicFlagSnapshot: {
      commandType,
      actor: ctx.actor,
      ...snapshot,
    },
    createdBy: ctx.actor,
  });
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_COMMAND' | 'PERIOD_LOCKED' | 'VALIDATION' | 'SERVICE'
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/**
 * Execute a single bridge command. Validates with Zod, enforces invariants,
 * calls services, records audit. Returns deterministic result or error.
 * In prod/staging: asserts not invoked from AI context (AI is advisory-only).
 */
export async function executeBridgeCommand(
  ctx: BridgeContext,
  command: unknown
): Promise<BridgeResult> {
  assertNoAiMutationContext();
  const parsed = bridgeCommandSchema.safeParse(command);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { ok: false, error: msg, code: 'INVALID_COMMAND' };
  }

  const cmd = parsed.data;

  try {
    switch (cmd.commandType) {
      case 'SaveTrialBalance': {
        await assertPeriodNotLocked(cmd.periodLabel, ctx.tenantId, ctx.pool);
        const entries: TrialBalanceEntry[] = cmd.entries.map((e) => {
          const accountName = e.accountName ?? '';
          const debit = e.debit ?? 0;
          const credit = e.credit ?? 0;
          const accountCode = e.accountCode;
          return {
            accountName,
            debit,
            credit,
            accountCode,
            lineId: computeLineId({ accountName, debit, credit, accountCode }),
          };
        });
        const totalDebits = sumRound2(entries.map((e) => e.debit));
        const totalCredits = sumRound2(entries.map((e) => e.credit));
        const tolerance = getRoundingTolerance();
        if (absGt(totalDebits, totalCredits, tolerance)) {
          return {
            ok: false,
            error: `Trial balance does not balance. Debits: ${totalDebits}, Credits: ${totalCredits}.`,
            code: 'VALIDATION',
          };
        }
        const source = cmd.source ?? 'uploaded';
        if (source === 'synced') {
          const connectionId = cmd.connectionId ?? '';
          if (!connectionId.trim()) {
            return {
              ok: false,
              error: 'connectionId required when source is synced.',
              code: 'VALIDATION',
            };
          }
          await saveUnadjustedFromSync(
            ctx.tenantId,
            cmd.periodLabel,
            entries,
            { connectionId, syncedBy: cmd.syncedBy ?? ctx.actor },
            ctx.pool
          );
        } else {
          await saveUnadjustedFromUpload(
            ctx.tenantId,
            cmd.periodLabel,
            entries,
            { uploadedBy: ctx.actor, fileName: cmd.fileName },
            ctx.pool
          );
        }
        await recordBridgeMutation(ctx, 'SaveTrialBalance', {
          periodLabel: cmd.periodLabel,
          entryCount: entries.length,
          totalDebits,
          totalCredits,
          source,
          ...(source === 'synced' && { connectionId: cmd.connectionId }),
        });
        return { ok: true, commandType: 'SaveTrialBalance', periodLabel: cmd.periodLabel };
      }

      case 'CreateDraftJE': {
        const session = await getCloseSessionById(ctx.pool, ctx.tenantId, cmd.closeSessionId);
        if (!session) {
          return { ok: false, error: 'Close session not found', code: 'VALIDATION' };
        }
        const periodLabel = session.periodEnd.slice(0, 7);
        await assertPeriodNotLocked(periodLabel, ctx.tenantId, ctx.pool);
        const je = await createDraftJE(ctx.pool, {
          closeSessionId: cmd.closeSessionId,
          tenantId: ctx.tenantId,
          memo: cmd.memo,
          source: cmd.source,
          createdBy: cmd.createdBy ?? ctx.actor,
          lines: cmd.lines.map((l) => ({
            accountRef: l.accountRef,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            description: l.description,
            amountProvenance: l.amountProvenance,
          })),
        });
        await recordBridgeMutation(ctx, 'CreateDraftJE', {
          periodLabel,
          journalEntryId: je.id,
          closeSessionId: cmd.closeSessionId,
        });
        return { ok: true, commandType: 'CreateDraftJE', journalEntry: { id: je.id, status: je.status } };
      }

      case 'ProposeJE': {
        const je = await getJournalEntry(ctx.pool, ctx.tenantId, cmd.journalEntryId);
        if (!je) {
          return { ok: false, error: 'Journal entry not found', code: 'VALIDATION' };
        }
        const session = await getCloseSessionById(ctx.pool, ctx.tenantId, je.closeSessionId);
        const periodLabel = session?.periodEnd?.slice(0, 7);
        if (periodLabel) {
          await assertPeriodNotLocked(periodLabel, ctx.tenantId, ctx.pool);
        }
        const updated = await proposeJE(ctx.pool, ctx.tenantId, cmd.journalEntryId);
        await recordBridgeMutation(ctx, 'ProposeJE', {
          periodLabel: periodLabel ?? undefined,
          journalEntryId: cmd.journalEntryId,
        });
        return { ok: true, commandType: 'ProposeJE', journalEntry: { id: updated.id, status: updated.status } };
      }

      case 'ApproveJE': {
        const updated = await approveJE(ctx.pool, ctx.tenantId, cmd.journalEntryId, cmd.approvedBy);
        const session = await getCloseSessionById(ctx.pool, ctx.tenantId, updated.closeSessionId);
        const periodLabel = session?.periodEnd?.slice(0, 7);
        await recordBridgeMutation(ctx, 'ApproveJE', {
          periodLabel: periodLabel ?? undefined,
          journalEntryId: cmd.journalEntryId,
          approvedBy: cmd.approvedBy,
        });
        return { ok: true, commandType: 'ApproveJE', journalEntry: { id: updated.id, status: updated.status } };
      }

      case 'PostJE': {
        const je = await getJournalEntry(ctx.pool, ctx.tenantId, cmd.journalEntryId);
        if (!je) {
          return { ok: false, error: 'Journal entry not found', code: 'VALIDATION' };
        }
        const session = await getCloseSessionById(ctx.pool, ctx.tenantId, je.closeSessionId);
        const periodLabel = session?.periodEnd?.slice(0, 7);
        if (periodLabel) {
          await assertPeriodNotLocked(periodLabel, ctx.tenantId, ctx.pool);
        }
        const result = await postJE(ctx.pool, ctx.tenantId, cmd.journalEntryId, ctx.aiPool);
        await recordBridgeMutation(ctx, 'PostJE', {
          periodLabel: periodLabel ?? undefined,
          journalEntryId: cmd.journalEntryId,
        });
        return {
          ok: true,
          commandType: 'PostJE',
          journalEntry: { id: result.journalEntry.id, status: result.journalEntry.status },
          ...(result.aiWarnings?.length && { aiWarnings: result.aiWarnings }),
        };
      }

      case 'ApplyHitlAdjustmentToTrialBalance': {
        await assertPeriodNotLocked(cmd.periodLabel, ctx.tenantId, ctx.pool);
        const item = await persistence.getStagingItem(ctx.pool, ctx.tenantId, cmd.stagedId);
        if (!item) {
          return { ok: false, error: 'Staging item not found', code: 'VALIDATION' };
        }
        const payload = item.payload as Record<string, unknown> | undefined;
        if (payload?.kind !== 'trial_balance_ingest') {
          return {
            ok: false,
            error: 'Staging item is not a trial_balance_ingest',
            code: 'VALIDATION',
          };
        }
        const rawRows = payload.rawRows as Array<{ accountName: string; debit?: number; credit?: number }> | undefined;
        if (!rawRows || !Array.isArray(rawRows)) {
          return { ok: false, error: 'Staging payload missing rawRows', code: 'VALIDATION' };
        }
        const normalizedRows = rawRows.map((r) => ({
          accountName: r.accountName,
          debit: r.debit ?? 0,
          credit: r.credit ?? 0,
        }));
        const base = parseTrialBalance(normalizedRows);
        const adjustmentEntries: TrialBalanceEntry[] = cmd.adjustment.map((a) => {
          const accountName = a.accountName ?? '';
          const debit = a.debit ?? 0;
          const credit = a.credit ?? 0;
          return {
            accountName,
            debit,
            credit,
            lineId: computeLineId({ accountName, debit, credit }),
          };
        });
        const combined = [...base.entries, ...adjustmentEntries];
        const totalDebits = sumRound2(combined.map((e) => e.debit ?? 0));
        const totalCredits = sumRound2(combined.map((e) => e.credit ?? 0));
        const tolerance = getRoundingTolerance();
        if (absGt(totalDebits, totalCredits, tolerance)) {
          return {
            ok: false,
            error: 'Adjustment still does not balance. Sum(Debits) != Sum(Credits).',
            code: 'VALIDATION',
          };
        }
        await saveUnadjustedFromUpload(
          ctx.tenantId,
          cmd.periodLabel,
          combined,
          { uploadedBy: ctx.actor, fileName: cmd.fileName },
          ctx.pool
        );
        await persistence.updateStagingStatus(ctx.pool, ctx.tenantId, cmd.stagedId, {
          status: 'approved',
          approvedBy: ctx.actor,
        });
        await recordBridgeMutation(ctx, 'ApplyHitlAdjustmentToTrialBalance', {
          periodLabel: cmd.periodLabel,
          stagedId: cmd.stagedId,
          adjustmentLineCount: cmd.adjustment.length,
        });
        return {
          ok: true,
          commandType: 'ApplyHitlAdjustmentToTrialBalance',
          periodLabel: cmd.periodLabel,
          stagedId: cmd.stagedId,
        };
      }

      case 'CreateCloseAdjustmentsFromJE': {
        await assertPeriodNotLocked(cmd.periodLabel, ctx.tenantId, ctx.pool);
        const suggestions = cmd.suggestions as JournalEntrySuggestion[];
        const added = await addJEAsAdjustments(cmd.periodLabel, suggestions, ctx.tenantId, ctx.pool);
        await recordBridgeMutation(ctx, 'CreateCloseAdjustmentsFromJE', {
          periodLabel: cmd.periodLabel,
          adjustmentCount: added.length,
          adjustmentIds: added.map((a) => a.id),
        });
        return { ok: true, commandType: 'CreateCloseAdjustmentsFromJE', added };
      }

      case 'CreateCloseAdjustmentsFromAccruals': {
        await assertPeriodNotLocked(cmd.periodLabel, ctx.tenantId, ctx.pool);
        const suggestions = cmd.suggestions as AccrualSuggestion[];
        const added = await addAccrualsAsAdjustments(cmd.periodLabel, suggestions, ctx.tenantId, ctx.pool);
        await recordBridgeMutation(ctx, 'CreateCloseAdjustmentsFromAccruals', {
          periodLabel: cmd.periodLabel,
          adjustmentCount: added.length,
          adjustmentIds: added.map((a) => a.id),
        });
        return { ok: true, commandType: 'CreateCloseAdjustmentsFromAccruals', added };
      }

      case 'UpdateCloseAdjustment': {
        const existing = await getAdjustment(ctx.pool, cmd.adjustmentId, ctx.tenantId);
        if (!existing) {
          return { ok: false, error: 'Adjustment not found', code: 'VALIDATION', statusCode: 404 };
        }
        await assertPeriodNotLocked(existing.periodLabel, ctx.tenantId, ctx.pool);
        const result = await updateCloseAdjustmentStatus({
          id: cmd.adjustmentId,
          status: cmd.status as import('../types/close_and_controls.js').CloseAdjustmentStatus,
          approvedBy: cmd.approvedBy,
          connectionId: cmd.connectionId,
          tenantId: ctx.tenantId,
          pool: ctx.pool,
          actorRole: ctx.actorRole ?? 'preparer',
          actorUserId: ctx.actor,
        });
        if ('updated' in result) {
          await recordBridgeMutation(ctx, 'UpdateCloseAdjustment', {
            periodLabel: existing.periodLabel,
            adjustmentId: cmd.adjustmentId,
            status: cmd.status,
          });
          return { ok: true, commandType: 'UpdateCloseAdjustment', updated: result.updated };
        }
        return {
          ok: false,
          error: result.error,
          code: result.statusCode === 403 && result.periodLabel ? 'PERIOD_LOCKED' : 'VALIDATION',
          statusCode: result.statusCode,
          periodLabel: result.periodLabel,
          approvalRequestId: result.approvalRequestId,
          errors: result.errors,
        };
      }

      case 'LockPeriod': {
        if (ctx.actorRole && !canPerform(ctx.actorRole, 'period_lock')) {
          return {
            ok: false,
            error: 'Insufficient role: period_lock requires approver',
            code: 'VALIDATION',
          };
        }
        const lock = await lockPeriod(cmd.periodLabel, cmd.lockedBy, cmd.reason, ctx.tenantId, ctx.pool);
        await recordBridgeMutation(ctx, 'LockPeriod', {
          periodLabel: lock.periodLabel,
          lockedBy: lock.lockedBy,
          lockedAt: lock.lockedAt,
        });
        return {
          ok: true,
          commandType: 'LockPeriod',
          periodLabel: lock.periodLabel,
          lockedAt: lock.lockedAt,
        };
      }
    }
  } catch (err) {
    if (err instanceof BridgeError) {
      return { ok: false, error: err.message, code: err.code };
    }
    if (err instanceof PeriodLockedError) {
      return {
        ok: false,
        error: `Period is locked: ${err.periodLabel}`,
        code: 'PERIOD_LOCKED',
        periodLabel: err.periodLabel,
      };
    }
    if (err instanceof JournalEntryError) {
      return { ok: false, error: err.message, code: err.code };
    }
    if (err instanceof ProvenanceValidationError) {
      return {
        ok: false,
        error: err.message,
        code: 'VALIDATION',
        statusCode: 400,
        errors: err.errors,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, code: 'SERVICE' };
  }
}
