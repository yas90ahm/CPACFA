/**
 * Export Service — Connect Agent reasoning to PDF/CSV export.
 *
 * 1. Dynamic Generation: Agent drafts narrative sections of the PDF (executive summary, overview).
 * 2. Inclusion: Reasoning Chain (Thoughts + Actions from ReAct loop) included as appendix in PDF.
 * 3. Format: CSV includes Agent_Confidence_Score column for every line item.
 * 4. Compliance Package: Balanced financial statements, IRAC-grounded justifications, ledger hash (tamper evidence).
 */

import { createHash } from 'crypto';
import { generateText } from '../llm/provider.js';
import { round2 } from '../utils/decimal.js';

/** One step in the Reasoning Chain (Thought or Action from ReAct). */
export interface ReasoningChainEntry {
  type: 'thought' | 'action';
  /** Thought text or action name. */
  content: string;
  /** For action: tool name and optional result summary. */
  toolName?: string;
  resultSummary?: string;
}

/** Agent context from Supervisor (ReAct loop). */
export interface AgentExportContext {
  /** Supervisor final response (used to draft narrative). */
  response: string;
  /** Thoughts from ReAct loop. */
  thoughts?: string[];
  /** Tool calls: name, input, result (summary for appendix). */
  toolCalls?: Array<{ name: string; input?: unknown; result?: string }>;
}

/** Binder summary for drafting (entity, period, statement totals). */
export interface BinderSummaryForDraft {
  entityName?: string;
  periodStart?: string;
  periodEnd?: string;
  reportDate?: string;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  netIncome?: number;
}

/** Drafted narrative sections for PDF. */
export interface DraftedNarrative {
  executive_summary: string;
  overview?: string;
  highlights?: string[];
}

/** Compliance Package: proof of balanced statements, IRAC justifications, and ledger integrity (hash). */
export interface CompliancePackage {
  /** Balanced financial statements (BS/P&L) included in the export. */
  balancedFinancialStatements: Record<string, unknown>;
  /** IRAC-grounded justification for every agentic adjustment (audit trail + rules cited). */
  iracJustifications: {
    audit_trail: Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>;
    rules_cited: string[];
  };
  /** SHA-256 hash of canonical ledger to prove it has not been tampered with since last CPA review. */
  ledgerHash: string;
}

/** Report payload for PDF with agent-drafted narrative, Reasoning Chain appendix, and Compliance Package. */
export interface ReportPayloadWithAgent {
  cover: Record<string, string>;
  financial_statements: Record<string, unknown>;
  executive_summary: string;
  overview?: string;
  highlights?: string[];
  audit_trail: Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>;
  audit_trail_rules_cited: string[];
  /** Reasoning Chain: Thoughts and Actions from ReAct loop (for PDF appendix). */
  reasoning_chain_appendix: ReasoningChainEntry[];
  clean_ledger: CleanLedgerRowWithConfidence[];
  /** Compliance Package: statements + IRAC justifications + ledger hash (audit binder). */
  compliancePackage: CompliancePackage;
}

/** Clean ledger row with Agent_Confidence_Score for CSV. */
export interface CleanLedgerRowWithConfidence {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  account_type: string;
  Agent_Confidence_Score: number;
}

/**
 * Build Reasoning Chain entries from Supervisor thoughts and toolCalls (for PDF appendix).
 */
export function buildReasoningChainAppendix(context: AgentExportContext): ReasoningChainEntry[] {
  const entries: ReasoningChainEntry[] = [];
  const thoughts = context.thoughts ?? [];
  const toolCalls = context.toolCalls ?? [];
  const maxSteps = Math.max(thoughts.length, toolCalls.length);
  for (let i = 0; i < maxSteps; i++) {
    if (i < thoughts.length) {
      entries.push({ type: 'thought', content: thoughts[i].trim() });
    }
    if (i < toolCalls.length) {
      const t = toolCalls[i];
      const resultSummary = t.result ? (t.result.length > 200 ? t.result.slice(0, 200) + '…' : t.result) : undefined;
      entries.push({
        type: 'action',
        content: `Tool: ${t.name}`,
        toolName: t.name,
        resultSummary,
      });
    }
  }
  return entries;
}

