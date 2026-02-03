/**
 * Close reconciliation routes: reconciliation-resolution POST/GET, PATCH :id.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  createReconciliationResolution,
  listReconciliationResolutions,
  updateReconciliationResolution,
  type CreateReconciliationResolutionInput,
} from '../../services/reconciliation_resolution_service.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

/** POST /api/close/reconciliation-resolution */
router.post('/reconciliation-resolution', async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateReconciliationResolutionInput;
    if (!body?.periodLabel || body?.reconciliationType == null || body?.passed == null) {
      res.status(400).json({ error: 'Missing periodLabel, reconciliationType, or passed' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const resolution = await createReconciliationResolution(body, tenantId ?? undefined, pool);
    res.status(201).json(resolution);
  } catch (e) {
    send500(res, e, 'Create reconciliation resolution failed');
  }
});

/** GET /api/close/reconciliation-resolutions */
router.get('/reconciliation-resolutions', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const status = req.query.status as 'open' | 'in_progress' | 'resolved' | 're_run_pending' | 'waived' | undefined;
    const reconciliationType = req.query.reconciliationType as 'trial_balance' | 'balance_sheet_equation' | 'bank_reconciliation' | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listReconciliationResolutions(
      { periodLabel, status, reconciliationType, limit },
      tenantId ?? undefined,
      pool
    );
    res.json({ resolutions: list });
  } catch (e) {
    send500(res, e, 'List reconciliation resolutions failed');
  }
});

/** PATCH /api/close/reconciliation-resolution/:id */
router.patch('/reconciliation-resolution/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as { assignee?: string; dueDate?: string; status?: 'open' | 'in_progress' | 'resolved' | 're_run_pending' | 'waived'; resolvedBy?: string; waivedBy?: string; waivedReason?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing resolution id' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const updated = await updateReconciliationResolution(
      id,
      {
        assignee: body.assignee,
        dueDate: body.dueDate,
        status: body.status,
        resolvedBy: body.resolvedBy,
        waivedBy: body.waivedBy,
        waivedReason: body.waivedReason,
      },
      tenantId ?? undefined,
      pool
    );
    if (!updated) {
      res.status(404).json({ error: 'Resolution not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update reconciliation resolution failed');
  }
});

export default router;
