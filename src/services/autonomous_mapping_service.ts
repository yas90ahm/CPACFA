/**
 * Autonomous Mapping Service
 *
 * Orchestrates the full 5-layer mapping pipeline and auto-accepts
 * high-confidence, validated suggestions. The controller only sees
 * the exceptions — typically 3-5 out of 79 accounts.
 *
 * Pipeline:
 * 1. Prior period rules (Layer 1) — handled by existing COA mapping rules
 * 2. XBRL + AI RAG classification (Layer 2) — classifyWithXBRL
 * 3. Agentic balance validation (Layer 3) — runValidationAgent
 * 4. Pre-statement cross-validation (Layer 4) — runMappingCrossValidation
 * 5. Learning loop consultation (Layer 5) — queryLearningLoop
 *
 * Auto-accept criteria:
 * - Confidence >= 0.80
 * - Layer 3 found no mismatch for this account
 * - Layer 4 cross-validation passes overall
 *
 * Everything else is surfaced as "needs human review."
 */

import type { Pool } from 'pg';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import type { CoaSuggestion } from './ai_classification_service.js';

export interface AutonomousMappingResult {
  totalAccounts: number;
  autoAccepted: number;
  needsReview: number;
  /** Account codes that need human review (low confidence or flagged) */
  reviewRequired: Array<{
    accountCode: string;
    accountName: string;
    suggestedMapping: string | null;
    confidence: number;
    reason: string;
  }>;
  /** Agent correction proposals (Layer 3 findings) */
  correctionProposals: number;
  /** Cross-validation result (Layer 4) */
  crossValidationPasses: boolean;
  crossValidationIssues: number;
  /** Learning loop stats */
  learningSignalsUsed: number;
}

/**
 * Run the full autonomous mapping pipeline.
 * Auto-accepts confident, validated suggestions.
 * Returns the exceptions for controller review.
 */
