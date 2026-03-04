/**
 * FX Translation config persistence — GET/PUT per close session.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getTenantPool } from '../../db/index.js';

const router = Router();

router.get('/sessions/:sessionId/fx-translation/config', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const r = await pool.query(
      'SELECT * FROM fx_translation_configs WHERE tenant_id = $1 AND close_session_id = $2',
      [tenantId, req.params.sessionId]
    );
    if (r.rows.length === 0) {
      res.json({ config: null });
      return;
    }
    const row = r.rows[0];
    res.json({
      config: {
        mode: row.mode,
        sourceCurrency: row.source_currency,
        reportingCurrency: row.reporting_currency,
        closingRate: row.closing_rate,
        averageRate: row.average_rate,
        historicalRate: row.historical_rate,
        balanceLines: row.balance_lines,
      },
    });
  } catch (err) {
    console.error('[FxTranslationConfig] get error:', err);
    res.status(500).json({ error: 'Failed to load FX translation config' });
  }
});

router.put('/sessions/:sessionId/fx-translation/config', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const { mode, sourceCurrency, reportingCurrency, closingRate, averageRate, historicalRate, balanceLines } = req.body;
    await pool.query(
      `INSERT INTO fx_translation_configs (tenant_id, close_session_id, mode, source_currency, reporting_currency, closing_rate, average_rate, historical_rate, balance_lines)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, close_session_id)
       DO UPDATE SET mode = $3, source_currency = $4, reporting_currency = $5, closing_rate = $6, average_rate = $7, historical_rate = $8, balance_lines = $9, updated_at = now()`,
      [
        tenantId,
        req.params.sessionId,
        mode ?? 'translate',
        sourceCurrency ?? 'EUR',
        reportingCurrency ?? 'USD',
        closingRate || null,
        averageRate || null,
        historicalRate || null,
        JSON.stringify(balanceLines ?? []),
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[FxTranslationConfig] put error:', err);
    res.status(500).json({ error: 'Failed to save FX translation config' });
  }
});

export default router;
