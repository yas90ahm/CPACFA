/**
 * Close sign-off and readiness routes: sign-off, reviewer-sign-off, readiness, coach, status.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getOrCreatePeriodClose, setPeriodCloseStatus, setReviewerSignOff } from '../../services/period_close_service.js';
import { buildCloseReadiness } from '../../services/close_readiness_service.js';
import { getCloseCoach } from '../../services/agentic_close_coach.js';
import { buildCloseStatus } from '../../services/close_status_service.js';
import { appendAuditLog } from '../../services/audit_log_service.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();

router.post('/sign-off', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; status: 'in_review' | 'closed'; closedBy?: string };
    if (!body?.periodLabel || !body?.status) {
      res.status(400).json({ error: 'Missing periodLabel or status (in_review | closed)' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    await getOrCreatePeriodClose(tenantId, body.periodLabel, pool ?? undefined);
    const { record } = await setPeriodCloseStatus(
      tenantId,
      body.periodLabel,
      body.status,
      body.closedBy,
      pool ?? undefined
    );
    const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
    appendAuditLog(
      { action: 'period_close_sign_off', resource: `period:${body.periodLabel}`, actor: body.closedBy ?? (req as AuthRequest).userId ?? 'anonymous', detail: body.status },
      auditContext
    );
    res.json(record);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: 'Sign-off failed', message });
  }
});

router.post('/reviewer-sign-off', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; reviewedBy: string };
    if (!body?.periodLabel || !body?.reviewedBy) {
      res.status(400).json({ error: 'Missing periodLabel or reviewedBy' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const record = await setReviewerSignOff(tenantId, body.periodLabel, body.reviewedBy, pool ?? undefined);
    if (!record) {
      res.status(404).json({ error: 'Period close record not found' });
      return;
    }
    const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
    appendAuditLog(
      { action: 'period_close_reviewer_sign_off', resource: `period:${body.periodLabel}`, actor: body.reviewedBy, detail: 'reviewer signed off' },
      auditContext
    );
    res.json(record);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: 'Reviewer sign-off failed', message });
  }
});

router.get('/readiness', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const readiness = await buildCloseReadiness(tenantId, periodLabel, pool ?? undefined, { includeNarrative });
    res.json(readiness);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close readiness failed', message });
  }
});

router.get('/coach', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const result = await getCloseCoach(tenantId, periodLabel, pool ?? undefined);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close coach failed', message });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const status = await buildCloseStatus(tenantId, periodLabel, pool ?? undefined);
    res.json(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close status failed', message });
  }
});

export default router;
