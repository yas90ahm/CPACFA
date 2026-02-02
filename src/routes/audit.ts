/**
 * Audit Binder and GAAP Consistency API.
 * Bundles financial statements with Justification Chain; deep links for every P&L number;
 * GAAP Consistency Report (policy changes during fiscal year).
 */

import { Router, type Request, type Response } from 'express';
import type { AuthRequest } from '../auth/middleware.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { setQualitativeEvidenceMissing } from '../services/risk_context_store.js';
import {
  buildAuditBinder,
  buildGAAPConsistencyReport,
  registerStatementGeneration,
  recordPolicyChange,
  getLastStatementGeneration,
  getRecordedPolicyChanges,
} from '../services/audit_export_service.js';
import { buildReconciliationSummary } from '../services/reconciliation_summary_service.js';
import { buildReconciliationTieOut } from '../services/reconciliation_tie_out_service.js';
import { generateReconciliationNarrativeAgentic } from '../services/agentic_reconciliation_narrative.js';
import {
  getReconciliationTodos,
  addTodosFromGaps,
  markTodoDone,
  getGapsWithResolution,
} from '../services/reconciliation_todos.js';
import { justifyWithRAG } from '../services/justification_service.js';
import {
  addDocumentRequest,
  updateDocumentRequest,
  listDocumentRequests,
  fulfillDocumentRequest,
} from '../services/drl_service.js';
import { runSampling } from '../services/sampling_service.js';
import { suggestSampleSize } from '../services/sampling_design_service.js';
import { storeSamplingResult, getSamplingResult, updateSamplingTestResults } from '../services/sampling_result_store.js';
import { generateSamplingNarrativeAgentic } from '../services/agentic_sampling_narrative.js';
import {
  getMateriality,
  materialityThresholdFromSettings,
} from '../services/materiality_service.js';
import {
  buildPriorPeriodComparison,
  explainPriorPeriodComparisonAgentic,
} from '../services/agentic_prior_period_comparison.js';
import { loadCloseContext, requirePriorPeriodForComparison, isPriorPeriodBeforeCurrent } from '../services/close_context.js';
import { getPrecedentForCloseStep, toSimilarPrecedentSummary } from '../services/precedent_for_close_step.js';
import type { SamplingInput } from '../types/audit_evidence.js';
import { exportAuditBinderToPdf, exportAuditBinderToCsv } from '../services/audit_binder_export_service.js';
import {
  addPBCItem,
  listPBCItems,
  getPBCItem,
  updatePBCItem,
} from '../services/pbc_service.js';
import { buildClosePackage } from '../services/close_package_service.js';
import { exportClosePackageToPdf, exportClosePackageToCsv } from '../services/close_package_export_service.js';
import { buildCloseOnePager, exportCloseOnePagerToPdf } from '../services/close_one_pager_service.js';
import { buildAuditFile, exportAuditFileToPdf } from '../services/audit_file_service.js';
import {
  createEngagement,
  listEngagements,
  getEngagement,
  updateEngagement,
  deleteEngagement,
  addPeriodToEngagement,
  removePeriodFromEngagement,
  listPeriodsForEngagement,
  getCloseStatusForEngagement,
  getAuditFileForEngagement,
} from '../services/audit_engagement_service.js';
import { generateCloseNarrativeAgentic } from '../services/agentic_close_narrative.js';
import { runProfessionalReview } from '../services/professional_review_service.js';
import * as professionalAuditFlagsRepo from '../db/repositories/professional_audit_flags_repository.js';
import type { ProfessionalAuditFlagCategory, ProfessionalAuditFlagStatus } from '../types/professional_review.js';
import { runIntegrityGate } from '../services/integrity_gate_service.js';
import { IntegrityGateViolation } from '../types/integrity.js';
import type { IntegrityContractFact } from '../types/integrity.js';
import { classifyTrialBalanceDeterministic } from '../services/accountClassifier.js';

const router = Router();

/** Auditor Portal token: in production must be set and not the default; in dev default allowed. */
function getAuditorToken(): string | null {
  const raw = process.env.AUDITOR_PORTAL_TOKEN;
  if (process.env.NODE_ENV === 'production') {
    if (!raw || raw.trim() === '' || raw === 'auditor-readonly-2025') return null;
    return raw;
  }
  return raw ?? 'auditor-readonly-2025';
}

/** Optional Python backend URL for Forensic Skeptic / Audit Dashboard (e.g. http://localhost:5000). */
const BACKEND_PYTHON_URL = process.env.BACKEND_PYTHON_URL ?? '';

/**
 * POST /api/audit/register-statements
 * Body: { statements: FinancialStatementsOutput, sourceDocumentId?, sourceDocumentName?, reasoningChainId? }
 * Registers the last statement generation for Audit Binder line-level links.
 */
router.post('/register-statements', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      statements?: unknown;
      sourceDocumentId?: string;
      sourceDocumentName?: string;
      reasoningChainId?: string;
    };
    const statements = body?.statements;
    if (!statements || typeof statements !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "statements" in body' });
      return;
    }
    await registerStatementGeneration(statements as Parameters<typeof registerStatementGeneration>[0], {
      sourceDocumentId: body.sourceDocumentId,
      sourceDocumentName: body.sourceDocumentName,
      reasoningChainId: body.reasoningChainId,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    res.json({ ok: true, message: 'Statement generation registered for Audit Binder.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(500).json({ error: 'Registration error', message });
  }
});

/**
 * GET /api/audit/binder
 * Query: periodStart (ISO), periodEnd (ISO), entityName?
 * Returns: Audit Binder (all statements + justification chain + line-level deep links).
 */
router.get('/binder', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    res.json(binder);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Binder build failed';
    res.status(500).json({ error: 'Binder error', message });
  }
});

