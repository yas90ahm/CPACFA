/**
 * CPA module — optional route grouping under /api/cpa when CPA_ENABLED=true.
 * Re-exposes CPA-related routes under a single namespace; existing /api/* routes remain unchanged.
 */

import { Router } from 'express';
import trialBalanceRouter from './trialBalance.js';
import closeRouter from './close.js';
import auditRouter from './audit.js';
import financialMemoryRouter from './financial_memory.js';
import vectorStoreRouter from './vector_store.js';
import pipelinesRouter from './pipelines.js';
import revenueRecognitionRouter from './revenue_recognition.js';
import leasesRouter from './leases.js';
import fixedAssetsRouter from './fixed_assets.js';
import epsRouter from './eps.js';
import fxCurrencyRouter from './fx_currency.js';
import deferredTaxRouter from './deferred_tax.js';
import impairmentRouter from './impairment.js';
import segmentReportingRouter from './segment_reporting.js';
import consolidationRouter from './consolidation.js';
import statutoryRouter from './statutory.js';
import businessCombinationRouter from './business_combination.js';
import equityMethodRouter from './equity_method.js';
import stockCompensationRouter from './stock_compensation.js';
import justificationRouter from './justification.js';

const cpaRouter = Router();

cpaRouter.use('/trial-balance', trialBalanceRouter);
cpaRouter.use('/close', closeRouter);
cpaRouter.use('/audit', auditRouter);
cpaRouter.use('/knowledge-base', financialMemoryRouter);
cpaRouter.use('/vector-store', vectorStoreRouter);
cpaRouter.use('/pipelines', pipelinesRouter);
cpaRouter.use('/revenue-recognition', revenueRecognitionRouter);
cpaRouter.use('/leases', leasesRouter);
cpaRouter.use('/fixed-assets', fixedAssetsRouter);
cpaRouter.use('/eps', epsRouter);
cpaRouter.use('/fx', fxCurrencyRouter);
cpaRouter.use('/deferred-tax', deferredTaxRouter);
cpaRouter.use('/impairment', impairmentRouter);
cpaRouter.use('/segments', segmentReportingRouter);
cpaRouter.use('/consolidation', consolidationRouter);
cpaRouter.use('/statutory', statutoryRouter);
cpaRouter.use('/acquisitions', businessCombinationRouter);
cpaRouter.use('/equity-investments', equityMethodRouter);
cpaRouter.use('/stock-comp', stockCompensationRouter);
cpaRouter.use('/justification', justificationRouter);

export default cpaRouter;
