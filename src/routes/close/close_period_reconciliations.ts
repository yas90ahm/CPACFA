/**
 * Period reconciliation routes (Step 5).
 * Per close period: list recons, set supporting balance, add items, complete, approve, reject.
 * Mounted at /api/close.
 */

import multer from 'multer';
import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';
import {
  initializeReconciliations,
  setSupportingBalance,
  addReconcilingItem,
  removeReconcilingItem,
  createAJEFromReconItem,
  completeReconciliation,
  approveReconciliation,
  rejectReconciliation,
  reopenApprovedReconciliation,
  listPeriodReconciliations,
  getPeriodReconciliation,
  listReconcilingItems,
  updateReconNotes,
  getPriorPeriodData,
  copyPriorPeriod,
  carryForwardReconItems,
  carryForwardItems,
  resolveItem,
  PeriodReconciliationError,
} from '../../services/period_reconciliation_service.js';
import { computeRollForward } from '../../services/roll_forward_recon_service.js';
import { checkReconCompleteness } from '../../services/recon_completeness_gate.js';
import type { ReconItemType } from '../../types/period_reconciliation.js';
import {
  attachEvidenceToReconciliation,
  listEvidenceForReconciliation,
  EvidenceAttachmentError,
} from '../../services/evidence_attachment_service.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

function getUserId(req: Request): string {
  return (req as AuthRequest).userId ?? (req as { userId?: string }).userId ?? 'api';
}

/** GET /api/close/sessions/:periodId/reconciliations — list all recons for period */
router.get('/sessions/:periodId/reconciliations', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and periodId required' });
      return;
    }
    const list = await listPeriodReconciliations(pool, tenantId, periodId);
    res.json({ reconciliations: list });
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'List period reconciliations failed');
  }
});