/**
 * GET /api/audit/binder/export/pdf
 * Query: periodStart, periodEnd, entityName? — same as /binder. Returns PDF buffer.
 */
router.get('/binder/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    const buffer = await exportAuditBinderToPdf(binder);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-binder-${periodStart}-${periodEnd}.pdf"`);
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Binder PDF export failed';
    res.status(500).json({ error: 'Binder export error', message });
  }
});

/**
 * GET /api/audit/binder/export/csv
 * Query: periodStart, periodEnd, entityName? — same as /binder. Returns CSV buffer.
 */
router.get('/binder/export/csv', async (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const entityName = (req.query.entityName as string) ?? 'Entity';
    const host = req.get('host');
    const baseUrl = req.protocol + '://' + (host ?? '');
    const binder = await buildAuditBinder({
      periodStart,
      periodEnd,
      entityName,
      baseSourceDocumentUrl: `${baseUrl}/api/audit/source-document`,
      baseReasoningUrl: `${baseUrl}/api/audit/reasoning`,
      tenantId: getTenantId(req),
      pool: getTenantPool(req),
    });
    const buffer = exportAuditBinderToCsv(binder);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-binder-${periodStart}-${periodEnd}.csv"`);
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Binder CSV export failed';
    res.status(500).json({ error: 'Binder export error', message });
  }
});

/**
 * GET /api/audit/reconciliation-summary
 * Returns: Single reconciliation artifact — TB balance, BS balance, CF tie, equity tie, failed checks.
 * Optional ?includeNarrative=true for agentic narrative.
 */
router.get('/reconciliation-summary', async (req: Request, res: Response) => {
  try {
    const summary = await buildReconciliationSummary(null, getTenantId(req), getTenantPool(req));
    if (!summary) {
      res.status(404).json({
        error: 'No statement generation registered',
        message: 'Upload a trial balance and generate statements first, or POST with statements in body.',
      });
      return;
    }
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const payload: Record<string, unknown> = { ...summary };
    if (includeNarrative) {
      payload.narrative = await generateReconciliationNarrativeAgentic(summary);
    }
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconciliation summary failed';
    res.status(500).json({ error: 'Reconciliation error', message });
  }
});

/**
 * GET /api/audit/reconciliation-tie-out — Tie-out for period: resolutions passed/waived or list open.
 */
router.get('/reconciliation-tie-out', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
      return;
    }
    const tieOut = await buildReconciliationTieOut(tenantId, periodLabel, pool ?? undefined);
    res.json(tieOut);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconciliation tie-out failed';
    res.status(500).json({ error: 'Reconciliation error', message });
  }
});

/**
 * POST /api/audit/reconciliation-summary/narrative — Optional agentic narrative for reconciliation summary.
 */
router.post('/reconciliation-summary/narrative', async (req: Request, res: Response) => {
  try {
    const summary = await buildReconciliationSummary(null, getTenantId(req), getTenantPool(req));
    if (!summary) {
      res.status(404).json({
        error: 'No statement generation registered',
        message: 'Build reconciliation summary first.',
      });
      return;
    }
    const narrative = await generateReconciliationNarrativeAgentic(summary);
    res.json({ narrative });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconciliation narrative failed';
    res.status(500).json({ error: 'Reconciliation error', message });
  }
});

/**
 * POST /api/audit/reconciliation-summary
 * Body: { statements?: FinancialStatementsOutput }
 * Returns: Reconciliation summary for the provided statements (or last registered).
 */
router.post('/reconciliation-summary', async (req: Request, res: Response) => {
  try {
    const body = req.body as { statements?: unknown };
    const summary = await buildReconciliationSummary(
      body?.statements as Parameters<typeof buildReconciliationSummary>[0],
      getTenantId(req),
      getTenantPool(req)
    );
    if (!summary) {
      res.status(404).json({
        error: 'No statements',
        message: 'Provide statements in body or register a statement generation first.',
      });
      return;
    }
    res.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reconciliation summary failed';
    res.status(500).json({ error: 'Reconciliation error', message });
  }
});

/**
 * GET /api/audit/gaap-consistency
 * Query: periodStart (ISO), periodEnd (ISO)
 * Returns: GAAP Consistency Report (flags accounting policy changes during fiscal year).
 */
router.get('/gaap-consistency', (req: Request, res: Response) => {
  try {
    const periodStart = (req.query.periodStart as string) ?? new Date().toISOString().slice(0, 10);
    const periodEnd = (req.query.periodEnd as string) ?? new Date().toISOString().slice(0, 10);
    const report = buildGAAPConsistencyReport({ periodStart, periodEnd });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GAAP report failed';
    res.status(500).json({ error: 'GAAP report error', message });
  }
});

/**
 * POST /api/audit/policy-change
 * Body: { effectiveDate, policyArea, changeDescription, citation?, eventType?, reasoning? }
 * Records an accounting policy change for GAAP Consistency Report.
 */
router.post('/policy-change', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      effectiveDate?: string;
      policyArea?: string;
      changeDescription?: string;
      citation?: string;
      eventType?: string;
      reasoning?: string;
    };
    if (!body?.effectiveDate || !body?.policyArea || !body?.changeDescription) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'Body must include effectiveDate, policyArea, changeDescription.',
      });
      return;
    }
    const record = recordPolicyChange({
      effectiveDate: body.effectiveDate,
      policyArea: body.policyArea,
      changeDescription: body.changeDescription,
      citation: body.citation,
      eventType: body.eventType,
      reasoning: body.reasoning,
    });
    res.status(201).json(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Policy change record failed';
    res.status(500).json({ error: 'Policy change error', message });
  }
});

