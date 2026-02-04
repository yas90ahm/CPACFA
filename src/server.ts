/**
 * FinOS Agent — Backend API
 * Trial Balance ingestion → Balance Sheet + P&L with Plan-Execute-Verify and codification traceability.
 * Phase 1: DB (Postgres when DATABASE_URL set), auth (JWT), optionalAuth middleware sets req.tenantId.
 */

import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { optionalAuth, requireAuth, attachTenantPool, requireTenantContext } from './auth/middleware.js';
import { isDbConfigured, getPool, queryControl } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import authRouter from './routes/auth.js';
import trialBalanceRouter from './routes/trial-balance/index.js';
import justificationRouter from './routes/justification.js';
import orchestratorRouter from './routes/orchestrator.js';
import auditRouter from './routes/audit/index.js';
import exportRouter from './routes/export.js';
import financialMemoryRouter from './routes/financial_memory.js';
import vectorStoreRouter from './routes/vector_store.js';
import ingestionRouter from './routes/ingestion.js';
import hitlRouter from './routes/hitl.js';
import supervisorRouter from './routes/supervisor.js';
import memoryRouter from './routes/memory.js';
import integrationsRouter from './routes/integrations.js';
import pipelinesRouter from './routes/pipelines.js';
import closeRouter from './routes/close/index.js';
import forecastingRouter from './routes/forecasting.js';
import capitalRouter from './routes/capital.js';
import budgetRouter from './routes/budget.js';
import entitiesRouter from './routes/entities.js';
import intercompanyRouter from './routes/intercompany.js';
import dataQualityRouter from './routes/data_quality.js';
import approvalsRouter from './routes/approvals.js';
import catalogRouter from './routes/catalog.js';
import reportingRouter from './routes/reporting.js';
import accessRouter from './routes/access.js';
import accountingIntegrationRouter from './routes/accounting_integration.js';
import arApWorkflowsRouter from './routes/ar_ap_workflows.js';
import invoiceToBooksRouter from './routes/invoice_to_books.js';
import bankFeedMatchingRouter from './routes/bank_feed_matching.js';
import revenueRecognitionRouter from './routes/revenue_recognition.js';
import onboardingRouter from './routes/onboarding.js';
import tenantsRouter from './routes/tenants.js';
import stockCompensationRouter from './routes/stock_compensation.js';
import deferredTaxRouter from './routes/deferred_tax.js';
import impairmentRouter from './routes/impairment.js';
import segmentReportingRouter from './routes/segment_reporting.js';
import businessCombinationRouter from './routes/business_combination.js';
import equityMethodRouter from './routes/equity_method.js';
import leasesRouter from './routes/leases.js';
import fixedAssetsRouter from './routes/fixed_assets.js';
import epsRouter from './routes/eps.js';
import fxCurrencyRouter from './routes/fx_currency.js';
import consolidationRouter from './routes/consolidation.js';
import statutoryRouter from './routes/statutory.js';
import cpaRouter from './routes/cpa_index.js';
import { startIngestionScheduler } from './services/ingestion_scheduler.js';
import { send500 } from './lib/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Trust proxy when behind reverse proxy (for rate limit IP)
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(helmet());
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : (process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []);
// When no CORS env is set, allow local dev (frontend on 3000 calling API on 3001)
const corsOptions = corsOrigins.length
  ? { origin: corsOrigins }
  : { origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] };
app.use(cors(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);

// Health check (public)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'finos-agent-api' });
});

// Readiness: checks control DB without leaking internals
app.get('/health/ready', async (_req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ status: 'not_ready', reason: 'database_not_configured' });
  }
  try {
    await queryControl('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'database_unavailable' });
  }
});

// Auth (no requireAuth / attachTenantPool); rate limits applied inside auth router
app.use('/api/auth', authRouter);

// General API rate limit (200 req/min per IP); /api/auth is mounted above so excluded
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests', retryAfter: '1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Require auth for all other /api routes. In production always require auth; in dev respect REQUIRE_AUTH.
const isProduction = process.env.NODE_ENV === 'production';
const requireAuthByDefault = process.env.REQUIRE_AUTH !== 'false';
const useRequireAuth = isProduction || requireAuthByDefault;

// Auth bypass for diagnostics: only when NOT production and explicitly enabled (DIAGNOSTICS_AUTH_BYPASS=true).
// In production these paths always require auth.
const authBypassPaths: (string | RegExp)[] = [
  '/trial-balance/ingest',
  '/supervisor/chat',
  /^\/supervisor\/session\/[^/]+\/trace$/,
];
function shouldBypassAuth(path: string): boolean {
  if (isProduction) return false;
  if (process.env.DIAGNOSTICS_AUTH_BYPASS !== 'true') return false;
  return authBypassPaths.some((p) => (typeof p === 'string' ? path === p : p.test(path)));
}
app.use('/api', apiLimiter, (req, res, next) => {
  const path = (req as express.Request).path;
  if (shouldBypassAuth(path)) return optionalAuth(req as AuthRequest, res, next);
  return (useRequireAuth ? requireAuth : optionalAuth)(req as AuthRequest, res, next);
});
app.use('/api', attachTenantPool);
app.use('/api', requireTenantContext);

