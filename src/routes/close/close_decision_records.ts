/**
 * Decision records (explainability): list only — append-only, no update/delete.
 * Mounted at /api/close/decision-records.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getDecisionRecord, listDecisionRecords } from '../../services/decision_record_service.js';

const router = Router();

/** GET /api/close/decision-records — list records (query: closeSessionId?, decisionType?, limit?) */
router.get('/decision-records', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.query.closeSessionId as string | undefined;
    const decisionType = req.query.decisionType as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const records = await listDecisionRecords(pool, {
      tenantId,
      closeSessionId: closeSessionId ?? undefined,
      decisionType: decisionType ?? undefined,
      limit: Number.isNaN(limit) ? undefined : limit,
    });
    res.json({ records });
  } catch (e) {
    send500(res, e, 'List decision records failed');
  }
});

/** GET /api/close/decision-records/:id — get one record */
router.get('/decision-records/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const record = await getDecisionRecord(pool, tenantId, id);
    if (!record) {
      res.status(404).json({ error: 'Decision record not found' });
      return;
    }
    res.json(record);
  } catch (e) {
    send500(res, e, 'Get decision record failed');
  }
});

export default router;
