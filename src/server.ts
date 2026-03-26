/**
 * Sabit — Backend API
 * Trial Balance ingestion → Balance Sheet + P&L with Plan-Execute-Verify and codification traceability.
 * Phase 1: DB (Postgres when DATABASE_URL set), auth (JWT), optionalAuth middleware sets req.tenantId.
 *
 * Deployment modes:
 *   1. Single process (default): API + job worker together.
 *      $ npm start
 *
 *   2. Split process (horizontal scaling): API-only + dedicated worker(s).
 *      $ JOB_WORKER_ENABLED=false npm start   # API process (no worker)
 *      $ npm run worker                        # Standalone worker process
 *
 *   In split mode, set JOB_WORKER_ENABLED=false on the API process so it does
 *   not compete with the dedicated worker(s) for jobs. You can run multiple
 *   worker replicas — the job table uses SELECT ... FOR UPDATE SKIP LOCKED
 *   so each job is claimed by exactly one worker.
 */

import 'dotenv/config';
import { assertNoDestructiveInStagingOrProduction } from './db/destructive_guards.js';
import { applyModeDefaults, getMode, requireAuth as requireAuthFromMode, enableDevApi } from './lib/runtime_mode.js';
import { runStartupValidation, printStartupBanner } from './startup_validation.js';
import { seedDemo } from './scripts/seed_demo.js';
import { assertDeploymentConfigSafe, printDevModeEnforcementWarning } from './lib/deployment_config_guard.js';
import { assertSigningKeysInStrictMode, isSigningConfigured, getPublicKeyB64, verifyArtifactHash } from './lib/cert_signing.js';
import { computeArtifactHash } from './services/certification_artifact_service.js';

// Apply MODE-based defaults before any route setup (fail fast if prod/demo misconfigured)
const _modeConfig = applyModeDefaults();
assertSigningKeysInStrictMode();

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { optionalAuth, requireAuth, attachTenantPool, requireTenantContext, type AuthRequest } from './auth/middleware.js';
import { isDbConfigured, getPool, queryControl } from './db/index.js';
import authRouter from './routes/auth.js';
import trialBalanceRouter from './routes/trial-balance/index.js';
import justificationRouter from './routes/justification.js';
import auditRouter from './routes/audit/index.js';
import exportRouter from './routes/export.js';
import financialMemoryRouter from './routes/financial_memory.js';
import vectorStoreRouter from './routes/vector_store.js';
// QUARANTINED — Automated ingestion infrastructure not in MVP architecture
// import ingestionRouter from './routes/ingestion.js';
import hitlRouter from './routes/hitl.js';
import memoryRouter from './routes/memory.js';
import integrationsRouter from './routes/integrations.js';
// QUARANTINED — Bank pipeline, AP/AR aging, payroll accrual not in MVP architecture
// import pipelinesRouter from './routes/pipelines.js';
import closeRouter from './routes/close/index.js';
import precheckRouter from './routes/precheck.js';
import configRouter from './routes/config.js';
import settingsRouter from './routes/settings.js';
import verificationRouter from './routes/verification/index.js';
import coaMappingRouter from './routes/coa_mapping.js';
import coaRouter from './routes/coa.js';
import glRouter from './routes/gl/index.js';
import dataQualityRouter from './routes/data_quality.js';
import approvalsRouter from './routes/approvals.js';
import accountingIntegrationRouter from './routes/accounting_integration.js';
import bankConnectionsRouter from './routes/bank_connections.js';
import onboardingRouter from './routes/onboarding.js';
import tenantsRouter from './routes/tenants.js';
import portfolioRouter from './routes/portfolio.js';
import notificationsRouter, { webhookRouter, preferencesRouter } from './routes/notifications.js';
import cpaRouter from './routes/cpa_index.js';
import devDiagnosticsRouter from './routes/dev_diagnostics.js';
import fxCurrencyRouter from './routes/fx_currency.js';
import consolidationRouter from './routes/consolidation.js';
import xbrlRouter from './routes/xbrl.js';
// QUARANTINED — Automated ingestion infrastructure not in MVP architecture
// import { startIngestionScheduler } from './services/ingestion_scheduler.js';
import { runWorkerLoop } from './services/job_worker.js';
import { send500 } from './lib/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { runInBoundaryScope } from './lib/ai_boundary.js';

assertNoDestructiveInStagingOrProduction();

