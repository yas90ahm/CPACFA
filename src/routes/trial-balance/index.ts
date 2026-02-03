/**
 * Trial Balance routes aggregate: mounts ingest, parser, and classification at /api/trial-balance.
 * Each sub-router defines full paths (e.g. /ingest, /statements, /period/:periodLabel) so combined paths stay identical.
 */

import { Router } from 'express';
import ingestRouter from './ingest.js';
import parserRouter from './parser.js';
import classificationRouter from './classification.js';

const router = Router();
router.use(ingestRouter);
router.use(parserRouter);
router.use(classificationRouter);

export default router;
