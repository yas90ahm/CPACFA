import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../auth/middleware.js';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getSession } from '../../services/close_session_service.js';
import {
  AccountingMemoryError,
  approveCandidateMemory,
  correctProposedJournalEntry,
  getAccountingMemorySessionView,
  revokeAccountingMemory,
} from '../../services/accounting_memory_service.js';
import {
  enqueueCloseOrchestratorReconcile,
  getCloseOrchestratorView,
} from '../../services/close_orchestrator_service.js';
import * as memoryRepository from '../../db/repositories/accounting_memory_repository.js';
import type {
  AccountingCorrectionApplicability,
  AccountingMemoryScope,
} from '../../types/accounting_memory.js';

const router = Router();

const correctionBodySchema = z.object({
  rationale: z.string().trim().min(10).max(2_000),
  applicability: z.enum(['one_time', 'recurring', 'policy_candidate']).default('recurring'),
  memoryScope: z.enum(['transaction_pattern', 'account', 'entity']).default('transaction_pattern'),
  memo: z.string().trim().min(5).max(500),
  lines: z.array(z.object({
    accountRef: z.string().trim().min(1).max(200),
    debit: z.number().finite().nonnegative().optional(),
    credit: z.number().finite().nonnegative().optional(),
    description: z.string().trim().max(500).optional(),
  }).strict()).min(2).max(200),
}).strict();

const memoryResolutionBodySchema = z.object({
  reason: z.string().trim().min(10).max(2_000),
  closeSessionId: z.string().trim().min(1).max(200).optional(),
}).strict();

function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

function handleAccountingMemoryError(res: Response, error: unknown): void {
  if (error instanceof AccountingMemoryError) {
    const status = error.code === 'NOT_FOUND'
      ? 404
      : error.code === 'SESSION_NOT_WRITABLE' || error.code === 'INVALID_STATUS' || error.code === 'MEMORY_CONFLICT'
        ? 409
        : 422;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  res.status(500).json({ error: 'Accounting memory request failed.' });
}

/** Replace a proposed JE, preserve the original, and remember the human treatment. */
router.post('/journal-entries/:id/correct', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    if (getCloseRoleFromReq(authReq) !== 'approver') {
      res.status(403).json({
        error: 'Only the Close Supervisor or another approver may record an accounting correction.',
        code: 'INSUFFICIENT_ROLE',
      });
      return;
    }
    const journalEntryId = req.params.id ?? '';
    const journalEntry = await (await import('../../db/repositories/journal_entry_repository.js'))
      .getJournalEntryById(pool, journalEntryId, tenantId);
    if (!journalEntry) {
      res.status(404).json({ error: 'Journal entry not found.', code: 'NOT_FOUND' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, journalEntry.closeSessionId)) return;
    const parsedBody = correctionBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(422).json({
        error: validationMessage(parsedBody.error),
        code: 'VALIDATION',
      });
      return;
    }
    const body = parsedBody.data;
    const result = await correctProposedJournalEntry(pool, {
      tenantId,
      journalEntryId,
      correctedBy: authReq.userId ?? 'system:close-supervisor',
      rationale: body.rationale,
      applicability: body.applicability as AccountingCorrectionApplicability,
      memoryScope: body.memoryScope as AccountingMemoryScope,
      memo: body.memo,
      lines: body.lines,
    });
    let orchestrationQueued = false;
    let orchestrationWarning: string | undefined;
    try {
      const queued = await enqueueCloseOrchestratorReconcile({
        tenantId,
        closeSessionId: journalEntry.closeSessionId,
        trigger: 'human_correction',
        sourceType: 'journal_entry',
        sourceId: result.replacementJournalEntryId,
        memoryId: result.memory.id,
      });
      orchestrationQueued = queued.inserted;
    } catch {
      orchestrationWarning = 'The correction is durable, but the close recheck could not be queued automatically.';
    }
    res.status(201).json({
      ...result,
      orchestrationQueued,
      ...(orchestrationWarning ? { orchestrationWarning } : {}),
    });
  } catch (error) {
    handleAccountingMemoryError(res, error);
  }
});

/** Session-scoped view of corrections, memories, and actual memory applications. */
router.get('/sessions/:sessionId/accounting-memory', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const closeSessionId = req.params.sessionId ?? '';
    const session = await getSession(pool, tenantId, closeSessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found.' });
      return;
    }
    const view = await getAccountingMemorySessionView(
      pool,
      tenantId,
      closeSessionId,
      session.entityId
    );
    res.json(view);
  } catch (error) {
    handleAccountingMemoryError(res, error);
  }
});

