/**
 * Subsequent Events routes (ASC 855).
 * Mounted at /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { canPerform } from '../../services/segregation_service.js';
import {
  createEvent,
  listEvents,
  updateEventDisposition,
} from '../../services/subsequent_event_service.js';
import {
  advanceToSubsequentEventsReview,
  confirmNoSubsequentEvents,
} from '../../services/close_session_service.js';
import type { SubsequentEventDisposition } from '../../types/subsequent_event.js';

const router = Router();

/** GET /api/close/sessions/:id/subsequent-events */
router.get('/sessions/:id/subsequent-events', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const sessionId = req.params.id ?? '';
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const events = await listEvents(pool, tenantId, sessionId);
    res.json(events);
  } catch (e) {
    send500(res, e, 'List subsequent events failed');
  }
});

/** POST /api/close/sessions/:id/subsequent-events */
router.post('/sessions/:id/subsequent-events', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const sessionId = req.params.id ?? '';
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const actorRole = getCloseRoleFromReq(authReq);
    if (!canPerform(actorRole, 'variance_confirm')) {
      res.status(403).json({ error: 'Insufficient role: creating subsequent events requires reviewer' });
      return;
    }
    const { eventDate, description, impactAssessment } = req.body as {
      eventDate?: string;
      description?: string;
      impactAssessment?: string;
    };
    if (!eventDate || !description) {
      res.status(400).json({ error: 'eventDate and description are required' });
      return;
    }
    const event = await createEvent(pool, {
      tenantId,
      closeSessionId: sessionId,
      eventDate,
      description,
      impactAssessment,
      createdBy: authReq.userId ?? 'api',
    });
    res.status(201).json(event);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'VALIDATION') {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    send500(res, e, 'Create subsequent event failed');
  }
});

/** PUT /api/close/subsequent-events/:eventId */
router.put('/subsequent-events/:eventId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const eventId = req.params.eventId ?? '';
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const actorRole = getCloseRoleFromReq(authReq);
    if (!canPerform(actorRole, 'period_lock')) {
      res.status(403).json({ error: 'Insufficient role: setting disposition requires approver' });
      return;
    }
    const { disposition, impactAssessment } = req.body as {
      disposition?: SubsequentEventDisposition;
      impactAssessment?: string;
    };
    if (!disposition) {
      res.status(400).json({ error: 'disposition is required' });
      return;
    }
    const event = await updateEventDisposition(pool, tenantId, eventId, {
      disposition,
      impactAssessment,
      reviewedBy: authReq.userId ?? 'api',
    });
    res.json(event);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'NOT_FOUND') {
      res.status(404).json({ error: (e as Error).message });
      return;
    }
    send500(res, e, 'Update subsequent event disposition failed');
  }
});

/** POST /api/close/sessions/:id/advance-to-subsequent-events-review */
router.post('/sessions/:id/advance-to-subsequent-events-review', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const sessionId = req.params.id ?? '';
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const actorRole = getCloseRoleFromReq(authReq);
    const session = await advanceToSubsequentEventsReview(
      pool, sessionId, tenantId, authReq.userId ?? 'api', actorRole
    );
    res.json(session);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'INSUFFICIENT_ROLE') {
      res.status(403).json({ error: (e as Error).message });
      return;
    }
    if ((e as { code?: string }).code === 'INVALID_TRANSITION') {
      res.status(409).json({ error: (e as Error).message });
      return;
    }
    send500(res, e, 'Advance to subsequent events review failed');
  }
});

/** POST /api/close/sessions/:id/confirm-no-subsequent-events */
router.post('/sessions/:id/confirm-no-subsequent-events', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const sessionId = req.params.id ?? '';
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const authReq = req as AuthRequest;
    const actorRole = getCloseRoleFromReq(authReq);
    const session = await confirmNoSubsequentEvents(
      pool, sessionId, tenantId, authReq.userId ?? 'api', actorRole
    );
    res.json(session);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'INSUFFICIENT_ROLE') {
      res.status(403).json({ error: (e as Error).message });
      return;
    }
    if ((e as { code?: string }).code === 'INVALID_TRANSITION') {
      res.status(409).json({ error: (e as Error).message });
      return;
    }
    send500(res, e, 'Confirm no subsequent events failed');
  }
});

export default router;
