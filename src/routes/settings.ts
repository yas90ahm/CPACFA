/**
 * Settings API: entity general settings, entity list.
 * Mounted at /api/settings.
 * Recon requirements and AJE templates CRUD live under /api/close.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';
import * as entitySettingsService from '../services/entity_settings_service.js';
import { recordMaterialEvent } from '../services/audit_service.js';
import type { AuthRequest } from '../auth/middleware.js';
import settingsTeamRouter from './settings_team.js';

const router = Router();

router.use('/team', settingsTeamRouter);

/** GET /api/settings/general?entityId=X — entity general settings */
router.get('/general', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    const entityId = (req.query.entityId as string) ?? (req as { entityId?: string }).entityId;
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!entityId) {
      res.status(400).json({ error: 'entityId query required' });
      return;
    }
    const settings = await entitySettingsService.getEntitySettings(pool, tenantId, entityId);
    res.json({
      entityId: settings.entityId,
      entityName: settings.entityName,
      fiscalYearEnd: settings.fiscalYearEndMonth,
      fiscalYearEndDay: settings.fiscalYearEndDay,
      baseCurrency: settings.baseCurrency,
      autoLockDays: settings.autoLockDays,
      varianceMaterialityDollar: settings.varianceMaterialityDollar,
      varianceMaterialityPercent: settings.varianceMaterialityPercent,
      functionalCurrency: settings.functionalCurrency,
    });
  } catch (e) {
    send500(res, e, 'Get entity settings failed');
  }
});

/** PUT /api/settings/general?entityId=X — update entity general settings */
router.put('/general', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    const entityId = (req.query.entityId as string) ?? (req.body as { entityId?: string }).entityId;
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!entityId) {
      res.status(400).json({ error: 'entityId query or body required' });
      return;
    }
    const body = req.body as {
      entityName?: string;
      fiscalYearEnd?: number;
      fiscalYearEndDay?: number;
      baseCurrency?: string;
      autoLockDays?: number;
      varianceMaterialityDollar?: string | number;
      varianceMaterialityPercent?: string | number;
      functionalCurrency?: string;
    };
    const settings = await entitySettingsService.upsertEntitySettings(
      pool,
      tenantId,
      entityId,
      {
        entityName: body.entityName,
        fiscalYearEndMonth: body.fiscalYearEnd,
        fiscalYearEndDay: body.fiscalYearEndDay,
        baseCurrency: body.baseCurrency,
        autoLockDays: body.autoLockDays,
        varianceMaterialityDollar: body.varianceMaterialityDollar,
        varianceMaterialityPercent: body.varianceMaterialityPercent,
        functionalCurrency: body.functionalCurrency,
      }
    );
    await recordMaterialEvent(pool, {
      tenantId,
      eventType: 'mapping_rule_update',
      deterministicFlagSnapshot: {
        event: 'entity_settings_updated',
        entityId,
        userId: (req as AuthRequest).userId ?? 'anonymous',
        targetType: 'entity_settings',
        afterState: body,
      },
    });
    res.json({
      entityId: settings.entityId,
      entityName: settings.entityName,
      fiscalYearEnd: settings.fiscalYearEndMonth,
      fiscalYearEndDay: settings.fiscalYearEndDay,
      baseCurrency: settings.baseCurrency,
      functionalCurrency: settings.functionalCurrency,
      autoLockDays: settings.autoLockDays,
      varianceMaterialityDollar: settings.varianceMaterialityDollar,
      varianceMaterialityPercent: settings.varianceMaterialityPercent,
    });
  } catch (e) {
    send500(res, e, 'Update entity settings failed');
  }
});

/** GET /api/settings/entities — list entity IDs for tenant (from close_sessions); when none, return one default from tenant name */
router.get('/entities', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const r = await pool.query<{ entity_id: string }>(
      `SELECT DISTINCT entity_id FROM close_sessions WHERE tenant_id = $1 ORDER BY entity_id`,
      [tenantId]
    );
    const entityIds = r.rows.map((row) => row.entity_id);
    const entities: Array<{ id: string; name: string }> = [];
    if (entityIds.length === 0) {
      const control = await import('../db/index.js').then((m) => m.getControlPool());
      const tenantRow = await control.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [tenantId]);
      const tenantName = tenantRow.rows[0]?.name ?? 'Default';
      entities.push({ id: 'default', name: tenantName });
    } else {
      let tenantName: string | null = null;
      for (const id of entityIds) {
        const settings = await entitySettingsService.getEntitySettings(pool, tenantId, id);
        const name = settings.entityName || id;
        if (id === 'default' && !settings.entityName) {
          if (tenantName == null) {
            const control = await import('../db/index.js').then((m) => m.getControlPool());
            const tenantRow = await control.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [tenantId]);
            tenantName = tenantRow.rows[0]?.name ?? 'Default';
          }
          entities.push({ id, name: tenantName });
        } else {
          entities.push({ id, name });
        }
      }
    }
    res.json({ entities });
  } catch (e) {
    send500(res, e, 'List entities failed');
  }
});

export default router;
