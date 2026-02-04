/**
 * Unified Orchestration Service — single entry point for Supervisor flows.
 * Strategy Pattern: Month-End Close → Deterministic Pipeline; Forensic / ad-hoc → Agentic ReAct.
 * Both paths use the same DATA_GROUNDING_RULE (Supervisor + Skeptic prompts).
 */

import type { Pool } from 'pg';
import type { PipelineInput, ResultGeneratorOutput } from './result_generator.js';
import { runResultPipeline } from './result_generator.js';
import { runSupervisor } from '../agents/Supervisor.js';
import {
  appendReasoningLogWithClient,
  getSession,
  isPersistedMessageHistory,
  updateSession,
  type ReasoningLogEntry,
} from './persistence_service.js';
import {
  runSupervisorWithSkeptic,
  runSkepticReview,
  runDiscussion,
  type SupervisorReport,
} from '../agents/auditor_agent.js';
import type { RawTrialBalanceRow } from './trialBalanceParser.js';
import { DATA_GROUNDING_RULE } from '../llm/guardrails.js';
import { updatePolicyMemory } from '../memory/index.js';

/** Re-export so callers can rely on a single grounding rule. */
export { DATA_GROUNDING_RULE };

export type TaskStrategy = 'month_end_close' | 'forensic';

/** Month-end close keywords: standard close, trial balance, statements. */
const MONTH_END_PATTERNS = [
  /month\s*end\s*close/i,
  /year\s*end\s*close/i,
  /trial\s*balance/i,
  /financial\s*statements/i,
  /prepare\s*(the\s*)?(statements|close|report)/i,
  /close\s*(the\s*)?(books|period)/i,
  /balance\s*sheet\s*and\s*p&l/i,
  /executive\s*memo/i,
];

/** Forensic / audit keywords: find, investigate, anomaly, personal expenses. */
const FORENSIC_PATTERNS = [
  /find\s*(personal\s*)?expenses/i,
  /forensic/i,
  /personal\s*expenses/i,
  /anomaly|anomalies/i,
  /investigate/i,
  /suspicious/i,
  /audit\s*(for|to\s*find)/i,
  /detect\s*(fraud|expenses|issues)/i,
  /where\s*(did|are)\s*(the\s*)?(expenses|payments)/i,
];

/** Audit or Statement Build intent: force agentic path so Supervisor runs and can self-correct. */
const AUDIT_OR_STATEMENT_BUILD_PATTERNS = [
  /audit/i,
  /statement\s*build/i,
  /full\s*audit/i,
  /balance\s*sheet\s*and\s*p&l/i,
];

/**
 * Infer task strategy from the user message (and optional pipeline input).
 * Audit/Statement Build → forensic so Supervisor is primary. Month-End Close → Deterministic Pipeline when pipelineInput exists.
 * Forensic / ad-hoc → Agentic ReAct Loop.
 */
export function inferTaskStrategy(message: string, pipelineInput?: PipelineInput | null): TaskStrategy {
  const text = message.trim();
  const hasAuditOrStatementBuild = AUDIT_OR_STATEMENT_BUILD_PATTERNS.some((p) => p.test(text));
  const hasForensic = FORENSIC_PATTERNS.some((p) => p.test(text));
  const hasMonthEnd = MONTH_END_PATTERNS.some((p) => p.test(text));
  if (hasAuditOrStatementBuild) return 'forensic';
  if (hasForensic) return 'forensic';
  if (hasMonthEnd && pipelineInput != null) return 'month_end_close';
  return 'forensic';
}

/** CFA task keywords: DCF, valuation, multiples — when present, Orchestrator fetches CPA Historical Snapshot and injects as accounting_context. */
const CFA_TASK_PATTERNS = [
  /dcf|discounted\s*cash\s*flow/i,
  /valuation|enterprise\s*value|ev\s*\/\s*ebitda/i,
  /multiples|comps|comparable\s*analysis/i,
];

/** Full Audit / Diagnostic HUD intent: force Supervisor (forensic) so Thought Stream runs and self-correction can happen. */
const FULL_AUDIT_INTENT_PATTERNS = [
  /full\s*audit\s*&\s*statement\s*build/i,
  /full\s*audit/i,
  /statement\s*build/i,
];

