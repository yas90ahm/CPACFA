/**
 * CFO Dashboard routes aggregate: mounts KPIs, narratives, and scenarios at /api/cfo-dashboard (no path prefix here).
 * Each sub-router defines full paths (e.g. /kpis, /narrative, /scenarios) so combined paths stay identical.
 */

import { Router } from 'express';
import kpisRouter from './kpis.js';
import narrativesRouter from './narratives.js';
import scenariosRouter from './scenarios.js';

const router = Router();
router.use(kpisRouter);
router.use(narrativesRouter);
router.use(scenariosRouter);

export default router;
