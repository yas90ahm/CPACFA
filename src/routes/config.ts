/**
 * Configuration routes — tenant materiality and other overrides.
 * Mounted at /api/config.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  getEffectiveMateriality,
  type MaterialityValues,
} from '../services/materiality_config_service.js';
import * as tenantConfigRepo from '../db/repositories/tenant_financial_config_repository.js';
import { send500 } from '../lib/errorHandler.js';

const router = Router();

/** GET /api/config/materiality — view effective materiality (tenant override + defaults) */
router.get('/materiality', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({
        error: 'Tenant context required',
        message: 'Authenticate with tenant context to view materiality config.',
      });
      return;
    }
    const effective = await getEffectiveMateriality(pool, tenantId);
    const tenantOverride = await tenantConfigRepo.getTenantMateriality(pool, tenantId);
    res.status(200).json({
      effective,
      tenantOverride: tenantOverride ?? null,
    });
  } catch (err) {
    send500(res, err as Error, 'Get materiality config failed');
  }
});

/** PUT /api/config/materiality — update tenant materiality override */
router.put('/materiality', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({
        error: 'Tenant context required',
        message: 'Authenticate with tenant context to update materiality config.',
      });
      return;
    }
    const body = req.body as Partial<MaterialityValues>;
    const absoluteThreshold =
      typeof body.absoluteThreshold === 'number' ? body.absoluteThreshold : undefined;
    const relativeThreshold =
      typeof body.relativeThreshold === 'number' ? body.relativeThreshold : undefined;

    if (absoluteThreshold != null && absoluteThreshold <= 0) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'absoluteThreshold must be greater than 0.',
      });
      return;
    }
    if (relativeThreshold != null && (relativeThreshold < 0 || relativeThreshold > 1)) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'relativeThreshold must be between 0 and 1.',
      });
      return;
    }

    const config = {
      absoluteThreshold,
      relativeThreshold,
      roundingToleranceCents:
        typeof body.roundingToleranceCents === 'number'
          ? body.roundingToleranceCents
          : undefined,
      defaultThreshold:
        typeof body.defaultThreshold === 'number' ? body.defaultThreshold : undefined,
    };
    await tenantConfigRepo.upsertTenantMateriality(pool, tenantId, config);
    const effective = await getEffectiveMateriality(pool, tenantId);
    res.status(200).json({ effective });
  } catch (err) {
    send500(res, err as Error, 'Update materiality config failed');
  }
});

export default router;
