/**
 * Audit DRL (document request list) routes: drl POST/GET, drl/:id PATCH, drl/:id/fulfill.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  addDocumentRequest,
  updateDocumentRequest,
  listDocumentRequests,
  fulfillDocumentRequest,
} from '../../services/drl_service.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { createDRLBodySchema, updateDRLBodySchema, fulfillDRLBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** POST /api/audit/drl */
router.post('/drl', validateBody(createDRLBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { requestLabel: string; documentId?: string; status?: 'pending' | 'fulfilled' | 'partial' };
    const entry = await addDocumentRequest(body, getTenantPool(req), getTenantId(req));
    res.status(201).json(entry);
  } catch (err) {
    handleAuditError(res, err, 'DRL error');
  }
});

/** GET /api/audit/drl */
router.get('/drl', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'pending' | 'in_progress' | 'fulfilled' | 'partial' | undefined;
    const list = await listDocumentRequests(status, getTenantPool(req), getTenantId(req));
    res.json({ requests: list });
  } catch (err) {
    handleAuditError(res, err, 'DRL error');
  }
});

/** PATCH /api/audit/drl/:id */
router.patch('/drl/:id', validateBody(updateDRLBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { assignee?: string; dueDate?: string; status?: 'pending' | 'in_progress' | 'fulfilled' | 'partial' };
    const updated = await updateDocumentRequest(req.params.id, body, getTenantPool(req), getTenantId(req));
    if (!updated) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    handleAuditError(res, err, 'DRL error');
  }
});

/** POST /api/audit/drl/:id/fulfill */
router.post('/drl/:id/fulfill', validateBody(fulfillDRLBodySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { documentId: string };
    const entry = await fulfillDocumentRequest(req.params.id, body.documentId, getTenantPool(req), getTenantId(req));
    if (!entry) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(entry);
  } catch (err) {
    handleAuditError(res, err, 'DRL error');
  }
});

export default router;
