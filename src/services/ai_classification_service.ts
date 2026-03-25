/**
 * AI Classification Service — orchestration layer for SLM-based suggestions.
 *
 * Coordinates between:
 * - SLM Client (HTTP calls to Python microservice)
 * - ai_coa_suggestions / ai_cf_suggestions tables (AI-scoped persistence)
 * - Audit ledger (hash-chained event trail)
 * - Guardrails (assertNoNumericAmountsInAgentOutput)
 * - Cascade engine (MAPPING_CHANGED trigger on acceptance)
 *
 * AI boundary: this service writes ONLY to ai_* tables. Accepted suggestions
 * are promoted to core COA mapping rules via the existing upsertCoaRules path,
 * which records the mapping_rule_update audit event.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import { appendEntry } from '../db/repositories/audit_ledger_repository.js';
import { insertCoaMappingRule, getNextRuleVersion } from '../db/repositories/coa_mapping_rules_repository.js';
import { executeCascade, CascadeTriggerType } from './cascade_engine.js';
import {
  type SlmError,
} from './slm_client_service.js';
import { checkMappingCompleteness } from './mapping_completeness_gate.js';
import { runClassifier, type RunClassifierResult } from '../ai/ai_orchestrator.js';
import { searchXBRL } from './xbrl_search_service.js';
import { listFsTaxonomyLines } from '../db/repositories/fs_taxonomy_repository.js';

// ---------- Prompt sanitization (H7 fix) ----------

/** Injection patterns that should be stripped from user-supplied text before prompt inclusion. */
const INJECTION_PREFIXES = /^(IGNORE|SYSTEM:|INSTRUCTIONS:|ASSISTANT:|HUMAN:|USER:|<\|im_start\|>|<\|im_end\|>|<\/?system>|<\/?user>|<\/?assistant>)/im;

/**
 * Sanitize user-supplied text before interpolating into AI prompts.
 * Defends against prompt injection via GL account names or other user input.
 */
function sanitizeForPrompt(text: string): string {
  let s = text;
  // Strip control characters (keep newlines and tabs for readability)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Escape backslashes and quotes
  s = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // Remove lines that look like prompt injection
  s = s
    .split('\n')
    .filter((line) => !INJECTION_PREFIXES.test(line.trim()))
    .join('\n');
  // Limit length to 200 characters
  if (s.length > 200) {
    s = s.slice(0, 200);
  }
  return s;
}

// ---------- Types ----------

export interface GenerateSuggestionsInput {
  tenantId: string;
  entityId: string;
  closeSessionId: string;
  /** If provided, only classify these accounts. Otherwise, classify all unmapped. */
  accountNames?: string[];
}

export interface CoaSuggestion {
  id: string;
  accountCode: string | null;
  accountName: string;
  suggestedFsLineId: string;
  suggestedFsLineLabel: string | null;
  confidence: number;
  confidenceBand: string;
  tier: string | null;
  alternatives: Array<Record<string, unknown>>;
  modelVersion: string;
  status: string;
  autoAccepted?: boolean;
}

export interface CfSuggestion {
  id: string;
  accountCode: string | null;
  accountName: string;
  classification: string;
  confidence: number;
  confidenceBand: string;
  source: string;
  rulePattern: string | null;
  alternatives: Array<Record<string, unknown>>;
  modelVersion: string;
  status: string;
}

export interface GenerateSuggestionsResult {
  coaSuggestions: CoaSuggestion[];
  cfSuggestions: CfSuggestion[];
  errors: SlmError[];
}

// ---------- RAG Classification: XBRL Retrieval → AI Selection ----------

/**
 * RAG-based account classification pipeline.
 *
 * Step 1 (Retrieval): XBRL trigram search returns top 5 candidates per account
 * Step 2 (Generation): AI reads candidates + account name + account type → picks best match
 * Step 3 (Fallback): If AI unavailable, use best XBRL match directly
 *
 * The AI prompt contains ONLY words — account names, XBRL labels, account types.
 * NO dollar amounts, NO balances, NO numbers of any kind enter the prompt.
 */
