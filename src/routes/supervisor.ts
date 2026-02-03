/**
 * Supervisor API — single Unified Orchestration Service.
 * Strategy: Month-End Close → Deterministic Pipeline; Forensic (e.g. "Find personal expenses") → Agentic ReAct.
 * Both paths use the same DATA_GROUNDING_RULE and Skeptic gate.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { runUnifiedSupervisor, type UnifiedChatOutput, type UnifiedPipelineOutput } from '../services/unified_orchestrator.js';
import type { PipelineInput } from '../services/result_generator.js';
import type { RawTrialBalanceRow } from '../services/trialBalanceParser.js';
import * as conflictsRepo from '../db/repositories/risk_context_conflicts_repository.js';
import { resolveConflictWithMemo } from '../services/risk_context_store.js';
import * as persistence from '../services/persistence_service.js';
import { handleAuditOrIntegrityError } from './audit/audit_shared.js';

const router = Router();

/**
 * POST /api/supervisor/chat
 * Body: { message: string, raw_rows?: RawTrialBalanceRow[], pipeline_input?: PipelineInput, mode?: 'chat' | 'pipeline' }
 * Strategy is inferred from message: Month-End Close → Deterministic Pipeline; Forensic / ad-hoc → Agentic ReAct.
 * Optional mode overrides inference. Session created when tenantId/pool exist; sessionId returned.
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      message?: string;
      raw_rows?: RawTrialBalanceRow[];
      pipeline_input?: PipelineInput;
      mode?: 'chat' | 'pipeline';
    };
    const message = (body?.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Missing "message" in body' });
      return;
    }

    let pipelineInput: PipelineInput | undefined = body?.pipeline_input;
    if (!pipelineInput && body?.raw_rows && Array.isArray(body.raw_rows) && body.raw_rows.length > 0) {
      pipelineInput = { type: 'raw_rows', rawRows: body.raw_rows };
    }

    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    let sessionId: string | undefined;
    if (pool && tenantId) {
      const session = await persistence.createSession(pool, tenantId, {
        mode: 'chat',
        pipelineInputSnapshot: pipelineInput ?? null,
      });
      sessionId = session.id;
    }
    const out = await runUnifiedSupervisor({
      ...(body.mode != null && { mode: body.mode }),
      message,
      pipelineInput,
      sessionId,
      tenantId: tenantId ?? undefined,
      pool,
    });
    if ('pipelineResult' in out) {
      const pipe = out as UnifiedPipelineOutput;
      res.json({
        response: pipe.finalMemo ?? pipe.executiveMemo,
        executiveMemo: pipe.executiveMemo,
        strategy: pipe.strategy,
        skepticReviewed: pipe.skepticReviewed,
        skepticFinding: pipe.skepticFinding,
        consensus: pipe.consensus,
        pipelineResult: pipe.pipelineResult,
        ...(sessionId && { sessionId }),
      });
      return;
    }
    const chatOut = out as UnifiedChatOutput;
    res.json({
      response: chatOut.response,
      toolCalls: chatOut.toolCalls,
      stopReason: chatOut.stopReason,
      strategy: chatOut.strategy,
      ...(sessionId && { sessionId }),
      ...(chatOut.dissentingOpinion && { dissentingOpinion: chatOut.dissentingOpinion }),
      ...(chatOut.skepticReviewed !== undefined && { skepticReviewed: chatOut.skepticReviewed }),
      ...(chatOut.skepticFinding && { skepticFinding: chatOut.skepticFinding }),
      ...(chatOut.consensus && { consensus: chatOut.consensus }),
    });
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Supervisor error');
  }
});

/**
 * POST /api/supervisor/chat-verified
 * Body: { message: string, raw_rows?: RawTrialBalanceRow[], mode?: 'chat' | 'pipeline' }
 * Same Unified Orchestration Service with Skeptic verification. Strategy inferred unless mode is passed.
 * Returns final, verified consensus (finalReport). Optional: skepticFinding, consensus, sessionId, strategy.
 */
