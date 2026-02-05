/**
 * CPA module — optional route grouping under /api/cpa when CPA_ENABLED=true.
 * Re-exposes CPA-related routes under a single namespace; existing /api/* routes remain unchanged.
 * Only mounts routes that exist in this repo (out-of-scope routes removed).
 */

import { Router } from 'express';
import trialBalanceRouter from './trial-balance/index.js';
import closeRouter from './close/index.js';
import auditRouter from './audit/index.js';
import financialMemoryRouter from './financial_memory.js';
import vectorStoreRouter from './vector_store.js';
import pipelinesRouter from './pipelines.js';
import justificationRouter from './justification.js';

const cpaRouter = Router();

cpaRouter.use('/trial-balance', trialBalanceRouter);
cpaRouter.use('/close', closeRouter);
cpaRouter.use('/audit', auditRouter);
cpaRouter.use('/knowledge-base', financialMemoryRouter);
cpaRouter.use('/vector-store', vectorStoreRouter);
cpaRouter.use('/pipelines', pipelinesRouter);
cpaRouter.use('/justification', justificationRouter);

export default cpaRouter;
