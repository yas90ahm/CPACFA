/**
 * Mapping Validation Agent (Layer 3)
 *
 * An agentic system that doesn't just flag mapping-balance mismatches —
 * it investigates them and proposes corrections with full reasoning.
 *
 * Pipeline:
 * Step 1: Deterministic rules detect "suspects" (mapping contradicts balance behavior)
 * Step 2: Agent gathers context per suspect (name, balance direction, XBRL candidates,
 *         similar corrections from learning loop, cross-tenant signals)
 * Step 3: AI reasons about the mismatch and proposes a correction with ASC citation
 * Step 4: Proposals saved as pending for controller review
 *
 * The agent NEVER sees dollar amounts. Only: account names, balance directions
 * (debit-normal/credit-normal), magnitude categories (large/medium/small),
 * and accounting type labels.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { searchXBRL } from './xbrl_search_service.js';
import { listFsTaxonomyLines } from '../db/repositories/fs_taxonomy_repository.js';

// ── Types ──

export type MismatchType =
  | 'reversed_balance'
  | 'wrong_statement'
  | 'contra_mismatch'
  | 'magnitude_anomaly'
  | 'name_contradiction'
  | 'cross_validation_failure';

export interface MappingSuspect {
  accountCode: string;
  accountName: string;
  accountType: string;
  currentFsLineId: string;
  currentFsLineName: string;
  currentFsLineStatement: string;
  balanceDirection: 'debit' | 'credit';
  magnitudeCategory: 'large' | 'medium' | 'small';
  mismatchType: MismatchType;
  evidence: string;
}

export interface CorrectionProposal {
  id: string;
  accountCode: string;
  accountName: string;
  currentFsLineId: string;
  currentFsLineName: string | null;
  proposedFsLineId: string;
  proposedFsLineName: string | null;
  mismatchType: MismatchType;
  mismatchEvidence: string;
  reasoning: string;
  confidence: number;
  ascReference: string | null;
  xbrlElementId: string | null;
  xbrlLabel: string | null;
  status: 'pending';
}

export interface ValidationAgentResult {
  suspects: MappingSuspect[];
  proposals: CorrectionProposal[];
  accountsValidated: number;
  issuesFound: number;
}

// ── Balance direction expectations ──

const EXPECTED_BALANCE: Record<string, 'debit' | 'credit'> = {
  // BS - Assets (debit-normal)
  'fs_asset': 'debit', 'fs_asset_cash': 'debit', 'fs_asset_ar': 'debit',
  'fs_asset_inventory': 'debit', 'fs_asset_prepaid': 'debit',
  'fs_asset_other_current': 'debit', 'fs_asset_ppe': 'debit',
  'fs_asset_intangible': 'debit', 'fs_asset_goodwill': 'debit',
  'fs_asset_dta': 'debit',
  // BS - Contra assets (credit-normal)
  'fs_asset_ar_allowance': 'credit', 'fs_asset_ppe_accum_dep': 'credit',
  'fs_asset_intangible_amort': 'credit',
  // BS - Liabilities (credit-normal)
  'fs_liability': 'credit', 'fs_liability_ap': 'credit',
  'fs_liability_accrued': 'credit', 'fs_liability_current_debt': 'credit',
  'fs_liability_deferred_rev_current': 'credit', 'fs_liability_other_current': 'credit',
  'fs_liability_lt_debt': 'credit', 'fs_liability_deferred_rev_noncurrent': 'credit',
  'fs_liability_dtl': 'credit', 'fs_liability_other_noncurrent': 'credit',
  // BS - Equity (credit-normal)
  'fs_equity': 'credit', 'fs_equity_common': 'credit', 'fs_equity_apic': 'credit',
  'fs_equity_retained': 'credit', 'fs_equity_aoci': 'credit',
  // BS - Contra equity (debit-normal)
  'fs_equity_treasury': 'debit',
  // PL - Revenue (credit-normal)
  'fs_revenue': 'credit', 'fs_revenue_product': 'credit', 'fs_revenue_service': 'credit',
  'fs_revenue_other': 'credit',
  // PL - Contra revenue (debit-normal)
  'fs_revenue_contra': 'debit',
  // PL - Expenses (debit-normal)
  'fs_expense': 'debit', 'fs_cogs': 'debit', 'fs_cogs_materials': 'debit',
  'fs_cogs_labor': 'debit', 'fs_cogs_overhead': 'debit',
  'fs_opex_sga': 'debit', 'fs_opex_rd': 'debit', 'fs_opex_da': 'debit',
  'fs_opex_other': 'debit', 'fs_interest_expense': 'debit',
  'fs_tax_expense': 'debit', 'fs_tax_current': 'debit', 'fs_tax_deferred': 'debit',
  // PL - Income items (credit-normal)
  'fs_interest_income': 'credit', 'fs_other_income': 'credit',
  'fs_other_gain_loss': 'credit',
};

/** Statement that each FS line belongs to */
const FS_LINE_STATEMENT: Record<string, 'BS' | 'PL'> = {};
// Populated dynamically from taxonomy