/** GET /api/close/sessions/:periodId/reconciliations/:reconId — single recon with items */
router.get('/sessions/:periodId/reconciliations/:reconId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    const recon = await getPeriodReconciliation(pool, tenantId, reconId);
    if (!recon) {
      res.status(404).json({ error: 'Reconciliation not found' });
      return;
    }
    const items = await listReconcilingItems(pool, reconId);
    res.json({ reconciliation: recon, items });
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Get period reconciliation failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/initialize — initialize recons for period */
router.post('/sessions/:periodId/reconciliations/initialize', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and periodId required' });
      return;
    }
    const body = req.body as { entity_id?: string };
    let entityId = body?.entity_id;
    if (!entityId) {
      // Derive entity_id from the session
      const { getCloseSessionById } = await import('../../db/repositories/close_session_repository.js');
      const session = await getCloseSessionById(pool, tenantId, periodId);
      entityId = session?.entityId ?? 'default';
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const created = await initializeReconciliations(
      pool,
      tenantId,
      periodId,
      entityId
    );
    res.status(201).json({ reconciliations: created });
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Initialize reconciliations failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/supporting-balance */
router.post('/sessions/:periodId/reconciliations/:reconId/supporting-balance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const body = req.body as { amount?: number | string; supportingBalance?: number | string; source?: string; supportingSource?: string };
    const amount = body?.amount ?? body?.supportingBalance;
    const source = body?.source ?? body?.supportingSource;
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !reconId || amount == null) {
      res.status(400).json({ error: 'Tenant context, reconId, and amount required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const updated = await setSupportingBalance(
      pool,
      tenantId,
      reconId,
      amount,
      source ?? null,
      getUserId(req)
    );
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Set supporting balance failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/items — add reconciling item */
router.post('/sessions/:periodId/reconciliations/:reconId/items', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const body = req.body as {
      description?: string;
      amount?: number | string;
      item_type?: ReconItemType;
      needs_aje?: boolean;
    };
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !reconId || !body?.description || body?.amount == null) {
      res.status(400).json({ error: 'Tenant context, reconId, description, and amount required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const item = await addReconcilingItem(
      pool,
      tenantId,
      reconId,
      {
        description: body.description,
        amount: body.amount,
        itemType: body.item_type ?? 'other',
        needsAje: body.needs_aje ?? false,
      },
      getUserId(req)
    );
    res.status(201).json(item);
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Add reconciling item failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/items/:itemId/create-aje */
router.post('/sessions/:periodId/reconciliations/:reconId/items/:itemId/create-aje', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const itemId = req.params.itemId ?? '';
    const body = req.body as { expense_account_ref?: string };
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !itemId || !body?.expense_account_ref) {
      res.status(400).json({ error: 'Tenant context, itemId, and expense_account_ref required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const result = await createAJEFromReconItem(
      pool,
      tenantId,
      itemId,
      getUserId(req),
      { expenseAccountRef: body.expense_account_ref }
    );
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Create AJE from recon item failed');
  }
});

/** DELETE /api/close/sessions/:periodId/reconciliations/:reconId/items/:itemId */
router.delete('/sessions/:periodId/reconciliations/:reconId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const itemId = req.params.itemId ?? '';
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !itemId) {
      res.status(400).json({ error: 'Tenant context and itemId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    await removeReconcilingItem(pool, tenantId, itemId, getUserId(req));
    res.status(204).send();
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Remove reconciling item failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/evidence — upload supporting document */
router.post(
  '/sessions/:periodId/reconciliations/:reconId/evidence',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const reconId = req.params.reconId ?? '';
      if (!tenantId || !pool || !reconId) {
        res.status(400).json({ error: 'Tenant context and reconId required' });
        return;
      }
      const file = (req as Request & { file?: { buffer: Buffer; originalname?: string; mimetype?: string } }).file;
      if (!file?.buffer) {
        res.status(400).json({ error: 'File upload required' });
        return;
      }
      const periodId = req.params.periodId ?? '';
      if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
      const result = await attachEvidenceToReconciliation(pool, tenantId, reconId, {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalFilename: file.originalname,
        description: (req.body as { description?: string }).description,
        attachedBy: getUserId(req),
      });
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof EvidenceAttachmentError) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'PERIOD_LOCKED' ? 409 : 400;
        res.status(status).json({ error: e.message, code: e.code });
        return;
      }
      send500(res, e, 'Evidence upload failed');
    }
  }
);

/** GET /api/close/sessions/:periodId/reconciliations/:reconId/evidence */
router.get('/sessions/:periodId/reconciliations/:reconId/evidence', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    const attachments = await listEvidenceForReconciliation(pool, tenantId, reconId);
    res.json({ attachments });
  } catch (e) {
    send500(res, e, 'List reconciliation evidence failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/complete */
router.post('/sessions/:periodId/reconciliations/:reconId/complete', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    const body = req.body as { variance_explanation?: string; varianceExplanation?: string; preparedBy?: string };
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const updated = await completeReconciliation(
      pool,
      tenantId,
      reconId,
      body?.preparedBy ?? getUserId(req),
      body?.variance_explanation ?? body?.varianceExplanation ?? null
    );
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError) {
      if (e.code === 'NOT_FOUND') res.status(404).json({ error: e.message });
      else if (e.code === 'VALIDATION') res.status(400).json({ error: e.message });
      else send500(res, e, 'Complete reconciliation failed');
      return;
    }
    send500(res, e, 'Complete reconciliation failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/approve */
router.post('/sessions/:periodId/reconciliations/:reconId/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const updated = await approveReconciliation(pool, tenantId, reconId, getUserId(req));
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError) {
      if (e.code === 'NOT_FOUND') res.status(404).json({ error: e.message });
      else if (e.code === 'VALIDATION' || e.code === 'SEGREGATION') res.status(400).json({ error: e.message });
      else send500(res, e, 'Approve reconciliation failed');
      return;
    }
    send500(res, e, 'Approve reconciliation failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/reject */
router.post('/sessions/:periodId/reconciliations/:reconId/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    const body = req.body as { reason?: string };
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const updated = await rejectReconciliation(
      pool,
      tenantId,
      reconId,
      body?.reason ?? 'Rejected by reviewer',
      getUserId(req)
    );
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError) {
      if (e.code === 'NOT_FOUND') res.status(404).json({ error: e.message });
      else if (e.code === 'VALIDATION') res.status(400).json({ error: e.message });
      else send500(res, e, 'Reject reconciliation failed');
      return;
    }
    send500(res, e, 'Reject reconciliation failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/reopen */
router.post('/sessions/:periodId/reconciliations/:reconId/reopen', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    const body = req.body as { reason?: string };
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const updated = await reopenApprovedReconciliation(
      pool,
      tenantId,
      reconId,
      body?.reason ?? '',
      getUserId(req)
    );
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError) {
      if (e.code === 'NOT_FOUND') res.status(404).json({ error: e.message });
      else if (e.code === 'VALIDATION') res.status(400).json({ error: e.message });
      else send500(res, e, 'Reopen reconciliation failed');
      return;
    }
    send500(res, e, 'Reopen reconciliation failed');
  }
});

/** GET /api/close/sessions/:periodId/reconciliations/prior-period — prior period recon data */
router.get('/sessions/:periodId/reconciliations/prior-period', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = req.params.periodId ?? '';
    const entityId = (req.query.entityId as string) || '';
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and periodId required' });
      return;
    }
    let resolvedEntityId = entityId;
    if (!resolvedEntityId) {
      const { getCloseSessionById } = await import('../../db/repositories/close_session_repository.js');
      const session = await getCloseSessionById(pool, tenantId, periodId);
      resolvedEntityId = session?.entityId ?? 'default';
    }
    const priorRecons = await getPriorPeriodData(pool, tenantId, resolvedEntityId, periodId);
    res.json({ reconciliations: priorRecons });
  } catch (e) {
    send500(res, e, 'Get prior period recons failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/copy-prior — copy prior period data */
router.post('/sessions/:periodId/reconciliations/:reconId/copy-prior', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const { getCloseSessionById } = await import('../../db/repositories/close_session_repository.js');
    const session = await getCloseSessionById(pool, tenantId, periodId);
    const entityId = session?.entityId ?? 'default';
    const updated = await copyPriorPeriod(pool, tenantId, reconId, entityId, periodId);
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError) {
      if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
      if (e.code === 'VALIDATION') { res.status(400).json({ error: e.message }); return; }
    }
    send500(res, e, 'Copy prior period failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/:reconId/carry-forward-items — carry forward reconciling items from prior period */
router.post('/sessions/:periodId/reconciliations/:reconId/carry-forward-items', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const { getCloseSessionById } = await import('../../db/repositories/close_session_repository.js');
    const session = await getCloseSessionById(pool, tenantId, periodId);
    const entityId = session?.entityId ?? 'default';
    const userId = getUserId(req);
    const items = await carryForwardReconItems(pool, tenantId, reconId, entityId, periodId, userId);
    res.json({ items, count: items.length });
  } catch (e) {
    if (e instanceof PeriodReconciliationError) {
      if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
      if (e.code === 'VALIDATION') { res.status(400).json({ error: e.message }); return; }
    }
    send500(res, e, 'Carry forward items failed');
  }
});

/** PUT /api/close/sessions/:periodId/reconciliations/:reconId/notes — update notes */
router.put('/sessions/:periodId/reconciliations/:reconId/notes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const periodId = req.params.periodId ?? '';
    const body = req.body as { notes?: string };
    if (!tenantId || !pool || !reconId) {
      res.status(400).json({ error: 'Tenant context and reconId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const updated = await updateReconNotes(pool, tenantId, reconId, body?.notes ?? '');
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Update recon notes failed');
  }
});

/** GET /api/close/sessions/:sessionId/reconciliations/:reconId/roll-forward — roll-forward analysis (GAP I12) */
router.get('/sessions/:sessionId/reconciliations/:reconId/roll-forward', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const reconId = req.params.reconId ?? '';
    const sessionId = req.params.sessionId ?? '';
    if (!tenantId || !pool || !reconId || !sessionId) {
      res.status(400).json({ error: 'Tenant context, sessionId, and reconId required' });
      return;
    }
    const result = await computeRollForward(pool, tenantId, reconId, sessionId);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
      return;
    }
    send500(res, e, 'Roll-forward reconciliation failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/carry-forward — carry forward unresolved items between sessions (GAP I10) */
router.post('/sessions/:periodId/reconciliations/carry-forward', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = req.params.periodId ?? '';
    const body = req.body as { fromSessionId?: string };
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and periodId required' });
      return;
    }
    if (!body?.fromSessionId) {
      res.status(400).json({ error: 'fromSessionId is required in request body' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const items = await carryForwardItems(pool, tenantId, body.fromSessionId, periodId);
    res.json({ items, count: items.length });
  } catch (e) {
    send500(res, e, 'Carry forward items failed');
  }
});

/** POST /api/close/sessions/:periodId/reconciliations/items/:itemId/resolve — resolve a reconciling item (GAP I10) */
router.post('/sessions/:periodId/reconciliations/items/:itemId/resolve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const itemId = req.params.itemId ?? '';
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !itemId) {
      res.status(400).json({ error: 'Tenant context and itemId required' });
      return;
    }
    if (!await guardSessionWritable(res, pool, tenantId, periodId)) return;
    const resolved = await resolveItem(pool, tenantId, itemId);
    res.json(resolved);
  } catch (e) {
    if (e instanceof PeriodReconciliationError && e.code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Resolve recon item failed');
  }
});

/** GET /api/close/sessions/:periodId/recon-completeness — run completeness gate */
router.get('/sessions/:periodId/recon-completeness', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodId = req.params.periodId ?? '';
    if (!tenantId || !pool || !periodId) {
      res.status(400).json({ error: 'Tenant context and periodId required' });
      return;
    }
    const result = await checkReconCompleteness(pool, tenantId, periodId);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Check recon completeness failed');
  }
});

export default router;