// API: Trial Balance ingest → Balance Sheet + P&L
app.use('/api/trial-balance', trialBalanceRouter);

// API: Justification chat (RAG, IRAC, [Source]), Export Audit Defense PDF
app.use('/api/justification', justificationRouter);

// API: Task Decomposition — Prepare Q4 Financials (plan, reconciliation worker, self-correction)
app.use('/api/orchestrator', orchestratorRouter);

// API: Audit Binder (statements + justification chain + line-level deep links), GAAP Consistency Report
app.use('/api/audit', auditRouter);

// API: Export — PDF document package, Clean Ledger CSV (TypeScript-only; no Python proxy)
app.use('/api/export', exportRouter);

// API: Financial Memory (three-tier: Global/Firm/Session, hybrid search, CPA invoice consistency)
app.use('/api/knowledge-base', financialMemoryRouter);

// API: RAG Vector Store (Intelligent Context — ingestion, precedent, citation with document title + page number)
app.use('/api/vector-store', vectorStoreRouter);

// API: Ingestion Agent (auto-detect type, classify bank/tax, route to specialist, data cleaning)
app.use('/api/ingestion', ingestionRouter);

// API: Semantic Memory (decisions, user corrections, justifications — vectorized; vendor lookup and consistency check)
app.use('/api/memory', memoryRouter);

// API: OAuth integrations (Gmail/Drive)
app.use('/api/integrations', integrationsRouter);

// API: Pipelines — Bank transaction-level, AP/AR aging, Payroll accrual
app.use('/api/pipelines', pipelinesRouter);

// API: Month-end close — JE suggestions, checklist, period lock, audit log, segregation
app.use('/api/close', closeRouter);

// API: Forecasting — Rolling 13-week cash, quarterly/annual projections
app.use('/api/forecasting', forecastingRouter);

// API: Capital allocation — ROI, payback
app.use('/api/capital', capitalRouter);

// API: Budget — Versioning, reforecast (agentic), driver-based planning
app.use('/api/budget', budgetRouter);

// API: Entities — Multi-entity consolidation
app.use('/api/entities', entitiesRouter);

// API: Intercompany — Pairs, reconciliation, agentic variance explain
app.use('/api/intercompany', intercompanyRouter);

// API: Data quality — Configurable rules, exceptions, agentic remediation
app.use('/api/data-quality', dataQualityRouter);

// API: Approvals — Multi-step workflows, requests, agentic summary
app.use('/api/approvals', approvalsRouter);

// API: Catalog — Datasets, query, agentic intent/summary (ad-hoc analysis)
app.use('/api/catalog', catalogRouter);

// API: Reporting — Pack builder, commentary library
app.use('/api/reporting', reportingRouter);

// API: Access — Role dashboards, alerts, usage log
app.use('/api/access', accessRouter);

// API: Accounting integration — QuickBooks, Xero, NetSuite (sync TB, push JE, pull transactions)
app.use('/api/accounting-integration', accountingIntegrationRouter);

// API: AR/AP workflows — Collections (agentic), payment run (agentic), cash application (agentic)
app.use('/api/ar-ap-workflows', arApWorkflowsRouter);

// API: Invoice-in → books — Capture, agentic coding, approval, post to GL
app.use('/api/invoice-to-books', invoiceToBooksRouter);

// API: Bank feed + auto-match to GL/AR (agentic)
app.use('/api/bank-feed-matching', bankFeedMatchingRouter);

// API: Revenue recognition — Contracts, POBs, allocation/schedule (agentic)
app.use('/api/revenue-recognition', revenueRecognitionRouter);

// API: Onboarding — Guided setup, CoA import, first close wizard
app.use('/api/onboarding', onboardingRouter);

// API: Tenants — BYOD database_url (PATCH/GET; require auth, same-tenant only)
app.use('/api/tenants', tenantsRouter);

// API: Stock Compensation — Grants, valuations, expense, dilution (IFRS 2 / ASC 718)
app.use('/api/stock-comp', stockCompensationRouter);

// API: Deferred Tax — Temporary differences, DTA/DTL, valuation allowance (IAS 12 / ASC 740)
app.use('/api/deferred-tax', deferredTaxRouter);

// API: Impairment — CGUs, goodwill, impairment testing (IAS 36 / ASC 350)
app.use('/api/impairment', impairmentRouter);

// API: Segment Reporting — Operating segments, 10% test, reconciliation (IFRS 8 / ASC 280)
app.use('/api/segments', segmentReportingRouter);

// API: Consolidation — suggest eliminations, footnote (agentic)
app.use('/api/consolidation', consolidationRouter);

