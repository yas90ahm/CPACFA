/**
 * Evidence Manifest Verification — GET /api/verification/evidence-manifest/:snapshotId
 * Read-only endpoint for auditors to verify evidence manifest integrity bound to certified snapshot.
 * Returns counts + hashes; does NOT leak full documents, URIs, or labels unless includeDetails=1.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getLedgerSnapshotById } from '../../db/repositories/ledger_snapshot_repository.js';
import { recomputeAndVerifySnapshotHash } from '../../services/ledger_snapshot_service.js';
import { hashManifestContent, HASH_VERSION_WITH_EVIDENCE_MANIFEST } from '../../lib/snapshot_hash.js';
import { send500 } from '../../lib/errorHandler.js';
import type { EvidenceManifest } from '../../types/ledger_snapshot.js';

const router = Router();
const CONTRACT_VERSION = 'v1';

/** UUID v4 format — snapshotId must be valid UUID. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function countManifestEntries(manifest: EvidenceManifest): number {
  return manifest.journalEntries.reduce(
    (sum, je) => sum + (je.evidenceLinks?.length ?? 0),
    0
  );
}

/** Minimal manifest detail for includeDetails=1: no URIs, labels, etc. */
function toMinimalManifestDetail(manifest: EvidenceManifest): Array<{
  journalEntryId: string;
  evidenceId: string;
  hashSha256: string;
  assertionType: string | null;
  requiredness: string | null;
}> {
  const out: Array<{
    journalEntryId: string;
    evidenceId: string;
    hashSha256: string;
    assertionType: string | null;
    requiredness: string | null;
  }> = [];
  for (const je of manifest.journalEntries ?? []) {
    for (const link of je.evidenceLinks ?? []) {
      out.push({
        journalEntryId: je.journalEntryId,
        evidenceId: link.evidenceId,
        hashSha256: link.hashSha256,
        assertionType: link.assertionType ?? null,
        requiredness: link.requiredness ?? null,
      });
    }
  }
  return out;
}

/** GET /api/verification/evidence-manifest/:snapshotId — verify evidence manifest (read-only) */
router.get('/evidence-manifest/:snapshotId', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({
        error: 'Tenant context required',
        code: 'VALIDATION',
        message: 'Tenant context (tenantId and pool) is required for evidence manifest verification.',
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

    const snapshot = await getLedgerSnapshotById(pool, snapshotId);
    if (!snapshot || snapshot.tenantId !== tenantId) {
      res.status(404).json({
        error: 'Snapshot not found',
        code: 'NOT_FOUND',
        message: 'No snapshot found for the given snapshotId.',
      });
      return;
    }

    const includeDetails = req.query.includeDetails === '1' || req.query.includeDetails === 'true';

    if (snapshot.hashVersion < HASH_VERSION_WITH_EVIDENCE_MANIFEST) {
      res.status(200).json({
        contractVersion: CONTRACT_VERSION,
        snapshotId: snapshot.id,
        supported: false,
        reason: 'NO_EVIDENCE_MANIFEST_IN_HASH_VERSION',
      });
      return;
    }

    const payload = snapshot.snapshotPayloadJson;
    const manifest: EvidenceManifest = payload.evidenceManifest ?? { journalEntries: [] };
    const entryCount = countManifestEntries(manifest);

    const recomputedManifestHash = hashManifestContent(manifest);
    const { hashMatches } = recomputeAndVerifySnapshotHash(snapshot);

    const body: Record<string, unknown> = {
      contractVersion: CONTRACT_VERSION,
      snapshotId: snapshot.id,
      supported: true,
      evidenceManifest: {
        entryCount,
        storedManifestHash: null,
        recomputedManifestHash,
        matchesSnapshotBinding: hashMatches,
        notes: null,
      },
    };

    if (includeDetails) {
      (body as Record<string, unknown>).manifestDetails = toMinimalManifestDetail(manifest);
    }

    res.status(200).json(body);
  } catch (err) {
    send500(res, err as Error, 'Evidence manifest verification failed');
  }
});

export default router;
