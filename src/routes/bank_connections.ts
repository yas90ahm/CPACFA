/**
 * Bank Connections API — manage bank account connections for live balance pre-fill.
 * Mounted at /api/bank-connections.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';

const router = Router();

/** GET /api/bank-connections — list connected bank accounts */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { listConnections } = await import('../services/bank_connection_service.js');
    const connections = await listConnections(pool, tenantId);
    res.json({ connections });
  } catch (e) {
    send500(res, e, 'List bank connections failed');
  }
});

/** POST /api/bank-connections — create/register a bank connection */
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { provider, accessToken, institutionName, accountMappings } = req.body as {
      provider: string; accessToken: string; institutionName?: string;
      accountMappings?: Array<{ glAccountCode: string; providerAccountId: string }>;
    };
    if (!provider || !accessToken) {
      res.status(400).json({ error: 'provider and accessToken are required' });
      return;
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO bank_connections (id, tenant_id, provider, access_token, institution_name, account_mappings, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [id, tenantId, provider, accessToken, institutionName ?? '', JSON.stringify(accountMappings ?? [])]
    );
    res.status(201).json({ id, provider, active: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('does not exist')) {
      res.status(503).json({ error: 'Bank connections table not initialized. Run migrations first.' });
      return;
    }
    send500(res, e, 'Create bank connection failed');
  }
});

/** DELETE /api/bank-connections/:id — deactivate a connection */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { id } = req.params;
    await pool.query(
      `UPDATE bank_connections SET active = false WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    res.json({ deactivated: true });
  } catch (e) {
    send500(res, e, 'Delete bank connection failed');
  }
});

/** GET /api/bank-connections/health — check if any adapter is available */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const { getAdapter } = await import('../services/bank_connection_service.js');
    const plaid = getAdapter('plaid');
    res.json({
      plaidAvailable: !!plaid,
      plaidConfigured: !!process.env.PLAID_CLIENT_ID,
    });
  } catch (e) {
    send500(res, e, 'Bank connection health check failed');
  }
});

export default router;