/**
 * Draft narrative sections (executive summary, overview) using the agent's response and binder summary.
 * Dynamic generation instead of static template.
 */
export async function draftNarrativeSections(
  binderSummary: BinderSummaryForDraft,
  agentContext: AgentExportContext
): Promise<DraftedNarrative> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.MISTRAL_API_KEY) {
    return {
      executive_summary: `Period: ${binderSummary.periodStart ?? ''} to ${binderSummary.periodEnd ?? ''}. Entity: ${binderSummary.entityName ?? 'Entity'}. Prepared by Supervisor Agent. Financial statements and justification chain included.`,
      overview: undefined,
      highlights: undefined,
    };
  }

  const prompt = `You are drafting the narrative sections for a financial report PDF. Use the following context to write a concise executive summary and optional overview/highlights. Do not invent numbers; use only what is provided.

Context:
- Entity: ${binderSummary.entityName ?? 'Entity'}
- Period: ${binderSummary.periodStart ?? ''} to ${binderSummary.periodEnd ?? ''}
- Report date: ${binderSummary.reportDate ?? 'N/A'}
- Totals (if any): Assets ${binderSummary.totalAssets ?? 'N/A'}, Liabilities ${binderSummary.totalLiabilities ?? 'N/A'}, Equity ${binderSummary.totalEquity ?? 'N/A'}, Revenue ${binderSummary.totalRevenue ?? 'N/A'}, Expenses ${binderSummary.totalExpenses ?? 'N/A'}, Net Income ${binderSummary.netIncome ?? 'N/A'}

Agent's response to the user (use this to inform the narrative):
${agentContext.response.slice(0, 3000)}

Output format (use exactly these labels):
EXECUTIVE_SUMMARY: [2-4 sentences for the report cover]
OVERVIEW: [Optional 1-2 sentences]
HIGHLIGHTS: [Optional bullet points, one per line starting with - ]
If you omit OVERVIEW or HIGHLIGHTS, write "OVERVIEW: " or "HIGHLIGHTS: " with nothing after.`;

  try {
    const text = await generateText({
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 1024,
      prompt,
    });

    const execMatch = text.match(/EXECUTIVE_SUMMARY:\s*([\s\S]*?)(?=OVERVIEW:|HIGHLIGHTS:|$)/i);
    const overviewMatch = text.match(/OVERVIEW:\s*([\s\S]*?)(?=HIGHLIGHTS:|$)/i);
    const highlightsMatch = text.match(/HIGHLIGHTS:\s*([\s\S]*?)$/im);
    const executive_summary = execMatch ? execMatch[1].trim() : text.slice(0, 500);
    const overview = overviewMatch ? overviewMatch[1].trim() : undefined;
    const highlights = highlightsMatch
      ? highlightsMatch[1]
          .split(/\n/)
          .map((s) => s.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean)
      : undefined;

    return { executive_summary, overview, highlights };
  } catch {
    return {
      executive_summary: `Period: ${binderSummary.periodStart ?? ''} to ${binderSummary.periodEnd ?? ''}. Entity: ${binderSummary.entityName ?? 'Entity'}. Prepared by Supervisor Agent.`,
      overview: undefined,
      highlights: undefined,
    };
  }
}

/**
 * Build clean ledger rows with Agent_Confidence_Score column for CSV.
 * Default confidence 1.0 per line unless a map is provided (e.g. from classifier).
 */
export function buildCleanLedgerWithConfidence(
  cleanLedger: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }>,
  confidenceByKey?: (row: { account_code?: string; account_name: string }) => number
): CleanLedgerRowWithConfidence[] {
  return cleanLedger.map((r) => {
    const key = (r.account_code ?? '') + '|' + (r.account_name ?? '');
    const score = confidenceByKey
      ? confidenceByKey({ account_code: r.account_code, account_name: r.account_name })
      : 1.0;
    const clamped = Math.min(1, Math.max(0, Number(score) || 1));
    return {
      account_code: r.account_code ?? '',
      account_name: r.account_name ?? '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      account_type: r.account_type ?? '',
      Agent_Confidence_Score: round2(clamped),
    };
  });
}

