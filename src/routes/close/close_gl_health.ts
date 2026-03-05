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
    const result = await runGLHealthAnalysis(pool, tenantId, req.params.sessionId, periodLabel);
    res.json({ analysis: result });
  } catch (err) {
    console.error('[GLHealth] run error:', err);
    res.status(500).json({ error: 'Failed to run GL health analysis' });
  }
});

export default router;
