/**
 * Verification routes — read-only auditor verification surface.
 * Mounted at /api/verification.
 */

import { Router } from 'express';
import snapshotsRouter from './snapshots.js';
import auditChainRouter from './audit_chain.js';
import evidenceManifestRouter from './evidence_manifest.js';

const router = Router();
router.use(snapshotsRouter);
router.use(auditChainRouter);
router.use(evidenceManifestRouter);

export default router;
