/**
 * Close adjustments routes: adjustments GET, from-je, from-accruals, PATCH :id (uses close_adjustment_update_service).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  listAdjustments,
  addJEAsAdjustments,
  addAccrualsAsAdjustments,
} from '../../services/close_adjustments_service.js';
import { updateCloseAdjustmentStatus } from '../../services/close_adjustment_update_service.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();

/** GET /api/close/adjustments */
router.get('/adjustments', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | 'posted' | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listAdjustments({ periodLabel, status }, tenantId ?? undefined, pool);
    res.json({ adjustments: list });
  } catch (e) {
    send500(res, e, 'List adjustments failed');
  }
});

/** POST /api/close/adjustments/from-je */
router.post('/adjustments/from-je', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; suggestions: import('../../types/close_and_controls.js').JournalEntrySuggestion[] };
    if (!body?.periodLabel || !Array.isArray(body?.suggestions)) {
      res.status(400).json({ error: 'Missing periodLabel or suggestions array' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const added = await addJEAsAdjustments(body.periodLabel, body.suggestions, tenantId ?? undefined, pool);
    res.status(201).json({ added, count: added.length });
  } catch (e) {
    send500(res, e, 'Add JE adjustments failed');
  }
});

/** POST /api/close/adjustments/from-accruals */
router.post('/adjustments/from-accruals', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; suggestions: import('../../types/accrual_deferral.js').AccrualSuggestion[] };
    if (!body?.periodLabel || !Array.isArray(body?.suggestions)) {
      res.status(400).json({ error: 'Missing periodLabel or suggestions array' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const added = await addAccrualsAsAdjustments(body.periodLabel, body.suggestions, tenantId ?? undefined, pool);
    res.status(201).json({ added, count: added.length });
  } catch (e) {
    send500(res, e, 'Add accrual adjustments failed');
  }
});

/** PATCH /api/close/adjustments/:id */
router.patch('/adjustments/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as {
      status: import('../../types/close_and_controls.js').CloseAdjustmentStatus;
      approvedBy?: string;
      connectionId?: string;
    };
    if (!id || !body?.status) {
      res.status(400).json({ error: 'Missing adjustment id or status' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    const actorUserId = (req as AuthRequest).userId;
    const result = await updateCloseAdjustmentStatus({
      id,
      status: body.status,
      approvedBy: body.approvedBy,
      connectionId: body.connectionId,
      tenantId,
      pool,
      actorRole,
      actorUserId,
    });
    if ('updated' in result) {
      return res.json(result.updated);
    }
    if (result.statusCode === 403 && result.periodLabel) {
      return res.status(403).json({ error: result.error, periodLabel: result.periodLabel });
    }
    if (result.statusCode === 400 && result.approvalRequestId !== undefined) {
      return res.status(400).json({
        error: result.error,
        message: `Approve via PATCH /api/approvals/requests/${result.approvalRequestId} with body: { action: "approved", actor?: "userId" }`,
        approvalRequestId: result.approvalRequestId,
      });
    }
    if (result.statusCode === 400 && result.error === 'Approval workflow required') {
      return res.status(400).json({
        error: result.error,
        message: `Submit for approval first via POST /api/approvals/submit with body: { resourceType: "close_adjustment", resourceId: "${id}" }`,
      });
    }
    if (result.statusCode === 502 && result.errors) {
      return res.status(502).json({
        error: result.error,
        message: result.errors?.join(' ') ?? 'Unknown error',
        errors: result.errors,
      });
    }
    res.status(result.statusCode).json({ error: result.error, ...(result.errors && { errors: result.errors }) });
  } catch (e) {
    send500(res, e, 'Update adjustment failed');
  }
});

export default router;
