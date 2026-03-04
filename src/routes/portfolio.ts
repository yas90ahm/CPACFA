/**
 * Portfolio API: cross-tenant dashboard for operating partners.
 * Mounted at /api/portfolio.
 * Requires operating_partner or admin role.
 */

import { Router, type Request, type Response } from 'express';
import { getControlPool, getTenantPool } from '../db/index.js';
import { send500 } from '../lib/errorHandler.js';
import * as portfolioService from '../services/portfolio_service.js';
import { checkOverdueAndNotify } from '../services/notification_service.js';
import { buildEntityIntegrityReport, buildPortfolioIntegrityReport } from '../services/integrity_report_service.js';
import type { AuthRequest } from '../auth/middleware.js';

const router = Router();

function requirePortfolioAccess(req: Request, res: Response, next: () => void): void {
  const role = (req as AuthRequest).role;
  if (role !== 'operating_partner' && role !== 'admin') {
    res.status(403).json({ error: 'Portfolio access requires operating_partner or admin role' });
    return;
  }
  next();
}

router.use(requirePortfolioAccess);

/** GET /api/portfolio/entities — list entities with close status (dashboard cards) */
router.get('/entities', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const controlPool = getControlPool();
    const entities = await portfolioService.getPortfolioSummary(controlPool, userId);
    res.json({ entities });

    // Trigger overdue check in background on portfolio page load
    checkOverdueAndNotify().catch(() => {});
  } catch (e) {
    send500(res, e, 'Portfolio entities failed');
  }
});

/** GET /api/portfolio/summary — aggregate metrics across portfolio */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const controlPool = getControlPool();
    const entities = await portfolioService.getPortfolioSummary(controlPool, userId);
    const totals = portfolioService.computePortfolioTotals(entities);

    const closedThisPeriod = entities.filter(
      (e) => e.currentState === 'certified' || e.currentState === 'locked'
    ).length;
    const inProgress = entities.filter(
      (e) =>
        e.currentState === 'in_progress' ||
        e.currentState === 'under_review'
    ).length;
    const notStarted = entities.filter(
      (e) => e.currentState === 'not_started' || e.currentState === 'open'
    ).length;
    const needsAttention = entities.filter((e) => e.needsAttention).length;
    const withAvg = entities.filter((e) => e.avgCloseDuration != null);
    const avgCloseDays =
      withAvg.length > 0
        ? Math.round(
            withAvg.reduce((s, e) => s + (e.avgCloseDuration ?? 0), 0) / withAvg.length
          )
        : null;
    const withPriorAvg = entities.filter((e) => e.priorAvgCloseDays != null);
    const priorAvgCloseDays =
      withPriorAvg.length > 0
        ? Math.round(
            withPriorAvg.reduce((s, e) => s + (e.priorAvgCloseDays ?? 0), 0) / withPriorAvg.length
          )
        : null;
    const totalBlockingIssues = entities.reduce((s, e) => s + e.blockingIssues, 0);

    // Derive currentPeriod from the most common period across entities
    const periodCounts: Record<string, number> = {};
    for (const e of entities) {
      if (e.currentPeriod) periodCounts[e.currentPeriod] = (periodCounts[e.currentPeriod] ?? 0) + 1;
    }
    const currentPeriod = Object.entries(periodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    res.json({
      totalEntities: entities.length,
      closedThisPeriod,
      inProgress,
      notStarted,
      needsAttention,
      avgCloseDays,
      priorAvgCloseDays,
      totalBlockingIssues,
      currentPeriod,
      portfolioRevenue: totals.portfolioRevenue,
      portfolioNetIncome: totals.portfolioNetIncome,
      portfolioEbitda: totals.portfolioEbitda,
      portfolioTotalAssets: totals.portfolioTotalAssets,
      portfolioTotalLiabilities: totals.portfolioTotalLiabilities,
      portfolioCashPosition: totals.portfolioCashPosition,
      portfolioMargin: totals.portfolioMargin,
      certifiedCount: totals.certifiedCount,
      totalWithData: totals.totalWithData,
    });
  } catch (e) {
    send500(res, e, 'Portfolio summary failed');
  }
});

/** GET /api/portfolio/entities/:id/history — close history for one tenant */
router.get('/entities/:id/history', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = req.params.id ?? '';
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const controlPool = getControlPool();
    const entities = await portfolioService.getPortfolioEntities(controlPool, userId);
    const hasAccess = entities.some((e) => e.tenant_id === tenantId);
    if (!hasAccess) {
      res.status(403).json({ error: 'No access to this entity' });
      return;
    }
    const pool = await getTenantPool(tenantId);
    const periods = Math.min(24, Math.max(1, parseInt(String(req.query.periods), 10) || 12));
    const history = await portfolioService.getEntityCloseHistory(pool, tenantId, periods);
    res.json({ entityId: tenantId, history });
  } catch (e) {
    send500(res, e, 'Portfolio history failed');
  }
});

/** GET /api/portfolio/entities/:id/integrity-report — due diligence integrity scorecard for one entity */
router.get('/entities/:id/integrity-report', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = req.params.id ?? '';
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const controlPool = getControlPool();
    const entities = await portfolioService.getPortfolioEntities(controlPool, userId);
    const entity = entities.find((e) => e.tenant_id === tenantId);
    if (!entity) {
      res.status(403).json({ error: 'No access to this entity' });
      return;
    }
    const pool = await getTenantPool(tenantId);
    const report = await buildEntityIntegrityReport(pool, tenantId, entity.tenant_name);
    res.json(report);
  } catch (e) {
    send500(res, e, 'Entity integrity report failed');
  }
});

/** GET /api/portfolio/integrity-report — portfolio-level integrity scorecard */
router.get('/integrity-report', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const controlPool = getControlPool();
    const report = await buildPortfolioIntegrityReport(controlPool, userId);
    res.json(report);
  } catch (e) {
    send500(res, e, 'Portfolio integrity report failed');
  }
});

/** POST /api/portfolio/access/grant — grant portfolio access (admin only) */
router.post('/access/grant', async (req: Request, res: Response) => {
  try {
    if ((req as AuthRequest).role !== 'admin') {
      res.status(403).json({ error: 'Only admins can grant portfolio access' });
      return;
    }
    const body = req.body as { userId?: string; tenantId?: string };
    const { userId, tenantId } = body;
    if (!userId || !tenantId) {
      res.status(400).json({ error: 'userId and tenantId are required' });
      return;
    }
    const controlPool = getControlPool();
    await controlPool.query(
      `INSERT INTO portfolio_access (id, user_id, tenant_id, granted_by, granted_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())
       ON CONFLICT (user_id, tenant_id) DO NOTHING`,
      [userId, tenantId, (req as AuthRequest).userId]
    );
    res.json({ granted: true });
  } catch (e) {
    send500(res, e, 'Grant portfolio access failed');
  }
});

/** DELETE /api/portfolio/access/revoke — revoke portfolio access */
router.delete('/access/revoke', async (req: Request, res: Response) => {
  try {
    if ((req as AuthRequest).role !== 'admin') {
      res.status(403).json({ error: 'Only admins can revoke portfolio access' });
      return;
    }
    const body = req.body as { userId?: string; tenantId?: string };
    const { userId, tenantId } = body;
    if (!userId || !tenantId) {
      res.status(400).json({ error: 'userId and tenantId are required' });
      return;
    }
    const controlPool = getControlPool();
    await controlPool.query(
      'DELETE FROM portfolio_access WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    res.json({ revoked: true });
  } catch (e) {
    send500(res, e, 'Revoke portfolio access failed');
  }
});

export default router;