function isFullAuditOrDiagnosticIntent(message: string): boolean {
  const text = message.trim();
  return FULL_AUDIT_INTENT_PATTERNS.some((p) => p.test(text));
}

export interface UnifiedSupervisorParams {
  /** If set, overrides inferred strategy. Otherwise strategy is inferred from message (and pipelineInput). */
  mode?: 'chat' | 'pipeline';
  /** When true, force forensic (Supervisor Agent) so month_end_close pipeline never runs. Use from Diagnostic HUD. */
  forceForensic?: boolean;
  message: string;
  pipelineInput?: PipelineInput;
  sessionId?: string;
  tenantId?: string;
  pool?: Pool | null;
  /** When provided with a CFA task (DCF, Valuation, Multiples), Orchestrator fetches CPA Historical Snapshot and injects as accounting_context. */
  periodLabel?: string;
  /**
   * When true (e.g. /chat-verified), run Skeptic after the agentic path.
   * When false, Skeptic is still run for both pipeline and agentic paths.
   */
  useVerifiedPath?: boolean;
}

export interface UnifiedChatOutput {
  response: string;
  finalReport?: string;
  toolCalls?: Array<{ name: string; summary: string }>;
  stopReason?: string;
  sessionId?: string;
  dissentingOpinion?: unknown;
  skepticReviewed?: boolean;
  skepticFinding?: string;
  consensus?: 'no_error' | 'correction_accepted';
  supervisorResponse?: string;
  /** Inferred or chosen strategy. */
  strategy?: TaskStrategy;
}

export interface UnifiedPipelineOutput {
  pipelineResult: ResultGeneratorOutput;
  executiveMemo: string;
  skepticReviewed: boolean;
  skepticFinding?: string;
  consensus?: 'no_error' | 'correction_accepted';
  finalMemo?: string;
  strategy: 'month_end_close';
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
 * Single Unified Orchestration Service.
 * Strategy: if user task is standard Month-End Close (and pipelineInput exists), use Deterministic Pipeline.
 * If user ask is Forensic (e.g. "Find personal expenses") or ad-hoc, use Agentic ReAct Loop (agents/Supervisor only).
 * Both paths use the same DATA_GROUNDING_RULE and pass through the Skeptic gate.
 */
export async function runUnifiedSupervisor(
  params: UnifiedSupervisorParams
): Promise<UnifiedChatOutput | UnifiedPipelineOutput> {
  const { mode: modeOverride, forceForensic, message, pipelineInput, sessionId, tenantId, pool, periodLabel, useVerifiedPath } =
    params;

  // DEBUG: Hard-code forensic to prove routing. Comment back in the block below to restore inference.
  // const mustUseForensic = forceForensic === true || isFullAuditOrDiagnosticIntent(message);
  // const strategy: TaskStrategy =
  //   mustUseForensic
  //     ? 'forensic'
  //     : modeOverride === 'pipeline'
  //       ? 'month_end_close'
  //       : modeOverride === 'chat'
  //         ? 'forensic'
  //         : inferTaskStrategy(message, pipelineInput);
  const strategy: TaskStrategy = 'forensic';

  console.log('STRATEGY TRACE: incoming message:', message, '| strategy (forced for debug):', strategy);
  // DEBUG: throw removed so you can see --- SUPERVISOR ACTIVATED --- in terminal. Uncomment to force-fail and prove this path is hit:
  // if (message.includes('Audit')) { throw new Error('STRATEGY TRACE: I am about to select ' + strategy); }
  console.log('TRACE 1: Orchestrator received request with strategy:', strategy);

  if (strategy === 'month_end_close' && pipelineInput != null) {
    const context = tenantId && pool ? { tenantId, pool } : undefined;
    const pipelineResult = await runResultPipeline(pipelineInput, context);
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
      strategy: 'month_end_close',
    };
  }