/**
 * Build full report payload for PDF/CSV export with agent-drafted narrative and Reasoning Chain appendix.
 */
export async function buildReportPayloadWithAgent(params: {
  cover: Record<string, string>;
  financial_statements: Record<string, unknown>;
  audit_trail: Array<{ timestamp_utc: string; event_type: string; reasoning: string; citations: string; outcome: string }>;
  audit_trail_rules_cited: string[];
  clean_ledger: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }>;
  binderSummary: BinderSummaryForDraft;
  agentContext?: AgentExportContext;
  confidenceByKey?: (row: { account_code?: string; account_name: string }) => number;
}): Promise<ReportPayloadWithAgent> {
  const {
    cover,
    financial_statements,
    audit_trail,
    audit_trail_rules_cited,
    clean_ledger,
    binderSummary,
    agentContext,
    confidenceByKey,
  } = params;

  let executive_summary: string;
  let overview: string | undefined;
  let highlights: string[] | undefined;

  if (agentContext) {
    const drafted = await draftNarrativeSections(binderSummary, agentContext);
    executive_summary = drafted.executive_summary;
    overview = drafted.overview;
    highlights = drafted.highlights;
  } else {
    executive_summary = `Period: ${binderSummary.periodStart ?? ''} to ${binderSummary.periodEnd ?? ''}. Entity: ${binderSummary.entityName ?? 'Entity'}. Prepared by Supervisor Agent.`;
  }

  const reasoning_chain_appendix = agentContext ? buildReasoningChainAppendix(agentContext) : [];
  const clean_ledger_with_confidence = buildCleanLedgerWithConfidence(clean_ledger, confidenceByKey);
  const ledgerHash = computeLedgerHash(clean_ledger);
  const compliancePackage: CompliancePackage = {
    balancedFinancialStatements: financial_statements,
    iracJustifications: {
      audit_trail,
      rules_cited: audit_trail_rules_cited,
    },
    ledgerHash,
  };

  return {
    cover,
    financial_statements,
    executive_summary,
    overview,
    highlights,
    audit_trail,
    audit_trail_rules_cited,
    reasoning_chain_appendix,
    clean_ledger: clean_ledger_with_confidence,
    compliancePackage,
  };
}

/**
 * Compute SHA-256 hash of canonical ledger representation (sorted by account_code then account_name, stable string).
 * Used in Compliance Package to prove ledger has not been tampered with since last CPA review.
 */
export function computeLedgerHash(
  cleanLedger: Array<{ account_code?: string; account_name: string; debit: number; credit: number; account_type?: string }>
): string {
  const rows = [...cleanLedger].sort((a, b) => {
    const codeA = (a.account_code ?? '').trim();
    const codeB = (b.account_code ?? '').trim();
    if (codeA !== codeB) return codeA.localeCompare(codeB);
    return (a.account_name ?? '').trim().localeCompare((b.account_name ?? '').trim());
  });
  const canonical = rows
    .map((r) => `${r.account_code ?? ''}|${r.account_name ?? ''}|${r.debit}|${r.credit}|${r.account_type ?? ''}`)
    .join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const CSV_HEADER = 'account_code,account_name,debit,credit,account_type,Agent_Confidence_Score';

/**
 * Generate CSV buffer with Agent_Confidence_Score column for every line item.
 */
export function generateCsvWithConfidence(cleanLedger: CleanLedgerRowWithConfidence[]): Buffer {
  const rows = [CSV_HEADER];
  for (const r of cleanLedger) {
    const code = escapeCsv(r.account_code);
    const name = escapeCsv(r.account_name);
    const type = escapeCsv(r.account_type);
    rows.push(`${code},${name},${r.debit},${r.credit},${type},${r.Agent_Confidence_Score}`);
  }
  return Buffer.from(rows.join('\r\n'), 'utf-8');
}

function escapeCsv(value: string): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
