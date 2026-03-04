/**
 * Close audit-log routes: audit-log POST/GET, audit-log/retention-purge.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { recordAuditLogAction } from '../../services/audit_service.js';
import { queryAuditLog, purgeRetention } from '../../services/audit_log_service.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';
import { canPerform } from '../../services/segregation_service.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();

router.post('/audit-log', async (req: Request, res: Response) => {
  try {
    const body = req.body as { actor: string; action: string; resource?: string; detail?: string; payload?: Record<string, unknown> };
    if (!body?.actor || !body?.action) {
      res.status(400).json({ error: 'Missing actor or action' });
      return;
    }
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req) ?? 'default';
    if (pool && tenantId) {
      await recordAuditLogAction(pool, tenantId, {
        actor: body.actor,
        action: body.action,
        resource: body.resource,
        detail: body.detail,
        payload: body.payload,
      });
    }
    const entry = {
      id: 'audit-ledger',
      timestamp: new Date().toISOString(),
      actor: body.actor,
      action: body.action,
      resource: body.resource,
      detail: body.detail,
      payload: body.payload,
    };
    res.json(entry);
  } catch (e) {
    send500(res, e, 'Audit log append failed');
  }
});

router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const actor = req.query.actor as string | undefined;
    const action = req.query.action as string | undefined;
    const resource = req.query.resource as string | undefined;
    const since = req.query.since as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req) ?? 'default';
    const context = pool && tenantId ? { pool, tenantId } : undefined;
    let entries = await queryAuditLog({ actor, action, resource, since, limit }, context);

    // Fallback: if audit_log table is empty, also try audit_ledger
    if (entries.length === 0 && pool && tenantId) {
      try {
        const { listAllForTenant } = await import('../../db/repositories/audit_ledger_repository.js');
        const ledgerEntries = await listAllForTenant(pool, tenantId, { limit: limit ?? 100 });
        let mapped = ledgerEntries.map((e: any) => ({
          id: e.id,
          timestamp: typeof e.created_at === 'string' ? e.created_at : (e.created_at?.toISOString?.() ?? e.timestamp ?? new Date().toISOString()),
          actor: e.created_by ?? e.userId ?? 'system',
          action: e.event_type ?? e.eventType ?? 'unknown',
          resource: e.period_label ?? e.periodLabel ?? undefined,
          detail: e.user_prompt_rationale ?? e.description ?? undefined,
        }));
        if (actor) mapped = mapped.filter((e: any) => e.actor === actor);
        if (action) mapped = mapped.filter((e: any) => e.action === action);
        if (since) {
          const sinceMs = new Date(since).getTime();
          mapped = mapped.filter((e: any) => new Date(e.timestamp).getTime() >= sinceMs);
        }
        entries = mapped;
      } catch {
        // audit_ledger fallback failed — return empty from audit_log
      }
    }

    res.json({ entries });
  } catch (e) {
    send500(res, e, 'Audit log query failed');
  }
});

router.post('/audit-log/retention-purge', async (req: Request, res: Response) => {
  try {
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    if (!canPerform(actorRole, 'audit_log_retention_purge')) {
      return res.status(403).json({ error: 'Insufficient role for this action' });
    }
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      return res.status(503).json({ error: 'Tenant context required', message: 'Pool and tenantId required for retention purge.' });
    }
    const context = { pool, tenantId };
    const { deleted } = await purgeRetention(context);
    await recordAuditLogAction(pool, tenantId, {
      action: 'audit_log_retention_purge',
      actor: (req as AuthRequest).userId ?? 'unknown',
      detail: `deleted=${deleted}`,
    });
    res.json({ deleted });
  } catch (e) {
    send500(res, e, 'Audit log retention purge failed');
  }
});

export default router;
