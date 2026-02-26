/**
 * General Ledger routes — mounts ingest at /api/gl.
 */

import { Router } from 'express';
import ingestRouter from './ingest.js';

const router = Router();
router.use(ingestRouter);

export default router;
