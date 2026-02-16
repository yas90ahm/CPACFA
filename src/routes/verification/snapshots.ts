/**
 * Snapshot Verification — GET /api/verification/snapshots/:snapshotId
 * Read-only endpoint for auditors to independently verify certified snapshot hash.
 * Returns identifiers + hashes + metadata; does NOT leak snapshot payload.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getLedgerSnapshotById } from '../../db/repositories/ledger_snapshot_repository.js';
import { recomputeAndVerifySnapshotHash } from '../../services/ledger_snapshot_service.js';
import { snapshotIncludesGL } from '../../services/snapshot_gl_helpers.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();
const CONTRACT_VERSION = 'v1';

/** UUID v4 format (hex) — snapshotId must be valid UUID for ledger_snapshots.id */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET /api/verification/snapshots/:snapshotId — verify snapshot hash (read-only) */
router.get('/snapshots/:snapshotId', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({
        error: 'Tenant context required',
        code: 'VALIDATION',
        message: 'Tenant context (tenantId and pool) is required for snapshot verification.',
      });
      return;
    }

    const snapshotId = req.params.snapshotId?.trim() ?? '';
    if (!snapshotId || !UUID_REGEX.test(snapshotId)) {
      res.status(404).json({
        error: 'Snapshot not found',
        code: 'NOT_FOUND',
        message: 'No snapshot found for the given snapshotId.',
      });
      return;
    }

    const snapshot = await getLedgerSnapshotById(pool, tenantId, snapshotId);
    if (!snapshot || snapshot.tenantId !== tenantId) {
      res.status(404).json({
        error: 'Snapshot not found',
        code: 'NOT_FOUND',
        message: 'No snapshot found for the given snapshotId.',
      });
      return;
    }

    const { recomputedHash, hashMatches } = recomputeAndVerifySnapshotHash(snapshot);
    const includesGL = snapshotIncludesGL(snapshot);

    res.status(200).json({
      contractVersion: CONTRACT_VERSION,
      snapshot: {
        snapshotId: snapshot.id,
        tenantId: snapshot.tenantId,
        closeSessionId: snapshot.closeSessionId ?? null,
        periodLabel: snapshot.periodLabel,
        createdAt: snapshot.createdAt,
        hashVersion: snapshot.hashVersion,
        storedHash: snapshot.snapshotHash,
        recomputedHash,
        hashMatches,
        includesGL,
      },
    });
  } catch (err) {
    send500(res, err as Error, 'Snapshot verification failed');
  }
});

export default router;
