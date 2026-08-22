import { createHash } from 'crypto';
import type { Pool } from 'pg';
import * as writebackRepo from '../db/repositories/journal_entry_erp_writeback_repository.js';
import type { JournalEntryErpWriteback } from '../db/repositories/journal_entry_erp_writeback_repository.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { getCloseCalendarConfig } from './close_calendar_config_service.js';
import { getConnection, pushJournalEntry } from './accounting_integration_service.js';
import { getJournalEntryWithLines, postJE } from './journal_entry_service.js';
import { enqueueJobWithId } from './job_service.js';
import { recordMaterialEvent } from './audit_service.js';
import { log } from '../lib/logger.js';
import { buildEventPacket, financialEvents } from '../events/financial_event_emitter.js';
import { assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { round2 } from '../utils/decimal.js';

export class ErpWritebackError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'NOT_APPROVED'
      | 'NOT_CONFIGURED'
      | 'ENTITY_MISMATCH'
      | 'AMBIGUOUS_EXTERNAL_RESULT'
      | 'INVALID_STATE'
  ) {
    super(message);
    this.name = 'ErpWritebackError';
  }
}

export interface ErpWritebackRequestResult {
  enabled: boolean;
  queued: boolean;
  writeback?: JournalEntryErpWriteback;
  reason?: string;
}

export function journalEntryErpIdempotencyKey(tenantId: string, journalEntryId: string): string {
  const digest = createHash('sha256')
    .update(`approved-erp-je:v1:${tenantId}:${journalEntryId}`)
    .digest('hex')
    .slice(0, 32);
  return `sabit-${digest}`;
}

export function erpWritebackJobId(tenantId: string, journalEntryId: string): string {
  const digest = createHash('sha256')
    .update(`erp-je-writeback:v1:${tenantId}:${journalEntryId}`)
    .digest('hex');
  return `erp-je-${digest}`;
}

export async function enqueueErpWritebackJob(
  tenantId: string,
  journalEntryId: string
): Promise<{ id: string; inserted: boolean }> {
  return enqueueJobWithId(erpWritebackJobId(tenantId, journalEntryId), {
    type: 'erp_je_writeback',
    payload: { tenantId, journalEntryId },
    // An ambiguous ERP response must never be retried automatically. A human
    // must reconcile the external ledger before another posting is attempted.
    maxAttempts: 1,
  });
}

/**
 * Persist an outbox request after independent human approval. This function
 * never accepts account lines, amounts, dates, or a connection from the caller.
 */
