/**
 * CPA module — optional route grouping under /api/cpa when CPA_ENABLED=true.
 * Re-exposes CPA-related routes under a single namespace; existing /api/* routes remain unchanged.
 * Only mounts routes that exist in this repo (out-of-scope routes removed).
 */

import { Router } from 'express';
import trialBalanceRouter from './trial-balance/index.js';
import closeRouter from './close/index.js';
import auditRouter from './audit/index.js';
// QUARANTINED — Knowledge base routes not in MVP architecture
// import financialMemoryRouter from './financial_memory.js';
// import vectorStoreRouter from './vector_store.js';
// QUARANTINED — Bank pipeline, AP/AR aging, payroll accrual not in MVP architecture
// import pipelinesRouter from './pipelines.js';
// QUARANTINED — Justification/RAG chat not in MVP architecture
// import justificationRouter from './justification.js';

const cpaRouter = Router();

cpaRouter.use('/trial-balance', trialBalanceRouter);
cpaRouter.use('/close', closeRouter);
cpaRouter.use('/audit', auditRouter);
// QUARANTINED — Knowledge base routes not in MVP architecture
// cpaRouter.use('/knowledge-base', financialMemoryRouter);
// cpaRouter.use('/vector-store', vectorStoreRouter);
// QUARANTINED — Bank pipeline, AP/AR aging, payroll accrual not in MVP architecture
// cpaRouter.use('/pipelines', pipelinesRouter);
// QUARANTINED — Justification/RAG chat not in MVP architecture
// cpaRouter.use('/justification', justificationRouter);

export default cpaRouter;
