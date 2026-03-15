/**
 * Audit data access routes (GAP I8).
 * Mounted at /api/close.
 *
 * Endpoints:
 * - GET /sessions/:sessionId/audit/sample?accountCode=X&sampleSize=25
 * - GET /sessions/:sessionId/audit/binder
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getAuditSample, getAuditBinder } from '../../services/audit_data_access_service.js';

const router = Router();

/** GET /sessions/:sessionId/audit/sample — random GL entry sample for substantive testing */
router.get('/sessions/:sessionId/audit/sample', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const sessionId = req.params.sessionId ?? '';
    if (!tenantId || !pool || !sessionId) {
      res.status(400).json({ error: 'Tenant context and sessionId required' });
      return;
    }

    const accountCode = (req.query.accountCode as string) ?? '';
    if (!accountCode) {
      res.status(400).json({ error: 'accountCode query parameter is required' });
      return;
    }

    const sampleSize = Math.min(
      500,
      Math.max(1, parseInt(String(req.query.sampleSize), 10) || 25)
    );

    const sample = await getAuditSample(pool, tenantId, sessionId, accountCode, sampleSize);
    res.json({
      sessionId,
      accountCode,
      requestedSize: sampleSize,
      actualSize: sample.length,
      sample,
    });
  } catch (e) {
    send500(res, e, 'Audit sample failed');
  }
});

/** GET /sessions/:sessionId/audit/binder — comprehensive audit binder compilation */
router.get('/sessions/:sessionId/audit/binder', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const sessionId = req.params.sessionId ?? '';
    if (!tenantId || !pool || !sessionId) {
      res.status(400).json({ error: 'Tenant context and sessionId required' });
      return;
    }

    const binder = await getAuditBinder(pool, tenantId, sessionId);
    res.json(binder);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
      return;
    }
    send500(res, e, 'Audit binder failed');
  }
});

export default router;
