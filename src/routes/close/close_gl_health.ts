/**
 * GL Health Analysis routes.
 * GET  /sessions/:sessionId/gl-health       — Load stored analysis
 * POST /sessions/:sessionId/gl-health/run   — Run (or re-run) analysis
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getTenantPool } from '../../db/index.js';
import { runGLHealthAnalysis } from '../../services/gl_health_analysis_service.js';

const router = Router();

/** Load stored GL health analysis for a session */
router.get('/sessions/:sessionId/gl-health', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const { rows } = await pool.query(
      `SELECT id, overall_grade, overall_score, checks, finding_count, period_label, created_at
       FROM core.gl_health_analysis
       WHERE tenant_id = $1 AND close_session_id = $2`,
      [tenantId, req.params.sessionId]
    );

    if (rows.length === 0) {
      res.json({ analysis: null });
      return;
    }

    const row = rows[0];
    res.json({
      analysis: {
        id: row.id,
        overallGrade: row.overall_grade,
        overallScore: parseFloat(row.overall_score),
        checks: row.checks,
        findingCount: row.finding_count,
        periodLabel: row.period_label,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('[GLHealth] get error:', err);
    res.status(500).json({ error: 'Failed to load GL health analysis' });
  }
});

/** Run (or re-run) GL health analysis */
router.post('/sessions/:sessionId/gl-health/run', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);

    // Look up session to get period_label
    const sessionResult = await pool.query(
      `SELECT period_label FROM core.close_sessions WHERE id = $1 AND tenant_id = $2`,
      [req.params.sessionId, tenantId]
    );
    if (sessionResult.rows.length === 0) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const periodLabel = sessionResult.rows[0].period_label;
    const priorPeriodLabel = typeof req.body?.priorPeriodLabel === 'string' ? req.body.priorPeriodLabel : undefined;
    const result = await runGLHealthAnalysis(pool, tenantId, req.params.sessionId, periodLabel, priorPeriodLabel);
    res.json({ analysis: result });
  } catch (err) {
    console.error('[GLHealth] run error:', err);
    res.status(500).json({ error: 'Failed to run GL health analysis' });
  }
});

/** GET /sessions/:sessionId/gl-anomalies — Proactive anomaly detection on uploaded GL */
router.get('/sessions/:sessionId/gl-anomalies', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);

    const sessionResult = await pool.query<{ period_end: string; entity_id: string }>(
      `SELECT period_end, entity_id FROM core.close_sessions WHERE id = $1 AND tenant_id = $2`,
      [req.params.sessionId, tenantId]
    );
    if (sessionResult.rows.length === 0) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const periodLabel = (sessionResult.rows[0].period_end ?? '').slice(0, 7);
    const entityId = sessionResult.rows[0].entity_id;

    // Get current TB
    const { getTrialBalanceForCertification } = await import('../../services/adjusted_trial_balance_service.js');
    let currentTB;
    try {
      const tbResult = await getTrialBalanceForCertification(pool, tenantId, periodLabel, req.params.sessionId);
      currentTB = tbResult.trialBalance.map((e: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }) => ({
        accountCode: (e.accountCode ?? e.accountName ?? '').trim(),
        accountName: e.accountName,
        accountType: e.accountType,
        debit: e.debit,
        credit: e.credit,
      }));
    } catch {
      res.json({ anomalies: [], summary: { total: 0, critical: 0, warning: 0, info: 0 }, accountsScanned: 0, priorPeriodAvailable: false });
      return;
    }

    // Try to get prior period TB
    let priorTB = null;
    try {
      const priorSessionResult = await pool.query<{ id: string; period_end: string }>(
        `SELECT id, period_end FROM core.close_sessions
         WHERE tenant_id = $1 AND entity_id = $2 AND id != $3
           AND status IN ('certified', 'locked')
         ORDER BY period_end DESC LIMIT 1`,
        [tenantId, entityId, req.params.sessionId]
      );
      if (priorSessionResult.rows.length > 0) {
        const priorPeriodLabel = (priorSessionResult.rows[0].period_end ?? '').slice(0, 7);
        const priorResult = await getTrialBalanceForCertification(pool, tenantId, priorPeriodLabel, priorSessionResult.rows[0].id);
        priorTB = priorResult.trialBalance.map((e: { accountCode?: string; accountName: string; debit: number; credit: number; accountType?: string }) => ({
          accountCode: (e.accountCode ?? e.accountName ?? '').trim(),
          accountName: e.accountName,
          accountType: e.accountType,
          debit: e.debit,
          credit: e.credit,
        }));
      }
    } catch {
      /* no prior period — anomaly detection still works without comparison */
    }

    const { detectAnomalies } = await import('../../services/gl_anomaly_detection_service.js');
    const result = await detectAnomalies(pool, tenantId, req.params.sessionId, currentTB, priorTB);
    res.json(result);
  } catch (err) {
    console.error('[GLAnomalies] error:', err);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

export default router;
