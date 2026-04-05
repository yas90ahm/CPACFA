/**
 * Resolution Agent: wraps the Plan-Execute-Verify loop for financial events.
 *
 * Flow:
 *   1. Plan: analyze event packet + KB results → determine proposal type
 *   2. Execute: generate Resolution Proposal with IRAC + RAG citations
 *   3. Verify: validate proposal against guardrails
 *   4. If verification fails, re-plan with the error (max 3 retries)
 *   5. Output: ResolutionProposal stored in HITL staging
 */

import type { Pool } from 'pg';
import { createHash } from 'crypto';
import { z } from 'zod';
import { searchFinancialMemory, queryGlobal } from '../knowledge_base/index.js';
import { callAIWithSchema } from './ai_client.js';
import {
  validateProposal,
  type ResolutionProposal,
} from './guardrails/proposal_validator.js';
import { submitToStaging } from '../services/hitl_orchestrator.js';
import { appendEntry } from '../db/repositories/audit_ledger_repository.js';
import type { FinancialEventPacket, FinancialEventType } from '../events/financial_event_emitter.js';
import { log } from '../lib/logger.js';
import { buildResolutionAgentSystemPrompt } from './prompts/resolution_agent.prompt.js';

const MAX_RETRIES = 3;
const RESOLUTION_AGENT_VERSION = 'resolution-agent-v2';

// --- Zod schema for AI response ---

const ResolutionOutputSchema = z.object({
  proposalType: z.string(),
  title: z.string(),
  description: z.string(),
  irac: z.object({
    issue: z.string(),
    rule: z.string(),
    analysis: z.string(),
    conclusion: z.string(),
  }),
  citations: z.array(z.string()),
  accountCodes: z.array(z.string()),
  confidence: z.number(),
});

// --- Plan phase: build context from KB ---

interface PlanResult {
  kbSnippets: Array<{ rule_id: string; title: string; snippet_markdown: string }>;
  eventSummary: string;
  priorErrors: string[];
}

async function plan(
  event: FinancialEventPacket,
  eventData: Record<string, unknown>,
  priorErrors: string[] = []
): Promise<PlanResult> {
  // Build search query from event context
  const queryParts: string[] = [];
  if (event.metadata.accountCodes?.length) {
    queryParts.push(event.metadata.accountCodes.join(' '));
  }
  queryParts.push(event.errorCode);
  queryParts.push(event.eventType);
  const query = queryParts.join(' ').slice(0, 300);

  // Search KB for relevant standards and policies
  const kbResults = searchFinancialMemory(query, { topK: 5 });
  const globalResults = await queryGlobal(query, { topK: 3 });

  const kbSnippets = [
    ...kbResults.map((r) => ({
      rule_id: (r.entry.payload?.['citation'] as string) ?? r.entry.id,
      title: r.entry.source + (r.entry.payload?.['topic'] ? `: ${r.entry.payload['topic']}` : ''),
      snippet_markdown: r.entry.text,
    })),
    ...globalResults.map((e) => ({
      rule_id: (e.payload?.['citation'] as string) ?? e.id,
      title: e.source + (e.payload?.['topic'] ? `: ${e.payload['topic']}` : ''),
      snippet_markdown: e.text,
    })),
  ];

  const eventSummary = `Event: ${event.eventType} | Code: ${event.errorCode} | ` +
    `Accounts: ${event.metadata.accountCodes?.join(', ') ?? 'none'} | ` +
    `Data: ${JSON.stringify(eventData).slice(0, 500)}`;

  return { kbSnippets, eventSummary, priorErrors };
}

// --- Execute phase: call AI to generate proposal ---

