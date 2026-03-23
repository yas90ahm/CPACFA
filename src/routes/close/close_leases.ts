/**
 * Lease Accounting routes — ASC 842.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listLeases,
  createLease,
  updateLease,
  generatePaymentSchedule,
  getPaymentSchedule,
  proposePeriodEntries,
  processModification,
  getASC842Disclosure,
  listPeriodEntries,
} from '../../services/lease_accounting_service.js';

const router = Router();

/** GET /sessions/:sessionId/leases — List all leases for tenant. */
router.get('/sessions/:sessionId/leases', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const leases = await listLeases(pool, tenantId);
    const entries = await listPeriodEntries(pool, tenantId, req.params.sessionId!);
    res.json({ leases, periodEntries: entries });
  } catch (e) {
    send500(res, e, 'List leases failed');
  }
});

/** POST /entities/:entityId/leases — Create a new lease. */
router.post('/entities/:entityId/leases', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const lease = await createLease(pool, tenantId, req.params.entityId!, req.body);
    res.status(201).json({ lease });
  } catch (e) {
    send500(res, e, 'Create lease failed');
  }
});

/** PUT /leases/:leaseId — Update lease metadata. */
router.put('/leases/:leaseId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const lease = await updateLease(pool, tenantId, req.params.leaseId!, req.body);
    if (!lease) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }
    res.json({ lease });
  } catch (e) {
    send500(res, e, 'Update lease failed');
  }
});

/** POST /leases/:leaseId/generate-schedule — Generate payment schedule. */
router.post('/leases/:leaseId/generate-schedule', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const schedule = await generatePaymentSchedule(pool, tenantId, req.params.leaseId!);
    res.status(201).json({ schedule });
  } catch (e) {
    send500(res, e, 'Generate payment schedule failed');
  }
});

/** POST /leases/:leaseId/modifications — Process a lease modification. */
router.post('/leases/:leaseId/modifications', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { closeSessionId, ...modification } = req.body;
    if (!closeSessionId) {
      res.status(400).json({ error: 'closeSessionId is required' });
      return;
    }
    const result = await processModification(pool, tenantId, req.params.leaseId!, closeSessionId, modification);
    res.status(201).json({ modification: result });
  } catch (e) {
    send500(res, e, 'Process lease modification failed');
  }
});

/** POST /sessions/:sessionId/leases/propose-entries — Propose period entries for all active leases. */
router.post('/sessions/:sessionId/leases/propose-entries', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const session = await getCloseSessionById(pool, tenantId, sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const { entityId } = req.body;
    if (!entityId) {
      res.status(400).json({ error: 'entityId is required' });
      return;
    }

    const entries = await proposePeriodEntries(
      pool, tenantId, entityId, sessionId!,
      String(session.periodStart), String(session.periodEnd)
    );
    res.status(201).json({ entries });
  } catch (e) {
    send500(res, e, 'Propose lease period entries failed');
  }
});

/** GET /sessions/:sessionId/leases/disclosure — Get ASC 842 disclosure summary. */
router.get('/sessions/:sessionId/leases/disclosure', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const entityId = req.query.entityId as string;
    if (!entityId) {
      res.status(400).json({ error: 'entityId query parameter is required' });
      return;
    }
    const disclosure = await getASC842Disclosure(pool, tenantId, entityId, req.params.sessionId!);
    res.json({ disclosure });
  } catch (e) {
    send500(res, e, 'Get lease disclosure failed');
  }
});

export default router;