/** Name patterns that strongly suggest specific account types */
const NAME_SIGNALS: Array<{ pattern: RegExp; expectedType: string; expectedBalance: 'debit' | 'credit' }> = [
  { pattern: /depreciation|accum.*dep/i, expectedType: 'contra_asset', expectedBalance: 'credit' },
  { pattern: /allowance.*doubtful|bad.*debt.*reserve/i, expectedType: 'contra_asset', expectedBalance: 'credit' },
  { pattern: /amortization|accum.*amort/i, expectedType: 'contra_asset', expectedBalance: 'credit' },
  { pattern: /revenue|sales|income.*(?:product|service|subscription)/i, expectedType: 'revenue', expectedBalance: 'credit' },
  { pattern: /cost.*(?:goods|sales|revenue)|cogs/i, expectedType: 'expense', expectedBalance: 'debit' },
  { pattern: /accounts.*payable|trade.*payable/i, expectedType: 'liability', expectedBalance: 'credit' },
  { pattern: /accounts.*receivable|trade.*receivable/i, expectedType: 'asset', expectedBalance: 'debit' },
  { pattern: /accrued.*(?:expense|liability|compensation|payroll)/i, expectedType: 'liability', expectedBalance: 'credit' },
  { pattern: /prepaid|advance.*(?:payment|deposit)/i, expectedType: 'asset', expectedBalance: 'debit' },
  { pattern: /retained.*earning|accumulated.*(?:deficit|surplus)/i, expectedType: 'equity', expectedBalance: 'credit' },
  { pattern: /treasury.*stock/i, expectedType: 'contra_equity', expectedBalance: 'debit' },
  { pattern: /deferred.*rev/i, expectedType: 'liability', expectedBalance: 'credit' },
  { pattern: /deferred.*tax.*asset/i, expectedType: 'asset', expectedBalance: 'debit' },
  { pattern: /deferred.*tax.*liab/i, expectedType: 'liability', expectedBalance: 'credit' },
  { pattern: /(?:long.?term|lt).*debt|notes.*payable|loan.*payable/i, expectedType: 'liability', expectedBalance: 'credit' },
  { pattern: /interest.*(?:expense|payable)/i, expectedType: 'expense', expectedBalance: 'debit' },
  { pattern: /interest.*(?:income|receivable)/i, expectedType: 'income', expectedBalance: 'credit' },
  { pattern: /rent.*expense|lease.*expense|occupancy/i, expectedType: 'expense', expectedBalance: 'debit' },
  { pattern: /inventory|raw.*material|finished.*good|work.*in.*process/i, expectedType: 'asset', expectedBalance: 'debit' },
  { pattern: /goodwill/i, expectedType: 'asset', expectedBalance: 'debit' },
  { pattern: /(?:common|preferred).*stock|share.*capital/i, expectedType: 'equity', expectedBalance: 'credit' },
  { pattern: /additional.*paid|apic|paid.?in.*capital/i, expectedType: 'equity', expectedBalance: 'credit' },
];