export async function requestApprovedErpWriteback(
  pool: Pool,
  tenantId: string,
  journalEntryId: string,
  requestedBy: string
): Promise<ErpWritebackRequestResult> {
  const config = await getCloseCalendarConfig(tenantId, pool);
  if (!config?.approvedErpWritebackEnabled || !config.connectionId || !config.entityId) {
    return { enabled: false, queued: false, reason: 'Approved ERP writeback is not configured.' };
  }

  const result = await getJournalEntryWithLines(pool, tenantId, journalEntryId);
  if (!result) throw new ErpWritebackError('Journal entry not found', 'NOT_FOUND');
  if (!['approved', 'posted', 'exported'].includes(result.je.status)) {
    throw new ErpWritebackError(
      `Journal entry must have independent approval before ERP writeback; current status: ${result.je.status}`,
      'NOT_APPROVED'
    );
  }
  const session = await getCloseSessionById(pool, tenantId, result.je.closeSessionId);
  if (!session) throw new ErpWritebackError('Close session not found', 'NOT_FOUND');
  if (session.entityId !== config.entityId) {
    return {
      enabled: false,
      queued: false,
      reason: `Journal entry entity ${session.entityId} is outside the configured writeback entity ${config.entityId}.`,
    };
  }

  const writeback = await writebackRepo.createPendingWriteback(pool, {
    tenantId,
    journalEntryId,
    connectionId: config.connectionId,
    idempotencyKey: journalEntryErpIdempotencyKey(tenantId, journalEntryId),
    requestedBy,
  });

  if (writeback.status !== 'pending') {
    return { enabled: true, queued: false, writeback };
  }

  try {
    const queued = await enqueueErpWritebackJob(tenantId, journalEntryId);
    return { enabled: true, queued: queued.inserted, writeback };
  } catch (error) {
    // The tenant outbox row is durable. The periodic dispatcher will recover
    // it if the control queue is temporarily unavailable.
    log('error', 'Approved ERP writeback persisted but immediate queueing failed', {
      tenantId,
      journalEntryId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { enabled: true, queued: false, writeback };
  }
}

/** Execute exactly one approved-only writeback attempt. */
export async function executeApprovedErpWriteback(
  pool: Pool,
  tenantId: string,
  journalEntryId: string
): Promise<JournalEntryErpWriteback> {
  // The orchestration worker may execute an approved instruction; a model call
  // running inside the advisory boundary may not invoke this mutation directly.
  assertNoAiMutationContext();
  let writeback = await writebackRepo.getWriteback(pool, tenantId, journalEntryId);
  if (!writeback) throw new ErpWritebackError('ERP writeback request not found', 'NOT_FOUND');
  if (writeback.status === 'posted') return writeback;
  if (writeback.status === 'posting') {
    const message = 'A prior ERP posting attempt did not record a conclusive result; reconcile the ERP before retrying.';
    await writebackRepo.markTerminal(
      pool,
      tenantId,
      journalEntryId,
      'reconciliation_required',
      message
    );
    throw new ErpWritebackError(message, 'AMBIGUOUS_EXTERNAL_RESULT');
  }
  if (writeback.status !== 'pending') {
    throw new ErpWritebackError(
      `ERP writeback is ${writeback.status}; automatic posting is not permitted from this state`,
      'INVALID_STATE'
    );
  }

  const config = await getCloseCalendarConfig(tenantId, pool);
  if (
    !config?.approvedErpWritebackEnabled ||
    !config.connectionId ||
    config.connectionId !== writeback.connectionId
  ) {
    const cancelled = await writebackRepo.markTerminal(
      pool,
      tenantId,
      journalEntryId,
      'cancelled',
      'ERP writeback configuration was disabled or changed before execution.'
    );
    if (cancelled) return cancelled;
    throw new ErpWritebackError('ERP writeback configuration is no longer active', 'NOT_CONFIGURED');
  }

  let entry = await getJournalEntryWithLines(pool, tenantId, journalEntryId);
  if (!entry) throw new ErpWritebackError('Journal entry not found', 'NOT_FOUND');
  const session = await getCloseSessionById(pool, tenantId, entry.je.closeSessionId);
  if (!session) throw new ErpWritebackError('Close session not found', 'NOT_FOUND');
  if (session.entityId !== config.entityId) {
    await writebackRepo.markTerminal(
      pool,
      tenantId,
      journalEntryId,
      'cancelled',
      'Journal entry no longer belongs to the configured ERP writeback entity.'
    );
    throw new ErpWritebackError('Journal entry entity does not match writeback configuration', 'ENTITY_MISMATCH');
  }

  // Run every deterministic pre-post and shadow-audit control before touching
  // the external ERP. The worker can execute this transition only because the
  // persisted JE is already independently approved.
  if (entry.je.status === 'approved') {
    try {
      await postJE(pool, tenantId, journalEntryId);
    } catch (error) {
      await writebackRepo.markTerminal(
        pool,
        tenantId,
        journalEntryId,
        'failed',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
    entry = await getJournalEntryWithLines(pool, tenantId, journalEntryId);
    if (!entry) throw new ErpWritebackError('Journal entry not found after internal post', 'NOT_FOUND');
  }
  if (entry.je.status !== 'posted' && entry.je.status !== 'exported') {
    const message = `Only approved-and-posted journal entries can reach the ERP; current status: ${entry.je.status}`;
    await writebackRepo.markTerminal(pool, tenantId, journalEntryId, 'failed', message);
    throw new ErpWritebackError(message, 'NOT_APPROVED');
  }

  const claimed = await writebackRepo.beginPosting(pool, tenantId, journalEntryId);
  if (!claimed) {
    throw new ErpWritebackError('ERP writeback could not acquire its one-shot posting claim', 'INVALID_STATE');
  }
  writeback = claimed;

  const connection = await getConnection(writeback.connectionId, pool, tenantId);
  if (!connection) {
    const message = `Accounting connection ${writeback.connectionId} was not found`;
    await writebackRepo.markTerminal(pool, tenantId, journalEntryId, 'failed', message);
    throw new ErpWritebackError(message, 'NOT_CONFIGURED');
  }

  let externalResult;
  try {
    externalResult = await pushJournalEntry(
      {
        connectionId: writeback.connectionId,
        date: session.periodEnd,
        memo: entry.je.memo,
        idempotencyKey: writeback.idempotencyKey,
        lines: entry.lines.map((line) => ({
          accountCode: line.accountRef,
          accountName: line.accountRef,
          debit: round2(line.debit),
          credit: round2(line.credit),
          description: line.description,
        })),
      },
      pool,
      tenantId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writebackRepo.markTerminal(
      pool,
      tenantId,
      journalEntryId,
      'reconciliation_required',
      message
    );
    throw new ErpWritebackError(message, 'AMBIGUOUS_EXTERNAL_RESULT');
  }
  if (!externalResult.success) {
    const message = externalResult.errors.join('; ') || `${connection.provider} did not confirm the journal entry`;
    await writebackRepo.markTerminal(
      pool,
      tenantId,
      journalEntryId,
      'reconciliation_required',
      message
    );
    throw new ErpWritebackError(message, 'AMBIGUOUS_EXTERNAL_RESULT');
  }

  const confirmedAt = new Date().toISOString();
  await recordMaterialEvent(pool, {
    tenantId,
    periodLabel: session.periodEnd.slice(0, 7),
    eventType: 'je_posting',
    deterministicFlagSnapshot: {
      journalEntryId,
      closeSessionId: session.id,
      destination: 'external_erp',
      provider: connection.provider,
      connectionId: writeback.connectionId,
      externalId: externalResult.externalId,
      externalRef: externalResult.externalRef,
      idempotencyKey: writeback.idempotencyKey,
      approvedBy: entry.je.approvedBy,
      requestedBy: writeback.requestedBy,
      confirmedAt,
    },
    createdBy: 'system:approved-erp-writeback',
  });
  const posted = await writebackRepo.markPosted(pool, tenantId, journalEntryId, externalResult);
  if (!posted) {
    throw new ErpWritebackError(
      'ERP confirmed the entry, but Sabit could not finalize the receipt; reconciliation is required',
      'AMBIGUOUS_EXTERNAL_RESULT'
    );
  }
  financialEvents.emit('GATE_CHECK_REQUESTED', buildEventPacket('GATE_CHECK_REQUESTED', {
    errorCode: 'GATE_CHECK',
    conflictingData: {},
    metadata: { tenantId, closeSessionId: session.id },
    data: {
      closeSessionId: session.id,
      trigger: 'erp_writeback_confirmed',
      triggeredBy: 'system:approved-erp-writeback',
    },
  }));
  return posted;
}