const app = express();
const PORT = process.env.PORT ?? 3000;

// Trust proxy when behind reverse proxy (for rate limit IP)
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(helmet());
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : (process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []);
// When no CORS env is set, allow local dev (frontend on 3000 or 3002 calling API on 3001)
const corsOptions = corsOrigins.length
  ? { origin: corsOrigins, credentials: true }
  : { origin: ['http://localhost:3000', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3002'], credentials: true };
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);

// AI boundary scope: each request gets its own advisory-context counter
// so concurrent requests don't interfere with each other.
app.use((_req, _res, next) => { runInBoundaryScope(next); });

// Health check (public)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'sabit-api' });
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

// Public verification endpoints (no auth required) — auditors and third-parties
// can fetch the signing public key and verify certification artifacts without a JWT.
// Only public-key and verify are exposed; artifacts/:id stays behind auth.
(() => {
  const pub = express.Router();
  pub.get('/public-key', (_req, res) => {
    if (!isSigningConfigured()) {
      return res.status(501).json({ contractVersion: 'v1', code: 'SIGNING_NOT_CONFIGURED', message: 'Certification signing is not configured.' });
    }
    const pubB64 = getPublicKeyB64();
    if (!pubB64) {
      return res.status(501).json({ contractVersion: 'v1', code: 'SIGNING_NOT_CONFIGURED', message: 'Public key not available.' });
    }
    res.json({ contractVersion: 'v1', alg: 'ed25519', publicKeyB64: pubB64 });
  });
  pub.post('/verify', (req, res) => {
    const { artifact, signatureB64, publicKeyB64 } = req.body ?? {};
    if (!artifact || !signatureB64 || !publicKeyB64) {
      return res.status(400).json({ contractVersion: 'v1', code: 'INVALID_INPUT', message: 'artifact, signatureB64, and publicKeyB64 required.' });
    }
    const artifactHash = computeArtifactHash(artifact);
    const signatureValid = verifyArtifactHash(artifactHash, signatureB64, publicKeyB64);
    res.json({ contractVersion: 'v1', artifactHash, signatureValid });
  });
  app.use('/api/verification/certification', pub);
})();

// General API rate limit (200 req/min per IP); /api/auth is mounted above so excluded
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests', retryAfter: '1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Require auth: from runtime_mode (MODE is single source of truth).
const useRequireAuth = requireAuthFromMode();

/** For tests: /api must use requireAuth when in deployment mode. */
export function useRequireAuthForApi(): boolean {
  return requireAuthFromMode();
}

/** For tests: /api-dev mounted only when MODE=dev and ENABLE_DEV_API=true. */
export function isDevApiMounted(): boolean {
  return getMode() === 'dev' && enableDevApi();
}

app.use('/api', apiLimiter, (req, res, next) => {
  return (useRequireAuth ? requireAuth : optionalAuth)(req as AuthRequest, res, next);
});
app.use('/api', attachTenantPool);
app.use('/api', requireTenantContext);

// Dev-only diagnostics router. Mounted ONLY when MODE=dev AND ENABLE_DEV_API=true.
const canMountDevApi = getMode() === 'dev' && enableDevApi();
if (canMountDevApi) {
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

// API: RAG Vector Store — pgvector-backed GAAP/IFRS/Tax semantic search
app.use('/api/vector-store', vectorStoreRouter);

// QUARANTINED — Automated ingestion infrastructure not in MVP architecture
// app.use('/api/ingestion', ingestionRouter);

// API: Semantic Memory (decisions, user corrections, justifications — vectorized; vendor lookup and consistency check)
app.use('/api/memory', memoryRouter);

// API: OAuth integrations (Gmail/Drive)
app.use('/api/integrations', integrationsRouter);

// QUARANTINED — Bank pipeline, AP/AR aging, payroll accrual not in MVP architecture
// app.use('/api/pipelines', pipelinesRouter);

// API: Month-end close — JE suggestions, checklist, period lock, audit log, segregation
app.use('/api/close', closeRouter);

// API: Pre-certification structural check (board-ready) — stateless, no DB/AI
app.use('/api/precheck', precheckRouter);

// API: Config — tenant materiality and other overrides
app.use('/api/config', configRouter);

// API: Settings — entity general settings, entity list
app.use('/api/settings', settingsRouter);

// API: Auditor verification — read-only snapshot hash verification
app.use('/api/verification', verificationRouter);

// API: COA Mapping — FS taxonomy lines, mapping rules, apply rules to accounts
app.use('/api/coa-mapping', coaMappingRouter);

// API: Chart of Accounts — upload CSV, list accounts, get by code
app.use('/api/coa', coaRouter);

// API: General Ledger — upload CSV, list entries, get by entry_id
app.use('/api/gl', glRouter);

// API: Data quality — Configurable rules, exceptions, agentic remediation
app.use('/api/data-quality', dataQualityRouter);

// API: Approvals — Multi-step workflows, requests, agentic summary
app.use('/api/approvals', approvalsRouter);

// API: Accounting integration — QuickBooks, Xero, NetSuite (sync TB, push JE, pull transactions)
app.use('/api/accounting-integration', accountingIntegrationRouter);

// API: Bank connections — Plaid/MX/Yodlee for live bank balance pre-fill
app.use('/api/bank-connections', bankConnectionsRouter);

// API: Onboarding — Guided setup, CoA import, first close wizard
app.use('/api/onboarding', onboardingRouter);

// API: Tenants — BYOD database_url (PATCH/GET; require auth, same-tenant only)
app.use('/api/tenants', tenantsRouter);

// API: Portfolio — cross-tenant dashboard (operating_partner / admin)
app.use('/api/portfolio', portfolioRouter);

// API: Notifications — in-app, webhook, preferences
app.use('/api/notifications', notificationsRouter);
app.use('/api/settings/webhooks', webhookRouter);
app.use('/api/settings/notification-preferences', preferencesRouter);

// API: HITL staging and webhook
app.use('/api/hitl', hitlRouter);

// API: FX currency translation — stateless (no tenant/DB)
app.use('/api/fx', fxCurrencyRouter);

// API: Multi-entity consolidation — stateless (no tenant/DB)
app.use('/api/consolidation', consolidationRouter);

// API: XBRL Taxonomy — search, stats, element lookup, classify
app.use('/api/xbrl', xbrlRouter);

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
  assertDeploymentConfigSafe();
  printDevModeEnforcementWarning();
  await runStartupValidation();
  printStartupBanner();
  if (getMode() === 'demo' && isDbConfigured()) {
    try {
      await seedDemo();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[seed_demo] Failed (server will still start):', msg);
      console.error('[seed_demo] You can create a session via the UI or retry: npx tsx src/scripts/seed_demo.ts');
    }
  }
  // Register financial event handlers (async AI sidecar)
  const { registerEventHandlers } = await import('./events/event_handlers.js');
  registerEventHandlers();

  // Attach Socket.IO for real-time collaboration
  const { createServer } = await import('http');
  const httpServer = createServer(app);
  const { initRealtime } = await import('./realtime/index.js');
  const socketCorsOrigins = corsOrigins.length > 0 ? corsOrigins : [];
  await initRealtime(httpServer, socketCorsOrigins);

  httpServer.listen(PORT, () => {
    console.log(`Sabit API listening on http://localhost:${PORT}`);
    if (getMode() === 'demo') {
      console.log(`Demo ready at http://localhost:${PORT}`);
      console.log('  Demo user seeded — check your .env or seed_demo output for credentials.');
    }
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
    console.log('  GET  /api/hitl/staging — Staging; POST /api/hitl/resolve-ingest — fix imbalanced TB ingest; POST /api/hitl/resolve-gl-ingest — fix imbalanced GL entry; POST /api/hitl/webhook — Approve/Reject');
    if (canMountDevApi) {
      console.log('  /api-dev (ENABLE_DEV_API=true): trial-balance, supervisor 410');
    }
  });
}

const isJest = typeof process.env.JEST_WORKER_ID === 'string';
const shouldStart = !isJest ? process.env.NODE_ENV !== 'test' : process.env.NODE_ENV === 'production';
if (shouldStart) {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
  // QUARANTINED — Automated ingestion infrastructure not in MVP architecture
  // startIngestionScheduler();
  const workerEnabled = (process.env.JOB_WORKER_ENABLED ?? 'true') === 'true';
  if (workerEnabled && isDbConfigured()) {
    runWorkerLoop({
      pollIntervalMs: Number(process.env.JOB_WORKER_POLL_MS ?? 2000),
      backoffBaseMs: Number(process.env.JOB_WORKER_BACKOFF_BASE_MS ?? 60_000),
    }).catch((e) => console.error('Job worker error:', e));
  }
}