/** Bounded recursion and recovery history for one close. */
router.get('/sessions/:sessionId/orchestrator', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    const view = await getCloseOrchestratorView(pool, tenantId, req.params.sessionId ?? '');
    if (!view) {
      res.json({ run: null, events: [], incidents: [] });
      return;
    }
    res.json(view);
  } catch (error) {
    handleAccountingMemoryError(res, error);
  }
});

/** Resolve a conflicting memory candidate; prior approved treatment is superseded atomically. */
router.post('/accounting-memories/:id/approve', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    if (getCloseRoleFromReq(authReq) !== 'approver') {
      res.status(403).json({ error: 'Only an approver may resolve accounting memory conflicts.' });
      return;
    }
    const parsedBody = memoryResolutionBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(422).json({ error: validationMessage(parsedBody.error), code: 'VALIDATION' });
      return;
    }
    const requestedCloseSessionId = parsedBody.data.closeSessionId;
    if (requestedCloseSessionId) {
      const [candidate, recheckSession] = await Promise.all([
        memoryRepository.getMemory(pool, tenantId, req.params.id ?? ''),
        getSession(pool, tenantId, requestedCloseSessionId),
      ]);
      if (!candidate || !recheckSession || candidate.entityId !== recheckSession.entityId) {
        res.status(422).json({ error: 'The requested recheck session must belong to the memory entity.' });
        return;
      }
    }
    const memory = await approveCandidateMemory(pool, {
      tenantId,
      memoryId: req.params.id ?? '',
      actor: authReq.userId ?? 'system:memory-approver',
      reason: parsedBody.data.reason,
    });
    const correction = requestedCloseSessionId
      ? null
      : await memoryRepository.getCorrectionEvent(pool, tenantId, memory.sourceCorrectionEventId);
    const recheckCloseSessionId = requestedCloseSessionId ?? correction?.closeSessionId;
    if (recheckCloseSessionId) {
      await enqueueCloseOrchestratorReconcile({
        tenantId,
        closeSessionId: recheckCloseSessionId,
        trigger: 'human_correction',
        sourceType: 'memory',
        sourceId: memory.id,
        memoryId: memory.id,
        occurrenceToken: `${memory.status}:${memory.resolvedAt ?? memory.approvedAt ?? memory.createdAt}`,
      }).catch(() => undefined);
    }
    res.json({ memory });
  } catch (error) {
    handleAccountingMemoryError(res, error);
  }
});

/** Revoke a memory without deleting its correction or application history. */
router.post('/accounting-memories/:id/revoke', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required.' });
      return;
    }
    if (getCloseRoleFromReq(authReq) !== 'approver') {
      res.status(403).json({ error: 'Only an approver may revoke accounting memory.' });
      return;
    }
    const parsedBody = memoryResolutionBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(422).json({ error: validationMessage(parsedBody.error), code: 'VALIDATION' });
      return;
    }
    const requestedCloseSessionId = parsedBody.data.closeSessionId;
    if (requestedCloseSessionId) {
      const [existingMemory, recheckSession] = await Promise.all([
        memoryRepository.getMemory(pool, tenantId, req.params.id ?? ''),
        getSession(pool, tenantId, requestedCloseSessionId),
      ]);
      if (!existingMemory || !recheckSession || existingMemory.entityId !== recheckSession.entityId) {
        res.status(422).json({ error: 'The requested recheck session must belong to the memory entity.' });
        return;
      }
    }
    const memory = await revokeAccountingMemory(pool, {
      tenantId,
      memoryId: req.params.id ?? '',
      actor: authReq.userId ?? 'system:memory-approver',
      reason: parsedBody.data.reason,
    });
    const correction = requestedCloseSessionId
      ? null
      : await memoryRepository.getCorrectionEvent(pool, tenantId, memory.sourceCorrectionEventId);
    const recheckCloseSessionId = requestedCloseSessionId ?? correction?.closeSessionId;
    if (recheckCloseSessionId) {
      await enqueueCloseOrchestratorReconcile({
        tenantId,
        closeSessionId: recheckCloseSessionId,
        trigger: 'human_correction',
        sourceType: 'memory',
        sourceId: memory.id,
        memoryId: memory.id,
        occurrenceToken: `${memory.status}:${memory.resolvedAt ?? memory.approvedAt ?? memory.createdAt}`,
      }).catch(() => undefined);
    }
    res.json({ memory });
  } catch (error) {
    handleAccountingMemoryError(res, error);
  }
});

export default router;
