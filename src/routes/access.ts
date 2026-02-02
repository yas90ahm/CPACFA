/**
 * Access and usage: role-based dashboards, alerts, usage log.
 */

import { Router, type Request, type Response } from 'express';
import { getDashboardConfigForRole, listRoleDashboardConfigs } from '../services/role_dashboard_service.js';
import {
  listAlertConfigs,
  getAlertConfig,
  setAlertConfig,
  evaluateVarianceAlert,
  evaluateCovenantHeadroomAlert,
} from '../services/alert_service.js';
import { appendUsageLog, queryUsageLog } from '../services/usage_log_service.js';
import type { DashboardRole } from '../types/access_usage.js';

const router = Router();

/** GET /api/access/dashboards — List role dashboard configs */
router.get('/dashboards', (_req: Request, res: Response) => {
  try {
    const configs = listRoleDashboardConfigs();
    res.json({ configs });
  } catch (e) {
    res.status(500).json({
      error: 'List dashboards failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/access/dashboards/:role — Get dashboard config for role (controller | cfo | auditor) */
router.get('/dashboards/:role', (req: Request, res: Response) => {
  try {
    const role = req.params.role as DashboardRole;
    if (!['controller', 'cfo', 'auditor'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    const config = getDashboardConfigForRole(role);
    if (!config) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }
    res.json(config);
  } catch (e) {
    res.status(500).json({
      error: 'Get dashboard failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/access/alerts — List alert configs */
router.get('/alerts', (_req: Request, res: Response) => {
  try {
    const configs = listAlertConfigs();
    res.json({ configs });
  } catch (e) {
    res.status(500).json({
      error: 'List alerts failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/access/alerts/:id — Get one alert config */
router.get('/alerts/:id', (req: Request, res: Response) => {
  try {
    const config = getAlertConfig(req.params.id);
    if (!config) {
      res.status(404).json({ error: 'Alert config not found' });
      return;
    }
    res.json(config);
  } catch (e) {
    res.status(500).json({
      error: 'Get alert failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PUT /api/access/alerts/:id — Set alert config */
router.put('/alerts/:id', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const config = setAlertConfig({ id: req.params.id, ...body });
    res.json(config);
  } catch (e) {
    res.status(500).json({
      error: 'Set alert failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/access/alerts/evaluate-variance — Evaluate variance alert (variancePercent, varianceAmount) */
router.post('/alerts/evaluate-variance', (req: Request, res: Response) => {
  try {
    const body = req.body as { variancePercent: number; varianceAmount: number };
    const result = evaluateVarianceAlert(body.variancePercent ?? 0, body.varianceAmount ?? 0);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Evaluate variance alert failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/access/alerts/evaluate-covenant — Evaluate covenant headroom alert */
router.post('/alerts/evaluate-covenant', (req: Request, res: Response) => {
  try {
    const body = req.body as { headroomPercent: number };
    const result = evaluateCovenantHeadroomAlert(body.headroomPercent ?? 0);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Evaluate covenant alert failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/access/usage-log — Append usage log (reportKey, userId?, tenantId?, action?) */
router.post('/usage-log', (req: Request, res: Response) => {
  try {
    const body = req.body as { reportKey: string; userId?: string; tenantId?: string; action?: string };
    if (!body?.reportKey) {
      res.status(400).json({ error: 'Missing reportKey' });
      return;
    }
    const entry = appendUsageLog(body);
    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({
      error: 'Usage log failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/access/usage-log — Query usage log (userId?, tenantId?, reportKey?, fromDate?, toDate?, limit?) */
router.get('/usage-log', (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const tenantId = req.query.tenantId as string | undefined;
    const reportKey = req.query.reportKey as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const entries = queryUsageLog({ userId, tenantId, reportKey, fromDate, toDate, limit });
    res.json({ entries });
  } catch (e) {
    res.status(500).json({
      error: 'Query usage log failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
