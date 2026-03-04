/**
 * Exchange rate management routes — CRUD for period_exchange_rates per close session.
 * GET  /sessions/:sessionId/exchange-rates
 * POST /sessions/:sessionId/exchange-rates
 * DELETE /sessions/:sessionId/exchange-rates/:rateId
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getTenantPool } from '../../db/index.js';
import * as exchangeRateRepo from '../../db/repositories/exchange_rate_repository.js';

const router = Router();

/** List exchange rates for a close session */
router.get('/sessions/:sessionId/exchange-rates', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const rates = await exchangeRateRepo.listExchangeRates(pool, tenantId, req.params.sessionId);
    res.json({ rates });
  } catch (err) {
    console.error('[ExchangeRates] list error:', err);
    res.status(500).json({ error: 'Failed to list exchange rates' });
  }
});

/** Create or update an exchange rate for a close session */
router.post('/sessions/:sessionId/exchange-rates', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const userId = (req as unknown as { userId?: string }).userId;
    const pool = await getTenantPool(tenantId);
    const { fromCurrency, toCurrency, rateType, rate, effectiveDate } = req.body;

    if (!fromCurrency || !rate || !effectiveDate) {
      res.status(400).json({ error: 'fromCurrency, rate, and effectiveDate are required' });
      return;
    }

    if (Number(rate) <= 0) {
      res.status(400).json({ error: 'rate must be positive' });
      return;
    }

    const result = await exchangeRateRepo.upsertExchangeRate(
      pool,
      tenantId,
      req.params.sessionId,
      String(fromCurrency).toUpperCase(),
      toCurrency ? String(toCurrency).toUpperCase() : 'USD',
      rateType ?? 'closing',
      String(rate),
      String(effectiveDate),
      userId
    );
    res.json({ rate: result });
  } catch (err) {
    console.error('[ExchangeRates] upsert error:', err);
    res.status(500).json({ error: 'Failed to save exchange rate' });
  }
});

/** Delete an exchange rate */
router.delete('/sessions/:sessionId/exchange-rates/:rateId', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const pool = await getTenantPool(tenantId);
    const deleted = await exchangeRateRepo.deleteExchangeRate(pool, tenantId, req.params.rateId);
    if (!deleted) {
      res.status(404).json({ error: 'Exchange rate not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[ExchangeRates] delete error:', err);
    res.status(500).json({ error: 'Failed to delete exchange rate' });
  }
});

export default router;
