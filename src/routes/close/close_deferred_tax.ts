/**
 * Deferred tax routes — temporary differences, DTA/DTL, valuation allowance, rate changes.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { guardSessionWritable } from '../../lib/session_write_guard.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listDeferredTaxItems,
  getDeferredTaxItem,
  createDeferredTaxItem,
  updateDeferredTaxItem,
  deleteDeferredTaxItem,
  calculateDeferredTax,
  assessValuationAllowance,
  calculateRateChangeImpact,
  listValuationAllowances,
  listRateChanges,
} from '../../services/deferred_tax_service.js';

const router = Router();

/** GET /sessions/:sessionId/deferred-tax/items — List deferred tax items. */
router.get('/sessions/:sessionId/deferred-tax/items', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const session = await getCloseSessionById(pool, tenantId, req.params.sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const items = await listDeferredTaxItems(tenantId, pool, periodLabel);
    res.json({ items });
  } catch (e) {
    send500(res, e, 'List deferred tax items failed');
  }
});

/** GET /sessions/:sessionId/deferred-tax/items/:id — Get single deferred tax item. */
router.get('/sessions/:sessionId/deferred-tax/items/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const item = await getDeferredTaxItem(tenantId, pool, req.params.id!);
    if (!item) {
      res.status(404).json({ error: 'Deferred tax item not found' });
      return;
    }
    res.json({ item });
  } catch (e) {
    send500(res, e, 'Get deferred tax item failed');
  }
});

/** POST /sessions/:sessionId/deferred-tax/items — Create a deferred tax item. */
router.post('/sessions/:sessionId/deferred-tax/items', async (req: Request, res: Response) => {
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

    const body = req.body;
    if (!body.description) {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const item = await createDeferredTaxItem(tenantId, pool, { ...body, periodLabel });
    res.status(201).json({ item });
  } catch (e) {
    send500(res, e, 'Create deferred tax item failed');
  }
});

/** PUT /sessions/:sessionId/deferred-tax/items/:id — Update a deferred tax item. */
router.put('/sessions/:sessionId/deferred-tax/items/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const item = await updateDeferredTaxItem(tenantId, pool, id!, req.body);
    if (!item) {
      res.status(404).json({ error: 'Deferred tax item not found' });
      return;
    }
    res.json({ item });
  } catch (e) {
    send500(res, e, 'Update deferred tax item failed');
  }
});

/** DELETE /sessions/:sessionId/deferred-tax/items/:id — Delete a deferred tax item. */
router.delete('/sessions/:sessionId/deferred-tax/items/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId, id } = req.params;
    if (!await guardSessionWritable(res, pool, tenantId, sessionId!)) return;

    const deleted = await deleteDeferredTaxItem(tenantId, pool, id!);
    if (!deleted) {
      res.status(404).json({ error: 'Deferred tax item not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    send500(res, e, 'Delete deferred tax item failed');
  }
});

/** POST /sessions/:sessionId/deferred-tax/calculate — Calculate deferred tax position. */
router.post('/sessions/:sessionId/deferred-tax/calculate', async (req: Request, res: Response) => {
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

    const { taxRate } = req.body;
    if (taxRate == null || typeof taxRate !== 'number') {
      res.status(400).json({ error: 'taxRate (number) is required' });
      return;
    }

    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const result = await calculateDeferredTax(tenantId, pool, periodLabel, taxRate);
    res.json({ result });
  } catch (e) {
    send500(res, e, 'Calculate deferred tax failed');
  }
});

/** POST /sessions/:sessionId/deferred-tax/valuation-allowance — Assess valuation allowance. */
router.post('/sessions/:sessionId/deferred-tax/valuation-allowance', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const session = await getCloseSessionById(pool, tenantId, req.params.sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const { deferredTaxAssetGross, evidence } = req.body;
    if (deferredTaxAssetGross == null || !evidence) {
      res.status(400).json({ error: 'deferredTaxAssetGross and evidence are required' });
      return;
    }

    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const result = await assessValuationAllowance(tenantId, pool, periodLabel, deferredTaxAssetGross, evidence);
    res.json({ result });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Insufficient evidence')) {
      res.status(400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Assess valuation allowance failed');
  }
});

/** POST /sessions/:sessionId/deferred-tax/rate-change-impact — Calculate rate change impact (stateless). */
router.post('/sessions/:sessionId/deferred-tax/rate-change-impact', async (req: Request, res: Response) => {
  try {
    const { deferredTaxAssetGross, deferredTaxLiabilityGross, oldRate, newRate } = req.body;
    if (deferredTaxAssetGross == null || deferredTaxLiabilityGross == null || oldRate == null || newRate == null) {
      res.status(400).json({ error: 'deferredTaxAssetGross, deferredTaxLiabilityGross, oldRate, and newRate are required' });
      return;
    }
    const result = calculateRateChangeImpact(deferredTaxAssetGross, deferredTaxLiabilityGross, oldRate, newRate);
    res.json({ result });
  } catch (e) {
    send500(res, e, 'Calculate rate change impact failed');
  }
});

/** GET /sessions/:sessionId/deferred-tax/valuation-allowances — List valuation allowances. */
router.get('/sessions/:sessionId/deferred-tax/valuation-allowances', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const session = await getCloseSessionById(pool, tenantId, req.params.sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const allowances = await listValuationAllowances(tenantId, pool, periodLabel);
    res.json({ allowances });
  } catch (e) {
    send500(res, e, 'List valuation allowances failed');
  }
});

/** GET /sessions/:sessionId/deferred-tax/rate-changes — List rate changes. */
router.get('/sessions/:sessionId/deferred-tax/rate-changes', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const rateChanges = await listRateChanges(tenantId, pool);
    res.json({ rateChanges });
  } catch (e) {
    send500(res, e, 'List rate changes failed');
  }
});

export default router;
