/**
 * Sovereign CPA Engine AI orchestrator: Justifier + Shadow Auditor + Classifier + Advisor pillars.
 */

import { createHash } from 'crypto';
import type { Pool } from 'pg';
import {
  buildJustifierUserPrompt,
  buildJustifierSystemPrompt,
  JUSTIFIER_PROMPT_VERSION,
} from './prompts/justifier.prompt.js';
import {
  buildShadowAuditorUserPrompt,
  buildShadowAuditorSystemPrompt,
  SHADOW_AUDITOR_PROMPT_VERSION,
} from './prompts/shadow_auditor.prompt.js';
import {
  buildClassifierUserPrompt,
  buildClassifierSystemPrompt,
  CLASSIFIER_PROMPT_VERSION,
  type NormalizedSourceLine,
} from './prompts/classifier.prompt.js';
import {
  buildAdvisorUserPrompt,
  buildAdvisorSystemPrompt,
  ADVISOR_PROMPT_VERSION,
  type ClassifiedSourceLine,
  type TbSummary,
} from './prompts/advisor.prompt.js';
import { JustifierOutputSchema } from './schemas/justifier.schema.js';
import { ShadowAuditorOutputSchema } from './schemas/shadow_auditor.schema.js';
import { ClassifierOutputSchema } from './schemas/classifier.schema.js';
import { AdvisorOutputSchema } from './schemas/advisor.schema.js';
import { getDefaultSnippetsForJustifier } from './standards_snippets.js';
import { getDefaultSnippetsForShadowAuditor } from './standards_snippets_shadow.js';
import { getDefaultSnippetsForClassifier } from './standards_snippets_classifier.js';
import { getDefaultSnippetsForAdvisor } from './standards_snippets_advisor.js';
import { callAIWithSchema } from './ai_client.js';
import {
  queryGlobal,
  searchFinancialMemory,
  type MemoryEntry,
} from '../knowledge_base/index.js';
import { isDbConfigured, getPool } from '../db/index.js';
import { queryVectorStore } from '../knowledge_base/vector_store/pg_vector_store.js';

// --- Knowledge Base integration helpers ---

/** Convert KB MemoryEntry[] to snippet format usable by prompts. */
function kbEntriesToSnippets(entries: MemoryEntry[]): Array<{ rule_id: string; title: string; snippet_markdown: string }> {
  return entries.map((e) => ({
    rule_id: (e.payload?.['citation'] as string) ?? e.id,
    title: e.source + (e.payload?.['topic'] ? `: ${e.payload['topic']}` : ''),
    snippet_markdown: e.text,
  }));
}

/** Query KB for relevant GAAP/IFRS standards. Returns extra snippets to merge with defaults.
 * Primary: pgvector semantic search returns specific ASC paragraph citations (e.g., ASC 606-10-25-27).
 * Fallback: queryGlobal keyword search for broader coverage. */
async function queryKbForJustifier(facts: Record<string, unknown>): Promise<Array<{ rule_id: string; title: string; snippet_markdown: string }>> {
  try {
    const query = String(facts['memo'] ?? facts['description'] ?? Object.values(facts).slice(0, 3).join(' ')).slice(0, 300);
    if (!query.trim()) return [];

    // Primary: pgvector semantic search for specific ASC paragraph-level citations
    if (isDbConfigured()) {
      try {
        const pool = getPool();
        const vectorResults = await queryVectorStore(pool, query, {
          topK: 5,
          tier: 'tier1_global',
          minSimilarity: 0.1,
        });
        if (vectorResults.length > 0) {
          const vectorSnippets = vectorResults.map((c) => ({
            rule_id: c.citation,
            title: [c.framework, c.section].filter(Boolean).join(': '),
            snippet_markdown: `**${c.citation}** — ${c.chunkText}`,
          }));
          // Also get keyword results for broader coverage and merge
          const keywordEntries = await queryGlobal(query, { topK: 3 });
          const keywordSnippets = kbEntriesToSnippets(keywordEntries);
          // Deduplicate by rule_id (prefer vector results — they have specific paragraph citations)
          const seen = new Set(vectorSnippets.map((s) => s.rule_id));
          for (const ks of keywordSnippets) {
            if (!seen.has(ks.rule_id)) {
              vectorSnippets.push(ks);
              seen.add(ks.rule_id);
            }
          }
          return vectorSnippets.slice(0, 7);
        }
      } catch {
        // pgvector unavailable, fall through to keyword
      }
    }

    // Fallback: keyword-based queryGlobal
    const entries = await queryGlobal(query, { topK: 5 });
    return kbEntriesToSnippets(entries);
  } catch { return []; }
}

