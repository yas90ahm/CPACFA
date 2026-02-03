/**
 * Accounting software integration: QuickBooks, Xero, NetSuite.
 * Sync TB, push JEs, pull transactions.
 */

import { Router, Request, Response } from 'express';
import {
  createConnection,
  getConnection,
  listConnections,
  syncTrialBalance,
  pushJournalEntry,
  pullTransactions,
} from '../services/accounting_integration_service.js';

const router = Router();

const getTenantId = (req: Request): string => (req as Request & { tenantId?: string }).tenantId ?? 'default';
const getTenantPool = (req: Request): import('pg').Pool | undefined => (req as Request & { tenantPool?: import('pg').Pool }).tenantPool;

router.post('/connections', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const { provider, name, credentialRef } = req.body ?? {};
    if (!provider || !name || !credentialRef) {
      return res.status(400).json({ error: 'provider, name, and credentialRef required' });
    }
    if (!['quickbooks', 'xero', 'netsuite'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be quickbooks, xero, or netsuite' });
    }
    const conn = await createConnection(tenantId, provider, name, credentialRef, pool);
    res.status(201).json(conn);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/connections', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const list = await listConnections(tenantId, pool);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/connections/:id', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const conn = await getConnection(req.params.id, pool);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    res.json(conn);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/sync-trial-balance', async (req: Request, res: Response) => {
  try {
    const { connectionId, asOfDate, periodLabel } = req.body ?? {};
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const result = await syncTrialBalance(connectionId, asOfDate, pool);
    if (result.success && periodLabel && tenantId) {
      await saveUnadjustedFromSync(
        tenantId,
        periodLabel,
        result.entries,
        { connectionId, syncedBy: (req as AuthRequest).userId ?? undefined },
        pool
      );
      res.json({ ...result, savedAsUnadjusted: true });
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/push-journal-entry', async (req: Request, res: Response) => {
  try {
    const input = req.body;
    if (!input?.connectionId || !input?.date || !Array.isArray(input?.lines)) {
      return res.status(400).json({ error: 'connectionId, date, and lines required' });
    }
    const pool = getTenantPool(req);
    const result = await pushJournalEntry(input, pool);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/pull-transactions', async (req: Request, res: Response) => {
  try {
    const { connectionId, startDate, endDate, accountCodes } = req.body ?? {};
    if (!connectionId || !startDate || !endDate) {
      return res.status(400).json({ error: 'connectionId, startDate, endDate required' });
    }
    const pool = getTenantPool(req);
    const result = await pullTransactions({ connectionId, startDate, endDate, accountCodes }, pool);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
