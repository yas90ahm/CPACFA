/**
 * CPA module — optional route grouping under /api/cpa when CPA_ENABLED=true.
 * Re-exposes CPA-related routes under a single namespace; existing /api/* routes remain unchanged.
 * Only mounts routes that exist in this repo (out-of-scope routes removed).
 */

import { Router } from 'express';
import trialBalanceRouter from './trial-balance/index.js';
import closeRouter from './close/index.js';
import auditRouter from './audit/index.js';

const cpaRouter = Router();

cpaRouter.use('/trial-balance', trialBalanceRouter);
cpaRouter.use('/close', closeRouter);
cpaRouter.use('/audit', auditRouter);

export default cpaRouter;