/**
 * GET /api/audit/source-document/:id
 * Deep link: returns metadata (or redirect) for the source document (PDF/CSV) for a statement generation.
 */
router.get('/source-document/:id', async (req: Request, res: Response) => {
  const stored = await getLastStatementGeneration(getTenantId(req), getTenantPool(req));
  if (!stored || stored.sourceDocumentId !== req.params.id) {
    res.status(404).json({
      error: 'Not found',
      message: 'Source document not found or no statement generation registered.',
    });
    return;
  }
  res.json({
    id: stored.sourceDocumentId,
    name: stored.sourceDocumentName,
    registeredAt: stored.registeredAt,
    message: 'Download or view the uploaded Trial Balance (CSV/XLSX) from the ingestion that produced this statement.',
  });
});

/**
 * GET /api/audit/reasoning/:id
 * Deep link: returns the timestamped Reasoning Monologue (Plan-Execute-Verify chain) for a statement generation.
 */
router.get('/reasoning/:id', async (req: Request, res: Response) => {
  const stored = await getLastStatementGeneration(getTenantId(req), getTenantPool(req));
  const id = req.params.id;
  if (!stored) {
    res.status(404).json({
      error: 'Not found',
      message: 'Reasoning monologue not found or no statement generation registered.',
    });
    return;
  }
  if (stored.reasoningChainId !== id) {
    res.status(404).json({
      error: 'Not found',
      message: 'Reasoning monologue id does not match.',
    });
    return;
  }
  const chain = stored.statements.reasoningChain;
  res.json({
    id: stored.reasoningChainId,
    timestamp: stored.reasoningChainTimestamp,
    plan: chain?.plan,
    executedAt: chain?.executedAt,
    verification: chain?.verification,
    message: 'Reasoning chain (Plan-Execute-Verify) used to categorize and build the financial statements.',
  });
});

/**
 * GET /api/audit/todos
 * Query: status? (open | done), limit?
 * Returns: Actionable to-dos derived from data gaps (Urgent To-Dos list).
 */
router.get('/todos', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const status = req.query.status as 'open' | 'done' | undefined;
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    const todos = await getReconciliationTodos({ status, limit }, pool, tenantId);
    res.json({ todos, count: todos.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Todos list failed';
    res.status(500).json({ error: 'Todos error', message });
  }
});

/** GET /api/audit/gaps-with-resolution — Gaps with linked todo status (resolved when todo done) */
router.get('/gaps-with-resolution', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const status = req.query.status as 'open' | 'done' | undefined;
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    const gaps = await getGapsWithResolution({ status, limit }, pool, tenantId);
    res.json({ gaps, count: gaps.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gaps with resolution failed';
    res.status(500).json({ error: 'Audit error', message });
  }
});

/**
 * POST /api/audit/todos/from-gaps
 * Body: { gaps: DataGap[] }
 * Converts data gaps into actionable to-dos (idempotent by gapId). Call after TB/statements pipeline returns gaps.
 */
router.post('/todos/from-gaps', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const body = req.body as { gaps?: Array<{ id: string; type: string; title: string; description: string; urgency: string; suggestion?: string }> };
    const gaps = body?.gaps ?? [];
    const added = await addTodosFromGaps(gaps as Parameters<typeof addTodosFromGaps>[0], pool, tenantId);
    res.status(201).json({ ok: true, added, count: added.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'From-gaps failed';
    res.status(500).json({ error: 'Todos error', message });
  }
});

/**
 * PATCH /api/audit/todos/:id
 * Body: { status: 'open' | 'done' }
 * Mark a to-do as done or reopen.
 */
router.patch('/todos/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const id = req.params.id;
    const body = req.body as { status?: 'open' | 'done' };
    const status = body?.status;
    if (status !== 'open' && status !== 'done') {
      res.status(400).json({ error: 'status must be "open" or "done"' });
      return;
    }
    const todo = await markTodoDone(id, status, pool, tenantId);
    if (!todo) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }
    res.json({ ok: true, todo });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    res.status(500).json({ error: 'Todos error', message });
  }
});

/**
 * GET /api/audit/policy-changes
 * Returns all recorded policy changes (for admin or GAAP report detail).
 */
