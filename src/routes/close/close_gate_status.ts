/**
 * Gate status routes — check gate status, trigger gate evaluation, get snapshot history.
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { checkGatesAndAutoAdvance, getLatestGateSnapshot } from '../../services/gate_event_service.js';

export function createGateStatusRoutes(getPool: (tenantId: string) => Promise<Pool>): Router {
  const router = Router();

  /**
   * POST /close/sessions/:sessionId/gates/check
   * Trigger a gate evaluation. If auto-advance is enabled and all gates pass, auto-advances.
   */
  router.post('/sessions/:sessionId/gates/check', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const userId = (req as unknown as { userId?: string }).userId ?? 'api';
      const { sessionId } = req.params;
      const pool = await getPool(tenantId);
      const result = await checkGatesAndAutoAdvance(pool, tenantId, sessionId, userId);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Gate check failed' });
    }
  });

  /**
   * GET /close/sessions/:sessionId/gates/latest
   * Get the most recent gate snapshot for a session.
   */
  router.get('/sessions/:sessionId/gates/latest', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const { sessionId } = req.params;
      const pool = await getPool(tenantId);
      const snapshot = await getLatestGateSnapshot(pool, tenantId, sessionId);
      if (!snapshot) {
        return res.status(404).json({ error: 'No gate snapshot found. Trigger a gate check first.' });
      }
      return res.json(snapshot);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Fetch failed' });
    }
  });

  /**
   * GET /close/sessions/:sessionId/gates/history
   * Get gate snapshot history (last N snapshots) for audit trail.
   */
  router.get('/sessions/:sessionId/gates/history', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const { sessionId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const pool = await getPool(tenantId);
      const r = await pool.query<{
        id: string;
        gates_passing: number;
        gates_total: number;
        can_advance: boolean;
        gate_details: unknown;
        triggered_by: string;
        created_at: string | Date;
      }>(
        `SELECT id, gates_passing, gates_total, can_advance, gate_details, triggered_by, created_at
         FROM tenant_gate_snapshots
         WHERE tenant_id = $1 AND close_session_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [tenantId, sessionId, limit]
      );
      const snapshots = r.rows.map((row) => ({
        id: row.id,
        gatesPassing: row.gates_passing,
        gatesTotal: row.gates_total,
        canAdvance: row.can_advance,
        gateDetails: row.gate_details,
        triggeredBy: row.triggered_by,
        checkedAt: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
      }));
      return res.json({ snapshots, total: snapshots.length });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'History failed' });
    }
  });

  return router;
}
