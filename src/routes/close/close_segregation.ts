/**
 * Close segregation routes: can-perform, perform-action.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { canPerform, performControlledAction, type ControlledAction } from '../../services/segregation_service.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();

router.post('/can-perform', (req: Request, res: Response) => {
  try {
    const body = req.body as { action: ControlledAction };
    if (!body?.action) {
      res.status(400).json({ error: 'Missing action' });
      return;
    }
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    const allowed = canPerform(actorRole, body.action);
    res.json({ allowed, action: body.action, actorRole });
  } catch (e) {
    send500(res, e, 'Can-perform check failed');
  }
});

router.post('/perform-action', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      action: ControlledAction;
      resource?: string;
      detail?: string;
      payload?: Record<string, unknown>;
    };
    if (!body?.action) {
      res.status(400).json({ error: 'Missing action' });
      return;
    }
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    const actor = (req as Request & { userId?: string }).userId ?? 'unknown';
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req) ?? 'default';
    const context = pool && tenantId ? { pool, tenantId } : undefined;
    const { allowed, auditEntry } = await performControlledAction(
      actor,
      actorRole,
      body.action,
      body.resource,
      body.detail,
      body.payload,
      context
    );
    res.json({ allowed, auditEntry });
  } catch (e) {
    send500(res, e, 'Perform action failed');
  }
});

export default router;