// API: Statutory — suggest management-to-statutory adjustments (agentic)
app.use('/api/statutory', statutoryRouter);

// API: Business Combinations — Acquisitions, PPA, goodwill (IFRS 3 / ASC 805)
app.use('/api/acquisitions', businessCombinationRouter);

// API: Equity Method Investments — Share of profit, basis differences (IAS 28 / ASC 323)
app.use('/api/equity-investments', equityMethodRouter);

// API: Leases (ASC 842 / IFRS 16)
app.use('/api/leases', leasesRouter);

// API: Fixed assets and depreciation (PP&E)
app.use('/api/fixed-assets', fixedAssetsRouter);

// API: Earnings per share (ASC 260)
app.use('/api/eps', epsRouter);

// API: FX currency (ASC 830 / IAS 21) — translation, remeasurement, agentic
app.use('/api/fx', fxCurrencyRouter);

// API: Supervisor Agent (ReAct + Claude); HUD / Full Audit & Statement Build
app.use('/api/supervisor', supervisorRouter);
// API: HITL staging and webhook
app.use('/api/hitl', hitlRouter);

// CPA module: optional grouping under /api/cpa when CPA_ENABLED=true (same handlers as above)
const cpaEnabled = process.env.CPA_ENABLED === 'true';
if (cpaEnabled) {
  app.use('/api/cpa', cpaRouter);
}

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (sanitized: log full error, respond generic only)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  send500(res, err, 'Internal server error');
});

async function start(): Promise<void> {
  if (isDbConfigured()) {
    try {
      await runMigrations();
    } catch (e) {
      console.error('Migrations failed:', e);
      process.exit(1);
    }
  }
  app.listen(PORT, () => {
    console.log(`FinOS Agent API listening on http://localhost:${PORT}`);
  console.log('  POST /api/trial-balance/ingest — upload CSV/XLSX Trial Balance');
  console.log('  POST /api/trial-balance/statements — JSON Trial Balance → BS + P&L');
  console.log('  GET  /api/trial-balance/supported — supported formats & codification');
  console.log('  POST /api/justification/chat — IRAC justification with RAG + [Source]');
  console.log('  GET  /api/justification/audit-defense/export — Export Audit Defense PDF');
  console.log('  POST /api/orchestrator/prepare-q4 — Task Decomposition: Q4 Financials');
  console.log('  POST /api/orchestrator/intent — Detect "Prepare Q4 Financials" intent');
  console.log('  POST /api/orchestrator/lead-partner — Lead Partner CoT');
  console.log('  GET  /api/audit/binder — Audit Binder (statements + CF + equity + line-level deep links)');
  console.log('  GET  /api/audit/reconciliation-summary — Reconciliation summary (TB/BS/CF/equity + failed checks)');
  console.log('  GET  /api/audit/todos — Urgent To-Dos; PATCH /api/audit/todos/:id to mark done');
  console.log('  GET  /api/audit/gaap-consistency — GAAP Consistency Report');
  console.log('  POST /api/audit/auditor/verify — Auditor Portal login; POST /api/audit/auditor/internal-controls-chat — Internal Controls Q&A');
  console.log('  POST /api/export/pdf — Document package PDF; POST /api/export/csv — Clean Ledger CSV');
  console.log('  GET  /api/knowledge-base/tier1/entries — Global (FASB, IFRS, Tax); POST /api/knowledge-base/search — Hybrid search');
  console.log('  POST /api/vector-store/ingest — Ingest docs; POST /api/vector-store/query — RAG query; POST /api/vector-store/precedent — CPA precedent');
  console.log('  POST /api/ingestion/agent — Ingestion Agent: .xlsx/.csv/.pdf/.json → classify & route');
  console.log('  POST /api/pipelines/bank — Bank tx; ap-aging, ar-aging, payroll-accrual, bank-rec, cash-position');
  console.log('  POST /api/close/je-suggestions, accrual-suggestions, checklist, period-lock, audit-log, can-perform, perform-action');
  console.log('  POST /api/forecasting/13-week-cash, quarterly-annual; POST /api/capital/project-metrics — ROI + payback');
  console.log('  POST /api/budget/version, driver-based, reforecast; POST /api/entities/consolidation, fx-translation');
  console.log('  GET  /api/reporting/pack-templates; POST /api/reporting/pack; GET /api/reporting/commentary');
  console.log('  POST /api/audit/drl, sampling, prior-period-comparison; GET /api/access/dashboards, alerts');
  console.log('  POST /api/supervisor/chat — Supervisor Agent (ReAct + Claude); GET /api/supervisor/conflicts — CPA vs CFA conflicts');
  console.log('  GET  /api/hitl/staging — Staging; POST /api/hitl/resolve-ingest — fix imbalanced ingest; POST /api/hitl/webhook — Approve/Reject');
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
startIngestionScheduler();
