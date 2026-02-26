/**
 * DB Enforcement Health Check — GET /api/verification/db-enforcement
 * Confirms tamper-proof triggers exist in the tenant's database.
 * Use ?tenantId=X to check a specific tenant (requires auth).
 * If triggers are missing (e.g., pre-migration onboard), returns warning — does not crash.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getTenantPoolWithMigrations } from '../../db/index.js';

const router = Router();

async function getDbEnforcementStatus(pool: { query: (sql: string) => Promise<unknown> }): Promise<{
  appendOnlyTrigger: boolean;
  snapshotImmutabilityTrigger: boolean;
  triggersPresent: boolean;
  warning?: string;
}> {
  try {
    const r = (await pool.query(
      `SELECT t.tgname
       FROM pg_trigger t
       JOIN pg_class c ON t.tgrelid = c.oid
       WHERE c.relname IN ('audit_ledger', 'ledger_snapshots')
         AND NOT t.tgisinternal
         AND t.tgname IN (
           'audit_ledger_no_update', 'audit_ledger_no_delete',
           'ledger_snapshots_no_update', 'ledger_snapshots_no_delete'
         )`
    )) as { rows: { tgname: string }[] };
    const names = new Set(r.rows.map((row) => row.tgname));
    const appendOnlyTrigger =
      names.has('audit_ledger_no_update') && names.has('audit_ledger_no_delete');
    const snapshotImmutabilityTrigger =
      names.has('ledger_snapshots_no_update') && names.has('ledger_snapshots_no_delete');
    const triggersPresent = appendOnlyTrigger && snapshotImmutabilityTrigger;
    const warning = triggersPresent
      ? undefined
      : 'Tenant database is missing tamper-proof triggers. Run migrations (091_append_only_triggers) to apply. Tenants onboarded before this migration may need a manual migration run.';
    return {
      appendOnlyTrigger,
      snapshotImmutabilityTrigger,
      triggersPresent,
      ...(warning ? { warning } : {}),
    };
  } catch {
    return {
      appendOnlyTrigger: false,
      snapshotImmutabilityTrigger: false,
      triggersPresent: false,
      warning:
        'Could not verify triggers (query failed). Ensure tenant database is accessible and migrations have been run.',
    };
  }
}

/** GET /api/verification/db-enforcement — health check: triggers present in tenant DB */
router.get('/db-enforcement', async (req: Request, res: Response) => {
  try {
    const tenantIdParam = typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : undefined;
    const tenantId = tenantIdParam || getTenantId(req);

    if (!tenantId) {
      res.status(400).json({
        error: 'Tenant context required',
        code: 'VALIDATION',
        message:
          'Provide tenantId via ?tenantId=X query param or authenticate with tenant context.',
      });
      return;
    }

    const pool = tenantIdParam
      ? await getTenantPoolWithMigrations(tenantIdParam)
      : getTenantPool(req);

    if (!pool) {
      res.status(400).json({
        error: 'Tenant pool not available',
        code: 'VALIDATION',
        message: 'Could not resolve tenant database. Ensure tenant exists and DATABASE_URL is configured.',
      });
      return;
    }

    const status = await getDbEnforcementStatus(pool);

    res.status(200).json({
      tenantId,
      ...status,
    });
  } catch {
    res.status(200).json({
      tenantId: (typeof req.query.tenantId === 'string' ? req.query.tenantId : null) || getTenantId(req) || null,
      appendOnlyTrigger: false,
      snapshotImmutabilityTrigger: false,
      triggersPresent: false,
      warning: 'Could not verify tenant database. Ensure tenant exists and migrations have been run.',
    });
  }
});

export default router;
