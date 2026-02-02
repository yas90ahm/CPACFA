/**
 * Fixed assets API — PP&E register, depreciation run, agentic suggestions and footnote.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createFixedAsset,
  getFixedAsset,
  listFixedAssets,
  updateFixedAsset,
  deleteFixedAsset,
  runDepreciation,
  getDepreciationSummary,
} from '../services/fixed_asset_service.js';
import {
  suggestUsefulLifeAgentic,
  suggestDepreciationMethodAgentic,
  generateDepreciationFootnoteAgentic,
} from '../services/agentic_fixed_asset.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validateRequest.js';
import {
  createFixedAssetSchema,
  updateFixedAssetSchema,
  periodQuerySchema,
  runDepreciationSchema,
  suggestUsefulLifeSchema,
  suggestMethodSchema,
  generateFootnoteSchema,
  fixedAssetIdParamSchema,
} from '../schemas/fixedAssetSchemas.js';

const router = Router();

/** POST /api/fixed-assets — Create fixed asset */
router.post('/', validateBody(createFixedAssetSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const asset = await createFixedAsset(tenantId, pool, {
      ...body,
      residualValue: body.residualValue ?? 0,
    });
    res.status(201).json(asset);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create fixed asset failed', message });
  }
});

/** GET /api/fixed-assets — List fixed assets */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const assets = await listFixedAssets(tenantId, pool);
    res.json({ assets });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List fixed assets failed', message });
  }
});

/** POST /api/fixed-assets/depreciation/run — Run depreciation for period */
router.post(
  '/depreciation/run',
  validateBody(runDepreciationSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const { periodLabel, periodStart, periodEnd } = req.body;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const { run, details } = await runDepreciation(
        tenantId,
        pool,
        periodLabel,
        periodStart,
        periodEnd
      );
      res.status(201).json({ run, details });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Run depreciation failed', message });
    }
  }
);

/** GET /api/fixed-assets/depreciation — Get depreciation by period */
router.get(
  '/depreciation',
  validateQuery(periodQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const periodLabel = req.query.periodLabel as string;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const summary = await getDepreciationSummary(tenantId, pool, periodLabel);
      if (!summary) {
        res.status(404).json({ error: 'No depreciation run for period', periodLabel });
        return;
      }
      res.json(summary);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Get depreciation failed', message });
    }
  }
);

/** POST /api/fixed-assets/suggest-useful-life — Agentic: suggest useful life and residual */
router.post(
  '/suggest-useful-life',
  validateBody(suggestUsefulLifeSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await suggestUsefulLifeAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest useful life failed', message });
    }
  }
);

/** POST /api/fixed-assets/suggest-method — Agentic: suggest depreciation method */
router.post(
  '/suggest-method',
  validateBody(suggestMethodSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await suggestDepreciationMethodAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Suggest method failed', message });
    }
  }
);

/** POST /api/fixed-assets/footnote — Agentic: generate depreciation footnote */
router.post(
  '/footnote',
  validateBody(generateFootnoteSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await generateDepreciationFootnoteAgentic(req.body);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Generate footnote failed', message });
    }
  }
);

/** GET /api/fixed-assets/:id — Get fixed asset */
router.get('/:id', validateParams(fixedAssetIdParamSchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id as string;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const asset = await getFixedAsset(tenantId, pool, id);
    if (!asset) {
      res.status(404).json({ error: 'Fixed asset not found', id });
      return;
    }
    res.json(asset);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get fixed asset failed', message });
  }
});

/** PATCH /api/fixed-assets/:id — Update fixed asset */
router.patch(
  '/:id',
  validateParams(fixedAssetIdParamSchema),
  validateBody(updateFixedAssetSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const id = req.params.id as string;
      const patch = req.body;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const updated = await updateFixedAsset(tenantId, pool, id, patch);
      if (!updated) {
        res.status(404).json({ error: 'Fixed asset not found', id });
        return;
      }
      res.json(updated);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Update fixed asset failed', message });
    }
  }
);

/** DELETE /api/fixed-assets/:id — Delete fixed asset */
router.delete(
  '/:id',
  validateParams(fixedAssetIdParamSchema),
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const id = req.params.id as string;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const deleted = await deleteFixedAsset(tenantId, pool, id);
      if (!deleted) {
        res.status(404).json({ error: 'Fixed asset not found', id });
        return;
      }
      res.status(204).send();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: 'Delete fixed asset failed', message });
    }
  }
);

export default router;
