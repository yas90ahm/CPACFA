/**
 * Audit engagements routes: engagements CRUD, periods, close-status, audit-file.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  createEngagement,
  listEngagements,
  getEngagement,
  updateEngagement,
  deleteEngagement,
  addPeriodToEngagement,
  removePeriodFromEngagement,
  listPeriodsForEngagement,
  getCloseStatusForEngagement,
  getAuditFileForEngagement,
} from '../../services/audit_engagement_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { createEngagementBodySchema, updateEngagementBodySchema, addPeriodToEngagementBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/engagements */
router.get('/engagements', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const list = await listEngagements(tenantId, pool);
    res.json(list);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** POST /api/audit/engagements */
router.post('/engagements', validateBody(createEngagementBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const body = req.body;
    const name = body.name ?? 'New engagement';
    const engagement = await createEngagement(tenantId, pool, name, body.status ?? 'draft');
    res.status(201).json(engagement);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** GET /api/audit/engagements/:id */
router.get('/engagements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const engagement = await getEngagement(tenantId, pool, id);
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(engagement);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** PATCH /api/audit/engagements/:id */
router.patch('/engagements/:id', validateBody(updateEngagementBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const engagement = await updateEngagement(tenantId, pool, id, body);
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(engagement);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** DELETE /api/audit/engagements/:id */
router.delete('/engagements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const deleted = await deleteEngagement(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** GET /api/audit/engagements/:id/periods */
router.get('/engagements/:id/periods', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const periods = await listPeriodsForEngagement(tenantId, pool, id);
    res.json(periods);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** POST /api/audit/engagements/:id/periods */
router.post('/engagements/:id/periods', validateBody(addPeriodToEngagementBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const period = await addPeriodToEngagement(tenantId, pool, id, body.periodLabel, body.sortOrder ?? 0);
    if (!period) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.status(201).json(period);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** DELETE /api/audit/engagements/:id/periods/:periodLabel */
router.delete('/engagements/:id/periods/:periodLabel', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const periodLabel = req.params.periodLabel ?? '';
    if (!tenantId || !pool || !id || !periodLabel) {
      res.status(400).json({ error: 'Tenant context, engagement id, and periodLabel required' });
      return;
    }
    const removed = await removePeriodFromEngagement(tenantId, pool, id, periodLabel);
    if (!removed) {
      res.status(404).json({ error: 'Engagement or period not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** GET /api/audit/engagements/:id/close-status */
router.get('/engagements/:id/close-status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const result = await getCloseStatusForEngagement(tenantId, pool, id);
    if (!result) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

/** GET /api/audit/engagements/:id/audit-file */
router.get('/engagements/:id/audit-file', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const result = await getAuditFileForEngagement(tenantId, pool, id);
    if (!result) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    handleAuditError(res, err, 'Engagements error');
  }
});

export default router;