/** Query KB for policy snippets relevant to shadow audit. */
async function queryKbForShadowAuditor(facts: Record<string, unknown>): Promise<Array<{ rule_id: string; title: string; snippet_markdown: string }>> {
  try {
    const query = String(facts['memo'] ?? facts['source'] ?? Object.values(facts).slice(0, 3).join(' ')).slice(0, 300);
    if (!query.trim()) return [];
    const results = searchFinancialMemory(query, { tiers: ['global'], topK: 5 });
    return results.map((r) => ({
      rule_id: (r.entry.payload?.['citation'] as string) ?? r.entry.id,
      title: r.entry.source + (r.entry.payload?.['topic'] ? `: ${r.entry.payload['topic']}` : ''),
      snippet_markdown: r.entry.text,
    }));
  } catch { return []; }
}

/** Query KB for firm CoA history relevant to classification. */
function queryKbForClassifier(sourceLines: NormalizedSourceLine[]): Array<{ rule_id: string; title: string; snippet_markdown: string }> {
  try {
    const query = sourceLines.slice(0, 5).map((l) => l.accountName ?? l.source_id).join(' ').slice(0, 300);
    if (!query.trim()) return [];
    const results = searchFinancialMemory(query, { tiers: ['firm'], topK: 5 });
    return results.map((r) => ({
      rule_id: r.entry.id,
      title: r.entry.source + (r.entry.payload?.['name'] ? `: ${r.entry.payload['name']}` : ''),
      snippet_markdown: r.entry.text,
    }));
  } catch { return []; }
}

