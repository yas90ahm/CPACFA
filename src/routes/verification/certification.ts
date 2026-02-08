/**
 * Certification artifact verification routes.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthRequest } from '../../auth/middleware.js';
import { getTenantPoolWithMigrations } from '../../db/index.js';
import { getArtifactByCloseSessionId } from '../../db/repositories/certification_artifact_repository.js';
import { isSigningConfigured, getPublicKeyB64 } from '../../lib/cert_signing.js';
import { computeArtifactHash } from '../../services/certification_artifact_service.js';
import { verifyArtifactHash } from '../../lib/cert_signing.js';
import { getLedgerSnapshotById } from '../../db/repositories/ledger_snapshot_repository.js';
import { verifyChain } from '../../db/repositories/audit_ledger_repository.js';
import type { CertificationArtifactV1 } from '../../types/certification_artifact.js';

const router = Router();

/** GET /api/verification/certification/public-key */
router.get('/public-key', (_req: Request, res: Response) => {
  if (!isSigningConfigured()) {
    return res.status(501).json({
      contractVersion: 'v1',
      code: 'SIGNING_NOT_CONFIGURED',
      message: 'Certification signing is not configured (keys missing in dev).',
    });
  }
  const pubB64 = getPublicKeyB64();
  if (!pubB64) {
    return res.status(501).json({
      contractVersion: 'v1',
      code: 'SIGNING_NOT_CONFIGURED',
      message: 'Public key not available.',
    });
  }
  res.json({
    contractVersion: 'v1',
    alg: 'ed25519',
    publicKeyB64: pubB64,
  });
});

/** GET /api/verification/certification/artifacts/:closeSessionId */
router.get('/artifacts/:closeSessionId', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.tenantId;
  if (!tenantId) {
    return res.status(503).json({ error: 'Tenant context required' });
  }
  const closeSessionId = req.params.closeSessionId;
  if (!closeSessionId) {
    return res.status(400).json({ error: 'closeSessionId required' });
  }
  const pool = await getTenantPoolWithMigrations(tenantId);
  const row = await getArtifactByCloseSessionId(pool, tenantId, closeSessionId);
  if (!row) {
    return res.status(404).json({
      contractVersion: 'v1',
      code: 'NOT_FOUND',
      message: 'No certification artifact for this close session.',
    });
  }
  res.json({
    contractVersion: 'v1',
    artifact: row.artifact,
    artifactHash: row.artifactHash,
    signatureB64: row.signatureB64,
    alg: row.alg,
    publicKeyB64: row.publicKeyB64,
  });
});

/** POST /api/verification/certification/verify */
router.post('/verify', async (req: Request, res: Response) => {
  const body = req.body as {
    artifact?: CertificationArtifactV1;
    signatureB64?: string;
    publicKeyB64?: string;
  };
  if (!body.artifact || !body.signatureB64 || !body.publicKeyB64) {
    return res.status(400).json({
      contractVersion: 'v1',
      code: 'INVALID_INPUT',
      message: 'artifact, signatureB64, and publicKeyB64 required.',
    });
  }
  const artifactHash = computeArtifactHash(body.artifact);
  const signatureValid = verifyArtifactHash(artifactHash, body.signatureB64, body.publicKeyB64);

  const result: Record<string, unknown> = {
    contractVersion: 'v1',
    artifactHash,
    signatureValid,
  };

  const authReq = req as AuthRequest;
  const tenantId = authReq.tenantId;
  if (tenantId && body.artifact.snapshot?.snapshotId) {
    try {
      const pool = await getTenantPoolWithMigrations(tenantId);
      const snapshot = await getLedgerSnapshotById(pool, body.artifact.snapshot.snapshotId);
      if (snapshot) {
        result.snapshotHashMatches =
          snapshot.snapshotHash === body.artifact.snapshot.snapshotHash;
      }
      const chainResult = await verifyChain(pool, tenantId);
      result.auditChainVerified =
        chainResult.valid &&
        body.artifact.auditChain?.lastEntryHash === chainResult.latestEntryHash;
    } catch {
      result.snapshotHashMatches = undefined;
      result.auditChainVerified = undefined;
    }
  }

  res.json(result);
});

export default router;