router.get('/policy-changes', (_req: Request, res: Response) => {
  try {
    const list = getRecordedPolicyChanges();
    res.json({ policyChanges: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    res.status(500).json({ error: 'List error', message });
  }
});

/**
 * POST /api/audit/auditor/verify
 * Body: { token: string }
 * Returns: { valid: boolean } — for Auditor Portal read-only login.
 */
router.post('/auditor/verify', (req: Request, res: Response) => {
  try {
    const auditorToken = getAuditorToken();
    if (auditorToken === null) {
      return res.status(503).json({ error: 'Auditor portal not configured', message: 'Set AUDITOR_PORTAL_TOKEN in production.' });
    }
    const body = req.body as { token?: string };
    const token = (body?.token ?? '').trim();
    const valid = token === auditorToken;
    res.json({ valid });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verify failed';
    res.status(500).json({ error: 'Verify error', message });
  }
});

/**
 * POST /api/audit/auditor/internal-controls-chat
 * Body: { question: string, token?: string }
 * Auditor Portal: interrogate the bot specifically about Internal Controls.
 * Scopes the question to internal controls and returns IRAC justification with [Source].
 */
router.post('/auditor/internal-controls-chat', async (req: Request, res: Response) => {
  try {
    const auditorToken = getAuditorToken();
    if (auditorToken === null) {
      return res.status(503).json({ error: 'Auditor portal not configured', message: 'Set AUDITOR_PORTAL_TOKEN in production.' });
    }
    const body = req.body as { question?: string; token?: string };
    const token = (body?.token ?? '').trim();
    if (token !== auditorToken) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing auditor token.' });
      return;
    }
    const question = (body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'Missing "question" in body' });
      return;
    }
    const scopedQuestion = `Internal controls: ${question}`;
    const response = await justifyWithRAG(scopedQuestion, { framework: 'FASB' });
    res.json({
      question: question,
      scopedQuestion: scopedQuestion,
      irac: response.irac,
      sourceTag: response.sourceTag,
      formatted: response.formatted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal controls chat failed';
    res.status(500).json({ error: 'Internal controls chat error', message });
  }
});

/**
 * GET /api/audit/dashboard/forensic-anomalies
 * Audit Dashboard for Controller: list forensic anomalies (Benford, round-sum, unusual-time, weekend).
 * Forensic Skeptic does not alert the user who made the entry; all anomalies appear here for Controller review.
 * Query: limit?, scan_since?, created_by?, flag_type?
 * If BACKEND_PYTHON_URL is set, proxies to Python backend; otherwise returns empty list.
 */
router.get('/dashboard/forensic-anomalies', async (req: Request, res: Response) => {
  try {
    if (!BACKEND_PYTHON_URL) {
      res.json({
        forensic_anomalies: [],
        count: 0,
        message: 'Set BACKEND_PYTHON_URL to Python backend for Forensic Skeptic / Audit Dashboard data.',
      });
      return;
    }
    const limit = req.query.limit ?? '200';
    const scan_since = req.query.scan_since as string | undefined;
    const created_by = req.query.created_by as string | undefined;
    const flag_type = req.query.flag_type as string | undefined;
    const params = new URLSearchParams({ limit: String(limit) });
    if (scan_since) params.set('scan_since', scan_since);
    if (created_by) params.set('created_by', created_by);
    if (flag_type) params.set('flag_type', flag_type);
    const url = `${BACKEND_PYTHON_URL.replace(/\/$/, '')}/api/audit/dashboard/forensic-anomalies?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Forensic anomalies fetch failed';
    res.status(500).json({ error: 'Dashboard error', message });
  }
});

/** POST /api/audit/drl — Add document request (auditor request) */
router.post('/drl', async (req: Request, res: Response) => {
  try {
    const body = req.body as { requestLabel: string; documentId?: string; status?: 'pending' | 'fulfilled' | 'partial' };
    if (!body?.requestLabel) {
      res.status(400).json({ error: 'Missing requestLabel' });
      return;
    }
    const entry = await addDocumentRequest(body, getTenantPool(req), getTenantId(req));
    res.status(201).json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DRL add failed';
    res.status(500).json({ error: 'DRL error', message });
  }
});

/** GET /api/audit/drl — List document requests (optional status) */
router.get('/drl', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'pending' | 'in_progress' | 'fulfilled' | 'partial' | undefined;
    const list = await listDocumentRequests(status, getTenantPool(req), getTenantId(req));
    res.json({ requests: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DRL list failed';
    res.status(500).json({ error: 'DRL error', message });
  }
});

/** PATCH /api/audit/drl/:id — Update DRL item (assignee, due date, status) — FW3 */
router.patch('/drl/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body as { assignee?: string; dueDate?: string; status?: 'pending' | 'in_progress' | 'fulfilled' | 'partial' };
    const updated = await updateDocumentRequest(req.params.id, body, getTenantPool(req), getTenantId(req));
    if (!updated) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DRL update failed';
    res.status(500).json({ error: 'DRL error', message });
  }
});

/** POST /api/audit/drl/:id/fulfill — Fulfill document request (link document) */
router.post('/drl/:id/fulfill', async (req: Request, res: Response) => {
  try {
    const body = req.body as { documentId: string };
    if (!body?.documentId) {
      res.status(400).json({ error: 'Missing documentId' });
      return;
    }
    const entry = await fulfillDocumentRequest(req.params.id, body.documentId, getTenantPool(req), getTenantId(req));
    if (!entry) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DRL fulfill failed';
    res.status(500).json({ error: 'DRL error', message });
  }
});

/** POST /api/audit/sampling — Run sampling (random / risk_based / hilo); stores result with runId for test results (FW3) */
router.post('/sampling', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const body = req.body as SamplingInput;
    if (!body?.population || !body?.items || !Array.isArray(body.items) || body?.sampleSize == null) {
      res.status(400).json({ error: 'Missing population, items, or sampleSize' });
      return;
    }
    const result = runSampling(body);
    const stored = await storeSamplingResult(result, pool, tenantId);
    res.json({
      ...result,
      runId: stored.runId,
      createdAt: stored.createdAt,
      periodLabel: stored.periodLabel,
      materialityThreshold: stored.materialityThreshold,
      populationCount: stored.populationCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sampling failed';
    res.status(500).json({ error: 'Sampling error', message });
  }
});

/** GET /api/audit/sampling/suggest-size?populationSize=&risk=&confidenceLevel=&materialityThreshold=&preferRiskBased= — Suggest sample size for audit sampling. */
router.get('/sampling/suggest-size', (req: Request, res: Response) => {
  try {
    const populationSize = Number(req.query.populationSize);
    if (!Number.isFinite(populationSize) || populationSize < 0) {
      res.status(400).json({ error: 'Missing or invalid populationSize query' });
      return;
    }
    const risk = req.query.risk != null ? Number(req.query.risk) : undefined;
    const confidenceLevel = req.query.confidenceLevel != null ? Number(req.query.confidenceLevel) : undefined;
    const materialityThreshold = req.query.materialityThreshold != null ? Number(req.query.materialityThreshold) : undefined;
    const preferRiskBased = String(req.query.preferRiskBased ?? '') === 'true';
    const result = suggestSampleSize(populationSize, {
      risk: Number.isFinite(risk) ? risk : undefined,
      confidenceLevel: Number.isFinite(confidenceLevel) ? confidenceLevel : undefined,
      materialityThreshold: Number.isFinite(materialityThreshold) ? materialityThreshold : undefined,
      preferRiskBased,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Suggest sample size failed';
    res.status(500).json({ error: 'Sampling design error', message });
  }
});

/** POST /api/audit/sampling/design — Suggest sample size (body: populationSize, optional risk, confidenceLevel, materialityThreshold, preferRiskBased). */
router.post('/sampling/design', (req: Request, res: Response) => {
  try {
    const body = req.body as { populationSize: number; risk?: number; confidenceLevel?: number; materialityThreshold?: number; preferRiskBased?: boolean };
    const populationSize = body?.populationSize != null ? Number(body.populationSize) : NaN;
    if (!Number.isFinite(populationSize) || populationSize < 0) {
      res.status(400).json({ error: 'Missing or invalid populationSize in body' });
      return;
    }
    const result = suggestSampleSize(populationSize, {
      risk: body.risk,
      confidenceLevel: body.confidenceLevel,
      materialityThreshold: body.materialityThreshold,
      preferRiskBased: body.preferRiskBased,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sampling design failed';
    res.status(500).json({ error: 'Sampling design error', message });
  }
});

/** GET /api/audit/sampling/:runId — Get sampling run. Optional ?includeNarrative=true for agentic narrative. */
router.get('/sampling/:runId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const runId = req.params.runId ?? '';
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!runId) {
      res.status(400).json({ error: 'Missing runId' });
      return;
    }
    const run = await getSamplingResult(runId, pool, tenantId);
    if (!run) {
      res.status(404).json({ error: 'Sampling run not found' });
      return;
    }
    const payload: Record<string, unknown> = { ...run };
    if (includeNarrative) {
      payload.narrative = await generateSamplingNarrativeAgentic(run);
    }
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Get sampling run failed';
    res.status(500).json({ error: 'Sampling error', message });
  }
});

/** POST /api/audit/sampling/:runId/narrative — Optional agentic narrative for sampling run. */
router.post('/sampling/:runId/narrative', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const runId = req.params.runId ?? '';
    if (!runId) {
      res.status(400).json({ error: 'Missing runId' });
      return;
    }
    const run = await getSamplingResult(runId, pool, tenantId);
    if (!run) {
      res.status(404).json({ error: 'Sampling run not found' });
      return;
    }
    const narrative = await generateSamplingNarrativeAgentic(run);
    res.json({ runId, narrative });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sampling narrative failed';
    res.status(500).json({ error: 'Sampling error', message });
  }
});

/** POST /api/audit/sampling/:runId/test-results — Record test results (pass/fail/exception) per selected item (FW3) */
router.post('/sampling/:runId/test-results', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const runId = req.params.runId ?? '';
    const body = req.body as { testResults: { id: string; result: 'pass' | 'fail' | 'exception'; note?: string }[] };
    if (!runId || !Array.isArray(body?.testResults)) {
      res.status(400).json({ error: 'Missing runId or testResults array' });
      return;
    }
    const updated = await updateSamplingTestResults(runId, body.testResults, pool, tenantId);
    if (!updated) {
      res.status(404).json({ error: 'Sampling run not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Record test results failed';
    res.status(500).json({ error: 'Sampling test results error', message });
  }
});

/** GET /api/audit/pbc — List PBC (provided by client) items (FW3) */
router.get('/pbc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const status = req.query.status as 'pending' | 'provided' | 'partial' | undefined;
    const periodLabel = req.query.periodLabel as string | undefined;
    const items = await listPBCItems({ status, periodLabel }, pool, tenantId);
    res.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List PBC failed';
    res.status(500).json({ error: 'PBC error', message });
  }
});

/** POST /api/audit/pbc — Add PBC item (FW3) */
router.post('/pbc', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const body = req.body as { label: string; description?: string; periodLabel?: string };
    if (!body?.label) {
      res.status(400).json({ error: 'Missing label' });
      return;
    }
    const item = await addPBCItem({
      label: body.label,
      description: body.description,
      periodLabel: body.periodLabel,
      status: 'pending',
    }, pool, tenantId);
    res.status(201).json(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Add PBC failed';
    res.status(500).json({ error: 'PBC error', message });
  }
});

/** PATCH /api/audit/pbc/:id — Update PBC item (status, providedAt, documentId) (FW3) */
router.patch('/pbc/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body as { status?: 'pending' | 'provided' | 'partial'; providedAt?: string; documentId?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing PBC id' });
      return;
    }
    const updated = await updatePBCItem(id, body, pool, tenantId);
    if (!updated) {
      res.status(404).json({ error: 'PBC item not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update PBC failed';
    res.status(500).json({ error: 'PBC error', message });
  }
});

/** POST /api/audit/prior-period-comparison — Prior-period comparison (current vs prior lines); material from materiality settings when tenant present */
router.post('/prior-period-comparison', async (req: Request, res: Response) => {
  try {
    const body = req.body as import('../types/audit_evidence.js').PriorPeriodComparisonInput;
    if (!body?.currentPeriodLabel || !body?.priorPeriodLabel) {
      res.status(400).json({ error: 'Prior period data required.', message: 'currentPeriodLabel and priorPeriodLabel are required.' });
      return;
    }
    if (!isPriorPeriodBeforeCurrent(body.priorPeriodLabel, body.currentPeriodLabel)) {
      res.status(400).json({
        error: 'Prior period must be before current period.',
        message: 'priorPeriodLabel must be temporally before currentPeriodLabel (e.g. 2023-Q4 before 2024-Q1).',
      });
      return;
    }
    const priorRequiredErr = requirePriorPeriodForComparison(
      body.priorPeriodLabel,
      undefined,
      body.priorLines
    );
    if (priorRequiredErr) {
      res.status(400).json({ error: 'Prior period data required.', message: priorRequiredErr });
      return;
    }
    if (!body?.currentLines || !body?.priorLines) {
      res.status(400).json({ error: 'Missing currentLines or priorLines' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    let priorSnapshot: import('../types/kpi_history.js').KPISnapshot | undefined;
    if (pool && tenantId && body.priorPeriodLabel) {
      const closeCtx = await loadCloseContext({
        pool,
        tenantId,
        entityId: (body as { entityId?: string }).entityId ?? '',
        currentPeriodLabel: body.currentPeriodLabel,
        priorPeriodLabel: body.priorPeriodLabel,
      });
      priorSnapshot = closeCtx.priorSnapshot;
    }
    const settings = getMateriality(tenantId, body.currentPeriodLabel);
    const th = materialityThresholdFromSettings(settings);
    const result = buildPriorPeriodComparison(body, {
      materialThresholdPercent: th.percent,
      materialThresholdAmount: th.amount,
    });
    // Mandatory similar precedent for close step (auditability)
    const precedentResult = getPrecedentForCloseStep('prior_period_comparison', {
      entityId: (body as { entityId?: string }).entityId,
      currentPeriodLabel: body.currentPeriodLabel,
      priorPeriodLabel: body.priorPeriodLabel,
    });
    const similarPrecedent = toSimilarPrecedentSummary('prior_period_comparison', precedentResult);
    if (priorSnapshot != null) {
      res.json({ ...result, priorSnapshot, similarPrecedent });
    } else {
      res.json({ ...result, similarPrecedent });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prior-period comparison failed';
    res.status(500).json({ error: 'Prior-period error', message });
  }
});

/** POST /api/audit/prior-period-comparison/explain — Agentic narrative for prior-period comparison */
router.post('/prior-period-comparison/explain', async (req: Request, res: Response) => {
  try {
    const body = req.body as import('../types/audit_evidence.js').PriorPeriodComparisonResult;
    if (!body?.lines || !body?.currentPeriodLabel || !body?.priorPeriodLabel) {
      res.status(400).json({ error: 'Missing comparison result (lines, period labels)' });
      return;
    }
    const narrative = await explainPriorPeriodComparisonAgentic(body);
    res.json({ narrative });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Explain prior-period failed';
    res.status(500).json({ error: 'Explain error', message });
  }
});

/** POST /api/audit/professional-review — Run Judgment Layer (five protocols); returns ProfessionalReviewResponse. */
router.post('/professional-review', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const body = req.body as {
      runId: string;
      periodLabel: string;
      trialBalance?: { entries: { accountName: string; debit: number; credit: number }[] };
      balanceSheet?: { totalAssets: number; totalLiabilities: number; totalEquity: number };
      profitAndLoss?: { totalRevenue: number; totalExpenses: number; netIncome: number };
      covenantResult?: { debtToEbitdaBreach?: boolean; interestCoverageBreach?: boolean };
      liquidityMetrics?: { currentRatio?: number; runwayMonths?: number };
      contractIds?: string[];
      contractText?: string | string[];
      leaseDocuments?: string | string[];
      portfolioIds?: string[];
    };
    if (!body?.runId || !body?.periodLabel) {
      res.status(400).json({ error: 'runId and periodLabel are required' });
      return;
    }

    const { listContracts } = await import('../services/revenue_recognition_service.js');
    const allContracts = pool ? await listContracts(tenantId, pool, {}) : [];
    const hasContractIds = body.contractIds != null && body.contractIds.length > 0;
    const contractsForInput = hasContractIds
      ? allContracts.filter((c) => body.contractIds!.includes(c.id)).map((c) => ({
          contractNumber: c.contractNumber,
          performanceObligations: c.performanceObligations.map((p) => ({ name: p.name, description: p.description })),
          totalContractValue: c.totalContractValue,
        }))
      : allContracts.map((c) => ({
          contractNumber: c.contractNumber,
          performanceObligations: c.performanceObligations.map((p) => ({ name: p.name, description: p.description })),
          totalContractValue: c.totalContractValue,
        }));

    const hasContractText = Array.isArray(body.contractText)
      ? body.contractText.some((s) => typeof s === 'string' && s.trim().length > 0)
      : typeof body.contractText === 'string' && body.contractText.trim().length > 0;
    const hasLeaseDocuments = Array.isArray(body.leaseDocuments)
      ? body.leaseDocuments.some((s) => typeof s === 'string' && s.trim().length > 0)
      : typeof body.leaseDocuments === 'string' && body.leaseDocuments.trim().length > 0;
    const hasNarrative =
      contractsForInput.length > 0 || hasContractText || hasLeaseDocuments;

    if (ENABLE_INTEGRATED_SUPERVISOR) {
      await setQualitativeEvidenceMissing(pool!, tenantId, body.periodLabel, !hasNarrative);
    }

    const input: import('../types/professional_review.js').ProfessionalReviewInput = {
      tenantId,
      periodLabel: body.periodLabel,
      runId: body.runId,
      narrativeEvidenceSummary: hasNarrative ? 'Contract/lease narrative provided.' : '',
      trialBalance: body.trialBalance,
      balanceSheet: body.balanceSheet,
      profitAndLoss: body.profitAndLoss,
      covenantResult: body.covenantResult,
      liquidityMetrics: body.liquidityMetrics,
      contracts: contractsForInput.length > 0 ? contractsForInput : undefined,
      contractText: body.contractText,
      leaseDocuments: body.leaseDocuments,
    };
    if (body.portfolioIds?.length && pool) {
      const { listPerformance } = await import('../db/repositories/portfolio_repository.js');
      const byPortfolio: Record<string, { periodLabel: string; totalReturn?: number }[]> = {};
      for (const pid of body.portfolioIds) {
        const rows = await listPerformance(pool, tenantId, pid);
        byPortfolio[pid] = rows.map((r) => ({ periodLabel: r.periodLabel, totalReturn: r.totalReturn }));
      }
      input.portfolioPerformanceByPortfolio = byPortfolio;
    }
    const response = await runProfessionalReview(input, pool);
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Professional review failed';
    res.status(500).json({ error: 'Professional review error', message });
  }
});

/** POST /api/audit/integrity/validate — Validate TB revenue vs contract revenue (pass/fail, variance). */
router.post('/integrity/validate', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      entries: Array<{ accountName: string; debit: number; credit: number; accountType?: string }>;
      contracts: Array<{ id?: string; totalContractValue: number; periodRecognizedRevenue?: number }>;
      tolerance?: number;
    };
    if (!body?.entries?.length || !body?.contracts?.length) {
      res.status(400).json({ error: 'entries and contracts (with totalContractValue) required' });
      return;
    }
    const classified = body.entries.every((e) => e.accountType != null)
      ? body.entries as import('../types/financial.js').TrialBalanceEntry[]
      : classifyTrialBalanceDeterministic(body.entries as import('../types/financial.js').TrialBalanceEntry[]);
    const contracts: IntegrityContractFact[] = body.contracts.map((c) => ({
      id: c.id,
      totalContractValue: c.totalContractValue,
      periodRecognizedRevenue: c.periodRecognizedRevenue,
    }));
    const result = runIntegrityGate({
      trialBalanceEntries: classified,
      contracts,
      tolerance: body.tolerance,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof IntegrityGateViolation) {
      res.status(400).json({
        error: 'INTEGRITY_VIOLATION',
        code: err.code,
        message: err.message,
        tbRevenue: err.tbRevenue,
        contractRevenue: err.contractRevenue,
        variance: err.variance,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Integrity validation failed';
    res.status(500).json({ error: 'Integrity error', message });
  }
});

/** GET /api/audit/professional-review/flags — List professional audit flags (query: periodLabel?, runId?, category?, status?). */
router.get('/professional-review/flags', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const runId = req.query.runId as string | undefined;
    const category = req.query.category as ProfessionalAuditFlagCategory | undefined;
    const status = req.query.status as ProfessionalAuditFlagStatus | undefined;
    const list = await professionalAuditFlagsRepo.list(pool, tenantId, {
      periodLabel,
      runId,
      category,
      status,
      limit: 100,
    });
    res.json({ flags: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List flags failed';
    res.status(500).json({ error: 'Flags error', message });
  }
});

/** PATCH /api/audit/professional-review/flags/:id — Human sign-off (acknowledged | resolved). Requires note/userRationale; appends to audit ledger. */
router.patch('/professional-review/flags/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id;
    const body = req.body as { status?: 'acknowledged' | 'resolved'; acknowledgedBy?: string; resolvedBy?: string; note?: string; userRationale?: string };
    if (!id || !body?.status) {
      res.status(400).json({ error: 'Flag id and status (acknowledged | resolved) required' });
      return;
    }
    const userRationale = (body.note ?? body.userRationale ?? '').trim();
    if (!userRationale) {
      res.status(400).json({ error: 'note or userRationale required for override (audit ledger)' });
      return;
    }
    const flag = await professionalAuditFlagsRepo.get(pool, id, tenantId);
    if (!flag) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    const isVarianceOverride =
      flag.category === 'integrity_variance' ||
      /variance|integrity/i.test(flag.message ?? '') ||
      /variance|integrity/i.test(flag.recommendation ?? '');
    const { recordOverride } = await import('../services/audit_ledger_service.js');
    await recordOverride(pool, {
      tenantId,
      periodLabel: flag.periodLabel,
      eventType: isVarianceOverride ? 'user_induced_variance' : 'flag_override',
      deterministicFlagSnapshot: {
        flagId: flag.id,
        category: flag.category,
        severity: flag.severity,
        message: flag.message,
        recommendation: flag.recommendation,
        citationStandard: flag.citationStandard,
        statusBefore: flag.status,
      },
      agentDissentSnapshot: { recommendation: flag.recommendation, citationExcerpt: flag.citationExcerpt },
      userPromptRationale: userRationale,
      createdBy: body.status === 'resolved' ? body.resolvedBy : body.acknowledgedBy,
    });
    const updated = await professionalAuditFlagsRepo.updateStatus(pool, id, tenantId, {
      status: body.status,
      acknowledgedBy: body.acknowledgedBy,
      resolvedBy: body.resolvedBy,
      note: userRationale,
    });
    if (!updated) {
      res.status(404).json({ error: 'Flag not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update flag failed';
    res.status(500).json({ error: 'Flag update error', message });
  }
});

/** GET /api/audit/audit-file?periodLabel=X — Audit file (workpaper) for period: sections = control with assertions and evidence. */
router.get('/audit-file', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const auditFile = await buildAuditFile(tenantId, periodLabel, pool);
    res.json(auditFile);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit file failed';
    res.status(500).json({ error: 'Audit file error', message });
  }
});

/** GET /api/audit/audit-file/export/pdf?periodLabel=X — Audit file as PDF summary. */
router.get('/audit-file/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const auditFile = await buildAuditFile(tenantId, periodLabel, pool);
    const pdf = await exportAuditFileToPdf(auditFile);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-file-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit file PDF export failed';
    res.status(500).json({ error: 'Audit file PDF export error', message });
  }
});

/** GET /api/audit/engagements — List engagements for tenant. */
router.get('/engagements', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const list = await listEngagements(tenantId, pool);
    res.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List engagements failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** POST /api/audit/engagements — Create engagement (body: name, status?). */
router.post('/engagements', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const body = req.body as { name?: string; status?: string };
    const name = body?.name ?? 'New engagement';
    const engagement = await createEngagement(tenantId, pool, name, body?.status ?? 'draft');
    res.status(201).json(engagement);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create engagement failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** GET /api/audit/engagements/:id — Get engagement. */
router.get('/engagements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const engagement = await getEngagement(tenantId, pool, id);
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(engagement);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Get engagement failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** PATCH /api/audit/engagements/:id — Update engagement (body: name?, status?). */
router.patch('/engagements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body as { name?: string; status?: string };
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const engagement = await updateEngagement(tenantId, pool, id, body);
    if (!engagement) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(engagement);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update engagement failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** DELETE /api/audit/engagements/:id — Delete engagement. */
router.delete('/engagements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const deleted = await deleteEngagement(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete engagement failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** GET /api/audit/engagements/:id/periods — List periods in engagement. */
router.get('/engagements/:id/periods', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const periods = await listPeriodsForEngagement(tenantId, pool, id);
    res.json(periods);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List engagement periods failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** POST /api/audit/engagements/:id/periods — Add period to engagement (body: periodLabel, sortOrder?). */
router.post('/engagements/:id/periods', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body as { periodLabel?: string; sortOrder?: number };
    if (!tenantId || !pool || !id || !body?.periodLabel) {
      res.status(400).json({ error: 'Tenant context, engagement id, and periodLabel required' });
      return;
    }
    const period = await addPeriodToEngagement(
      tenantId,
      pool,
      id,
      body.periodLabel,
      body.sortOrder ?? 0
    );
    if (!period) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.status(201).json(period);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Add period failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** DELETE /api/audit/engagements/:id/periods/:periodLabel — Remove period from engagement. */
router.delete('/engagements/:id/periods/:periodLabel', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const periodLabel = req.params.periodLabel ?? '';
    if (!tenantId || !pool || !id || !periodLabel) {
      res.status(400).json({ error: 'Tenant context, engagement id, and periodLabel required' });
      return;
    }
    const removed = await removePeriodFromEngagement(tenantId, pool, id, periodLabel);
    if (!removed) {
      res.status(404).json({ error: 'Engagement or period not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Remove period failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** GET /api/audit/engagements/:id/close-status — Close status for each period in engagement. */
router.get('/engagements/:id/close-status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const result = await getCloseStatusForEngagement(tenantId, pool, id);
    if (!result) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Engagement close status failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** GET /api/audit/engagements/:id/audit-file — Audit file for each period in engagement. */
router.get('/engagements/:id/audit-file', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and engagement id required' });
      return;
    }
    const result = await getAuditFileForEngagement(tenantId, pool, id);
    if (!result) {
      res.status(404).json({ error: 'Engagement not found' });
      return;
    }
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Engagement audit file failed';
    res.status(500).json({ error: 'Engagements error', message });
  }
});

/** GET /api/audit/readiness-one-pager?periodLabel=X — Audit readiness one-pager (close status + optional narrative). Optional ?includeNarrative=true. */
router.get('/readiness-one-pager', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const onePager = await buildCloseOnePager(tenantId, periodLabel, pool, { includeNarrative });
    res.json(onePager);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit readiness one-pager failed';
    res.status(500).json({ error: 'Audit readiness one-pager error', message });
  }
});

/** GET /api/audit/readiness-one-pager/export/pdf?periodLabel=X — Audit readiness one-pager as PDF. Optional ?includeNarrative=true. */
router.get('/readiness-one-pager/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId || !pool) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context (tenantId, pool)' });
      return;
    }
    const onePager = await buildCloseOnePager(tenantId, periodLabel, pool, { includeNarrative });
    const pdf = await exportCloseOnePagerToPdf(onePager, { title: 'Audit Readiness One-Pager' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-readiness-one-pager-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit readiness one-pager PDF export failed';
    res.status(500).json({ error: 'Audit readiness one-pager PDF export error', message });
  }
});

/** GET /api/audit/package — Audit package for period (binder, DRL, PBC, sampling, checklist, recs, control evidence, period close). Requires tenant. Optional ?includeNarrative=true. */
router.get('/package', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    let narrative: string | null = null;
    if (includeNarrative) {
      try {
        narrative = (await generateCloseNarrativeAgentic(pkg)) || null;
      } catch {
        narrative = null;
      }
    }
    res.json(narrative != null ? { ...pkg, narrative } : pkg);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit package failed';
    res.status(500).json({ error: 'Audit package error', message });
  }
});

/** GET /api/audit/package/export/pdf?periodLabel=X — Audit package as PDF. Optional ?includeNarrative=true. */
router.get('/package/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    let narrative: string | null = null;
    if (includeNarrative) {
      try {
        narrative = (await generateCloseNarrativeAgentic(pkg)) || null;
      } catch {
        narrative = null;
      }
    }
    const pdf = await exportClosePackageToPdf(pkg, { title: 'Audit Package', includeNarrative: !!includeNarrative, narrative });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-package-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit package PDF export failed';
    res.status(500).json({ error: 'Audit package PDF export error', message });
  }
});

/** GET /api/audit/package/export/csv?periodLabel=X — Audit package as CSV (checklist, recs, control evidence). */
router.get('/package/export/csv', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    const csv = exportClosePackageToCsv(pkg);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-package-${periodLabel}.csv"`);
    res.send(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit package CSV export failed';
    res.status(500).json({ error: 'Audit package CSV export error', message });
  }
});

export default router;