/** Stable hash of facts + snippets + prompt_version for idempotency / audit. */
export function hashJustifierInputs(
  facts: Record<string, unknown>,
  promptVersion: string
): string {
  const snippets = getDefaultSnippetsForJustifier();
  const canonical = JSON.stringify({
    facts,
    prompt_version: promptVersion,
    snippet_ids: snippets.map((s) => s.rule_id).sort(),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export type JustifierRelatedType = 'hitl_staging' | 'close_adjustment' | 'journal_entry' | 'export';

export interface RunJustifierParams {
  pool: Pool;
  /** When set (AI_BOUNDARY_DB_ROLES), used for insertCallLog. */
  aiPool?: Pool;
  tenantId: string;
  periodLabel: string;
  relatedType: JustifierRelatedType;
  relatedId: string;
  facts: Record<string, unknown>;
}

export interface RunJustifierResult {
  ok: boolean;
  memo_markdown: string;
  irac_json?: { issue: string; rule: string; analysis: string; conclusion: string };
  rule_ids?: string[];
  facts_used?: string[];
  prompt_version: string;
  error?: string;
  callLogId?: string;
}

const AI_FAILED_MEMO_PREFIX = 'AI justification could not be generated.';

export async function runJustifier(params: RunJustifierParams): Promise<RunJustifierResult> {
  const { pool, aiPool, tenantId, periodLabel, relatedType, relatedId, facts } = params;
  const logPool = aiPool ?? pool;
  const kbSnippets = await queryKbForJustifier(facts);
  const standards_snippets = [...getDefaultSnippetsForJustifier(), ...kbSnippets];
  const context = { tenantId, periodLabel, relatedType, relatedId };
  const userPrompt = buildJustifierUserPrompt({ facts, standards_snippets, context });
  const systemPrompt = buildJustifierSystemPrompt();
  const requestJson = {
    pillar: 'justifier',
    prompt_version: JUSTIFIER_PROMPT_VERSION,
    context,
    factsKeys: Object.keys(facts),
    snippetsCount: standards_snippets.length,
  };

  const result = await callAIWithSchema({
    pool,
    tenantId,
    pillar: 'justifier',
    promptVersion: JUSTIFIER_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    schema: JustifierOutputSchema,
    requestJson,
  });

  if (result.ok && result.parsed) {
    return {
      ok: true,
      memo_markdown: result.parsed.memo_markdown,
      irac_json: result.parsed.irac,
      rule_ids: result.parsed.rule_ids,
      facts_used: result.parsed.facts_used,
      prompt_version: result.parsed.prompt_version,
      callLogId: result.callLogId,
    };
  }

  const errorId = result.callLogId ?? 'unknown';
  const fallbackMemo = `${AI_FAILED_MEMO_PREFIX} Error: ${result.error ?? 'unknown'}. Log id: ${errorId}.`;
  return {
    ok: false,
    memo_markdown: fallbackMemo,
    prompt_version: JUSTIFIER_PROMPT_VERSION,
    error: result.error,
    callLogId: result.callLogId,
  };
}

// --- Shadow Auditor pillar ---

export type ShadowAuditSubjectType = 'journal_entry' | 'tb_adjustment';

export interface RunShadowAuditParams {
  pool: Pool;
  aiPool?: Pool;
  tenantId: string;
  periodLabel: string;
  subjectType: ShadowAuditSubjectType;
  subjectId: string;
  facts: Record<string, unknown>;
  materialityThreshold?: number;
  workflowState?: string;
}

export interface RunShadowAuditResult {
  ok: boolean;
  severity: 'ok' | 'warn' | 'block';
  findings: Array<{ code: string; message: string; rule_ids: string[]; refs: string[] }>;
  confidence: number;
  prompt_version: string;
  error?: string;
  callLogId?: string;
}

const AI_FAILED_FINDING_CODE = 'AI_FAILED';

/** Fail-open: on AI failure return warn + single finding, do not block. */
export async function runShadowAudit(params: RunShadowAuditParams): Promise<RunShadowAuditResult> {
  const { pool, aiPool, tenantId, periodLabel, subjectType, subjectId, facts, materialityThreshold, workflowState } = params;
  const logPool = aiPool ?? pool;
  const kbSnippets = await queryKbForShadowAuditor(facts);
  const standards_snippets = [...getDefaultSnippetsForShadowAuditor(), ...kbSnippets];
  const context = {
    tenantId,
    periodLabel,
    subjectType,
    subjectId,
    materialityThreshold,
    workflowState,
  };
  const userPrompt = buildShadowAuditorUserPrompt({
    transactionPayload: facts,
    standards_snippets,
    context,
  });
  const systemPrompt = buildShadowAuditorSystemPrompt();
  const requestJson = {
    pillar: 'shadow_auditor',
    prompt_version: SHADOW_AUDITOR_PROMPT_VERSION,
    context: { tenantId, periodLabel, subjectType, subjectId },
    factsKeys: Object.keys(facts),
    snippetsCount: standards_snippets.length,
  };

  const result = await callAIWithSchema({
    pool: logPool,
    tenantId,
    pillar: 'shadow_auditor',
    promptVersion: SHADOW_AUDITOR_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    schema: ShadowAuditorOutputSchema,
    requestJson,
  });

  if (result.ok && result.parsed) {
    return {
      ok: true,
      severity: result.parsed.severity,
      findings: result.parsed.findings,
      confidence: result.parsed.confidence,
      prompt_version: result.parsed.prompt_version,
      callLogId: result.callLogId,
    };
  }

  // Fail-open: do not block; record AI_FAILED as warn so humans see it
  return {
    ok: false,
    severity: 'warn',
    findings: [
      {
        code: AI_FAILED_FINDING_CODE,
        message: `Shadow audit unavailable. ${result.error ?? 'Unknown error'}. Log id: ${result.callLogId ?? 'unknown'}.`,
        rule_ids: [],
        refs: [subjectId],
      },
    ],
    confidence: 0,
    prompt_version: SHADOW_AUDITOR_PROMPT_VERSION,
    error: result.error,
    callLogId: result.callLogId,
  };
}

// --- Classifier pillar ---

export interface RunClassifierParams {
  pool: Pool;
  aiPool?: Pool;
  tenantId: string;
  periodLabel: string;
  sourceLines: NormalizedSourceLine[];
  coaTaxonomy?: Array<{ key: string; label: string }>;
}

export interface RunClassifierResult {
  ok: boolean;
  results: Array<{
    source_id: string;
    object_type: string;
    fs_placement: string;
    suggested_accounts: string[];
    rule_tags: string[];
    missing_inputs: string[];
    confidence: number;
  }>;
  prompt_version: string;
  error?: string;
  callLogId?: string;
}

/** Fail-open: on AI failure return empty results; do not block ingestion. */
export async function runClassifier(params: RunClassifierParams): Promise<RunClassifierResult> {
  const { pool, aiPool, tenantId, periodLabel, sourceLines, coaTaxonomy = [] } = params;
  const logPool = aiPool ?? pool;
  const kbSnippets = queryKbForClassifier(sourceLines);
  const standards_snippets = [...getDefaultSnippetsForClassifier(), ...kbSnippets];
  const context = { tenantId, periodLabel };
  const userPrompt = buildClassifierUserPrompt({
    sourceLines,
    coaTaxonomy,
    standards_snippets,
    context,
  });
  const systemPrompt = buildClassifierSystemPrompt();
  const requestJson = {
    pillar: 'classifier',
    prompt_version: CLASSIFIER_PROMPT_VERSION,
    context: { tenantId, periodLabel },
    sourceLinesCount: sourceLines.length,
    snippetsCount: standards_snippets.length,
  };

  const result = await callAIWithSchema({
    pool: logPool,
    tenantId,
    pillar: 'classifier',
    promptVersion: CLASSIFIER_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    schema: ClassifierOutputSchema,
    requestJson,
  });

  if (result.ok && result.parsed) {
    return {
      ok: true,
      results: result.parsed.results,
      prompt_version: result.parsed.prompt_version,
      callLogId: result.callLogId,
    };
  }

  return {
    ok: false,
    results: [],
    prompt_version: CLASSIFIER_PROMPT_VERSION,
    error: result.error,
    callLogId: result.callLogId,
  };
}

// --- Advisor pillar ---

export interface RunAdvisorParams {
  pool: Pool;
  aiPool?: Pool;
  tenantId: string;
  periodLabel: string;
  sourceLines: ClassifiedSourceLine[];
  tbSummary?: TbSummary;
  coaTaxonomy?: Array<{ key: string; label: string }>;
}

export interface RunAdvisorResult {
  ok: boolean;
  proposals: Array<{
    proposal_id: string;
    type: string;
    rationale: string;
    rule_ids: string[];
    confidence: number;
    requires_human_confirmation: boolean;
    lines: Array<{
      dr_account_key: string;
      cr_account_key: string;
      amount?: number;
      amountProvenance: string;
      sourceRef?: { ledgerLineId?: string; tbRowId?: string };
      note?: string;
    }>;
    missing_inputs: string[];
  }>;
  prompt_version: string;
  error?: string;
  callLogId?: string;
}

/** Fail-safe: on AI failure return empty proposals; do not block workflow. */
export async function runAdvisor(params: RunAdvisorParams): Promise<RunAdvisorResult> {
  const { pool, aiPool, tenantId, periodLabel, sourceLines, tbSummary = {}, coaTaxonomy = [] } = params;
  const logPool = aiPool ?? pool;
  const standards_snippets = getDefaultSnippetsForAdvisor();
  const context = { tenantId, periodLabel };
  const userPrompt = buildAdvisorUserPrompt({
    sourceLines,
    tbSummary,
    coaTaxonomy,
    standards_snippets,
    context,
  });
  const systemPrompt = buildAdvisorSystemPrompt();
  const requestJson = {
    pillar: 'advisor',
    prompt_version: ADVISOR_PROMPT_VERSION,
    context: { tenantId, periodLabel },
    sourceLinesCount: sourceLines.length,
    snippetsCount: standards_snippets.length,
  };

  const result = await callAIWithSchema({
    pool: logPool,
    tenantId,
    pillar: 'advisor',
    promptVersion: ADVISOR_PROMPT_VERSION,
    systemPrompt,
    userPrompt,
    schema: AdvisorOutputSchema,
    requestJson,
  });

  if (result.ok && result.parsed) {
    return {
      ok: true,
      proposals: result.parsed.proposals,
      prompt_version: result.parsed.prompt_version,
      callLogId: result.callLogId,
    };
  }

  return {
    ok: false,
    proposals: [],
    prompt_version: ADVISOR_PROMPT_VERSION,
    error: result.error,
    callLogId: result.callLogId,
  };
}
