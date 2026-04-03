/**
 * Audit PBC (provided by client) routes: pbc GET/POST, pbc/:id PATCH.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { addPBCItem, listPBCItems, updatePBCItem } from '../../services/pbc_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { createPBCBodySchema, updatePBCBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/pbc */
router.get('/pbc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const status = req.query.status as 'pending' | 'provided' | 'partial' | undefined;
    const periodLabel = req.query.periodLabel as string | undefined;
    const items = await listPBCItems({ status, periodLabel }, pool, tenantId);
    res.json({ items });
  } catch (err) {
    handleAuditError(res, err, 'PBC error');
  }
});

/** POST /api/audit/pbc */
router.post('/pbc', validateBody(createPBCBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const body = req.body as { label: string; description?: string; periodLabel?: string };
    const item = await addPBCItem({
      label: body.label,
      description: body.description,
      periodLabel: body.periodLabel,
      status: 'pending',
    }, pool, tenantId);
    res.status(201).json(item);
  } catch (err) {
    handleAuditError(res, err, 'PBC error');
  }
});

/** PATCH /api/audit/pbc/:id */
router.patch('/pbc/:id', validateBody(updatePBCBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body as { status?: 'pending' | 'provided' | 'partial'; providedAt?: string; documentId?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing PBC id' });
      return;
    }
    const updated = await updatePBCItem(id, body, pool, tenantId);
    if (!updated) {
      res.status(404).json({ error: 'PBC item not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    handleAuditError(res, err, 'PBC error');
  }
});

export default router;