export async function classifyWithXBRL(
  pool: Pool,
  input: GenerateSuggestionsInput
): Promise<GenerateSuggestionsResult> {
  const { tenantId, entityId, closeSessionId } = input;

  // Resolve unmapped accounts
  let unmappedAccounts: Array<{ account_code: string | null; account_name: string; account_type?: string }> = [];
  if (!input.accountNames || input.accountNames.length === 0) {
    const mappingResult = await checkMappingCompleteness(pool, tenantId, closeSessionId, entityId);
    unmappedAccounts = mappingResult.unmapped_accounts;
  } else {
    unmappedAccounts = input.accountNames.map((name) => ({ account_code: null, account_name: name }));
  }

  if (unmappedAccounts.length === 0) {
    return { coaSuggestions: [], cfSuggestions: [], errors: [] };
  }

  // Check if XBRL taxonomy is populated
  const xbrlCountRes = await pool.query<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM xbrl_taxonomy_elements WHERE abstract = false AND deprecated = false');
  if (Number(xbrlCountRes.rows[0]?.cnt ?? 0) === 0) {
    return {
      coaSuggestions: [],
      cfSuggestions: [],
      errors: [{ account_name: '*', error: 'XBRL taxonomy not populated. Run seed_xbrl_taxonomy first.' }],
    };
  }

  // Build fs_taxonomy_lines lookups
  const fsLines = await listFsTaxonomyLines(pool);
  const fsByXbrlId = new Map<string, { id: string; name: string; code: string; statement: string }>();
  const fsByName = new Map<string, { id: string; name: string; code: string; statement: string }>();
  const fsById = new Map<string, { id: string; name: string; code: string; statement: string }>();
  for (const line of fsLines) {
    fsById.set(line.id, { id: line.id, name: line.name, code: line.code, statement: line.statement });
    if (line.xbrlElement) {
      fsByXbrlId.set(line.xbrlElement, { id: line.id, name: line.name, code: line.code, statement: line.statement });
    }
    fsByName.set(line.name.toLowerCase(), { id: line.id, name: line.name, code: line.code, statement: line.statement });
  }

  const statementByType: Record<string, string> = {
    ASSET: 'BS', LIABILITY: 'BS', EQUITY: 'BS', REVENUE: 'PL', EXPENSE: 'PL',
    CURRENT_ASSET: 'BS', NON_CURRENT_ASSET: 'BS',
    CURRENT_LIABILITY: 'BS', NON_CURRENT_LIABILITY: 'BS',
  };
  const defaultFsLineByType: Record<string, string> = {
    ASSET: 'fs_asset', LIABILITY: 'fs_liability', EQUITY: 'fs_equity',
    REVENUE: 'fs_revenue', EXPENSE: 'fs_expense',
  };

  // Expire previous pending suggestions for this session
  await pool.query(
    `UPDATE ai_coa_suggestions SET status = 'expired'
     WHERE tenant_id = $1 AND close_session_id = $2 AND status = 'pending'`,
    [tenantId, closeSessionId]
  );

  // ── STEP 1: XBRL Retrieval ──
  // For each account, retrieve top 5 XBRL candidates + resolve to Sabit fs_lines
  interface XbrlRetrievalResult {
    account: typeof unmappedAccounts[0];
    xbrlResults: Awaited<ReturnType<typeof searchXBRL>>;
    /** Best deterministic match (XBRL-only, no AI) */
    bestFsLineId: string | null;
    bestFsLineName: string | null;
    bestConfidence: number;
    bestXbrlId: string | null;
    bestXbrlLabel: string | null;
    /** All XBRL candidates mapped to Sabit lines (for AI to choose from) */
    candidates: Array<{ fsLineId: string; fsLineName: string; xbrlId: string; xbrlLabel: string; similarity: number }>;
  }

  // ── LAYER 0: Curated GL pattern → FS line mappings ──
  // Resolves common account names to known FS lines with high confidence.
  // Patterns use SQL ILIKE syntax (% = wildcard). Checked before XBRL trigram.
  interface PatternMapping { pattern: string; glType?: string; fsLineId: string; confidence: number }
  const CURATED_PATTERNS: PatternMapping[] = [
    // Cash & equivalents
    { pattern: 'cash%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.98 },
    { pattern: 'petty cash%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.98 },
    // Receivables
    { pattern: 'accounts receivable%', glType: 'ASSET', fsLineId: 'fs_asset_ar', confidence: 0.97 },
    { pattern: 'allowance for doubtful%', glType: 'ASSET', fsLineId: 'fs_asset_ar_allowance', confidence: 0.97 },
    { pattern: 'allowance for bad%', glType: 'ASSET', fsLineId: 'fs_asset_ar_allowance', confidence: 0.97 },
    // Inventory
    { pattern: 'inventory%', glType: 'ASSET', fsLineId: 'fs_asset_inventory', confidence: 0.96 },
    { pattern: 'work in progress%', glType: 'ASSET', fsLineId: 'fs_asset_inventory', confidence: 0.95 },
    // Prepaids
    { pattern: 'prepaid%', glType: 'ASSET', fsLineId: 'fs_asset_prepaid', confidence: 0.96 },
    // Fixed assets
    { pattern: '%depreciation%', glType: 'ASSET', fsLineId: 'fs_asset_ppe_accum_dep', confidence: 0.95 },
    { pattern: '%equipment%', glType: 'ASSET', fsLineId: 'fs_asset_ppe', confidence: 0.93 },
    { pattern: '%machinery%', glType: 'ASSET', fsLineId: 'fs_asset_ppe', confidence: 0.93 },
    { pattern: '%building%', glType: 'ASSET', fsLineId: 'fs_asset_ppe', confidence: 0.93 },
    { pattern: '%vehicle%', glType: 'ASSET', fsLineId: 'fs_asset_ppe', confidence: 0.90 },
    { pattern: '%furniture%', glType: 'ASSET', fsLineId: 'fs_asset_ppe', confidence: 0.90 },
    { pattern: '%leasehold improvement%', glType: 'ASSET', fsLineId: 'fs_asset_ppe', confidence: 0.90 },
    { pattern: '%amortization%', glType: 'ASSET', fsLineId: 'fs_asset_intangible_amort', confidence: 0.92 },
    { pattern: 'goodwill%', glType: 'ASSET', fsLineId: 'fs_asset_goodwill', confidence: 0.97 },
    { pattern: 'deferred tax asset%', glType: 'ASSET', fsLineId: 'fs_asset_dta', confidence: 0.96 },
    // Payables & liabilities
    { pattern: 'accounts payable%', glType: 'LIABILITY', fsLineId: 'fs_liability_ap', confidence: 0.97 },
    { pattern: 'accrued%', glType: 'LIABILITY', fsLineId: 'fs_liability_accrued', confidence: 0.95 },
    { pattern: '%tax payable%', glType: 'LIABILITY', fsLineId: 'fs_liability_accrued', confidence: 0.93 },
    { pattern: '%taxes payable%', glType: 'LIABILITY', fsLineId: 'fs_liability_accrued', confidence: 0.93 },
    { pattern: 'customer deposit%', glType: 'LIABILITY', fsLineId: 'fs_liability_deferred_rev_current', confidence: 0.93 },
    { pattern: 'deferred revenue%', glType: 'LIABILITY', fsLineId: 'fs_liability_deferred_rev_current', confidence: 0.96 },
    { pattern: 'deferred tax liabilit%', glType: 'LIABILITY', fsLineId: 'fs_liability_deferred_tax', confidence: 0.96 },
    { pattern: '%loan%', glType: 'LIABILITY', fsLineId: 'fs_liability_lt_debt', confidence: 0.88 },
    { pattern: '%term loan%', glType: 'LIABILITY', fsLineId: 'fs_liability_lt_debt', confidence: 0.93 },
    { pattern: '%line of credit%', glType: 'LIABILITY', fsLineId: 'fs_liability_current_debt', confidence: 0.93 },
    // Equity
    { pattern: 'common stock%', glType: 'EQUITY', fsLineId: 'fs_equity_common', confidence: 0.97 },
    { pattern: 'retained earnings%', glType: 'EQUITY', fsLineId: 'fs_equity_retained', confidence: 0.97 },
    { pattern: 'additional paid%', glType: 'EQUITY', fsLineId: 'fs_equity_apic', confidence: 0.96 },
    { pattern: 'treasury stock%', glType: 'EQUITY', fsLineId: 'fs_equity_treasury', confidence: 0.96 },
    { pattern: 'dividend%', glType: 'EQUITY', fsLineId: 'fs_equity_dividends', confidence: 0.95 },
    // Revenue
    { pattern: '%revenue%', glType: 'REVENUE', fsLineId: 'fs_revenue', confidence: 0.93 },
    { pattern: 'product revenue%', glType: 'REVENUE', fsLineId: 'fs_revenue_product', confidence: 0.96 },
    { pattern: 'service revenue%', glType: 'REVENUE', fsLineId: 'fs_revenue_service', confidence: 0.96 },
    { pattern: '%sales%', glType: 'REVENUE', fsLineId: 'fs_revenue', confidence: 0.90 },
    { pattern: 'sales returns%', glType: 'REVENUE', fsLineId: 'fs_revenue_contra', confidence: 0.95 },
    { pattern: 'sales discount%', glType: 'REVENUE', fsLineId: 'fs_revenue_contra', confidence: 0.95 },
    { pattern: 'interest income%', glType: 'REVENUE', fsLineId: 'fs_interest_income', confidence: 0.96 },
    // COGS
    { pattern: 'cogs%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.96 },
    { pattern: 'cost of goods%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.96 },
    { pattern: 'cost of sales%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.95 },
    { pattern: 'direct material%', glType: 'EXPENSE', fsLineId: 'fs_cogs_materials', confidence: 0.95 },
    { pattern: 'direct labor%', glType: 'EXPENSE', fsLineId: 'fs_cogs_labor', confidence: 0.95 },
    { pattern: 'manufacturing overhead%', glType: 'EXPENSE', fsLineId: 'fs_cogs_overhead', confidence: 0.95 },
    { pattern: 'warranty expense%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.90 },
    { pattern: 'inventory adjustment%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.90 },
    // SGA operating expenses
    { pattern: 'salaries%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.95 },
    { pattern: 'wages%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.95 },
    { pattern: 'payroll%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'employee benefit%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'health insurance%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'rent expense%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'utilit%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'insurance%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'office%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'repair%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'maintenance%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'travel%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'meals%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'entertainment%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'marketing%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'advertising%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'telecommunication%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'software%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'vehicle expense%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'shipping%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'professional fee%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'legal%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'consulting%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'trade show%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'postage%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'bank%charge%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.88 },
    { pattern: 'bank%fee%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.88 },
    { pattern: 'dues%subscription%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'training%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    // Depreciation & amortization expense
    { pattern: 'depreciation expense%', glType: 'EXPENSE', fsLineId: 'fs_opex_da', confidence: 0.96 },
    { pattern: 'amortization expense%', glType: 'EXPENSE', fsLineId: 'fs_opex_da', confidence: 0.96 },
    // R&D
    { pattern: 'r&d%', glType: 'EXPENSE', fsLineId: 'fs_opex_rd', confidence: 0.95 },
    { pattern: 'research%', glType: 'EXPENSE', fsLineId: 'fs_opex_rd', confidence: 0.93 },
    // Interest & other
    { pattern: 'interest expense%', glType: 'EXPENSE', fsLineId: 'fs_interest_expense', confidence: 0.96 },
    { pattern: 'gain%loss%', glType: 'EXPENSE', fsLineId: 'fs_other_gain_loss', confidence: 0.88 },
    { pattern: 'foreign currency%', glType: 'EXPENSE', fsLineId: 'fs_other_other', confidence: 0.88 },
    // Income tax expense
    { pattern: 'income tax expense%', glType: 'EXPENSE', fsLineId: 'fs_tax_expense', confidence: 0.96 },
    { pattern: 'deferred%tax%expense%', glType: 'EXPENSE', fsLineId: 'fs_tax_deferred', confidence: 0.95 },
    { pattern: 'current%tax%expense%', glType: 'EXPENSE', fsLineId: 'fs_tax_current', confidence: 0.95 },
    // ── International / non-standard naming variants ──
    // Cash variants (UK, Canada, QuickBooks)
    { pattern: 'bank%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.95 },
    { pattern: 'chequing%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.95 },
    { pattern: 'checking%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.95 },
    { pattern: 'current account%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.93 },
    { pattern: 'undeposited funds%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.93 },
    { pattern: 'money market%', glType: 'ASSET', fsLineId: 'fs_asset_cash', confidence: 0.90 },
    // UK/IFRS receivables/payables
    { pattern: 'trade debtors%', glType: 'ASSET', fsLineId: 'fs_asset_ar', confidence: 0.95 },
    { pattern: 'debtors%', glType: 'ASSET', fsLineId: 'fs_asset_ar', confidence: 0.90 },
    { pattern: 'trade creditors%', glType: 'LIABILITY', fsLineId: 'fs_liability_ap', confidence: 0.95 },
    { pattern: 'creditors%', glType: 'LIABILITY', fsLineId: 'fs_liability_ap', confidence: 0.90 },
    // Inventory variants
    { pattern: 'stock%', glType: 'ASSET', fsLineId: 'fs_asset_inventory', confidence: 0.88 },
    { pattern: 'merchandise%', glType: 'ASSET', fsLineId: 'fs_asset_inventory', confidence: 0.90 },
    { pattern: 'work-in-progress%', glType: 'ASSET', fsLineId: 'fs_asset_inventory', confidence: 0.93 },
    { pattern: 'wip%', glType: 'ASSET', fsLineId: 'fs_asset_inventory', confidence: 0.90 },
    // COGS variants
    { pattern: 'cost of revenue%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.95 },
    { pattern: 'direct costs%', glType: 'EXPENSE', fsLineId: 'fs_cogs', confidence: 0.93 },
    // Payroll / staff cost variants
    { pattern: 'labour%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'labor%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'staff cost%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.93 },
    { pattern: 'compensation%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'bonus%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.88 },
    { pattern: 'commission%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.88 },
    // Operating expense variants
    { pattern: 'motor vehicle%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'telephone%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.90 },
    { pattern: 'sundry%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.85 },
    { pattern: 'miscellaneous%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.85 },
    { pattern: 'overheads%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.88 },
    { pattern: 'printing%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.88 },
    { pattern: 'cleaning%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.85 },
    { pattern: 'security%', glType: 'EXPENSE', fsLineId: 'fs_opex_sga', confidence: 0.85 },
    // Revenue variants
    { pattern: 'turnover%', glType: 'REVENUE', fsLineId: 'fs_revenue', confidence: 0.93 },
    { pattern: 'billings%', glType: 'REVENUE', fsLineId: 'fs_revenue', confidence: 0.90 },
    { pattern: 'fees earned%', glType: 'REVENUE', fsLineId: 'fs_revenue', confidence: 0.93 },
    { pattern: 'income from services%', glType: 'REVENUE', fsLineId: 'fs_revenue_service', confidence: 0.93 },
    { pattern: 'rental income%', glType: 'REVENUE', fsLineId: 'fs_revenue_other', confidence: 0.90 },
    { pattern: 'royalty%income%', glType: 'REVENUE', fsLineId: 'fs_revenue_other', confidence: 0.88 },
  ];

  /** Match account name against curated patterns. Returns first match with highest confidence. */
  function matchCuratedPattern(accountName: string, glType: string): PatternMapping | null {
    const name = accountName.toLowerCase()
      .replace(/\([^)]*\)/g, '')      // strip (Chase) etc
      .replace(/\s*[-–—]\s*/g, ' ')   // strip separators
      .replace(/\s+/g, ' ').trim();
    let bestMatch: PatternMapping | null = null;
    for (const p of CURATED_PATTERNS) {
      // Check GL type filter if specified
      if (p.glType && glType && p.glType !== glType) continue;
      // Convert SQL ILIKE pattern to regex
      const regex = new RegExp('^' + p.pattern.replace(/%/g, '.*') + '$', 'i');
      if (regex.test(name)) {
        if (!bestMatch || p.confidence > bestMatch.confidence) {
          bestMatch = p;
        }
      }
    }
    return bestMatch;
  }

  const retrievals: XbrlRetrievalResult[] = [];

  for (const acc of unmappedAccounts) {
    const accountType = ((acc as Record<string, unknown>).account_type as string ?? '').toUpperCase();
    const xbrlStatement = statementByType[accountType] || undefined;

    // ── LAYER 0: Curated pattern matching ──
    const curatedMatch = matchCuratedPattern(acc.account_name, accountType);
    if (curatedMatch) {
      const fsLine = fsById.get(curatedMatch.fsLineId);
      retrievals.push({
        account: acc,
        xbrlResults: [],
        bestFsLineId: curatedMatch.fsLineId,
        bestFsLineName: fsLine?.name ?? curatedMatch.fsLineId,
        bestConfidence: curatedMatch.confidence,
        bestXbrlId: null,
        bestXbrlLabel: null,
        candidates: [],
      });
      continue; // Skip XBRL trigram for curated matches
    }

    const xbrlResults = await searchXBRL(pool, acc.account_name, {
      statement: xbrlStatement,
      limit: 5,
    });

    let bestFsLineId: string | null = null;
    let bestFsLineName: string | null = null;
    let bestConfidence = 0;
    let bestXbrlId: string | null = null;
    let bestXbrlLabel: string | null = null;
    const candidates: XbrlRetrievalResult['candidates'] = [];

    // Expected statement for this account type (BS for assets/liabilities/equity, PL for revenue/expense)
    const expectedStatement = xbrlStatement; // 'BS', 'PL', 'CF', or undefined

    // Build candidate list: every XBRL result that maps to a Sabit fs_line
    // Filter by statement alignment — ASSET accounts should only match BS lines
    for (const xr of xbrlResults) {
      const mapped = fsByXbrlId.get(xr.id);
      if (mapped) {
        // Penalise cross-statement matches: ASSET account shouldn't map to CF/PL lines
        const lineStatement = mapped.statement;
        const statementMatch = !expectedStatement || lineStatement === expectedStatement
          || (expectedStatement === 'PL' && lineStatement === 'IS')
          || (expectedStatement === 'IS' && lineStatement === 'PL');
        const adjustedSimilarity = statementMatch
          ? xr.similarity + 0.15  // boost for correct statement
          : xr.similarity * 0.3;  // heavy penalty for wrong statement

        candidates.push({
          fsLineId: mapped.id,
          fsLineName: mapped.name,
          xbrlId: xr.id,
          xbrlLabel: xr.label,
          similarity: adjustedSimilarity,
        });
      }
    }

    // Sort candidates by adjusted similarity (statement-aligned ones float to top)
    candidates.sort((a, b) => b.similarity - a.similarity);

    // Best deterministic pick: highest-similarity statement-aligned candidate
    if (candidates.length > 0) {
      const best = candidates[0];
      bestFsLineId = best.fsLineId;
      bestFsLineName = best.fsLineName;
      bestConfidence = Math.min(0.95, best.similarity);
      bestXbrlId = best.xbrlId;
      bestXbrlLabel = best.xbrlLabel;
    }

    // Direct fs_taxonomy_lines name match — runs if XBRL bridge produced nothing or low confidence
    if (!bestFsLineId || bestConfidence < 0.5) {
      const cleanedName = acc.account_name.toLowerCase()
        .replace(/\([^)]*\)/g, '')       // strip (Chase), (Wells Fargo) etc
        .replace(/\s*[-–—]\s*/g, ' ')    // strip separators
        .replace(/\s+/g, ' ').trim();
      const accountWords = cleanedName.split(/\s+/).filter(w => w.length > 2
        && !['the', 'and', 'for', 'net', 'current', 'admin', 'executive', 'general'].includes(w));
      let bestNameScore = 0;
      let bestNameLine: { id: string; name: string; statement: string } | null = null;
      for (const [name, line] of fsByName) {
        // Filter by statement alignment
        const lineMatch = !expectedStatement || line.statement === expectedStatement
          || (expectedStatement === 'PL' && line.statement === 'IS')
          || (expectedStatement === 'IS' && line.statement === 'PL');
        if (!lineMatch) continue;
        const nameWords = name.split(/\s+/);
        const matchCount = accountWords.filter(w => nameWords.some(nw => nw.includes(w) || w.includes(nw))).length;
        const score = matchCount / Math.max(accountWords.length, 1);
        if (score > bestNameScore && score >= 0.25) {
          bestNameScore = score;
          bestNameLine = line;
        }
      }
      if (bestNameLine && bestNameScore > bestConfidence) {
        bestFsLineId = bestNameLine.id;
        bestFsLineName = bestNameLine.name;
        bestConfidence = Math.min(0.90, bestNameScore + 0.15); // boost for direct name match
      }
    }

    // Ultimate fallback: default by account type
    if (!bestFsLineId && accountType && defaultFsLineByType[accountType]) {
      bestFsLineId = defaultFsLineByType[accountType];
      const fallback = fsLines.find((l) => l.id === bestFsLineId);
      bestFsLineName = fallback?.name ?? accountType;
      bestConfidence = 0.3;
    }

    // ── LAYER 3 FALLBACK: Direct Claude classification for low-confidence results ──
    // When curated patterns miss and XBRL returns weak results, ask Claude directly.
    const CLAUDE_FALLBACK_THRESHOLD = 0.80;
    if (bestConfidence < CLAUDE_FALLBACK_THRESHOLD && process.env.ANTHROPIC_API_KEY) {
      try {
        const { callAIWithSchema } = await import('../ai/ai_client.js');
        const { z } = await import('zod');

        // Filter fs lines by GL type to reduce noise
        const relevantLines = fsLines.filter((l) => {
          if (l.isSubtotal || l.isHidden) return false;
          const stmt = l.statement as string;
          if (accountType === 'ASSET' || accountType === 'CURRENT_ASSET' || accountType === 'NON_CURRENT_ASSET')
            return stmt === 'BS';
          if (accountType === 'LIABILITY' || accountType === 'CURRENT_LIABILITY' || accountType === 'NON_CURRENT_LIABILITY')
            return stmt === 'BS';
          if (accountType === 'EQUITY') return stmt === 'BS' || stmt === 'EQ';
          if (accountType === 'REVENUE') return stmt === 'PL' || stmt === 'IS';
          if (accountType === 'EXPENSE') return stmt === 'PL' || stmt === 'IS';
          return true;
        });
        const linesList = relevantLines.map((l) => `${l.id}: "${l.name}" (${l.statement})`).join('\n');

        const ClassifySchema = z.object({
          fsLineId: z.string(),
          fsLineName: z.string(),
          confidence: z.number(),
          reasoning: z.string(),
          ascCitation: z.string().optional(),
        });

        const claudeResult = await callAIWithSchema({
          pool,
          tenantId,
          pillar: 'classifier_layer3',
          promptVersion: 'direct_classify_v1',
          systemPrompt: 'You are an expert US GAAP accountant. Classify the GL account to the correct financial statement line. Respond with ONLY valid JSON.',
          userPrompt: `GL Account: "${acc.account_name}"
Account Code: ${acc.account_code ?? 'unknown'}
GL Type: ${accountType}
Current best guess: "${bestFsLineName ?? 'none'}" (confidence: ${Math.round(bestConfidence * 100)}% — too low)

Available financial statement lines:
${linesList}

Pick the single best line. If this is a non-English/non-standard name (e.g. "Trade Debtors" = Accounts Receivable, "Bank - RBC" = Cash), recognize it.

Respond with JSON only:
{"fsLineId":"id_from_list","fsLineName":"name","confidence":0.95,"reasoning":"one sentence","ascCitation":"ASC XXX"}`,
          schema: ClassifySchema,
          requestJson: { pillar: 'classifier_layer3', accountName: acc.account_name, currentConfidence: bestConfidence },
        });

        if (claudeResult.ok && claudeResult.parsed) {
          const pick = claudeResult.parsed;
          // Validate the fs_line_id exists
          const matched = fsById.get(pick.fsLineId);
          if (matched && pick.confidence > bestConfidence) {
            bestFsLineId = pick.fsLineId;
            bestFsLineName = pick.fsLineName;
            bestConfidence = Math.min(0.95, pick.confidence);
            bestXbrlId = null;
            bestXbrlLabel = pick.ascCitation ?? null;
          }
        }
      } catch {
        // Fail-open — keep XBRL/fallback result
      }
    }

    retrievals.push({
      account: acc,
      xbrlResults,
      bestFsLineId,
      bestFsLineName,
      bestConfidence,
      bestXbrlId,
      bestXbrlLabel,
      candidates,
    });
  }

  // ── STEP 2: AI Selection (RAG — words only, no numbers) ──
  // Build a single batch prompt: for each account, show the XBRL candidates
  // AI picks the best Sabit fs_line for each. Fail-open: if AI fails, use XBRL-only.
  let aiPicks: Map<string, { fsLineId: string; confidence: number }> = new Map();
  let modelVersion = 'xbrl_rag_v1';

  try {
    const { callAIWithSchema } = await import('../ai/ai_client.js');
    const { z } = await import('zod');

    // Build prompt — WORDS ONLY, no dollar amounts
    const accountBlocks = retrievals.map((r) => {
      const accType = ((r.account as Record<string, unknown>).account_type as string ?? 'unknown').toUpperCase();

      // Format candidates as a numbered list of choices
      const candidateLines = r.candidates.map((c, i) =>
        `  ${i + 1}. "${c.fsLineName}" (Sabit ID: ${c.fsLineId}) — XBRL: "${c.xbrlLabel}"`
      ).join('\n');

      // Also include Sabit lines reachable via name match (no XBRL link)
      const xbrlOnlyLines = r.xbrlResults
        .filter((xr) => !r.candidates.some((c) => c.xbrlId === xr.id))
        .slice(0, 2)
        .map((xr) => `  - XBRL only: "${xr.label}" (no direct Sabit mapping)`)
        .join('\n');

      return `Account: "${sanitizeForPrompt(String(r.account.account_name))}"
Type: ${accType}
Candidates:
${candidateLines || '  (no strong candidates)'}${xbrlOnlyLines ? '\n' + xbrlOnlyLines : ''}`;
    }).join('\n\n');

    // Build the complete Sabit taxonomy as the "answer space"
    const sabitLines = fsLines
      .filter((l) => !l.isSubtotal && !l.isHidden)
      .map((l) => `${l.id}: "${l.name}" (${l.statement})`)
      .join('\n');

    const userPrompt = `You are an expert CPA mapping accounts to financial statement line items.

For each account below, pick the single best Sabit reporting line from the candidates provided.
The candidates come from XBRL US GAAP taxonomy matching — they are strong hints but not always correct.
If none of the candidates fit well, pick from the full Sabit taxonomy list.

Rules:
- Pick exactly one Sabit line ID per account
- Use your accounting knowledge to disambiguate
- Contra accounts (Accumulated Depreciation, Allowance for Doubtful Accounts) must map to contra-asset lines
- Revenue accounts map to revenue lines, expense to expense lines
- If truly ambiguous, pick the most conservative classification

${accountBlocks}

Full Sabit Taxonomy (pick from these IDs):
${sabitLines}

Respond with JSON only. One object per account. Shape:
{"picks":[{"account_name":"...","fs_line_id":"...","confidence":0.0-1.0}]}`;

    const systemPrompt = `You are an expert US GAAP accountant. You classify GL accounts to financial statement reporting lines. You NEVER produce dollar amounts, balances, or calculations. You ONLY output the JSON mapping. Be precise with contra accounts and account subtypes.`;

    const PicksSchema = z.object({
      picks: z.array(z.object({
        account_name: z.string(),
        fs_line_id: z.string(),
        confidence: z.number(),
      })),
    });

    const result = await callAIWithSchema({
      pool,
      tenantId,
      pillar: 'classifier',
      promptVersion: 'xbrl_rag_v1',
      systemPrompt,
      userPrompt,
      schema: PicksSchema,
      requestJson: {
        pillar: 'classifier_rag',
        accountCount: retrievals.length,
        candidateCount: retrievals.reduce((s, r) => s + r.candidates.length, 0),
      },
    });

    if (result.ok && result.parsed) {
      // Layer 3 guardrail: verify no dollar amounts leaked into AI output
      assertNoNumericAmountsInAgentOutput(JSON.stringify(result.parsed), 'ai_classification_xbrl_rag');
      modelVersion = 'xbrl_rag_ai_v1';
      for (const pick of result.parsed.picks) {
        // Validate the fs_line_id exists in our taxonomy
        if (fsById.has(pick.fs_line_id)) {
          aiPicks.set(pick.account_name, {
            fsLineId: pick.fs_line_id,
            confidence: pick.confidence,
          });
        }
      }
    }
  } catch {
    // AI unavailable — use XBRL-only results (fail-open)
    modelVersion = 'xbrl_rag_v1';
  }

  // ── STEP 3: Merge — AI pick wins if it's valid, else XBRL-only ──
  const coaSuggestions: CoaSuggestion[] = [];

  for (const r of retrievals) {
    let fsLineId = r.bestFsLineId;
    let fsLineName = r.bestFsLineName;
    let confidence = r.bestConfidence;

    // If AI made a pick for this account, use it
    const aiPick = aiPicks.get(r.account.account_name);
    if (aiPick) {
      const aiLine = fsById.get(aiPick.fsLineId);
      if (aiLine) {
        fsLineId = aiLine.id;
        fsLineName = aiLine.name;
        confidence = aiPick.confidence;
      }
    }

    if (!fsLineId) continue;

    const confidenceBand = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';

    const alternatives = r.candidates.slice(0, 4)
      .filter((c) => c.fsLineId !== fsLineId)
      .map((c) => ({
        line_item_id: c.fsLineId,
        label: c.fsLineName,
        score: c.similarity,
        xbrl_element: c.xbrlId,
      }));

    // Determine model version and tier based on source
    const isCurated = r.xbrlResults.length === 0 && !r.bestXbrlId;
    const effectiveModelVersion = isCurated ? 'curated_pattern_v1' : modelVersion;
    const effectiveTier = isCurated ? 'pattern:curated' : (r.bestXbrlLabel ? `xbrl:${r.bestXbrlId}` : null);

    // Persist suggestion
    const id = randomUUID();
    await pool.query(
      `INSERT INTO ai_coa_suggestions
        (id, tenant_id, entity_id, close_session_id, account_code, account_name,
         suggested_fs_line_id, suggested_fs_line_label, confidence, confidence_band,
         tier, alternatives, model_version, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')`,
      [
        id, tenantId, entityId, closeSessionId,
        r.account.account_code, r.account.account_name,
        fsLineId, fsLineName,
        confidence, confidenceBand,
        effectiveTier,
        JSON.stringify(alternatives),
        effectiveModelVersion,
      ]
    ).catch(() => { /* non-fatal: duplicate */ });

    coaSuggestions.push({
      id,
      accountCode: r.account.account_code,
      accountName: r.account.account_name,
      suggestedFsLineId: fsLineId,
      suggestedFsLineLabel: fsLineName,
      confidence,
      confidenceBand,
      tier: r.bestXbrlLabel ? `xbrl:${r.bestXbrlId}` : null,
      alternatives,
      modelVersion,
      status: 'pending',
    });
  }

  // Auto-accept high-confidence suggestions if enabled
  try {
    const { getEntitySettings } = await import('./entity_settings_service.js');
    const settings = await getEntitySettings(pool, tenantId, entityId);
    if (settings.mappingAutoAcceptEnabled && coaSuggestions.length > 0) {
      const threshold = settings.mappingConfidenceThreshold;
      for (const suggestion of coaSuggestions) {
        if (suggestion.confidence >= threshold && suggestion.status === 'pending') {
          try {
            await acceptCoaSuggestion(pool, tenantId, suggestion.id, 'auto_accept');
            await pool.query(
              `UPDATE ai_coa_suggestions SET auto_accepted = TRUE, auto_accepted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
              [suggestion.id, tenantId]
            );
            suggestion.status = 'accepted';
            suggestion.autoAccepted = true;
          } catch {
            /* non-fatal */
          }
        }
      }
    }
  } catch {
    /* non-fatal */
  }

  return { coaSuggestions, cfSuggestions: [], errors: [] };
}

// ---------- Generate suggestions ----------

/**
 * Generate COA and CF classification suggestions for unmapped accounts.
 *
 * Delegates to the RAG pipeline: XBRL retrieval → AI selection → fallback.
 * This is the same pipeline as classifyWithXBRL — kept as a separate export
 * for backward compatibility with the /generate endpoint.
 */
export async function generateClassificationSuggestions(
  pool: Pool,
  input: GenerateSuggestionsInput
): Promise<GenerateSuggestionsResult> {
  return classifyWithXBRL(pool, input);
}

// ---------- Accept suggestion ----------

/**
 * Accept a COA suggestion: creates a real COA mapping rule and triggers cascade.
 *
 * 1. Marks the ai_coa_suggestion as 'accepted'
 * 2. Creates a COA mapping rule via insertCoaMappingRule
 * 3. Writes audit ledger event (ai_mapping_suggestion_accepted)
 * 4. Fires MAPPING_CHANGED cascade
 */
export async function acceptCoaSuggestion(
  pool: Pool,
  tenantId: string,
  suggestionId: string,
  reviewedBy: string,
  overrideFsLineId?: string
): Promise<{ ruleId: string; version: number }> {
  // Fetch suggestion
  const { rows } = await pool.query<{
    id: string;
    entity_id: string;
    close_session_id: string;
    account_code: string | null;
    account_name: string;
    suggested_fs_line_id: string;
    status: string;
  }>(
    `SELECT id, entity_id, close_session_id, account_code, account_name, suggested_fs_line_id, status
     FROM ai_coa_suggestions WHERE id = $1 AND tenant_id = $2`,
    [suggestionId, tenantId]
  );
  if (rows.length === 0) throw new Error(`COA suggestion ${suggestionId} not found`);
  const suggestion = rows[0];
  if (suggestion.status !== 'pending') throw new Error(`COA suggestion ${suggestionId} is already ${suggestion.status}`);

  const fsLineId = overrideFsLineId || suggestion.suggested_fs_line_id;
  const eventType = overrideFsLineId ? 'ai_mapping_suggestion_edited' : 'ai_mapping_suggestion_accepted';

  // Mark accepted
  await pool.query(
    `UPDATE ai_coa_suggestions SET status = 'accepted', reviewed_by = $1, reviewed_at = now() WHERE id = $2 AND tenant_id = $3`,
    [reviewedBy, suggestionId, tenantId]
  );

  // Create real COA mapping rule
  const ruleId = randomUUID();
  const version = await getNextRuleVersion(pool, tenantId, suggestion.entity_id);
  const pattern = suggestion.account_code
    ? suggestion.account_code
    : suggestion.account_name;
  const isAccountCode = !!suggestion.account_code;

  await insertCoaMappingRule(pool, ruleId, tenantId, suggestion.entity_id, version, {
    effectiveFrom: '2000-01-01',
    sourceAccountNamePattern: isAccountCode ? '%' : pattern,
    sourceAccountNumberPattern: isAccountCode ? pattern : undefined,
    mappedFsLineId: fsLineId,
    confidenceDefault: 1,
  });

  // Audit ledger
  try {
    await appendEntry(pool, {
      tenantId,
      eventType: eventType as 'ai_mapping_suggestion_accepted' | 'ai_mapping_suggestion_edited',
      deterministicFlagSnapshot: {
        suggestionId,
        accountName: suggestion.account_name,
        accountCode: suggestion.account_code,
        originalFsLineId: suggestion.suggested_fs_line_id,
        acceptedFsLineId: fsLineId,
        ruleId,
        version,
      },
      userPromptRationale: `AI COA suggestion ${eventType === 'ai_mapping_suggestion_edited' ? 'edited and accepted' : 'accepted'}: ${suggestion.account_name} → ${fsLineId}`,
    });
  } catch {
    /* non-fatal: audit write failed */
  }

  // Fire cascade
  try {
    await executeCascade(pool, tenantId, {
      type: CascadeTriggerType.MAPPING_CHANGED,
      period_id: suggestion.close_session_id,
      entity_id: suggestion.entity_id,
      triggered_by: 'ai_classification_service',
      affected_accounts: [suggestion.account_name],
      details: { source: 'slm_suggestion_accepted', suggestionId, ruleId },
    });
  } catch {
    /* non-fatal: cascade failed */
  }

  // Learning loop: record override corrections for future closes
  if (overrideFsLineId && overrideFsLineId !== suggestion.suggested_fs_line_id) {
    try {
      const { recordCorrection } = await import('./mapping_learning_service.js');
      await recordCorrection(pool, {
        tenantId,
        entityId: suggestion.entity_id,
        accountNamePattern: suggestion.account_name,
        accountCodePattern: suggestion.account_code ?? undefined,
        rejectedFsLineId: suggestion.suggested_fs_line_id,
        chosenFsLineId: overrideFsLineId,
        source: 'manual_override',
        closeSessionId: suggestion.close_session_id,
      });
    } catch {
      /* non-fatal: learning loop write failed */
    }
  }

  return { ruleId, version };
}

// ---------- Accept CF suggestion ----------

/**
 * Accept a CF suggestion: creates a COA mapping rule with cash_flow_class.
 */
export async function acceptCfSuggestion(
  pool: Pool,
  tenantId: string,
  suggestionId: string,
  reviewedBy: string,
  overrideClassification?: string
): Promise<{ ruleId: string; version: number }> {
  const { rows } = await pool.query<{
    id: string;
    entity_id: string;
    close_session_id: string;
    account_code: string | null;
    account_name: string;
    classification: string;
    status: string;
  }>(
    `SELECT id, entity_id, close_session_id, account_code, account_name, classification, status
     FROM ai_cf_suggestions WHERE id = $1 AND tenant_id = $2`,
    [suggestionId, tenantId]
  );
  if (rows.length === 0) throw new Error(`CF suggestion ${suggestionId} not found`);
  const suggestion = rows[0];
  if (suggestion.status !== 'pending') throw new Error(`CF suggestion ${suggestionId} is already ${suggestion.status}`);

  const classification = overrideClassification || suggestion.classification;
  const eventType = overrideClassification ? 'ai_mapping_suggestion_edited' : 'ai_mapping_suggestion_accepted';

  // Mark accepted
  await pool.query(
    `UPDATE ai_cf_suggestions SET status = 'accepted', reviewed_by = $1, reviewed_at = now() WHERE id = $2 AND tenant_id = $3`,
    [reviewedBy, suggestionId, tenantId]
  );

  // Create COA mapping rule with cash_flow_class
  const ruleId = randomUUID();
  const version = await getNextRuleVersion(pool, tenantId, suggestion.entity_id);
  const pattern = suggestion.account_code || suggestion.account_name;
  const isAccountCode = !!suggestion.account_code;

  await insertCoaMappingRule(pool, ruleId, tenantId, suggestion.entity_id, version, {
    effectiveFrom: '2000-01-01',
    sourceAccountNamePattern: isAccountCode ? '%' : pattern,
    sourceAccountNumberPattern: isAccountCode ? pattern : undefined,
    mappedFsLineId: 'auto', // CF classification doesn't map to a specific FS line
    confidenceDefault: 1,
    cashFlowClass: classification,
  });

  // Audit ledger
  try {
    await appendEntry(pool, {
      tenantId,
      eventType: eventType as 'ai_mapping_suggestion_accepted' | 'ai_mapping_suggestion_edited',
      deterministicFlagSnapshot: {
        suggestionId,
        accountName: suggestion.account_name,
        accountCode: suggestion.account_code,
        originalClassification: suggestion.classification,
        acceptedClassification: classification,
        ruleId,
        version,
      },
      userPromptRationale: `AI CF suggestion ${eventType === 'ai_mapping_suggestion_edited' ? 'edited and accepted' : 'accepted'}: ${suggestion.account_name} → ${classification}`,
    });
  } catch {
    /* non-fatal */
  }

  // Fire cascade
  try {
    await executeCascade(pool, tenantId, {
      type: CascadeTriggerType.MAPPING_CHANGED,
      period_id: suggestion.close_session_id,
      entity_id: suggestion.entity_id,
      triggered_by: 'ai_classification_service',
      affected_accounts: [suggestion.account_name],
      details: { source: 'slm_cf_suggestion_accepted', suggestionId, ruleId },
    });
  } catch {
    /* non-fatal */
  }

  return { ruleId, version };
}

// ---------- Reject suggestion ----------

/**
 * Reject a COA suggestion. Writes audit trail, marks as rejected.
 */
export async function rejectCoaSuggestion(
  pool: Pool,
  tenantId: string,
  suggestionId: string,
  reviewedBy: string,
  reason?: string
): Promise<void> {
  const { rows } = await pool.query<{ id: string; account_name: string; suggested_fs_line_id: string; status: string }>(
    `SELECT id, account_name, suggested_fs_line_id, status FROM ai_coa_suggestions WHERE id = $1 AND tenant_id = $2`,
    [suggestionId, tenantId]
  );
  if (rows.length === 0) throw new Error(`COA suggestion ${suggestionId} not found`);
  if (rows[0].status !== 'pending') throw new Error(`COA suggestion ${suggestionId} is already ${rows[0].status}`);

  await pool.query(
    `UPDATE ai_coa_suggestions SET status = 'rejected', reviewed_by = $1, reviewed_at = now() WHERE id = $2 AND tenant_id = $3`,
    [reviewedBy, suggestionId, tenantId]
  );

  try {
    await appendEntry(pool, {
      tenantId,
      eventType: 'ai_mapping_suggestion_rejected',
      deterministicFlagSnapshot: {
        suggestionId,
        accountName: rows[0].account_name,
        suggestedFsLineId: rows[0].suggested_fs_line_id,
        reason: reason || 'User rejected',
      },
      userPromptRationale: reason || `AI COA suggestion rejected: ${rows[0].account_name}`,
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Reject a CF suggestion.
 */
export async function rejectCfSuggestion(
  pool: Pool,
  tenantId: string,
  suggestionId: string,
  reviewedBy: string,
  reason?: string
): Promise<void> {
  const { rows } = await pool.query<{ id: string; account_name: string; classification: string; status: string }>(
    `SELECT id, account_name, classification, status FROM ai_cf_suggestions WHERE id = $1 AND tenant_id = $2`,
    [suggestionId, tenantId]
  );
  if (rows.length === 0) throw new Error(`CF suggestion ${suggestionId} not found`);
  if (rows[0].status !== 'pending') throw new Error(`CF suggestion ${suggestionId} is already ${rows[0].status}`);

  await pool.query(
    `UPDATE ai_cf_suggestions SET status = 'rejected', reviewed_by = $1, reviewed_at = now() WHERE id = $2 AND tenant_id = $3`,
    [reviewedBy, suggestionId, tenantId]
  );

  try {
    await appendEntry(pool, {
      tenantId,
      eventType: 'ai_mapping_suggestion_rejected',
      deterministicFlagSnapshot: {
        suggestionId,
        accountName: rows[0].account_name,
        classification: rows[0].classification,
        reason: reason || 'User rejected',
      },
      userPromptRationale: reason || `AI CF suggestion rejected: ${rows[0].account_name}`,
    });
  } catch {
    /* non-fatal */
  }
}

// ---------- List suggestions ----------

/**
 * List COA suggestions for a session.
 */
export async function listCoaSuggestions(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  status?: string
): Promise<CoaSuggestion[]> {
  let sql = `SELECT id, account_code, account_name, suggested_fs_line_id, suggested_fs_line_label,
    confidence, confidence_band, tier, alternatives, model_version, status, auto_accepted
    FROM ai_coa_suggestions WHERE tenant_id = $1 AND close_session_id = $2`;
  const params: unknown[] = [tenantId, closeSessionId];
  if (status) {
    sql += ` AND status = $3`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC`;

  const { rows } = await pool.query(sql, params);
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    accountCode: r.account_code as string | null,
    accountName: r.account_name as string,
    suggestedFsLineId: r.suggested_fs_line_id as string,
    suggestedFsLineLabel: r.suggested_fs_line_label as string | null,
    confidence: Number(r.confidence),
    confidenceBand: r.confidence_band as string,
    tier: r.tier as string | null,
    alternatives: (typeof r.alternatives === 'string' ? JSON.parse(r.alternatives) : r.alternatives) as Array<Record<string, unknown>>,
    modelVersion: r.model_version as string,
    status: r.status as string,
    autoAccepted: (r.auto_accepted as boolean) ?? false,
  }));
}

/**
 * List CF suggestions for a session.
 */
export async function listCfSuggestions(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  status?: string
): Promise<CfSuggestion[]> {
  let sql = `SELECT id, account_code, account_name, classification, confidence, confidence_band,
    source, rule_pattern, alternatives, model_version, status
    FROM ai_cf_suggestions WHERE tenant_id = $1 AND close_session_id = $2`;
  const params: unknown[] = [tenantId, closeSessionId];
  if (status) {
    sql += ` AND status = $3`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC`;

  const { rows } = await pool.query(sql, params);
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    accountCode: r.account_code as string | null,
    accountName: r.account_name as string,
    classification: r.classification as string,
    confidence: Number(r.confidence),
    confidenceBand: r.confidence_band as string,
    source: r.source as string,
    rulePattern: r.rule_pattern as string | null,
    alternatives: (typeof r.alternatives === 'string' ? JSON.parse(r.alternatives) : r.alternatives) as Array<Record<string, unknown>>,
    modelVersion: r.model_version as string,
    status: r.status as string,
  }));
}

// ---------- Orchestrator-based classification (Classifier pillar) ----------

export interface OrchestratorClassifyInput {
  tenantId: string;
  periodLabel: string;
  sourceLines: Array<{
    source_id: string;
    accountName?: string;
    debit?: number;
    credit?: number;
    description?: string;
    [key: string]: unknown;
  }>;
  coaTaxonomy?: Array<{ key: string; label: string }>;
}

/**
 * Classify accounts using the AI orchestrator's Classifier pillar (Claude-based).
 * Complementary to the SLM microservice path (generateClassificationSuggestions).
 * Fail-open: returns empty results on AI failure; does not block ingestion.
 */
export async function classifyWithOrchestrator(
  pool: Pool,
  input: OrchestratorClassifyInput
): Promise<RunClassifierResult> {
  return runClassifier({
    pool,
    tenantId: input.tenantId,
    periodLabel: input.periodLabel,
    sourceLines: input.sourceLines,
    coaTaxonomy: input.coaTaxonomy,
  });
}
