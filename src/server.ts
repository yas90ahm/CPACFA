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
import trialBalanceRouter from './routes/trialBalance.js';
import cfaAnalystRouter from './routes/cfaAnalyst.js';
import justificationRouter from './routes/justification.js';
import orchestratorRouter from './routes/orchestrator.js';
import cfaAgentRouter from './routes/cfaAgent.js';
import cfoDashboardRouter from './routes/cfoDashboard.js';
import auditRouter from './routes/audit.js';
import exportRouter from './routes/export.js';
import financialMemoryRouter from './routes/financial_memory.js';
import vectorStoreRouter from './routes/vector_store.js';
import ingestionRouter from './routes/ingestion.js';
import hitlRouter from './routes/hitl.js';
import supervisorRouter from './routes/supervisor.js';
import memoryRouter from './routes/memory.js';
import integrationsRouter from './routes/integrations.js';
import pipelinesRouter from './routes/pipelines.js';
import closeRouter from './routes/close.js';
import forecastingRouter from './routes/forecasting.js';
import capitalRouter from './routes/capital.js';
import enterpriseRouter from './routes/enterprise.js';
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
import dcfRouter from './routes/dcf.js';
import compsRouter from './routes/comps.js';
import precedentRouter from './routes/precedent.js';
import businessCombinationRouter from './routes/business_combination.js';
import equityMethodRouter from './routes/equity_method.js';
import portfolioRouter from './routes/portfolio.js';
import leasesRouter from './routes/leases.js';
import fixedAssetsRouter from './routes/fixed_assets.js';
import epsRouter from './routes/eps.js';
import fxCurrencyRouter from './routes/fx_currency.js';
import lboRouter from './routes/lbo.js';
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
app.use('/api', apiLimiter, useRequireAuth ? requireAuth : optionalAuth);
app.use('/api', attachTenantPool);
app.use('/api', requireTenantContext);

// API: Trial Balance ingest → Balance Sheet + P&L
app.use('/api/trial-balance', trialBalanceRouter);

// API: CFA Analyst — audit, DCF, liquidity, pointed questions, regression
app.use('/api/cfa', cfaAnalystRouter);

// API: Justification chat (RAG, IRAC, [Source]), Export Audit Defense PDF
app.use('/api/justification', justificationRouter);

// API: Task Decomposition — Prepare Q4 Financials (plan, reconciliation worker, self-correction)
app.use('/api/orchestrator', orchestratorRouter);

// API: Investment Analysis Agent (DuPont, Benchmarking, Monte Carlo, Skepticism)
app.use('/api/agents/cfa', cfaAgentRouter);

// API: CFO Dashboard — MD&A narrative, KPIs (Burn Rate, Runway, Rule of 40, Working Capital), Pointed Questions (sensitivity)
app.use('/api/cfo-dashboard', cfoDashboardRouter);

// API: Audit Binder (statements + justification chain + line-level deep links), GAAP Consistency Report
app.use('/api/audit', auditRouter);

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

// API: Capital allocation — ROI, payback, portfolio
app.use('/api/capital', capitalRouter);

// API: Enterprise — M&A (QoE, WC adjustment), Financing (covenants), Tax strategy, Tax provision, Filing calendar
app.use('/api/enterprise', enterpriseRouter);

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

// API: DCF Valuation — Models, WACC, terminal value, sensitivity
app.use('/api/valuation', dcfRouter);

// API: Comparable Analysis — Trading comps, multiples, valuation range
app.use('/api/valuation', compsRouter);

// API: Precedent Transactions — M&A transactions, control premium
app.use('/api/valuation', precedentRouter);

// API: LBO model (CFA)
app.use('/api/valuation/lbo', lboRouter);

// API: Consolidation — suggest eliminations, footnote (agentic)
app.use('/api/consolidation', consolidationRouter);

// API: Statutory — suggest management-to-statutory adjustments (agentic)
app.use('/api/statutory', statutoryRouter);

// API: Business Combinations — Acquisitions, PPA, goodwill (IFRS 3 / ASC 805)
app.use('/api/acquisitions', businessCombinationRouter);

// API: Equity Method Investments — Share of profit, basis differences (IAS 28 / ASC 323)
app.use('/api/equity-investments', equityMethodRouter);

// API: Portfolio Analytics — Allocation, Sharpe/Sortino, attribution, rebalancing
app.use('/api/portfolios', portfolioRouter);
// API: Leases (ASC 842 / IFRS 16)
app.use('/api/leases', leasesRouter);

// API: Fixed assets and depreciation (PP&E)
app.use('/api/fixed-assets', fixedAssetsRouter);

// API: Earnings per share (ASC 260)
app.use('/api/eps', epsRouter);