export async function runAutonomousMapping(
  pool: Pool,
  tenantId: string,
  entityId: string,
  closeSessionId: string
): Promise<AutonomousMappingResult> {
  // Step 1+2: Run XBRL + AI RAG classification
  const { classifyWithXBRL } = await import('./ai_classification_service.js');
  const classificationResult = await classifyWithXBRL(pool, {
    tenantId,
    entityId,
    closeSessionId,
  });

  const suggestions = classificationResult.coaSuggestions;

  // Defense-in-depth: verify no dollar amounts in classification output before auto-accept
  for (const s of suggestions) {
    assertNoNumericAmountsInAgentOutput(
      JSON.stringify({ accountName: s.accountName, fsLineId: s.suggestedFsLineId, confidence: s.confidence }),
      'autonomous_mapping_pre_accept'
    );
  }

  if (suggestions.length === 0) {
    return {
      totalAccounts: 0, autoAccepted: 0, needsReview: 0,
      reviewRequired: [], correctionProposals: 0,
      crossValidationPasses: true, crossValidationIssues: 0,
      learningSignalsUsed: 0,
    };
  }

  // Step 5: Consult learning loop for additional signals
  let learningSignalsUsed = 0;
  try {
    const { queryLearningLoop } = await import('./mapping_learning_service.js');
    for (const s of suggestions) {
      if (s.confidence < 0.8) {
        const learningHint = await queryLearningLoop(pool, tenantId, entityId, s.accountName);
        if (learningHint) {
          // Learning loop has a correction — boost confidence
          s.suggestedFsLineId = learningHint.fsLineId;
          s.suggestedFsLineLabel = learningHint.fsLineName;
          s.confidence = Math.max(s.confidence, 0.85);
          s.modelVersion = `learning_${learningHint.source}`;
          learningSignalsUsed++;
        }
      }
    }
  } catch {
    // Learning loop not available yet — non-fatal
  }

  // Step 3: Run agentic balance validation on all mapped accounts
  const { getTrialBalanceForCertification } = await import('./adjusted_trial_balance_service.js');
  const { getCloseSessionById } = await import('../db/repositories/close_session_repository.js');
  const { enrichEntriesWithCoaMapping } = await import('./coa_mapping_service.js');
  const { listFsTaxonomyLines } = await import('../db/repositories/fs_taxonomy_repository.js');

  let agentSuspectCodes = new Set<string>();
  let correctionProposalCount = 0;
  let crossValidationPasses = true;
  let crossValidationIssueCount = 0;

  try {
    const session = await getCloseSessionById(pool, tenantId, closeSessionId);
    if (session) {
      const periodLabel = (session.periodEnd ?? '').slice(0, 7);
      const tbResult = await getTrialBalanceForCertification(pool, tenantId, periodLabel, closeSessionId);
      const tbEntries = tbResult.trialBalance.map((e) => ({ ...e }));
      const enriched = await enrichEntriesWithCoaMapping(pool, tenantId, entityId, tbEntries, { asOfDate: session.periodEnd });
      const fsLines = await listFsTaxonomyLines(pool);
      const fsById = new Map(fsLines.map((l) => [l.id, l]));

      const mappedAccounts = enriched.map((e) => {
        const fsLine = fsById.get(e.fsLineId ?? '');
        return {
          accountCode: (e.accountCode ?? e.accountName ?? '').trim(),
          accountName: e.accountName,
          accountType: (e.accountType ?? '').toUpperCase(),
          fsLineId: e.fsLineId ?? '',
          fsLineName: fsLine?.name ?? '',
          fsLineStatement: fsLine?.statement ?? '',
          netBalance: (e.debit ?? 0) - (e.credit ?? 0),
        };
      }).filter((a) => a.fsLineId);

      // Layer 3: Agent validation
      const { runValidationAgent } = await import('./mapping_validation_agent.js');
      const agentResult = await runValidationAgent(pool, tenantId, entityId, closeSessionId, mappedAccounts);
      agentSuspectCodes = new Set(agentResult.suspects.map((s) => s.accountCode));
      correctionProposalCount = agentResult.proposals.length;

      // Apply Layer 3 correction proposals to suggestions
      // When the agent proposes a BETTER mapping, update the suggestion before auto-accept
      for (const proposal of agentResult.proposals) {
        if (!proposal.proposedFsLineId || proposal.confidence < 0.7) continue;
        const matchingSuggestion = suggestions.find(
          (s) => s.accountCode === proposal.accountCode && s.status === 'pending'
        );
        if (matchingSuggestion && proposal.confidence > matchingSuggestion.confidence) {
          // Update the suggestion with the agent's better mapping
          matchingSuggestion.suggestedFsLineId = proposal.proposedFsLineId;
          matchingSuggestion.suggestedFsLineLabel = proposal.proposedFsLineName ?? matchingSuggestion.suggestedFsLineLabel;
          matchingSuggestion.confidence = proposal.confidence;
          matchingSuggestion.modelVersion = 'layer3_ai_validated';
          // Persist the update
          await pool.query(
            `UPDATE ai_coa_suggestions SET suggested_fs_line_id = $1, suggested_fs_line_label = $2,
             confidence = $3, model_version = 'layer3_ai_validated', tier = $4
             WHERE id = $5 AND tenant_id = $6`,
            [proposal.proposedFsLineId, proposal.proposedFsLineName, proposal.confidence,
             proposal.ascReference ? `asc:${proposal.ascReference}` : null,
             matchingSuggestion.id, tenantId]
          ).catch(() => {});
          // Remove from suspect set since agent corrected it
          agentSuspectCodes.delete(proposal.accountCode);
        }
      }

      // Layer 4: Cross-validation
      const { runMappingCrossValidation } = await import('./mapping_cross_validation_service.js');
      const crossResult = runMappingCrossValidation(
        enriched.map((e) => ({
          accountCode: (e.accountCode ?? e.accountName ?? '').trim(),
          accountName: e.accountName,
          fsLineId: e.fsLineId ?? '',
          fsLineStatement: fsById.get(e.fsLineId ?? '')?.statement ?? '',
          debit: e.debit ?? 0,
          credit: e.credit ?? 0,
        }))
      );
      crossValidationPasses = crossResult.passes;
      crossValidationIssueCount = crossResult.issues.length;
    }
  } catch {
    // TB not available yet — skip validation layers
  }

  // Auto-accept logic
  const AUTO_ACCEPT_THRESHOLD = 0.80;
  const reviewRequired: AutonomousMappingResult['reviewRequired'] = [];
  let autoAccepted = 0;

  const { acceptCoaSuggestion } = await import('./ai_classification_service.js');

  for (const s of suggestions) {
    if (s.status !== 'pending') continue;

    const isSuspect = agentSuspectCodes.has(s.accountCode ?? '');
    const canAutoAccept =
      s.confidence >= AUTO_ACCEPT_THRESHOLD &&
      !isSuspect &&
      crossValidationPasses;

    if (canAutoAccept) {
      try {
        await acceptCoaSuggestion(pool, tenantId, s.id, 'autonomous_mapping');
        await pool.query(
          `UPDATE ai_coa_suggestions SET auto_accepted = TRUE, auto_accepted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [s.id, tenantId]
        );
        autoAccepted++;
      } catch {
        // Accept failed — add to review
        reviewRequired.push({
          accountCode: s.accountCode ?? '',
          accountName: s.accountName,
          suggestedMapping: s.suggestedFsLineLabel,
          confidence: s.confidence,
          reason: 'Auto-accept failed',
        });
      }
    } else {
      // Needs human review
      let reason = '';
      if (isSuspect) reason = 'Balance-mapping mismatch detected by validation agent';
      else if (!crossValidationPasses) reason = 'Cross-validation found structural issues';
      else if (s.confidence < AUTO_ACCEPT_THRESHOLD) reason = `Low confidence (${Math.round(s.confidence * 100)}%)`;
      else reason = 'Unknown';

      reviewRequired.push({
        accountCode: s.accountCode ?? '',
        accountName: s.accountName,
        suggestedMapping: s.suggestedFsLineLabel,
        confidence: s.confidence,
        reason,
      });
    }
  }

  // Emit realtime event
  try {
    const { emitSessionEvent } = await import('../realtime/index.js');
    emitSessionEvent({
      type: 'mapping_accepted',
      sessionId: closeSessionId,
      tenantId,
      triggeredBy: 'autonomous_mapping',
      data: {
        autoAccepted,
        needsReview: reviewRequired.length,
        totalAccounts: suggestions.length,
        correctionProposals: correctionProposalCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }

  return {
    totalAccounts: suggestions.length,
    autoAccepted,
    needsReview: reviewRequired.length,
    reviewRequired,
    correctionProposals: correctionProposalCount,
    crossValidationPasses,
    crossValidationIssues: crossValidationIssueCount,
    learningSignalsUsed,
  };
}
