/**
 * Close period routes: period-end, period-lock, calendar-config, calendar, periods.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getPeriodEndDate } from '../../services/close_context.js';
import { isPeriodLocked, getPeriodLock, listLockedPeriods } from '../../services/period_lock_service.js';
import { getCloseCalendarConfig, setCloseCalendarConfig } from '../../services/close_calendar_config_service.js';
import { setCloseDueDate, getPeriodEntry, listPeriods } from '../../services/close_calendar_service.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { periodLockBodySchema } from '../../schemas/closeSchemas.js';
import { executeBridgeCommand } from '../../bridge/index.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';
import { listAdjustments } from '../../services/close_adjustments_service.js';
import { getUnadjustedMeta } from '../../services/trial_balance_store_service.js';
import { buildCloseReadiness } from '../../services/close_readiness_service.js';
import { computeCloseStage } from '../../services/close_status_service.js';

const router = Router();

/** GET /api/close/period-end */
router.get('/period-end', (req: Request, res: Response) => {
  try {
    const periodLabel = (req.query.periodLabel as string) ?? '';
    const periodEnd = getPeriodEndDate(periodLabel);
    res.json({ periodLabel, periodEnd });
  } catch (e) {
    send500(res, e, 'Period end failed');
  }
});

/** POST /api/close/period-lock (via bridge) */
router.post('/period-lock', async (req: Request, res: Response) => {
  try {
    const parsed = periodLockBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(Boolean).join('; ') || 'Validation failed';
      res.status(400).json({ error: 'Validation failed', message });
      return;
    }
    const body = parsed.data;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    const result = await executeBridgeCommand(
      {
        pool,
        tenantId,
        actor: (req as AuthRequest).userId ?? body.lockedBy,
        actorRole,
      },
      {
        commandType: 'LockPeriod',
        periodLabel: body.periodLabel,
        lockedBy: body.lockedBy,
        reason: body.reason,
      }
    );
    if (!result.ok) {
      if (result.code === 'VALIDATION') {
        return res.status(403).json({ error: result.error });
      }
      return res.status(400).json({ error: result.error, code: result.code });
    }
    if (result.commandType !== 'LockPeriod') throw new Error('Unexpected result');
    res.json({
      periodLabel: result.periodLabel,
      lockedAt: result.lockedAt,
      lockedBy: body.lockedBy,
      reason: body.reason,
      suggestPackGeneration: true,
      packUrl: '/api/reporting/pack',
    });
  } catch (e: unknown) {
    send500(res, e, 'Period lock failed');
  }
});

/** GET /api/close/period-lock/:periodLabel */
router.get('/period-lock/:periodLabel', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel ?? '';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const locked = await isPeriodLocked(periodLabel, tenantId, pool);
    const lock = await getPeriodLock(periodLabel, tenantId, pool);
    res.json({ periodLabel, locked, lock: lock ?? null });
  } catch (e) {
    send500(res, e, 'Period lock check failed');
  }
});

/** GET /api/close/period-lock */
router.get('/period-lock', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const locksList = await listLockedPeriods(tenantId, pool);
    res.json({ locks: locksList });
  } catch (e) {
    res.status(500).json({
      error: 'List locks failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/close/calendar-config */
router.get('/calendar-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const config = await getCloseCalendarConfig(tenantId, pool);
    res.json(config ?? { tenantId, closeDueOffsetDays: 5, reminderDays: undefined });
  } catch (e) {
    send500(res, e, 'Get calendar config failed');
  }
});

/** PATCH /api/close/calendar-config */
router.patch('/calendar-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as { closeDueOffsetDays?: number; reminderDays?: number };
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const config = await setCloseCalendarConfig(tenantId, body, pool);
    res.json(config ?? { tenantId, closeDueOffsetDays: body.closeDueOffsetDays ?? 5, reminderDays: body.reminderDays });
  } catch (e) {
    send500(res, e, 'Set calendar config failed');
  }
});

/** GET /api/close/calendar */
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const periodLabels = req.query.periodLabels as string | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listPeriods(periodLabels ? periodLabels.split(',') : undefined, tenantId, pool);
    res.json({ periods: list });
  } catch (e) {
    send500(res, e, 'Close calendar failed');
  }
});

/** POST /api/close/calendar */
router.post('/calendar', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; closeDueDate: string };
    if (!body?.periodLabel || !body?.closeDueDate) {
      res.status(400).json({ error: 'Missing periodLabel or closeDueDate' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    await setCloseDueDate(body.periodLabel, body.closeDueDate, tenantId ?? undefined, pool);
    const entry = await getPeriodEntry(body.periodLabel, tenantId ?? undefined, pool);
    res.json(entry);
  } catch (e) {
    res.status(500).json({
      error: 'Set close due date failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/close/periods */
router.get('/periods', async (req: Request, res: Response) => {
  try {
    const periodLabels = req.query.periodLabels as string | undefined;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const list = await listPeriods(periodLabels ? periodLabels.split(',') : undefined, tenantId, pool);
    const enriched = await Promise.all(
      list.map(async (p) => {
        const [tbMeta, adjustments, readiness] = await Promise.all([
          getUnadjustedMeta(tenantId, p.periodLabel, pool),
          listAdjustments({ periodLabel: p.periodLabel }, tenantId, pool),
          buildCloseReadiness(tenantId, p.periodLabel, pool ?? undefined, { includeNarrative: false }),
        ]);
        const locked = p.status === 'locked';
        const postedCount = adjustments.filter((a) => a.status === 'posted').length;
        const closeStage = computeCloseStage(!!tbMeta, locked, readiness.ready, postedCount);
        return {
          ...p,
          hasUnadjustedTB: !!tbMeta,
          tbSource: tbMeta?.source ?? undefined,
          tbAt: tbMeta?.at,
          closeStage,
        };
      })
    );
    res.json({ periods: enriched });
  } catch (e) {
    send500(res, e, 'List periods failed');
  }
});

export default router;