async function execute(
  pool: Pool,
  tenantId: string,
  event: FinancialEventPacket,
  planResult: PlanResult
): Promise<ResolutionProposal | null> {
  const systemPrompt = buildResolutionAgentSystemPrompt(planResult.priorErrors.length > 0 ? planResult.priorErrors : undefined);

  const userPrompt = `Generate a resolution proposal for:

${planResult.eventSummary}

Relevant standards and policies:
${planResult.kbSnippets.map((s) => `[${s.rule_id}] ${s.title}: ${s.snippet_markdown}`).join('\n\n')}

Conflicting data: ${JSON.stringify(event.conflictingData)}

Valid proposal types for ${event.eventType}: ${getValidProposalTypes(event.eventType)}

Respond with a JSON object matching the schema.`;

  try {
    const result = await callAIWithSchema({
      pool,
      tenantId,
      pillar: 'resolution_agent',
      promptVersion: RESOLUTION_AGENT_VERSION,
      systemPrompt,
      userPrompt,
      schema: ResolutionOutputSchema,
      requestJson: {
        pillar: 'resolution_agent',
        prompt_version: RESOLUTION_AGENT_VERSION,
        eventType: event.eventType,
        errorCode: event.errorCode,
      },
    });

    if (!result.ok || !result.parsed) {
      log('warn', 'Resolution agent AI call failed', { error: result.error });
      return null;
    }

    return {
      ...result.parsed,
      sourceEventType: event.eventType,
      sourceEventId: `${event.eventType}-${event.emittedAt}`,
    } as ResolutionProposal;
  } catch (err) {
    log('error', 'Resolution agent execute error', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function getValidProposalTypes(eventType: string): string {
  const map: Record<string, string[]> = {
    VARIANCE_DETECTED: ['variance_explanation', 'reclassification', 'adjustment_recommendation', 'investigation'],
    RECON_OVER_TOLERANCE: ['reconciliation_action', 'adjustment_recommendation', 'investigation', 'evidence_request'],
    JE_POLICY_VIOLATION: ['policy_remediation', 'reversal_recommendation', 'disclosure_note', 'investigation'],
    SUSPICIOUS_PLUG: ['reclassification', 'investigation', 'adjustment_recommendation'],
    GL_HEALTH_ANOMALY: ['data_correction', 'investigation', 'disclosure_note', 'process_improvement'],
  };
  return (map[eventType] ?? ['investigation']).join(', ');
}

// --- Verify phase: validate against guardrails ---

async function verify(
  pool: Pool,
  tenantId: string,
  proposal: ResolutionProposal
): Promise<{ passed: boolean; errors: string[] }> {
  return validateProposal(pool, tenantId, proposal);
}

// --- Main Plan-Execute-Verify loop ---

export interface ResolutionAgentInput {
  pool: Pool;
  tenantId: string;
  event: FinancialEventPacket;
  eventData: Record<string, unknown>;
}

export interface ResolutionAgentResult {
  ok: boolean;
  proposal: ResolutionProposal | null;
  stagingItemId: string | null;
  attempts: number;
  errors: string[];
}

export async function runResolutionAgent(input: ResolutionAgentInput): Promise<ResolutionAgentResult> {
  const { pool, tenantId, event, eventData } = input;
  let attempts = 0;
  let priorErrors: string[] = [];
  let lastProposal: ResolutionProposal | null = null;

  while (attempts < MAX_RETRIES) {
    attempts++;

    // Exponential backoff with jitter on retries (skip first attempt)
    if (attempts > 1) {
      const base = 1000;
      const max = 10000;
      const exponential = Math.min(max, base * Math.pow(2, attempts - 2));
      const jitter = exponential * (0.5 + Math.random() * 0.5);
      await new Promise(resolve => setTimeout(resolve, Math.round(jitter)));
    }

    // 1. Plan
    const planResult = await plan(event, eventData, priorErrors);

    // 2. Execute
    const proposal = await execute(pool, tenantId, event, planResult);
    if (!proposal) {
      priorErrors.push(`Attempt ${attempts}: AI failed to generate a proposal.`);
      continue;
    }
    lastProposal = proposal;

    // 3. Verify
    const validation = await verify(pool, tenantId, proposal);
    if (validation.passed) {
      // Store in HITL staging
      const stagingItem = await submitToStaging(
        {
          proposedAction: `[${proposal.proposalType}] ${proposal.title}`,
          justification: formatIRAC(proposal.irac),
          type: mapProposalTypeToStagingType(proposal.proposalType),
          payload: {
            sourceEventType: event.eventType,
            sourceErrorCode: event.errorCode,
            proposal,
            kbCitations: proposal.citations,
            confidence: proposal.confidence,
            agentVersion: RESOLUTION_AGENT_VERSION,
          },
        },
        { pool, tenantId }
      );

      // Link to audit chain
      try {
        await appendEntry(pool, {
          tenantId,
          eventType: 'ai_resolution_proposal',
          deterministicFlagSnapshot: {
            stagingItemId: stagingItem.id,
            sourceEventType: event.eventType,
            sourceErrorCode: event.errorCode,
            proposalType: proposal.proposalType,
            confidence: proposal.confidence,
            agentVersion: RESOLUTION_AGENT_VERSION,
          },
          userPromptRationale: `AI resolution agent generated proposal: ${proposal.title}`,
          createdBy: 'resolution_agent',
        });
      } catch (auditErr) {
        log('warn', 'Failed to append resolution to audit chain', {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      log('info', 'Resolution agent completed', {
        eventType: event.eventType,
        proposalType: proposal.proposalType,
        stagingItemId: stagingItem.id,
        attempts,
      });

      return {
        ok: true,
        proposal,
        stagingItemId: stagingItem.id,
        attempts,
        errors: [],
      };
    }

    // Verification failed — re-plan with errors
    priorErrors = validation.errors.map((e) => `Attempt ${attempts}: ${e}`);
    log('warn', 'Resolution agent verification failed, retrying', {
      attempt: attempts,
      errors: validation.errors,
    });
  }

  // All retries exhausted
  log('error', 'Resolution agent exhausted retries', {
    eventType: event.eventType,
    attempts,
    errors: priorErrors,
  });

  return {
    ok: false,
    proposal: lastProposal,
    stagingItemId: null,
    attempts,
    errors: priorErrors,
  };
}

function formatIRAC(irac: ResolutionProposal['irac']): string {
  return [
    `**Issue:** ${irac.issue}`,
    `**Rule:** ${irac.rule}`,
    `**Analysis:** ${irac.analysis}`,
    `**Conclusion:** ${irac.conclusion}`,
  ].join('\n\n');
}

function mapProposalTypeToStagingType(proposalType: string): 'adjustment' | 'flag_override' | 'other' {
  if (proposalType.includes('adjustment') || proposalType.includes('reclassification') || proposalType.includes('reversal')) {
    return 'adjustment';
  }
  if (proposalType.includes('override') || proposalType.includes('remediation')) {
    return 'flag_override';
  }
  return 'other';
}
