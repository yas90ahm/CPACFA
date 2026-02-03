/**
 * Unified Orchestrator — single facade for Supervisor chat and pipeline.
 * Applies Skeptic hard gate before returning any financial result (plan §3).
 */

import type { Pool } from 'pg';
import type { PipelineInput, ResultGeneratorOutput } from './result_generator.js';
import { runResultPipeline } from './result_generator.js';
import { runSupervisorChat } from './supervisor_agent.js';
import { runSupervisor } from '../agents/Supervisor.js';
import {
  runSupervisorWithSkeptic,
  runSkepticReview,
  runDiscussion,
  type SupervisorReport,
} from '../agents/auditor_agent.js';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';

export interface UnifiedSupervisorParams {
  mode: 'chat' | 'pipeline';
  message: string;
  pipelineInput?: PipelineInput;
  sessionId?: string;
  tenantId?: string;
  pool?: Pool | null;
  /**
   * When true (e.g. /chat-verified), use runSupervisorWithSkeptic (agents Supervisor + Skeptic).
   * When false (e.g. /chat), use runSupervisorChat then apply Skeptic gate here.
   */
  useVerifiedPath?: boolean;
}

export interface UnifiedChatOutput {
  response: string;
  toolCalls?: Array<{ name: string; summary: string }>;
  stopReason?: string;
  sessionId?: string;
  dissentingOpinion?: unknown;
  skepticReviewed?: boolean;
  skepticFinding?: string;
  consensus?: 'no_error' | 'correction_accepted';
  supervisorResponse?: string;
}

export interface UnifiedPipelineOutput {
  pipelineResult: ResultGeneratorOutput;
  executiveMemo: string;
  skepticReviewed: boolean;
  skepticFinding?: string;
  consensus?: 'no_error' | 'correction_accepted';
  finalMemo?: string;
}

/**
 * Run the Skeptic gate on a report; if finding, run Discussion and return final text.
 */
async function applySkepticGate(report: SupervisorReport): Promise<{
  finalResponse: string;
  skepticReviewed: true;
  skepticFinding?: string;
  consensus?: 'no_error' | 'correction_accepted';
}> {
  const review = await runSkepticReview(report);
  if (review.noIssue) {
    return { finalResponse: report.response, skepticReviewed: true };
  }
  const discussion = await runDiscussion(
    report,
    review.finding ?? 'Skeptic flagged an issue.',
    review.suggestedCorrection
  );
  return {
    finalResponse: discussion.finalReport,
    skepticReviewed: true,
    skepticFinding: review.finding,
    consensus: discussion.consensus,
  };
}

/**
 * Unified Supervisor: mode 'chat' runs ReAct + Skeptic gate; mode 'pipeline' runs deterministic pipeline + Skeptic gate.
 */
export async function runUnifiedSupervisor(
  params: UnifiedSupervisorParams
): Promise<UnifiedChatOutput | UnifiedPipelineOutput> {
  const { mode, message, pipelineInput, sessionId, tenantId, pool, useVerifiedPath } = params;

  if (mode === 'pipeline') {
    const context = tenantId && pool ? { tenantId, pool } : undefined;
    const pipelineResult = await runResultPipeline(pipelineInput!, context);
    const report: SupervisorReport = {
      response: pipelineResult.executiveMemo,
      toolCalls: [],
    };
    const gate = await applySkepticGate(report);
    return {
      pipelineResult,
      executiveMemo: pipelineResult.executiveMemo,
      skepticReviewed: gate.skepticReviewed,
      skepticFinding: gate.skepticFinding,
      consensus: gate.consensus,
      finalMemo: gate.finalResponse !== pipelineResult.executiveMemo ? gate.finalResponse : undefined,
    };
  }

  // mode === 'chat'
  if (useVerifiedPath && tenantId && pool) {
    const entries =
      pipelineInput?.type === 'raw_rows' && pipelineInput.rawRows?.length
        ? pipelineInput.rawRows.map((r: RawTrialBalanceRow) => ({
            accountName: r.accountName,
            debit: Number(r.debit) || 0,
            credit: Number(r.credit) || 0,
            accountCode: r.accountCode,
          }))
        : undefined;
    const context = { tenantId, pool, sessionId, validatedEntries: entries };
    const out = await runSupervisorWithSkeptic(
      { message, entries },
      (inp) => runSupervisor(inp, context)
    );
    return {
      response: out.finalReport,
      finalReport: out.finalReport,
      skepticReviewed: out.skepticReviewed,
      skepticFinding: out.skepticFinding,
      consensus: out.consensus,
      supervisorResponse: out.supervisorResponse,
      sessionId,
    };
  }

  const out = await runSupervisorChat({
    message,
    pipelineInput,
    tenantId,
    pool,
    sessionId,
  });
  const report: SupervisorReport = {
    response: out.response,
    toolCalls: (out.toolCalls ?? []).map((t) => ({ name: t.name, result: t.summary })),
  };
  const gate = await applySkepticGate(report);
  return {
    response: gate.finalResponse,
    toolCalls: out.toolCalls,
    stopReason: out.stopReason,
    sessionId,
    dissentingOpinion: out.dissentingOpinion,
    skepticReviewed: gate.skepticReviewed,
    skepticFinding: gate.skepticFinding,
    consensus: gate.consensus,
    supervisorResponse: out.response,
  };
}