// ── Step 1: Detect Suspects (Deterministic) ──

interface MappedAccount {
  accountCode: string;
  accountName: string;
  accountType: string;
  fsLineId: string;
  fsLineName: string;
  fsLineStatement: string;
  /** Net balance: positive = debit-normal, negative = credit-normal */
  netBalance: number;
}

export function detectSuspects(mappedAccounts: MappedAccount[]): MappingSuspect[] {
  const suspects: MappingSuspect[] = [];

  for (const acct of mappedAccounts) {
    if (acct.netBalance === 0) continue;

    const balDir: 'debit' | 'credit' = acct.netBalance > 0 ? 'debit' : 'credit';
    const absNet = Math.abs(acct.netBalance);
    const magnitude: 'large' | 'medium' | 'small' =
      absNet > 1000000 ? 'large' : absNet > 50000 ? 'medium' : 'small';

    const expectedBal = EXPECTED_BALANCE[acct.fsLineId];

    // Check 1: Balance direction contradicts mapping
    if (expectedBal && expectedBal !== balDir && absNet > 100) {
      suspects.push({
        accountCode: acct.accountCode,
        accountName: acct.accountName,
        accountType: acct.accountType,
        currentFsLineId: acct.fsLineId,
        currentFsLineName: acct.fsLineName,
        currentFsLineStatement: acct.fsLineStatement,
        balanceDirection: balDir,
        magnitudeCategory: magnitude,
        mismatchType: 'reversed_balance',
        evidence: `Account has ${balDir}-normal balance but is mapped to "${acct.fsLineName}" which expects ${expectedBal}-normal`,
      });
      continue;
    }

    // Check 2: Account name contradicts mapping
    for (const signal of NAME_SIGNALS) {
      if (signal.pattern.test(acct.accountName)) {
        // Check if current mapping contradicts what the name implies
        const currentExpected = EXPECTED_BALANCE[acct.fsLineId];
        if (currentExpected && currentExpected !== signal.expectedBalance) {
          suspects.push({
            accountCode: acct.accountCode,
            accountName: acct.accountName,
            accountType: acct.accountType,
            currentFsLineId: acct.fsLineId,
            currentFsLineName: acct.fsLineName,
            currentFsLineStatement: acct.fsLineStatement,
            balanceDirection: balDir,
            magnitudeCategory: magnitude,
            mismatchType: 'name_contradiction',
            evidence: `Account name suggests ${signal.expectedType} (${signal.expectedBalance}-normal) but is mapped to "${acct.fsLineName}" (${currentExpected}-normal)`,
          });
          break;
        }
      }
    }

    // Check 3: Contra account detection
    const isContraName = /accum|allowance|contra|reserve.*(?:bad|doubtful)/i.test(acct.accountName);
    if (isContraName && !acct.fsLineId.includes('contra') && !acct.fsLineId.includes('accum') && !acct.fsLineId.includes('allowance')) {
      const currentExpected = EXPECTED_BALANCE[acct.fsLineId];
      if (currentExpected === 'debit' && balDir === 'credit') {
        suspects.push({
          accountCode: acct.accountCode,
          accountName: acct.accountName,
          accountType: acct.accountType,
          currentFsLineId: acct.fsLineId,
          currentFsLineName: acct.fsLineName,
          currentFsLineStatement: acct.fsLineStatement,
          balanceDirection: balDir,
          magnitudeCategory: magnitude,
          mismatchType: 'contra_mismatch',
          evidence: `Account name suggests contra-asset but is mapped to regular asset line "${acct.fsLineName}"`,
        });
      }
    }
  }

  return suspects;
}

// ── Step 2 + 3: Agent Investigation & Proposal ──

