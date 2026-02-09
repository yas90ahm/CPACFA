/**
 * Reconciliation state machine: recon runs, items, match groups, exceptions, signoffs.
 * Mounted at /api/close (paths: /recon-runs, /recon-runs/:id, /recon-match-groups/:id, etc.).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import {
  createReconRun,
  ingestReconItems,
  proposeMatches,
  confirmMatchGroup,
  rejectMatchGroup,
  markTimingDifference,
  signOffReconRun,
  getReconRun,
  listReconRunsByCloseSession,
  listReconItemsByRunId,
  listReconMatchGroupsByRunId,
  getUnmatchedReconItems,
  emitIssuesForUnmatchedAboveMateriality,
  ReconError,
} from '../../services/recon_service.js';
import { getSession } from '../../services/close_session_service.js';
import { getReconMatchGroupById } from '../../db/repositories/recon_repository.js';
import type { ReconRunType, ReconMatchGroup } from '../../types/recon.js';
import type { Pool } from 'pg';

const router = Router();

/** Validate closeSessionId belongs to tenant; return 404 if not (IDOR protection). */
async function ensureCloseSessionOwnership(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  res: Response
): Promise<boolean> {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) {
    res.status(404).json({ error: 'Close session not found' });
    return false;
  }
  return true;
}

/** Get recon run and validate its close_session belongs to tenant; return null if not (IDOR protection). */
async function getReconRunWithOwnershipCheck(
  pool: Pool,
  tenantId: string,
  runId: string,
  res: Response
): Promise<ReturnType<typeof getReconRun> | null> {
  const run = await getReconRun(pool, tenantId, runId);
  if (!run) {
    res.status(404).json({ error: 'Recon run not found' });
    return null;
  }
  if (!(await ensureCloseSessionOwnership(pool, tenantId, run.closeSessionId, res))) return null;
  return run;
}

/** Get match group and validate its recon run's close_session belongs to tenant; return null if not (IDOR protection). */
async function getMatchGroupWithOwnershipCheck(
  pool: Pool,
  tenantId: string,
  groupId: string,
  res: Response
): Promise<ReconMatchGroup | null> {
  const group = await getReconMatchGroupById(pool, tenantId, groupId);
  if (!group) {
    res.status(404).json({ error: 'Match group not found' });
    return null;
  }
  if (!(await getReconRunWithOwnershipCheck(pool, tenantId, group.reconRunId, res))) return null;
  return group;
}

/** POST /api/close/recon-runs — create a recon run */
router.post('/recon-runs', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as { closeSessionId: string; type: ReconRunType };
    if (!body?.closeSessionId || !body?.type) {
      res.status(400).json({ error: 'closeSessionId and type required' });
      return;
    }
    if (!(await ensureCloseSessionOwnership(pool, tenantId, body.closeSessionId, res))) return;
    const run = await createReconRun(pool, tenantId, body.closeSessionId, body.type);
    res.status(201).json(run);
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Create recon run failed');
  }
});

/** GET /api/close/recon-runs — list by closeSessionId (query: type?) */
router.get('/recon-runs', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.query.closeSessionId as string | undefined;
    if (!closeSessionId) {
      res.status(400).json({ error: 'closeSessionId query required' });
      return;
    }
    if (!(await ensureCloseSessionOwnership(pool, tenantId, closeSessionId, res))) return;
    const type = req.query.type as ReconRunType | undefined;
    const runs = await listReconRunsByCloseSession(pool, tenantId, closeSessionId, type);
    res.json({ runs });
  } catch (e) {
    send500(res, e, 'List recon runs failed');
  }
});

/** GET /api/close/recon-runs/:id */
router.get('/recon-runs/:id', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const run = await getReconRunWithOwnershipCheck(pool, tenantId, id, res);
    if (!run) return;
    res.json(run);
  } catch (e) {
    send500(res, e, 'Get recon run failed');
  }
});

/** POST /api/close/recon-runs/:id/items — ingest items */
router.post('/recon-runs/:id/items', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const body = req.body as { items: Array<{ source: string; amount: number; itemDate?: string; description?: string; ref?: Record<string, unknown> }> };
    if (!Array.isArray(body?.items)) {
      res.status(400).json({ error: 'items array required' });
      return;
    }
    const items = await ingestReconItems(
      pool,
      tenantId,
      id,
      body.items.map((i) => ({
        source: i.source as 'bank' | 'gl' | 'subledger',
        amount: i.amount,
        itemDate: i.itemDate,
        description: i.description,
        ref: i.ref,
      }))
    );
    res.status(201).json({ items });
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Ingest recon items failed');
  }
});