  const entries =
    pipelineInput?.type === 'raw_rows' && pipelineInput.rawRows?.length
      ? pipelineInput.rawRows.map((r: RawTrialBalanceRow) => ({
          accountName: r.accountName,
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
          accountCode: r.accountCode,
        }))
      : undefined;

  let initialMessageHistory: { provider: string; messages: unknown[] } | undefined;
  if (pool && tenantId && sessionId) {
    const session = await getSession(pool, tenantId, sessionId);
    if (session?.messageHistory != null && isPersistedMessageHistory(session.messageHistory)) {
      initialMessageHistory = session.messageHistory;
    }
  }

  // When user triggers a CFA task (Valuation, DCF, Multiples), fetch CPA Historical Snapshot and inject as read-only accounting_context.
  const isCFATask = CFA_TASK_PATTERNS.some((p) => p.test(message));
  let accountingContext: string | undefined;
  if (isCFATask && pool && tenantId && periodLabel) {
    const snapshot = await getHistoricalSnapshotFromCPA(tenantId, periodLabel, pool);
    if (snapshot) accountingContext = formatAccountingContextBlock(snapshot);
  }

  const onReasoningStep =
    pool && tenantId && sessionId
      ? async (entry: ReasoningLogEntry) => {
          const client = await pool.connect();
          try {
            await appendReasoningLogWithClient(client, tenantId, sessionId, {
              ...entry,
              timestamp: entry.timestamp || new Date().toISOString(),
            });
          } finally {
            client.release();
          }
        }
      : undefined;
  const onObservationPersisted =
    pool && tenantId && sessionId
      ? (lastStep: string, lastResultSummary: string) => updateSession(pool, tenantId, sessionId, { lastStep, lastResultSummary })
      : undefined;
  const onMessageHistoryPersisted =
    pool && tenantId && sessionId
      ? (payload: { provider: string; messages: unknown[] }) => updateSession(pool, tenantId, sessionId, { messageHistory: payload })
      : undefined;

  const context =
    tenantId && pool
      ? {
          tenantId,
          pool,
          sessionId,
          validatedEntries: entries,
          pipelineInput,
          onReasoningStep,
          onObservationPersisted,
          onMessageHistoryPersisted,
          initialMessageHistory,
          accountingContext,
        }
      : entries
        ? {
            validatedEntries: entries,
            pipelineInput,
            onReasoningStep,
            onObservationPersisted,
            onMessageHistoryPersisted,
            initialMessageHistory,
            accountingContext,
          }
        : undefined;

  // Sync policy memory when pipeline has entity meta (from legacy supervisor_agent behavior).
  const meta = pipelineInput?.meta;
  if (meta?.entityId && pool && tenantId) {
    await updatePolicyMemory(meta.entityId, {
      ...(meta.standard ? { standard: meta.standard } : {}),
      country: meta.country,
      jurisdiction: meta.jurisdiction,
      currency: meta.currency,
      taxId: meta.taxId,
      businessNumber: meta.businessNumber,
    }, undefined, { pool, tenantId });
  }

  const runAgentic = useVerifiedPath
    ? (inp: { message: string; entries?: typeof entries }) =>
        runSupervisorWithSkeptic(inp, (input) => runSupervisor(input, context))
    : async (inp: { message: string; entries?: typeof entries }) => {
        const out = await runSupervisor({ message: inp.message, entries: inp.entries }, context);
        const report: SupervisorReport = {
          response: out.response,
          toolCalls: out.toolCalls,
        };
        const gate = await applySkepticGate(report);
        return {
          finalReport: gate.finalResponse,
          skepticReviewed: true,
          supervisorResponse: out.response,
          skepticFinding: gate.skepticFinding,
          consensus: gate.consensus,
          dissentingOpinion: out.dissentingOpinion,
        };
      };

  const out = await runAgentic({ message, entries });
  return {
    response: out.finalReport,
    finalReport: out.finalReport,
    supervisorResponse: out.supervisorResponse,
    skepticReviewed: out.skepticReviewed,
    skepticFinding: out.skepticFinding,
    consensus: out.consensus,
    dissentingOpinion: out.dissentingOpinion,
    sessionId,
    strategy: 'forensic',
  };
}