export async function runValidationAgent(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string,
  mappedAccounts: MappedAccount[]
): Promise<ValidationAgentResult> {
  const suspects = detectSuspects(mappedAccounts);

  if (suspects.length === 0) {
    return {
      suspects: [],
      proposals: [],
      accountsValidated: mappedAccounts.length,
      issuesFound: 0,
    };
  }

  // Build taxonomy lookup
  const fsLines = await listFsTaxonomyLines(pool);
  const fsById = new Map(fsLines.map((l) => [l.id, l]));

  // Check learning loop for prior corrections on these account patterns
  const learningSignals = new Map<string, { fsLineId: string; fsLineName: string }>();
  try {
    const normalizedNames = suspects.map((s) => normalizeAccountName(s.accountName));
    if (normalizedNames.length > 0) {
      const signalRes = await pool.query<{ name_keyword: string; correct_fs_line_id: string; correct_fs_line_name: string }>(
        `SELECT name_keyword, correct_fs_line_id, correct_fs_line_name
         FROM mapping_pattern_signals
         WHERE name_keyword = ANY($1)
         ORDER BY signal_strength DESC`,
        [normalizedNames]
      );
      for (const row of signalRes.rows) {
        if (!learningSignals.has(row.name_keyword)) {
          learningSignals.set(row.name_keyword, {
            fsLineId: row.correct_fs_line_id,
            fsLineName: row.correct_fs_line_name ?? '',
          });
        }
      }
    }
  } catch {
    // Learning loop table may not exist yet — non-fatal
  }

  // Check entity-specific correction history
  const entityCorrections = new Map<string, { fsLineId: string; fsLineName: string }>();
  try {
    const corrRes = await pool.query<{ account_name_pattern: string; chosen_fs_line_id: string; chosen_fs_line_name: string }>(
      `SELECT account_name_pattern, chosen_fs_line_id, chosen_fs_line_name
       FROM mapping_corrections_log
       WHERE tenant_id = $1 AND entity_id = $2
       ORDER BY created_at DESC`,
      [tenantId, entityId]
    );
    for (const row of corrRes.rows) {
      if (!entityCorrections.has(row.account_name_pattern)) {
        entityCorrections.set(row.account_name_pattern, {
          fsLineId: row.chosen_fs_line_id,
          fsLineName: row.chosen_fs_line_name ?? '',
        });
      }
    }
  } catch {
    // Table may not exist yet
  }

  // For each suspect, gather XBRL context
  const suspectContexts: Array<{
    suspect: MappingSuspect;
    xbrlResults: Awaited<ReturnType<typeof searchXBRL>>;
    learningHint: { fsLineId: string; fsLineName: string } | null;
    entityHint: { fsLineId: string; fsLineName: string } | null;
  }> = [];

  for (const suspect of suspects) {
    const xbrlResults = await searchXBRL(pool, suspect.accountName, { limit: 5 });
    const normalizedName = normalizeAccountName(suspect.accountName);
    const learningHint = learningSignals.get(normalizedName) ?? null;
    const entityHint = entityCorrections.get(normalizedName) ?? null;

    suspectContexts.push({ suspect, xbrlResults, learningHint, entityHint });
  }

  // Step 3: AI batch proposal (words only, no amounts)
  let aiProposals = new Map<string, { fsLineId: string; reasoning: string; confidence: number; ascRef: string | null }>();

  try {
    const { callAIWithSchema } = await import('../ai/ai_client.js');
    const { z } = await import('zod');

    const suspectBlocks = suspectContexts.map((ctx) => {
      const xbrlCandidates = ctx.xbrlResults.slice(0, 3).map((xr) => {
        const fsLine = fsById.get(xr.id) ?? [...fsById.values()].find((l) => l.xbrlElement === xr.id);
        return `    - "${xr.label}" → ${fsLine ? `"${fsLine.name}" (${fsLine.id})` : 'no Sabit mapping'}`;
      }).join('\n');

      const hints: string[] = [];
      if (ctx.learningHint) hints.push(`Cross-tenant signal: accounts like this typically map to "${ctx.learningHint.fsLineName}"`);
      if (ctx.entityHint) hints.push(`Entity history: controller previously mapped similar account to "${ctx.entityHint.fsLineName}"`);

      return `Account: "${ctx.suspect.accountName}" (code: ${ctx.suspect.accountCode})
  Type: ${ctx.suspect.accountType}
  Balance direction: ${ctx.suspect.balanceDirection}-normal (${ctx.suspect.magnitudeCategory} account)
  Currently mapped to: "${ctx.suspect.currentFsLineName}" (${ctx.suspect.currentFsLineId})
  Problem: ${ctx.suspect.evidence}
  XBRL candidates:
${xbrlCandidates || '    (none)'}${hints.length > 0 ? '\n  Hints:\n' + hints.map((h) => `    - ${h}`).join('\n') : ''}`;
    }).join('\n\n');

    // Build full taxonomy as answer space
    const taxonomyBlock = fsLines
      .filter((l) => !l.isSubtotal && !l.isHidden)
      .map((l) => `${l.id}: "${l.name}" (${l.statement}, ${l.normalBalance}-normal)`)
      .join('\n');

    const userPrompt = `You are an expert CPA reviewing account mappings for a financial close.

Each account below has a MISMATCH between its current mapping and its actual balance behavior.
Your job is to:
1. Explain WHY the current mapping is wrong (cite the specific accounting principle)
2. Propose the CORRECT mapping from the Sabit taxonomy
3. Provide your confidence level

Accounting rules to apply:
- Assets have debit-normal balances (A=L+E, debits on left)
- Contra-assets (accumulated depreciation, allowances) have credit-normal balances
- Liabilities and equity have credit-normal balances
- Revenue has credit-normal balance
- Expenses have debit-normal balance
- Contra-revenue (returns, allowances) has debit-normal balance
- Treasury stock is contra-equity (debit-normal)

SUSPECTS:

${suspectBlocks}

SABIT TAXONOMY (pick proposed_fs_line_id from these):
${taxonomyBlock}

Respond with JSON only:
{"proposals":[{"account_code":"...","proposed_fs_line_id":"...","reasoning":"...","confidence":0.0-1.0,"asc_reference":"ASC xxx-xx-xx-xx or null"}]}`;

    const systemPrompt = `You are a US GAAP expert CPA. You review account-to-reporting-line mappings and correct mismatches. You NEVER produce dollar amounts. You ONLY output JSON with corrected mappings and accounting reasoning. Be specific about which ASC codification supports your correction.`;

    const ProposalSchema = z.object({
      proposals: z.array(z.object({
        account_code: z.string(),
        proposed_fs_line_id: z.string(),
        reasoning: z.string(),
        confidence: z.number(),
        asc_reference: z.string().nullable(),
      })),
    });

    const result = await callAIWithSchema({
      pool,
      tenantId,
      pillar: 'mapping_agent',
      promptVersion: 'mapping_validation_agent_v1',
      systemPrompt,
      userPrompt,
      schema: ProposalSchema,
      requestJson: {
        pillar: 'mapping_validation_agent',
        suspectCount: suspects.length,
      },
    });

    if (result.ok && result.parsed) {
      for (const p of result.parsed.proposals) {
        if (fsById.has(p.proposed_fs_line_id)) {
          aiProposals.set(p.account_code, {
            fsLineId: p.proposed_fs_line_id,
            reasoning: p.reasoning,
            confidence: p.confidence,
            ascRef: p.asc_reference,
          });
        }
      }
    }
  } catch {
    // AI unavailable — fall back to deterministic proposals
  }

  // Build final proposals (AI + deterministic fallback)
  const proposals: CorrectionProposal[] = [];

  for (const ctx of suspectContexts) {
    const s = ctx.suspect;
    const aiPick = aiProposals.get(s.accountCode);
    const learningPick = ctx.learningHint ?? ctx.entityHint;

    let proposedFsLineId: string;
    let proposedFsLineName: string | null;
    let reasoning: string;
    let confidence: number;
    let ascRef: string | null = null;
    let xbrlId: string | null = null;
    let xbrlLabel: string | null = null;

    if (aiPick) {
      // AI proposal available
      proposedFsLineId = aiPick.fsLineId;
      proposedFsLineName = fsById.get(aiPick.fsLineId)?.name ?? null;
      reasoning = aiPick.reasoning;
      confidence = aiPick.confidence;
      ascRef = aiPick.ascRef;
    } else if (learningPick) {
      // Learning loop has a correction
      proposedFsLineId = learningPick.fsLineId;
      proposedFsLineName = learningPick.fsLineName;
      reasoning = `Based on prior corrections: accounts with similar names have been mapped to "${learningPick.fsLineName}" by controllers.`;
      confidence = 0.85;
    } else {
      // Deterministic fallback: pick the XBRL candidate that matches expected balance direction
      const expectedDir = s.balanceDirection; // The account's actual direction is probably correct
      const bestXbrl = ctx.xbrlResults.find((xr) => {
        return (xr.balanceType === expectedDir) ||
          (expectedDir === 'credit' && xr.balanceType === 'credit') ||
          (expectedDir === 'debit' && xr.balanceType === 'debit');
      }) ?? ctx.xbrlResults[0];

      if (!bestXbrl) continue;

      // Find Sabit line for this XBRL element
      const fsLine = [...fsById.values()].find((l) => l.xbrlElement === bestXbrl.id);
      if (!fsLine || fsLine.id === s.currentFsLineId) continue;

      proposedFsLineId = fsLine.id;
      proposedFsLineName = fsLine.name;
      xbrlId = bestXbrl.id;
      xbrlLabel = bestXbrl.label;
      reasoning = `Account balance is ${s.balanceDirection}-normal. XBRL match "${bestXbrl.label}" (${bestXbrl.balanceType}) aligns with the actual balance direction. Current mapping "${s.currentFsLineName}" expects the opposite.`;
      confidence = 0.7;
    }

    const id = randomUUID();
    proposals.push({
      id,
      accountCode: s.accountCode,
      accountName: s.accountName,
      currentFsLineId: s.currentFsLineId,
      currentFsLineName: s.currentFsLineName,
      proposedFsLineId,
      proposedFsLineName,
      mismatchType: s.mismatchType,
      mismatchEvidence: s.evidence,
      reasoning,
      confidence,
      ascReference: ascRef,
      xbrlElementId: xbrlId,
      xbrlLabel,
      status: 'pending',
    });

    // Persist to DB
    try {
      await pool.query(
        `INSERT INTO mapping_correction_proposals
          (id, tenant_id, entity_id, close_session_id, account_code, account_name,
           current_fs_line_id, current_fs_line_name, proposed_fs_line_id, proposed_fs_line_name,
           mismatch_type, mismatch_evidence, reasoning, confidence, asc_reference,
           xbrl_element_id, xbrl_label, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'pending')
         ON CONFLICT DO NOTHING`,
        [
          id, tenantId, entityId, closeSessionId,
          s.accountCode, s.accountName,
          s.currentFsLineId, s.currentFsLineName,
          proposedFsLineId, proposedFsLineName,
          s.mismatchType, s.evidence,
          reasoning, confidence, ascRef,
          xbrlId, xbrlLabel,
        ]
      );
    } catch {
      // Table may not exist yet — non-fatal
    }
  }

  return {
    suspects,
    proposals,
    accountsValidated: mappedAccounts.length,
    issuesFound: suspects.length,
  };
}

/** Normalize account name for pattern matching: lowercase, strip numbers and special chars */
function normalizeAccountName(name: string): string {
  return name.toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
