/**
 * Consolidation config persistence — GET/PUT per close session.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getTenantPool } from '../../db/index.js';

const router = Router();

router.get('/sessions/:sessionId/consolidation/config', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const r = await pool.query(
      'SELECT * FROM consolidation_configs WHERE tenant_id = $1 AND close_session_id = $2',
      [tenantId, req.params.sessionId]
    );
    if (r.rows.length === 0) {
      res.json({ config: null });
      return;
    }
    const row = r.rows[0];
    res.json({
      config: {
        entities: row.entities,
        eliminationRules: row.elimination_rules,
        reportingCurrency: row.reporting_currency,
        periodLabel: row.period_label,
      },
    });
  } catch (err) {
    console.error('[ConsolidationConfig] get error:', err);
    res.status(500).json({ error: 'Failed to load consolidation config' });
  }
});

router.put('/sessions/:sessionId/consolidation/config', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const { entities, eliminationRules, reportingCurrency, periodLabel } = req.body;
    await pool.query(
      `INSERT INTO consolidation_configs (tenant_id, close_session_id, entities, elimination_rules, reporting_currency, period_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, close_session_id)
       DO UPDATE SET entities = $3, elimination_rules = $4, reporting_currency = $5, period_label = $6, updated_at = now()`,
      [
        tenantId,
        req.params.sessionId,
        JSON.stringify(entities ?? []),
        JSON.stringify(eliminationRules ?? []),
        reportingCurrency ?? 'USD',
        periodLabel ?? '',
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[ConsolidationConfig] put error:', err);
    res.status(500).json({ error: 'Failed to save consolidation config' });
  }
});

export default router;
