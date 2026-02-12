/**
 * Audit Chain Verification — GET /api/verification/audit-chain
 * Read-only endpoint for auditors to verify hash chain integrity.
 * Returns verification summary; does NOT leak full ledger entries.
 * Includes dbEnforcement: whether database triggers are present to block tampering.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { verifyChain } from '../../services/audit_ledger_service.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();
const CONTRACT_VERSION = 'v1';

/** Check if append-only and snapshot immutability triggers exist (query pg_trigger). */
async function getDbEnforcement(pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<{
  appendOnlyTrigger: boolean;
  snapshotImmutabilityTrigger: boolean;
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
    return {
      appendOnlyTrigger:
        names.has('audit_ledger_no_update') && names.has('audit_ledger_no_delete'),
      snapshotImmutabilityTrigger:
        names.has('ledger_snapshots_no_update') && names.has('ledger_snapshots_no_delete'),
    };
  } catch {
    return { appendOnlyTrigger: false, snapshotImmutabilityTrigger: false };
  }
}

/** GET /api/verification/audit-chain — verify audit ledger hash chain (read-only) */
router.get('/audit-chain', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({
        error: 'Tenant context required',
        code: 'VALIDATION',
        message: 'Tenant context (tenantId and pool) is required for audit chain verification.',
      });
      return;
    }

    const [result, dbEnforcement] = await Promise.all([
      verifyChain(pool, tenantId),
      getDbEnforcement(pool),
    ]);

    res.status(200).json({
      contractVersion: CONTRACT_VERSION,
      auditChain: {
        tenantId,
        verified: result.valid,
        entryCount: result.entryCount,
        verifiedAt: result.verifiedAt,
        lastEntryId: result.latestEntryId ?? null,
        lastEntryHash: result.latestEntryHash ?? null,
        ...(result.valid
          ? {}
          : {
              error: {
                code: 'CHAIN_BROKEN',
                message: result.message ?? 'Audit chain verification failed',
                ...(result.brokenAtEntryId ? { brokenAtEntryId: result.brokenAtEntryId } : {}),
              },
            }),
      },
      dbEnforcement,
    });
  } catch (err) {
    send500(res, err as Error, 'Audit chain verification failed');
  }
});

export default router;
