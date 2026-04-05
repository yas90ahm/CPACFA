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
import { executeBridgeCommand } from '../bridge/index.js';
import { syncAndStage } from '../services/erp_sync_staging_service.js';
import { promoteDeltas, rejectDeltas } from '../services/erp_sync_promote_service.js';
import * as deltaRepo from '../db/repositories/sync_staging_delta_repository.js';
import * as snapshotRepo from '../db/repositories/sync_snapshot_repository.js';
import type { AuthRequest } from '../auth/middleware.js';
import { send500 } from '../lib/errorHandler.js';
import { getCloseRoleFromReq } from '../lib/closeRole.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';

const router = Router();

router.post('/connections', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Integration mutations require controller/admin role' });
      return;
    }
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const { provider, name, credentialRef } = req.body ?? {};
    if (!provider || !name || !credentialRef) {
      return res.status(400).json({ error: 'provider, name, and credentialRef required' });
    }
    if (!['quickbooks', 'xero', 'netsuite', 'sage_intacct'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be quickbooks, xero, netsuite, or sage_intacct' });
    }
    const conn = await createConnection(tenantId, provider, name, credentialRef, pool);
    res.status(201).json(conn);
  } catch (e) {
    send500(res, e, 'Create connection failed');
  }
});

router.get('/connections', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const list = await listConnections(tenantId, pool);
    res.json(list);
  } catch (e) {
    send500(res, e, 'List connections failed');
  }
});

router.delete('/connections/:id', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Integration mutations require controller/admin role' });
      return;
    }
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!pool) return res.status(400).json({ error: 'Tenant pool required' });
    const conn = await getConnection(id, pool, tenantId);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const { recordMaterialEvent } = await import('../services/audit_service.js');
    await pool.query('DELETE FROM accounting_connections WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    await recordMaterialEvent(pool, {
      tenantId,
      eventType: 'mapping_rule_update',
      deterministicFlagSnapshot: {
        event: 'erp_connection_deleted',
        connectionId: id,
        provider: conn.provider,
        name: conn.name,
        userId: (req as AuthRequest).userId ?? 'anonymous',
      },
    });
    res.json({ deleted: true });
  } catch (e) {
    send500(res, e, 'Delete connection failed');
  }
});

router.post('/connections/:id/test', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!pool) return res.status(400).json({ error: 'Tenant pool required' });
    const conn = await getConnection(id, pool, tenantId);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const hasCreds = Boolean(conn.credentialRef && conn.credentialRef.trim().length > 0);
    const status = hasCreds ? 'connected' : 'failed';
    res.json({
      connectionId: id,
      provider: conn.provider,
      status,
      testedAt: new Date().toISOString(),
      ...(!hasCreds && { error: 'Connection has no credentials configured' }),
    });
  } catch (e) {
    send500(res, e, 'Test connection failed');
  }
});

router.get('/connections/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const conn = await getConnection(req.params.id, pool, tenantId);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    res.json(conn);
  } catch (e) {
    send500(res, e, 'Get connection failed');
  }
});

router.post('/sync-trial-balance', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Integration mutations require controller/admin role' });
      return;
    }
    const { connectionId, asOfDate, periodLabel, staged } = req.body ?? {};
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' });
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);

    // ── Staged mode (default) ──
    // Pull from ERP → stage diffs → controller reviews → promote separately
    if (staged !== false && periodLabel && tenantId && pool) {
      const stageResult = await syncAndStage(pool, tenantId, {
        connectionId,
        asOfDate,
        periodLabel,
        syncedBy: (req as AuthRequest).userId ?? 'anonymous',
      });
      res.json({ success: true, staged: true, ...stageResult });
      return;
    }

    // ── Legacy direct-write mode (staged: false) ──
    const result = await syncTrialBalance(connectionId, asOfDate, pool, tenantId);
    if (result.success && periodLabel && tenantId && pool) {
      const bridgeResult = await executeBridgeCommand(
        {
          pool,
          tenantId,
          actor: (req as AuthRequest).userId ?? 'anonymous',
        },
        {
          commandType: 'SaveTrialBalance',
          periodLabel,
          entries: result.entries.map((e) => ({
            accountName: e.accountName,
            debit: e.debit ?? 0,
            credit: e.credit ?? 0,
            accountCode: e.accountCode,
          })),
          source: 'synced',
          connectionId,
          syncedBy: (req as AuthRequest).userId ?? undefined,
        }
      );
      if (!bridgeResult.ok) {
        if (bridgeResult.code === 'PERIOD_LOCKED' || bridgeResult.code === 'VALIDATION') {
          const status = bridgeResult.code === 'PERIOD_LOCKED' ? 409 : 422;
          return res.status(status).json({
            error: bridgeResult.error,
            code: bridgeResult.code,
            message: bridgeResult.error,
          });
        }
        return res.status(400).json({ error: bridgeResult.error, code: bridgeResult.code });
      }
      res.json({ ...result, savedAsUnadjusted: true });
      return;
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Sync trial balance failed');
  }
});

