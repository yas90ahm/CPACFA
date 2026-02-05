/**
 * FinOS Agent — Backend API
 * Trial Balance ingestion → Balance Sheet + P&L with Plan-Execute-Verify and codification traceability.
 * Phase 1: DB (Postgres when DATABASE_URL set), auth (JWT), optionalAuth middleware sets req.tenantId.
 */

import 'dotenv/config';
import { assertNoDestructiveInStagingOrProduction } from './db/destructive_guards.js';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { optionalAuth, requireAuth, attachTenantPool, requireTenantContext, type AuthRequest } from './auth/middleware.js';
import { isDbConfigured, getPool, queryControl } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import authRouter from './routes/auth.js';
import trialBalanceRouter from './routes/trial-balance/index.js';
import justificationRouter from './routes/justification.js';
import auditRouter from './routes/audit/index.js';
import exportRouter from './routes/export.js';
import financialMemoryRouter from './routes/financial_memory.js';
import vectorStoreRouter from './routes/vector_store.js';
import ingestionRouter from './routes/ingestion.js';
import hitlRouter from './routes/hitl.js';
import memoryRouter from './routes/memory.js';
import integrationsRouter from './routes/integrations.js';
import pipelinesRouter from './routes/pipelines.js';
import closeRouter from './routes/close/index.js';
import coaMappingRouter from './routes/coa_mapping.js';
import dataQualityRouter from './routes/data_quality.js';
import approvalsRouter from './routes/approvals.js';
import accountingIntegrationRouter from './routes/accounting_integration.js';
import onboardingRouter from './routes/onboarding.js';
import tenantsRouter from './routes/tenants.js';
import cpaRouter from './routes/cpa_index.js';
import devDiagnosticsRouter from './routes/dev_diagnostics.js';
import { startIngestionScheduler } from './services/ingestion_scheduler.js';
import { runWorkerLoop } from './services/job_worker.js';
import { send500 } from './lib/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';

assertNoDestructiveInStagingOrProduction();

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

// Require auth for all other /api routes. In production ALWAYS require auth (no bypass).
const isProduction = process.env.NODE_ENV === 'production';
const requireAuthByDefault = process.env.REQUIRE_AUTH !== 'false';
const useRequireAuth = isProduction || requireAuthByDefault;

/** For tests: in production, /api must always use requireAuth (bypass impossible). */
export function useRequireAuthForApi(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH !== 'false';
}

app.use('/api', apiLimiter, (req, res, next) => {
  return (useRequireAuth ? requireAuth : optionalAuth)(req as AuthRequest, res, next);
});
app.use('/api', attachTenantPool);
app.use('/api', requireTenantContext);

// Dev-only diagnostics router: optionalAuth for trial-balance/ingest, supervisor/chat, supervisor/session/:id/trace.
// Mounted only when NODE_ENV !== 'production'; never available in production.
if (!isProduction) {
  app.use('/api-dev', devDiagnosticsRouter);
}

// API: Trial Balance ingest → Balance Sheet + P&L
app.use('/api/trial-balance', trialBalanceRouter);

// API: Justification chat (RAG, IRAC, [Source]), Export Audit Defense PDF
app.use('/api/justification', justificationRouter);

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

// API: COA Mapping — FS taxonomy lines, mapping rules, apply rules to accounts
app.use('/api/coa-mapping', coaMappingRouter);

// API: Data quality — Configurable rules, exceptions, agentic remediation
app.use('/api/data-quality', dataQualityRouter);

// API: Approvals — Multi-step workflows, requests, agentic summary
app.use('/api/approvals', approvalsRouter);

// API: Accounting integration — QuickBooks, Xero, NetSuite (sync TB, push JE, pull transactions)
app.use('/api/accounting-integration', accountingIntegrationRouter);

// API: Onboarding — Guided setup, CoA import, first close wizard
app.use('/api/onboarding', onboardingRouter);

// API: Tenants — BYOD database_url (PATCH/GET; require auth, same-tenant only)
app.use('/api/tenants', tenantsRouter);

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

/** Exported for headless/integration tests (e.g. sovereign_validator). */
export { app };

/** Fail fast when running in production without DB. Exported for tests. */
export function ensureProductionHasDatabase(): void {
  if (process.env.NODE_ENV === 'production' && !isDbConfigured()) {
    console.error('[FATAL] NODE_ENV is production but DATABASE_URL is not set. Refusing to start.');
    process.exit(1);
  }
}

async function start(): Promise<void> {
  ensureProductionHasDatabase();
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
    console.log('  GET  /api/audit/binder — Audit Binder (certified-only); GET /api/audit/draft-package — draft PDF');
    console.log('  GET  /api/audit/reconciliation-summary — Reconciliation summary');
    console.log('  GET  /api/audit/todos — Urgent To-Dos; PATCH /api/audit/todos/:id to mark done');
    console.log('  GET  /api/audit/gaap-consistency — GAAP Consistency Report');
    console.log('  POST /api/audit/auditor/verify — Auditor Portal; POST /api/audit/auditor/internal-controls-chat');
    console.log('  POST /api/audit/professional-review — Professional review (judgment layer)');
    console.log('  POST /api/export/pdf — Document package PDF; POST /api/export/csv — Clean Ledger CSV');
    console.log('  GET  /api/knowledge-base/tier1/entries — Global (FASB, IFRS, Tax); POST /api/knowledge-base/search — Hybrid search');
    console.log('  POST /api/vector-store/ingest — Ingest docs; POST /api/vector-store/query — RAG query; POST /api/vector-store/precedent — CPA precedent');
    console.log('  POST /api/ingestion/agent — Ingestion Agent: .xlsx/.csv/.pdf/.json → classify & route');
    console.log('  POST /api/pipelines/bank — Bank tx; ap-aging, ar-aging, payroll-accrual, bank-rec, cash-position');
    console.log('  POST /api/close/sessions, /close/sessions/:id/certify — Close sessions; POST /api/close/journal-entries — JE lifecycle');
    console.log('  GET  /api/hitl/staging — Staging; POST /api/hitl/resolve-ingest — fix imbalanced ingest; POST /api/hitl/webhook — Approve/Reject');
    console.log('  (Supervisor quarantined: /api-dev/supervisor returns 410 when NODE_ENV !== production)');
  });
}

const isJest = typeof process.env.JEST_WORKER_ID === 'string';
const shouldStart = !isJest ? process.env.NODE_ENV !== 'test' : process.env.NODE_ENV === 'production';
if (shouldStart) {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
  startIngestionScheduler();
  const workerEnabled = (process.env.JOB_WORKER_ENABLED ?? 'true') === 'true';
  if (workerEnabled && isDbConfigured()) {
    runWorkerLoop({
      pollIntervalMs: Number(process.env.JOB_WORKER_POLL_MS ?? 2000),
      backoffBaseMs: Number(process.env.JOB_WORKER_BACKOFF_BASE_MS ?? 60_000),
    }).catch((e) => console.error('Job worker error:', e));
  }
}
