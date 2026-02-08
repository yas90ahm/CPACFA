/**
 * Audit Chain Verification — GET /api/verification/audit-chain
 * Read-only endpoint for auditors to verify hash chain integrity.
 * Returns verification summary; does NOT leak full ledger entries.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { verifyChain } from '../../services/audit_ledger_service.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();
const CONTRACT_VERSION = 'v1';

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

    const result = await verifyChain(pool, tenantId);

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
    });
  } catch (err) {
    send500(res, err as Error, 'Audit chain verification failed');
  }
});

export default router;
