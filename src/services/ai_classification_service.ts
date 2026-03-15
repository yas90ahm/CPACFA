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
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { insertCoaMappingRule, getNextRuleVersion } from '../db/repositories/coa_mapping_rules_repository.js';
import { executeCascade, CascadeTriggerType } from './cascade_engine.js';
import {
  classifyCoaBatch,
  classifyCfBatch,
  type SlmCoaResult,
  type SlmCfResult,
  type SlmError,
} from './slm_client_service.js';
import { checkMappingCompleteness } from './mapping_completeness_gate.js';
import { runClassifier, type RunClassifierResult } from '../ai/ai_orchestrator.js';

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

// ---------- Generate suggestions ----------

/**
 * Generate COA and CF classification suggestions for unmapped accounts.
 *
 * 1. Resolves unmapped accounts from the close session (or uses provided list)
 * 2. Calls SLM microservice for COA + CF classification
 * 3. Runs guardrail (assertNoNumericAmountsInAgentOutput)
 * 4. Persists suggestions to ai_coa_suggestions and ai_cf_suggestions
 * 5. Returns suggestions for UI display
 *
 * Graceful degradation: if SLM is unreachable, returns empty results with errors.
 */
export async function generateClassificationSuggestions(
  pool: Pool,
  input: GenerateSuggestionsInput
): Promise<GenerateSuggestionsResult> {
  const { tenantId, entityId, closeSessionId } = input;
  const allErrors: SlmError[] = [];

  // Resolve account names
  let accountNames = input.accountNames;
  let unmappedAccounts: Array<{ account_code: string | null; account_name: string }> = [];

  if (!accountNames || accountNames.length === 0) {
    // Get unmapped accounts from the session
    const mappingResult = await checkMappingCompleteness(pool, tenantId, closeSessionId, entityId);
    unmappedAccounts = mappingResult.unmapped_accounts;
    accountNames = unmappedAccounts.map((a) => a.account_name);
  } else {
    unmappedAccounts = accountNames.map((name) => ({ account_code: null, account_name: name }));
  }

  if (accountNames.length === 0) {
    return { coaSuggestions: [], cfSuggestions: [], errors: [] };
  }

  // Reuse mapping rules from prior certified sessions for accounts that already had rules
  let priorReusedCount = 0;
  try {
    const existingRulesResult = await pool.query<{ source_account_name_pattern: string; source_account_number_pattern: string | null }>(
      `SELECT DISTINCT source_account_name_pattern, source_account_number_pattern
       FROM tenant_coa_mapping_rules WHERE tenant_id = $1 AND entity_id = $2`,
      [tenantId, entityId]
    );
    if (existingRulesResult.rows.length > 0) {
      const existingPatterns = new Set(
        existingRulesResult.rows.map((r) =>
          r.source_account_number_pattern || r.source_account_name_pattern
        )
      );
      const alreadyMapped: string[] = [];
      for (const acc of unmappedAccounts) {
        const code = acc.account_code ?? acc.account_name;
        if (existingPatterns.has(code) || existingPatterns.has(acc.account_name)) {
          alreadyMapped.push(acc.account_name);
        }
      }
      if (alreadyMapped.length > 0) {
        priorReusedCount = alreadyMapped.length;
        // Remove already-mapped accounts from the SLM request
        const alreadyMappedSet = new Set(alreadyMapped);
        accountNames = accountNames.filter((n) => !alreadyMappedSet.has(n));
        unmappedAccounts = unmappedAccounts.filter((a) => !alreadyMappedSet.has(a.account_name));
        try {
          await appendEntry(pool, {
            tenantId,
            eventType: 'mapping_prior_period_reused',
            deterministicFlagSnapshot: {
              closeSessionId,
              count: priorReusedCount,
              accounts: alreadyMapped.slice(0, 20),
            },
            userPromptRationale: `Reused ${priorReusedCount} mapping rules from prior periods`,
          });
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    /* non-fatal: prior rule lookup failed */
  }

  if (accountNames.length === 0) {
    return { coaSuggestions: [], cfSuggestions: [], errors: [] };
  }

  // Expire previous pending suggestions for this session
  await pool.query(
    `UPDATE ai_coa_suggestions SET status = 'expired' WHERE tenant_id = $1 AND close_session_id = $2 AND status = 'pending'`,
    [tenantId, closeSessionId]
  );
  await pool.query(
    `UPDATE ai_cf_suggestions SET status = 'expired' WHERE tenant_id = $1 AND close_session_id = $2 AND status = 'pending'`,
    [tenantId, closeSessionId]
  );

  // Call SLM for COA classifications
  const coaBatch = await classifyCoaBatch(accountNames).catch((err) => {
    allErrors.push({ account_name: '*', error: `COA batch failed: ${err instanceof Error ? err.message : String(err)}` });
    return { results: [] as SlmCoaResult[], errors: [] as SlmError[] };
  });
  allErrors.push(...coaBatch.errors);

  // Call SLM for CF classifications
  const cfBatch = await classifyCfBatch(accountNames).catch((err) => {
    allErrors.push({ account_name: '*', error: `CF batch failed: ${err instanceof Error ? err.message : String(err)}` });
    return { results: [] as SlmCfResult[], errors: [] as SlmError[] };
  });
  allErrors.push(...cfBatch.errors);

  // Run guardrail on SLM results
  for (const r of coaBatch.results) {
    assertNoNumericAmountsInAgentOutput(r, `SLM COA result for "${r.account_name}"`);
  }
  for (const r of cfBatch.results) {
    assertNoNumericAmountsInAgentOutput(r, `SLM CF result for "${r.account_name}"`);
  }

  // Persist COA suggestions
  const coaSuggestions: CoaSuggestion[] = [];
  for (const r of coaBatch.results) {
    const id = randomUUID();
    const unmapped = unmappedAccounts.find((a) => a.account_name === r.account_name);
    const accountCode = unmapped?.account_code ?? null;

    await pool.query(
      `INSERT INTO ai_coa_suggestions
        (id, tenant_id, entity_id, close_session_id, account_code, account_name,
         suggested_fs_line_id, suggested_fs_line_label, confidence, confidence_band,
         tier, alternatives, model_version, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')`,
      [
        id, tenantId, entityId, closeSessionId,
        accountCode, r.account_name,
        r.line_item_id, r.line_item_label,
        r.confidence, r.confidence_band,
        r.tier, JSON.stringify(r.alternatives),
        r.model_version,
      ]
    );

    coaSuggestions.push({
      id,
      accountCode,
      accountName: r.account_name,
      suggestedFsLineId: r.line_item_id,
      suggestedFsLineLabel: r.line_item_label,
      confidence: r.confidence,
      confidenceBand: r.confidence_band,
      tier: r.tier,
      alternatives: r.alternatives,
      modelVersion: r.model_version,
      status: 'pending',
    });
  }

  // Persist CF suggestions
  const cfSuggestions: CfSuggestion[] = [];
  for (const r of cfBatch.results) {
    const id = randomUUID();
    const unmapped = unmappedAccounts.find((a) => a.account_name === r.account_name);
    const accountCode = unmapped?.account_code ?? null;

    await pool.query(
      `INSERT INTO ai_cf_suggestions
        (id, tenant_id, entity_id, close_session_id, account_code, account_name,
         classification, confidence, confidence_band, source, rule_pattern,
         alternatives, model_version, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')`,
      [
        id, tenantId, entityId, closeSessionId,
        accountCode, r.account_name,
        r.classification, r.confidence, r.confidence_band,
        r.source, r.rule_pattern,
        JSON.stringify(r.alternatives),
        r.model_version,
      ]
    );

    cfSuggestions.push({
      id,
      accountCode,
      accountName: r.account_name,
      classification: r.classification,
      confidence: r.confidence,
      confidenceBand: r.confidence_band,
      source: r.source,
      rulePattern: r.rule_pattern,
      alternatives: r.alternatives,
      modelVersion: r.model_version,
      status: 'pending',
    });
  }

  // Auto-accept high-confidence suggestions if enabled
  try {
    const { getEntitySettings } = await import('./entity_settings_service.js');
    const settings = await getEntitySettings(pool, tenantId, entityId);
    if (settings.mappingAutoAcceptEnabled && coaSuggestions.length > 0) {
      const threshold = settings.mappingConfidenceThreshold;
      let autoAcceptedCount = 0;
      for (const suggestion of coaSuggestions) {
        if (suggestion.confidence >= threshold && suggestion.status === 'pending') {
          try {
            await acceptCoaSuggestion(pool, tenantId, suggestion.id, 'auto_accept');
            await pool.query(
              `UPDATE ai_coa_suggestions SET auto_accepted = TRUE, auto_accepted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
              [suggestion.id, tenantId]
            );
            suggestion.status = 'accepted';
            autoAcceptedCount++;
          } catch {
            /* non-fatal: skip individual auto-accept failures */
          }
        }
      }
      if (autoAcceptedCount > 0) {
        try {
          await appendEntry(pool, {
            tenantId,
            eventType: 'mapping_auto_accepted',
            deterministicFlagSnapshot: {
              closeSessionId,
              count: autoAcceptedCount,
              threshold,
            },
            userPromptRationale: `Auto-accepted ${autoAcceptedCount} COA mapping suggestions with confidence >= ${threshold}`,
          });
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    /* non-fatal: auto-accept feature failed gracefully */
  }

  return { coaSuggestions, cfSuggestions, errors: allErrors };
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