router.post('/push-journal-entry', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Integration mutations require controller/admin role' });
      return;
    }
    const input = req.body;
    if (!input?.connectionId || !input?.date || !Array.isArray(input?.lines)) {
      return res.status(400).json({ error: 'connectionId, date, and lines required' });
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const result = await pushJournalEntry(input, pool, tenantId);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Push journal entry failed');
  }
});

router.post('/pull-transactions', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Integration mutations require controller/admin role' });
      return;
    }
    const { connectionId, startDate, endDate, accountCodes } = req.body ?? {};
    if (!connectionId || !startDate || !endDate) {
      return res.status(400).json({ error: 'connectionId, startDate, endDate required' });
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const result = await pullTransactions({ connectionId, startDate, endDate, accountCodes }, pool, tenantId);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Pull transactions failed');
  }
});

// ─── Sync Staging Endpoints ─────────────────────────────────────────

/** GET /sync-staging/deltas — list deltas with filters */
router.get('/sync-staging/deltas', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const periodLabel = req.query.periodLabel as string;
    const batchId = req.query.batchId as string | undefined;
    const status = req.query.status as string | undefined;
    if (!periodLabel && !batchId) {
      res.status(400).json({ error: 'periodLabel or batchId required' }); return;
    }
    if (batchId) {
      const deltas = await deltaRepo.listDeltasByBatch(pool, tenantId, batchId);
      res.json({ deltas });
    } else {
      const deltas = await deltaRepo.listDeltasByPeriod(pool, tenantId, periodLabel, status as 'pending' | 'approved' | 'rejected' | 'superseded' | undefined);
      res.json({ deltas });
    }
  } catch (e) { send500(res, e, 'List sync staging deltas failed'); }
});

/** GET /sync-staging/snapshots — list snapshots for a period */
router.get('/sync-staging/snapshots', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const periodLabel = req.query.periodLabel as string;
    if (!periodLabel) { res.status(400).json({ error: 'periodLabel required' }); return; }
    const snapshots = await snapshotRepo.listSnapshotsForPeriod(pool, tenantId, periodLabel);
    res.json({ snapshots });
  } catch (e) { send500(res, e, 'List sync snapshots failed'); }
});

/** GET /sync-staging/summary — aggregate counts and net impact */
router.get('/sync-staging/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const periodLabel = req.query.periodLabel as string;
    if (!periodLabel) { res.status(400).json({ error: 'periodLabel required' }); return; }
    const summary = await deltaRepo.getDeltaSummary(pool, tenantId, periodLabel);
    res.json(summary);
  } catch (e) { send500(res, e, 'Get sync staging summary failed'); }
});

/** POST /sync-staging/promote — approve specific deltas */
router.post('/sync-staging/promote', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Promotion requires controller/admin role' }); return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { deltaIds, periodLabel } = req.body ?? {};
    if (!Array.isArray(deltaIds) || deltaIds.length === 0 || !periodLabel) {
      res.status(400).json({ error: 'deltaIds (array) and periodLabel required' }); return;
    }
    const result = await promoteDeltas(pool, tenantId, {
      deltaIds,
      periodLabel,
      approvedBy: (req as AuthRequest).userId ?? 'anonymous',
    });
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unbalanced') || msg.includes('not pending')) {
      res.status(422).json({ error: msg }); return;
    }
    send500(res, e, 'Promote sync deltas failed');
  }
});

/** POST /sync-staging/promote-all — approve all pending deltas for a period */
router.post('/sync-staging/promote-all', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Promotion requires controller/admin role' }); return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { periodLabel } = req.body ?? {};
    if (!periodLabel) { res.status(400).json({ error: 'periodLabel required' }); return; }
    const pending = await deltaRepo.listPendingDeltasByPeriod(pool, tenantId, periodLabel);
    if (pending.length === 0) {
      res.json({ promoted: 0, periodLabel, message: 'No pending deltas to promote' }); return;
    }
    const result = await promoteDeltas(pool, tenantId, {
      deltaIds: pending.map((d) => d.id),
      periodLabel,
      approvedBy: (req as AuthRequest).userId ?? 'anonymous',
    });
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unbalanced')) {
      res.status(422).json({ error: msg }); return;
    }
    send500(res, e, 'Promote all sync deltas failed');
  }
});

/** POST /sync-staging/reject — reject specific deltas */
router.post('/sync-staging/reject', async (req: Request, res: Response) => {
  try {
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Rejection requires controller/admin role' }); return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const { deltaIds, reason } = req.body ?? {};
    if (!Array.isArray(deltaIds) || deltaIds.length === 0) {
      res.status(400).json({ error: 'deltaIds (array) required' }); return;
    }
    const result = await rejectDeltas(pool, tenantId, {
      deltaIds,
      rejectedBy: (req as AuthRequest).userId ?? 'anonymous',
      reason,
    });
    res.json(result);
  } catch (e) { send500(res, e, 'Reject sync deltas failed'); }
});

export default router;