router.post('/chat-verified', async (req: Request, res: Response) => {
  try {
    const body = req.body as { message?: string; raw_rows?: RawTrialBalanceRow[]; mode?: 'chat' | 'pipeline' };
    const message = (body?.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Missing "message" in body' });
      return;
    }

    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    let pipelineInputForVerified: PipelineInput | undefined;
    if (body.raw_rows && Array.isArray(body.raw_rows) && body.raw_rows.length > 0) {
      pipelineInputForVerified = { type: 'raw_rows', rawRows: body.raw_rows };
    }
    const snapshot = pipelineInputForVerified ?? null;
    let sessionId: string | undefined;
    if (pool && tenantId) {
      const session = await persistence.createSession(pool, tenantId, {
        mode: 'chat',
        pipelineInputSnapshot: snapshot,
      });
      sessionId = session.id;
    }
    const out = await runUnifiedSupervisor({
      mode: body?.mode,
      message,
      pipelineInput: pipelineInputForVerified ?? undefined,
      sessionId,
      tenantId: tenantId ?? undefined,
      pool,
      useVerifiedPath: true,
    });
    if ('pipelineResult' in out) {
      const pipe = out as UnifiedPipelineOutput;
      res.json({
        response: pipe.finalMemo ?? pipe.executiveMemo,
        finalReport: pipe.finalMemo ?? pipe.executiveMemo,
        executiveMemo: pipe.executiveMemo,
        strategy: pipe.strategy,
        skepticReviewed: pipe.skepticReviewed,
        skepticFinding: pipe.skepticFinding,
        consensus: pipe.consensus,
        ...(sessionId && { sessionId }),
      });
      return;
    }
    const chatOut = out as UnifiedChatOutput;
    res.json({
      response: chatOut.response,
      finalReport: chatOut.finalReport ?? chatOut.response,
      skepticReviewed: chatOut.skepticReviewed,
      skepticFinding: chatOut.skepticFinding,
      consensus: chatOut.consensus,
      supervisorResponse: chatOut.supervisorResponse,
      strategy: chatOut.strategy,
      ...(sessionId && { sessionId }),
    });
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Supervisor (verified) error');
  }
});

/**
 * GET /api/supervisor/session/:sessionId/trace
 * Returns reasoning_logs and tenant_hitl_staging items for the session's tenant (audit trail).
 */
router.get('/session/:sessionId/trace', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!sessionId || !tenantId || !pool) {
      res.status(400).json({ error: 'Session id and tenant context required' });
      return;
    }
    const session = await persistence.getSession(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const stagingItems = await persistence.listStagingItems(pool, session.tenantId);
    res.json({
      reasoningLogs: session.reasoningLogs ?? [],
      stagingItems,
    });
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Trace fetch failed');
  }
});

/**
 * GET /api/supervisor/conflicts — List unresolved CPA-CFA conflicts (Integration only).
 * Query: periodLabel (optional).
 */
router.get('/conflicts', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const conflicts = await conflictsRepo.listUnresolved(pool, tenantId, periodLabel);
    res.json({ conflicts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'List conflicts failed';
    res.status(500).json({ error: 'Supervisor error', message: msg });
  }
});

/**
 * POST /api/supervisor/conflicts/:id/resolve — Resolve a conflict with a Resolution Memo (Integration only).
 * Body: { resolutionMemo: string, createdBy?: string }
 */
router.post('/conflicts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and conflict id required' });
      return;
    }
    const body = req.body as { resolutionMemo?: string; createdBy?: string };
    const resolutionMemo = (body?.resolutionMemo ?? '').trim();
    if (!resolutionMemo) {
      res.status(400).json({ error: 'Missing or empty "resolutionMemo" in body' });
      return;
    }
    const ok = await resolveConflictWithMemo(pool, tenantId, id, resolutionMemo, body.createdBy);
    if (!ok) {
      res.status(404).json({ error: 'Conflict not found or already resolved' });
      return;
    }
    res.json({ success: true, id });
  } catch (err) {
    handleAuditOrIntegrityError(res, err, 'Resolve conflict failed');
  }
});

export default router;
