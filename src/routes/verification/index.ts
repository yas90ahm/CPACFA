/**
 * Verification routes — read-only auditor verification surface.
 * Mounted at /api/verification.
 */

import { Router } from 'express';
import snapshotsRouter from './snapshots.js';
import auditChainRouter from './audit_chain.js';
import dbEnforcementRouter from './db_enforcement.js';
import evidenceManifestRouter from './evidence_manifest.js';
import certificationRouter from './certification.js';

const router = Router();
router.use(snapshotsRouter);
router.use(auditChainRouter);
router.use(dbEnforcementRouter);
router.use(evidenceManifestRouter);
router.use('/certification', certificationRouter);

export default router;
