/**
 * Protocol Bridge — single entrypoint for financial mutations.
 * Accepts strict JSON commands (Zod), enforces invariants (period lock, balance, attribution),
 * calls internal services/repositories, records audit event for every mutation.
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import type { CloseRole } from '../types/close_and_controls.js';
import { assertPeriodNotLocked, lockPeriod, PeriodLockedError } from '../services/period_lock_service.js';
import { saveUnadjustedFromUpload } from '../services/trial_balance_store_service.js';
import {
  createDraftJE,
  proposeJE,
  approveJE,
  postJE,
  getJournalEntry,
  JournalEntryError,
} from '../services/journal_entry_service.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { recordMaterialEvent } from '../services/audit_ledger_service.js';
import { canPerform } from '../services/segregation_service.js';
import { parseTrialBalance } from '../services/trialBalanceParser.js';
import { getRoundingTolerance } from '../services/rules_registry.js';
import { absGt } from '../utils/decimal.js';
import * as persistence from '../services/persistence_service.js';
import type { TrialBalanceEntry } from '../types/financial.js';

// ---------------------------------------------------------------------------
// Bridge context
// ---------------------------------------------------------------------------

export interface BridgeContext {
  pool: Pool;
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
});

const jeLineSchema = z.object({
  accountRef: z.string().min(1),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  description: z.string().optional(),
});

const createDraftJESchema = z.object({
  commandType: z.literal('CreateDraftJE'),
  closeSessionId: z.string().uuid(),
  memo: z.string().optional(),
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

export const bridgeCommandSchema = z.discriminatedUnion('commandType', [
  saveTrialBalanceSchema,
  createDraftJESchema,
  proposeJESchema,
  approveJESchema,
  postJESchema,
  applyHitlAdjustmentSchema,
  lockPeriodSchema,
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
  | { ok: false; error: string; code: string };

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
 */
export async function executeBridgeCommand(
  ctx: BridgeContext,
  command: unknown
): Promise<BridgeResult> {
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
        const entries: TrialBalanceEntry[] = cmd.entries.map((e) => ({
          accountName: e.accountName,
          debit: e.debit ?? 0,
          credit: e.credit ?? 0,
          accountCode: e.accountCode,
        }));
        const totalDebits = entries.reduce((s, e) => s + e.debit, 0);
        const totalCredits = entries.reduce((s, e) => s + e.credit, 0);
        const tolerance = getRoundingTolerance();
        if (absGt(totalDebits, totalCredits, tolerance)) {
          return {
            ok: false,
            error: `Trial balance does not balance. Debits: ${totalDebits}, Credits: ${totalCredits}.`,
            code: 'VALIDATION',
          };
        }
        await saveUnadjustedFromUpload(
          ctx.tenantId,
          cmd.periodLabel,
          entries,
          { uploadedBy: ctx.actor, fileName: cmd.fileName },
          ctx.pool
        );
        await recordBridgeMutation(ctx, 'SaveTrialBalance', {
          periodLabel: cmd.periodLabel,
          entryCount: entries.length,
          totalDebits,
          totalCredits,
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
        const result = await postJE(ctx.pool, ctx.tenantId, cmd.journalEntryId);
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
        const adjustmentEntries: TrialBalanceEntry[] = cmd.adjustment.map((a) => ({
          accountName: a.accountName,
          debit: a.debit ?? 0,
          credit: a.credit ?? 0,
        }));
        const combined = [...base.entries, ...adjustmentEntries];
        const totalDebits = combined.reduce((s, e) => s + (e.debit ?? 0), 0);
        const totalCredits = combined.reduce((s, e) => s + (e.credit ?? 0), 0);
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
      };
    }
    if (err instanceof JournalEntryError) {
      return { ok: false, error: err.message, code: err.code };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, code: 'SERVICE' };
  }
}