/** GET /api/close/recon-runs/:id/items */
router.get('/recon-runs/:id/items', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const items = await listReconItemsByRunId(pool, tenantId, id);
    res.json({ items });
  } catch (e) {
    send500(res, e, 'List recon items failed');
  }
});

/** GET /api/close/recon-runs/:id/match-groups */
router.get('/recon-runs/:id/match-groups', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const matchGroups = await listReconMatchGroupsByRunId(pool, tenantId, id);
    res.json({ matchGroups });
  } catch (e) {
    send500(res, e, 'List recon match groups failed');
  }
});

/** GET /api/close/recon-runs/:id/unmatched */
router.get('/recon-runs/:id/unmatched', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const items = await getUnmatchedReconItems(pool, tenantId, id);
    res.json({ items });
  } catch (e) {
    send500(res, e, 'List unmatched recon items failed');
  }
});

/** POST /api/close/recon-runs/:id/propose-matches */
router.post('/recon-runs/:id/propose-matches', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const body = req.body as { reconItemIds: string[]; matchConfidence?: number; decisionRecordId?: string };
    if (!Array.isArray(body?.reconItemIds)) {
      res.status(400).json({ error: 'reconItemIds array required' });
      return;
    }
    const group = await proposeMatches(pool, tenantId, id, {
      reconItemIds: body.reconItemIds,
      matchConfidence: body.matchConfidence,
      decisionRecordId: body.decisionRecordId,
    });
    res.status(201).json(group);
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Propose matches failed');
  }
});

/** POST /api/close/recon-runs/:id/emit-issues — emit issues for unmatched above materiality */
router.post('/recon-runs/:id/emit-issues', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const run = await getReconRunWithOwnershipCheck(pool, tenantId, id, res);
    if (!run) return;
    const body = req.body as { materialityThreshold?: number; currency?: string; createdBy?: string };
    const emitted = await emitIssuesForUnmatchedAboveMateriality(pool, {
      reconRunId: id,
      closeSessionId: run.closeSessionId,
      tenantId,
      materialityThreshold: body?.materialityThreshold,
      currency: body?.currency,
      createdBy: body?.createdBy,
    });
    res.json({ emitted });
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Emit recon issues failed');
  }
});

/** POST /api/close/recon-runs/:id/timing-difference */
router.post('/recon-runs/:id/timing-difference', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const body = req.body as { reason: string; linkedIssueId?: string };
    if (!body?.reason) {
      res.status(400).json({ error: 'reason required' });
      return;
    }
    const exception = await markTimingDifference(pool, tenantId, id, body.reason, body.linkedIssueId);
    res.status(201).json(exception);
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Mark timing difference failed');
  }
});

/** POST /api/close/recon-runs/:id/signoff */
router.post('/recon-runs/:id/signoff', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getReconRunWithOwnershipCheck(pool, tenantId, id, res))) return;
    const body = req.body as { signedBy: string; notes?: string };
    if (!body?.signedBy) {
      res.status(400).json({ error: 'signedBy required' });
      return;
    }
    const signoff = await signOffReconRun(pool, tenantId, id, body.signedBy, body.notes);
    res.json(signoff);
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Signoff recon run failed');
  }
});

/** POST /api/close/recon-match-groups/:id/confirm */
router.post('/recon-match-groups/:id/confirm', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getMatchGroupWithOwnershipCheck(pool, tenantId, id, res))) return;
    const group = await confirmMatchGroup(pool, tenantId, id);
    res.json(group);
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Confirm match group failed');
  }
});

/** POST /api/close/recon-match-groups/:id/reject */
router.post('/recon-match-groups/:id/reject', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    if (!(await getMatchGroupWithOwnershipCheck(pool, tenantId, id, res))) return;
    const group = await rejectMatchGroup(pool, tenantId, id);
    res.json(group);
  } catch (e) {
    if (e instanceof ReconError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Reject match group failed');
  }
});

export default router;