// API: FX currency (ASC 830 / IAS 21) — translation, remeasurement, agentic
app.use('/api/fx', fxCurrencyRouter);

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
  console.log('  POST /api/trial-balance/ingest  — upload CSV/XLSX Trial Balance');
  console.log('  POST /api/trial-balance/statements — JSON Trial Balance → BS + P&L');
  console.log('  GET  /api/trial-balance/supported — supported formats & codification');
  console.log('  POST /api/cfa/audit — audit check (YoY, Benford, round-sum)');
  console.log('  POST /api/cfa/liquidity — Current/Quick Ratio, CCC, CFA summary');
  console.log('  POST /api/cfa/dcf — DCF valuation');
  console.log('  POST /api/cfa/sensitivity — WACC vs Growth sensitivity');
  console.log('  POST /api/cfa/question — pointed question (e.g. "Assess liquidity risk")');
  console.log('  POST /api/cfa/regression — OLS regression (Python/MCP if available)');
  console.log('  POST /api/justification/chat — IRAC justification with RAG + [Source]');
  console.log('  GET  /api/justification/audit-defense/export — Export Audit Defense PDF');
  console.log('  POST /api/orchestrator/prepare-q4 — Task Decomposition: Q4 Financials');
  console.log('  POST /api/orchestrator/intent — Detect "Prepare Q4 Financials" intent');
  console.log('  POST /api/orchestrator/lead-partner — Lead Partner CoT; body may include cfoView (narrative, varianceSummary, sensitivitySummary)');
  console.log('  POST /api/agents/cfa/analyze — Investment Analysis (DuPont, Benchmark, Monte Carlo, Skepticism)');
  console.log('  POST /api/cfo-dashboard/narrative — MD&A narrative + KPIs');
  console.log('  POST /api/cfo-dashboard/narrative/agentic — LLM-enhanced MD&A');
  console.log('  POST /api/cfo-dashboard/kpis — Burn Rate, Runway, Rule of 40, Working Capital, ROIC');
  console.log('  POST /api/cfo-dashboard/variance — Budget vs actual (?explain, useAgenticDrivers, includeHitlPending)');
  console.log('  POST /api/cfo-dashboard/variance/explain — Agentic variance explanation');
  console.log('  POST /api/cfo-dashboard/variance/drivers/refine — LLM-refine variance drivers');
  console.log('  POST /api/cfo-dashboard/variance/multi-period — Period A vs B actuals (?explain)');
  console.log('  POST /api/cfo-dashboard/variance/hitl-confirm — HITL confirm driver/comment → semantic memory');
  console.log('  POST /api/cfo-dashboard/pointed-question — Sensitivity (?useAgenticParser for LLM parsing)');
  console.log('  POST /api/cfo-dashboard/pointed-question/interpret — Agentic scenario interpretation');
  console.log('  POST /api/cfo-dashboard/kpi-commentary — Agentic KPI vs prior period');
  console.log('  POST /api/cfo-dashboard/scenario-recommend — Recommend scenarios for target runway/break-even');
  console.log('  POST /api/cfo-dashboard/board-one-pager — Board one-pager (agentic executive summary)');
  console.log('  POST /api/cfo-dashboard/board-deck — Board deck (slide-ready JSON, agentic)');
  console.log('  POST /api/cfo-dashboard/scenario — Strategic Sandbox: Runway & Break-even via Python sandbox');
  console.log('  POST /api/cfo-dashboard/sensitivity-report — Structured what-if report (?explain=true)');
  console.log('  POST /api/cfo-dashboard/sensitivity-report/interpret — Agentic sensitivity report interpretation');
  console.log('  GET  /api/audit/binder — Audit Binder (statements + CF + equity + line-level deep links)');
  console.log('  GET  /api/audit/reconciliation-summary — Reconciliation summary (TB/BS/CF/equity + failed checks)');
  console.log('  GET  /api/audit/todos — Urgent To-Dos (actionable from data gaps); PATCH /api/audit/todos/:id to mark done');
  console.log('  GET  /api/audit/gaap-consistency — GAAP Consistency Report (policy changes during fiscal year)');
  console.log('  POST /api/audit/auditor/verify — Auditor Portal login (token)');
  console.log('  POST /api/audit/auditor/internal-controls-chat — Internal Controls Q&A (auditor only)');
  console.log('  POST /api/export/pdf — Document package PDF (detailed | summary)');
  console.log('  POST /api/export/csv — Clean Ledger CSV (injection-safe)');
  console.log('  GET  /api/knowledge-base/tier1/entries — Global (FASB, IFRS, Tax)');
  console.log('  POST /api/knowledge-base/search — Hybrid search across tiers');
  console.log('  POST /api/knowledge-base/invoice-consistency — CPA: similar invoice treatments (consistency of reporting)');
  console.log('  POST /api/vector-store/ingest — Ingest document/chunks (Standard Type, Level of Authority)');
  console.log('  POST /api/vector-store/ingest-pdf — Chunk PDF handbooks / Internal Control docs');
  console.log('  POST /api/vector-store/query — RAG query; citations include document title + page number');
  console.log('  POST /api/vector-store/precedent — CPA: check similar precedent in company history');
  console.log('  POST /api/ingestion/agent — Ingestion Agent: .xlsx/.csv/.pdf/.json → classify & route to specialist');
  console.log('  POST /api/pipelines/bank — Bank transaction-level → transactions + TB cash + balance');
  console.log('  POST /api/pipelines/ap-aging — AP aging report (0-30, 31-60, 61-90, 90+)');
  console.log('  POST /api/pipelines/ar-aging — AR aging report');
  console.log('  POST /api/pipelines/payroll-accrual — Payroll accrual summary');
  console.log('  POST /api/close/je-suggestions — JE suggestions from gaps + reconciliation; POST /api/close/je-suggestions/explain — Agentic narrative');
  console.log('  POST /api/close/accrual-suggestions — Rule-based accrual/deferral; POST /api/close/accrual-suggestions/agentic — Agentic');
  console.log('  POST /api/close/inventory-valuation — Inventory valuation (FIFO / weighted_average)');
  console.log('  POST /api/close/checklist — Close checklist for period');
  console.log('  POST /api/close/period-lock — Lock period; GET /api/close/period-lock — list locks');
  console.log('  POST /api/close/audit-log — Append; GET /api/close/audit-log — Query');
  console.log('  POST /api/close/can-perform — Segregation check; POST /api/close/perform-action — Controlled action');
  console.log('  POST /api/forecasting/13-week-cash — Rolling 13-week cash forecast');
  console.log('  POST /api/forecasting/quarterly-annual — Quarterly P&L projection');
  console.log('  POST /api/capital/project-metrics — ROI + payback; POST /api/capital/portfolio — Portfolio');
  console.log('  POST /api/enterprise/quality-of-earnings — QoE (EBITDA, adj EBITDA)');
  console.log('  POST /api/enterprise/working-capital-adjustment — WC adjustment (M&A)');
  console.log('  POST /api/enterprise/covenants — Covenant monitoring (?explain for agentic); POST /api/enterprise/covenants/explain — Agentic commentary');
  console.log('  POST /api/enterprise/tax-strategy — Tax jurisdictions + suggestions');
  console.log('  POST /api/enterprise/tax-provision — Tax provision (current, deferred, rate rec)');
  console.log('  POST /api/enterprise/filing-calendar — Add filing; GET /api/enterprise/filing-calendar — List');
  console.log('  POST /api/enterprise/statutory-reconciliation — Management vs statutory (?explain for agentic narrative)');
  console.log('  POST /api/budget/version — Create budget version; GET /api/budget/version — List');
  console.log('  POST /api/budget/version/:id/lock — Lock budget; POST /api/budget/driver-based — Driver-based plan');
  console.log('  POST /api/budget/reforecast — Agentic reforecast from actuals + prior budget');
  console.log('  POST /api/entities/consolidation — Multi-entity consolidation');
  console.log('  POST /api/entities/fx-translation — FX translation to reporting currency');
  console.log('  GET  /api/reporting/pack-templates — Pack templates; POST /api/reporting/pack — Build pack');
  console.log('  GET  /api/reporting/commentary — Commentary library; POST /api/reporting/commentary/search — Search by tags');
  console.log('  POST /api/pipelines/bank-rec — Bank reconciliation (?explain for agentic); POST /api/pipelines/bank-rec/explain — Agentic narrative');
  console.log('  POST /api/pipelines/cash-position — Cash position');
  console.log('  POST /api/close/checklist-sign-off — Sign-off step; POST /api/close/task-assign — Assign task');
  console.log('  POST /api/audit/drl — Document request list; POST /api/audit/sampling — Sampling');
  console.log('  POST /api/audit/prior-period-comparison — Prior-period; POST /api/audit/prior-period-comparison/explain — Agentic');
  console.log('  GET  /api/access/dashboards — Role dashboards; GET /api/access/alerts — Alerts');
  console.log('  POST /api/access/usage-log — Append usage; GET /api/access/usage-log — Query');
  console.log('  POST /api/supervisor/chat — Supervisor Agent: ReAct + Claude 3.5 Sonnet (step1CPA, step2CFA, step3Supervisor)');
  console.log('  GET  /api/hitl/staging — Staging Area (Proposed Action + Justification); POST /api/hitl/webhook — HumanApproved/HumanRejected');
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
startIngestionScheduler();
