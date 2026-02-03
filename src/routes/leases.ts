/**
 * Leases API — ASC 842 / IFRS 16: lease register, schedule, position, agentic.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createLease,
  getLease,
  listLeases,
  updateLease,
  deleteLease,
  generateAndPersistSchedule,
  getLeaseSchedule,
  getLeasePosition,
} from '../services/lease_service.js';
import {
  suggestLeaseClassificationAgentic,
  suggestDiscountRateAgentic,
  generateLeaseFootnoteAgentic,
} from '../services/agentic_lease.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest.js';
import { resolveLeaseStandard } from '../constants/accounting/index.js';
import {
  createLeaseSchema,
  updateLeaseSchema,
  periodQuerySchema,
  suggestClassificationSchema,
  suggestDiscountRateSchema,
  leaseIdParamSchema,
  generateFootnoteSchema,
} from '../schemas/leaseSchemas.js';

const router = Router();

/** POST /api/leases — Create lease */
router.post('/', validateBody(createLeaseSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as { standard?: 'asc842' | 'ifrs16'; accountingStandard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP'; [k: string]: unknown };
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const resolvedStandard = resolveLeaseStandard(body.standard, body.accountingStandard);
    if (!resolvedStandard) {
      res.status(400).json({ error: 'Either standard (asc842/ifrs16) or accountingStandard is required' });
      return;
    }
    const { accountingStandard: _ac, ...rest } = body;
    const payload = { ...rest, standard: resolvedStandard } as Parameters<typeof createLease>[2];
    const lease = await createLease(tenantId, pool, payload);
    res.status(201).json(lease);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create lease failed', message });
  }
});

/** GET /api/leases — List leases */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const leases = await listLeases(tenantId, pool);
    res.json({ leases });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List leases failed', message });
  }
});

/** GET /api/leases/position — Get ROU asset and lease liability for period */
router.get('/position', validateQuery(periodQuerySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodLabel = req.query.periodLabel as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const position = await getLeasePosition(tenantId, pool, periodLabel);
    res.json(position);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get lease position failed', message });
  }
});

/** POST /api/leases/suggest-classification — Agentic: suggest operating vs finance */
router.post('/suggest-classification', validateBody(suggestClassificationSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { termMonths: number; pvOfPayments: number; fairValueOfAsset?: number; standard?: 'asc842' | 'ifrs16'; accountingStandard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP' };
    const resolvedStandard = resolveLeaseStandard(body.standard, body.accountingStandard);
    if (!resolvedStandard) {
      res.status(400).json({ error: 'Either standard or accountingStandard is required' });
      return;
    }
    const result = await suggestLeaseClassificationAgentic({ ...body, standard: resolvedStandard });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest classification failed', message });
  }
});

/** POST /api/leases/suggest-discount-rate — Agentic: suggest IBR */
router.post('/suggest-discount-rate', validateBody(suggestDiscountRateSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await suggestDiscountRateAgentic(body);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest discount rate failed', message });
  }
});

/** GET /api/leases/:id — Get lease */
router.get('/:id', validateParams(leaseIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const lease = await getLease(tenantId, pool, id);
    if (!lease) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }
    res.json(lease);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get lease failed', message });
  }
});

/** PATCH /api/leases/:id — Update lease */
router.patch('/:id', validateParams(leaseIdParamSchema), validateBody(updateLeaseSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    const body = req.body as { standard?: 'asc842' | 'ifrs16'; accountingStandard?: 'ASPE' | 'IFRS' | 'FRS102' | 'US_GAAP'; [k: string]: unknown };
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const resolvedStandard = body.standard ?? (body.accountingStandard ? resolveLeaseStandard(undefined, body.accountingStandard) : undefined);
    const { accountingStandard: _ac, ...patch } = body;
    const patchWithStandard = resolvedStandard != null ? { ...patch, standard: resolvedStandard } : patch;
    const lease = await updateLease(tenantId, pool, id, patchWithStandard);
    if (!lease) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }
    res.json(lease);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Update lease failed', message });
  }
});

/** DELETE /api/leases/:id — Delete lease */
router.delete('/:id', validateParams(leaseIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const deleted = await deleteLease(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete lease failed', message });
  }
});

/** POST /api/leases/:id/schedule — Generate and persist amortization schedule */
router.post('/:id/schedule', validateParams(leaseIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const schedule = await generateAndPersistSchedule(tenantId, pool, id);
    res.status(201).json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate schedule failed', message });
  }
});

/** GET /api/leases/:id/schedule — Get amortization schedule */
router.get('/:id/schedule', validateParams(leaseIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const schedule = await getLeaseSchedule(tenantId, pool, id);
    res.json({ schedule });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get schedule failed', message });
  }
});

/** POST /api/leases/:id/footnote — Agentic: generate lease footnote */
router.post('/:id/footnote', validateParams(leaseIdParamSchema), validateBody(generateFootnoteSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    const periodLabel = (req.body as { periodLabel?: string }).periodLabel;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const lease = await getLease(tenantId, pool, id);
    if (!lease) {
      res.status(404).json({ error: 'Lease not found' });
      return;
    }
    const position = periodLabel ? await getLeasePosition(tenantId, pool, periodLabel) : { totalRouAsset: 0, totalLeaseLiability: 0 };
    const leases = await listLeases(tenantId, pool);
    const result = await generateLeaseFootnoteAgentic({
      totalRouAsset: position.totalRouAsset,
      totalLeaseLiability: position.totalLeaseLiability,
      leaseCount: leases.length,
      standard: lease.standard,
      periodLabel,
    });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Generate footnote failed', message });
  }
});

export default router;
