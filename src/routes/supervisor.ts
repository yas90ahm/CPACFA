/**
 * Supervisor Agent API: ReAct loop with Claude 3.5 Sonnet and CPA/CFA tools.
 * POST /api/supervisor/chat — send a message; agent reasons, calls tools, returns answer.
 * Sessions are created and snapshot stored when pool/tenantId exist (persistence_service).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { runUnifiedSupervisor } from '../services/unified_orchestrator.js';
import type { PipelineInput } from '../services/result_generator.js';
import type { RawTrialBalanceRow } from '../services/trialBalanceParser.js';
import * as conflictsRepo from '../db/repositories/risk_context_conflicts_repository.js';
import { resolveConflictWithMemo } from '../services/risk_context_store.js';
import * as persistence from '../services/persistence_service.js';

const router = Router();

/**
 * POST /api/supervisor/chat
 * Body: { message: string, raw_rows?: RawTrialBalanceRow[], pipeline_input?: PipelineInput }
 * If pipeline_input is provided (e.g. { type: 'raw_rows', rawRows } or { type: 'statements', output }), the agent can call step1CPA without passing raw_rows in the tool.
 * When tenantId and pool exist, a session is created and pipeline_input_snapshot stored; sessionId is returned.
 * Returns: { response, toolCalls, stopReason, sessionId? }
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      message?: string;
      raw_rows?: RawTrialBalanceRow[];
      pipeline_input?: PipelineInput;
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
      mode: 'chat',
      message,
      pipelineInput,
      sessionId,
      tenantId: tenantId ?? undefined,
      pool,
    });
    const chatOut = out as import('../services/unified_orchestrator.js').UnifiedChatOutput;
    res.json({
      response: chatOut.response,
      toolCalls: chatOut.toolCalls,
      stopReason: chatOut.stopReason,
      ...(sessionId && { sessionId }),
      ...(chatOut.dissentingOpinion && { dissentingOpinion: chatOut.dissentingOpinion }),
      ...(chatOut.skepticReviewed !== undefined && { skepticReviewed: chatOut.skepticReviewed }),
      ...(chatOut.skepticFinding && { skepticFinding: chatOut.skepticFinding }),
      ...(chatOut.consensus && { consensus: chatOut.consensus }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supervisor chat failed';
    res.status(500).json({ error: 'Supervisor error', message });
  }
});

/**
 * POST /api/supervisor/chat-verified
 * Body: { message: string, raw_rows?: RawTrialBalanceRow[] }
 * Runs Supervisor, then the Skeptic reviews the report. If the Skeptic finds an issue, they Discuss internally.
 * When tenantId and pool exist, a session is created with pipeline_input_snapshot (raw_rows); sessionId is returned.
 * Returns only the final, verified consensus (finalReport). Optional audit fields: skepticFinding, consensus, sessionId.
 */
router.post('/chat-verified', async (req: Request, res: Response) => {
  try {
    const body = req.body as { message?: string; raw_rows?: RawTrialBalanceRow[] };
    const message = (body?.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Missing "message" in body' });
      return;
    }

    const entries =
      body.raw_rows && Array.isArray(body.raw_rows) && body.raw_rows.length > 0
        ? body.raw_rows.map((r) => ({
            accountName: r.accountName,
            debit: Number(r.debit) || 0,
            credit: Number(r.credit) || 0,
            accountCode: r.accountCode,
          }))
        : undefined;

    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    let sessionId: string | undefined;
    const snapshot = entries
      ? { type: 'raw_rows' as const, rawRows: body.raw_rows }
      : null;
    if (pool && tenantId) {
      const session = await persistence.createSession(pool, tenantId, {
        mode: 'chat',
        pipelineInputSnapshot: snapshot,
      });
      sessionId = session.id;
    }
    const pipelineInputForVerified = entries
      ? { type: 'raw_rows' as const, rawRows: body.raw_rows! }
      : undefined;
    const out = await runUnifiedSupervisor({
      mode: 'chat',
      message,
      pipelineInput: pipelineInputForVerified ?? undefined,
      sessionId,
      tenantId: tenantId ?? undefined,
      pool,
      useVerifiedPath: true,
    });
    const chatOut = out as import('../services/unified_orchestrator.js').UnifiedChatOutput;
    res.json({
      response: chatOut.response,
      finalReport: chatOut.response,
      skepticReviewed: chatOut.skepticReviewed,
      skepticFinding: chatOut.skepticFinding,
      consensus: chatOut.consensus,
      supervisorResponse: chatOut.supervisorResponse,
      ...(sessionId && { sessionId }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Supervisor (verified) failed';
    res.status(500).json({ error: 'Supervisor error', message: msg });
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
    const msg = err instanceof Error ? err.message : 'Resolve conflict failed';
    res.status(500).json({ error: 'Supervisor error', message: msg });
  }
});

export default router;
