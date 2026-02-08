/**
 * Close adjustments routes: adjustments GET, from-je, from-accruals, PATCH :id.
 * All mutations route through executeBridgeCommand (lock assertion, audit ledger).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { listAdjustments } from '../../services/close_adjustments_service.js';
import { executeBridgeCommand } from '../../bridge/index.js';
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
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await executeBridgeCommand(
      {
        pool,
        tenantId,
        actor: (req as AuthRequest).userId ?? 'anonymous',
        actorRole: getCloseRoleFromReq(req as AuthRequest),
      },
      {
        commandType: 'CreateCloseAdjustmentsFromJE',
        periodLabel: body.periodLabel,
        suggestions: body.suggestions,
      }
    );
    if (!result.ok) {
      if (result.code === 'PERIOD_LOCKED') {
        return res.status(409).json({ error: result.error, code: result.code, periodLabel: result.periodLabel });
      }
      return res
        .status(result.statusCode ?? 400)
        .json({ error: result.error, code: result.code, ...(result.errors && { errors: result.errors }) });
    }
    if (result.commandType !== 'CreateCloseAdjustmentsFromJE') throw new Error('Unexpected result');
    res.status(201).json({ added: result.added, count: result.added.length });
  } catch (e: unknown) {
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
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const result = await executeBridgeCommand(
      {
        pool,
        tenantId,
        actor: (req as AuthRequest).userId ?? 'anonymous',
        actorRole: getCloseRoleFromReq(req as AuthRequest),
      },
      {
        commandType: 'CreateCloseAdjustmentsFromAccruals',
        periodLabel: body.periodLabel,
        suggestions: body.suggestions,
      }
    );
    if (!result.ok) {
      if (result.code === 'PERIOD_LOCKED') {
        return res.status(409).json({ error: result.error, code: result.code, periodLabel: result.periodLabel });
      }
      return res
        .status(result.statusCode ?? 400)
        .json({ error: result.error, code: result.code, ...(result.errors && { errors: result.errors }) });
    }
    if (result.commandType !== 'CreateCloseAdjustmentsFromAccruals') throw new Error('Unexpected result');
    res.status(201).json({ added: result.added, count: result.added.length });
  } catch (e: unknown) {
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
    const result = await executeBridgeCommand(
      {
        pool,
        tenantId,
        actor: (req as AuthRequest).userId ?? 'anonymous',
        actorRole: getCloseRoleFromReq(req as AuthRequest),
      },
      {
        commandType: 'UpdateCloseAdjustment',
        adjustmentId: id,
        status: body.status,
        approvedBy: body.approvedBy,
        connectionId: body.connectionId,
      }
    );
    if (result.ok && result.commandType === 'UpdateCloseAdjustment') {
      return res.json(result.updated);
    }
    if (!result.ok) {
      if (result.code === 'PERIOD_LOCKED' || (result.statusCode === 403 && result.periodLabel)) {
        return res.status(409).json({ error: result.error, periodLabel: result.periodLabel });
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
      if (result.statusCode === 501) {
        return res.status(501).json({
          error: result.error,
          message: 'GL post-back is disabled; set ENABLE_GL_POSTBACK=true to enable.',
          ...(result.errors && { errors: result.errors }),
        });
      }
      return res
        .status(result.statusCode ?? 400)
        .json({ error: result.error, ...(result.errors && { errors: result.errors }) });
    }
    send500(res, new Error('Unexpected result'), 'Update adjustment failed');
  } catch (e) {
    send500(res, e, 'Update adjustment failed');
  }
});

export default router;
