/**
 * Session readiness gates — transforms computeReadiness + gate checks into frontend gates array.
 */

import type { Pool } from 'pg';
import type { CloseSession } from '../types/close_session.js';
import { computeReadiness } from './close_checklist_readiness_service.js';
import { checkMappingCompleteness } from './mapping_completeness_gate.js';
import { checkReconCompleteness } from './recon_completeness_gate.js';
import { checkTemplateCompleteness } from './template_completeness_gate.js';
import { checkVarianceCompleteness } from './variance_analysis_service.js';
import { getBlockingIssuesForPeriod } from './issue_service.js';
import * as statementPackageRepo from '../db/repositories/statement_package_repository.js';

export interface ReadinessGate {
  id: string;
  name: string;
  description: string;
  passing: boolean;
  detail: string;
  category: 'hard' | 'soft';
  navigateTo: string;
}

export interface ReadinessGatesResult {
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
  gates: ReadinessGate[];
  raw?: {
    ready: boolean;
    hardBlockers: string[];
    softWarnings: string[];
  };
}

function periodLabelFromSession(session: CloseSession): string {
  return (session.periodEnd ?? '').length >= 7 ? (session.periodEnd ?? '').slice(0, 7) : '';
}

export async function getReadinessGates(
  pool: Pool,
  tenantId: string,
  session: CloseSession
): Promise<ReadinessGatesResult> {
  const closeSessionId = session.id;
  const periodLabel = periodLabelFromSession(session);
  const entityId = session.entityId ?? '';

  const readiness = await computeReadiness(pool, tenantId, session);
  const gates: ReadinessGate[] = [];

  // --- Prerequisite: check if GL data exists ---
  // If no accounts exist, almost all gates should fail (can't close what you haven't started)
  const mappingResult = await checkMappingCompleteness(pool, tenantId, closeSessionId, entityId);
  const accountCount = mappingResult.total_accounts ?? 0;
  const hasData = accountCount > 0;

  // 1. TB Balanced (integrity) — must have accounts AND balance
  gates.push({
    id: 'tb_balanced',
    name: 'Trial Balance Balanced',
    description: 'Total debits must equal total credits',
    passing: hasData && readiness.integrityChecksPass !== false,
    detail: !hasData
      ? 'No trial balance uploaded — upload a GL to begin'
      : readiness.integrityChecksPass
        ? `Debits equal credits · ${accountCount} accounts`
        : 'Trial balance or rounding checks failed',
    category: 'hard',
    navigateTo: '/trial-balance',
  });

  // 2. All Accounts Mapped — requires data to exist
  gates.push({
    id: 'all_accounts_mapped',
    name: 'All Accounts Mapped',
    description: 'Every trial balance account must be mapped to a reporting line item',
    passing: hasData && mappingResult.passes,
    detail: !hasData
      ? 'Upload a trial balance first'
      : `${mappingResult.mapped_accounts}/${mappingResult.total_accounts} accounts mapped`,
    category: 'hard',
    navigateTo: '/mapping',
  });

  // 3. Reconciliations Complete — requires data
  const reconResult = await checkReconCompleteness(pool, tenantId, closeSessionId);
  const reconCompleteCount = reconResult.completed + reconResult.approved;
  const reconPopulationConfigured = reconResult.total_required > 0;
  gates.push({
    id: 'recons_complete',
    name: 'Reconciliations Complete',
    description: 'All required accounts must be reconciled with supporting documentation',
    passing: hasData && reconPopulationConfigured && reconResult.passes,
    detail: !hasData
      ? 'Upload a trial balance first'
      : !reconPopulationConfigured
        ? 'No required reconciliation population is configured'
      : `${reconCompleteCount}/${reconResult.total_required} reconciliations complete`,
    category: 'hard',
    navigateTo: '/reconciliation',
  });

  // 4. AJE Templates Resolved — requires data
  const templateResult = await checkTemplateCompleteness(pool, tenantId, closeSessionId);
  gates.push({
    id: 'templates_resolved',
    name: 'Recurring Entries Resolved',
    description: 'All proposed recurring entry templates must be applied or skipped',
    passing: hasData && templateResult.passes,
    detail: !hasData
      ? 'Upload a trial balance first'
      : templateResult.passes
        ? `${templateResult.applied} applied, ${templateResult.skipped} skipped`
        : `${templateResult.pending} template(s) pending`,
    category: 'hard',
    navigateTo: '/adjustments',
  });

  // 5. Approved company runbook — once configured or started, every persisted
  // task outcome is part of the hard close gate.
  gates.push({
    id: 'runbook_complete',
    name: 'Approved Runbook Complete',
    description: 'Every procedure in the approved company runbook must be completed or validly dispositioned',
    passing: readiness.runbookComplete !== false,
    detail: readiness.runbookDetail ?? 'No approved runbook is required for this close session',
    category: 'hard',
    navigateTo: '/runbook',
  });

  // 6. Statements Current — requires data
  const pkgs = await statementPackageRepo.listStatementPackagesByCloseSessionId(pool, tenantId, closeSessionId, 1);
  const statementsExist = pkgs.length > 0;
  const statementsStale = !!session.statementsStaleSince;
  const statementsPass = hasData && statementsExist && !statementsStale;
  gates.push({
    id: 'statements_current',
    name: 'Statements Current',
    description: 'Financial statements must be generated and not stale',
    passing: statementsPass,
    detail: !hasData
      ? 'Upload a trial balance first'
      : !statementsExist
        ? 'Statements not yet generated'
        : statementsStale
          ? 'Statements are stale — regenerate after recent changes'
          : 'Statements generated and current',
    category: 'hard',
    navigateTo: '/statements',
  });

  // 7. Material Variances Explained
  const varianceResult = await checkVarianceCompleteness(pool, tenantId, closeSessionId);
  const variancePassing = statementsExist ? varianceResult.passes : false;
  const varianceDetail = !statementsExist
    ? 'Generate statements first'
    : varianceResult.unexplained.length > 0
      ? `${varianceResult.unexplained.length} material variance(s) need explanation`
      : (varianceResult.unreviewedAi ?? 0) > 0
        ? `${varianceResult.unreviewedAi} AI-drafted explanation(s) need human review — open each and click Approve`
        : `${varianceResult.totalMaterial} material variance(s) explained`;
  gates.push({
    id: 'variances_explained',
    name: 'Material Variances Explained',
    description: 'All material period-over-period changes must have documented explanations',
    passing: variancePassing,
    detail: varianceDetail,
    category: 'hard',
    navigateTo: '/variance',
  });

  // 8. Zero Blocking Issues
  const blockingIssues = await getBlockingIssuesForPeriod(pool, closeSessionId, tenantId);
  const noBlockingIssues = blockingIssues.length === 0;
  gates.push({
    id: 'no_blocking_issues',
    name: 'No Blocking Issues',
    description: 'All critical and blocking issues must be resolved',
    passing: noBlockingIssues,
    detail: noBlockingIssues ? 'No blocking issues' : `${blockingIssues.length} blocking issue(s) open`,
    category: 'hard',
    navigateTo: '/issues',
  });

  // 9. Evidence Policy Met — check actual evidence count for completed recons
  let evidencePass = true;
  let evidenceDetail = 'Evidence requirements satisfied';
  const evidenceBlockers = readiness.hardBlockers.filter((m) =>
    m.includes('evidence') || m.includes('Evidence') || m.includes('supporting documentation')
  );
  if (evidenceBlockers.length > 0) {
    evidencePass = false;
    evidenceDetail = evidenceBlockers[0] ?? 'Evidence requirements not met';
  } else {
    // Additional check: if completed/approved recons exist, verify they have evidence
    try {
      const reconsWithoutEvidence = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::int AS cnt FROM tenant_period_reconciliations r
         WHERE r.tenant_id = $1 AND r.period_id = $2
           AND r.status IN ('completed', 'approved')
           AND NOT EXISTS (
             SELECT 1 FROM evidence_links el
             WHERE el.tenant_id = r.tenant_id AND el.object_type = 'reconciliation' AND el.object_id = r.recon_id
           )`,
        [tenantId, closeSessionId]
      );
      const missingCount = Number(reconsWithoutEvidence.rows[0]?.cnt ?? 0);
      if (missingCount > 0) {
        evidencePass = false;
        evidenceDetail = `${missingCount} completed reconciliation${missingCount === 1 ? '' : 's'} missing supporting evidence`;
      }
    } catch {
      // Tables may not exist — use readiness blockers only
    }
  }
  gates.push({
    id: 'evidence_policy',
    name: 'Evidence Policy Met',
    description: 'Required evidence attached to reconciliations and material journal entries',
    passing: evidencePass,
    detail: evidenceDetail,
    category: 'hard',
    navigateTo: '/reconciliation',
  });

  // 10. Checklist Complete — requires data
  gates.push({
    id: 'checklist_complete',
    name: 'Close Checklist Complete',
    description: 'All core controls must be completed; conditional controls require an approved not-applicable reason',
    passing: hasData && readiness.checklistComplete !== false,
    detail: !hasData
      ? 'Upload a trial balance first'
      : readiness.checklistComplete !== false ? 'All required items complete' : 'Required checklist items incomplete',
    category: 'hard',
    navigateTo: '/checklist',
  });

  // 11. Cash Reconciliation — check period reconciliations for cash accounts (1xxx)
  let cashRecPassing = hasData && readiness.cashRecComplete !== false;
  let cashRecDetail = !hasData
    ? 'Upload a trial balance first'
    : cashRecPassing
      ? 'Cash reconciliation readiness checks passed'
      : 'Bank reconciliation is missing or requires sign-off';
  try {
    const cashRecons = await pool.query<{ status: string; account_code: string }>(
      `SELECT status, account_code FROM tenant_period_reconciliations
       WHERE tenant_id = $1 AND period_id = $2
         AND account_code LIKE '1%'
       ORDER BY account_code`,
      [tenantId, closeSessionId]
    );
    if (cashRecons.rows.length > 0) {
      const notApproved = cashRecons.rows.filter(r => r.status !== 'approved' && r.status !== 'completed');
      cashRecPassing = cashRecPassing && notApproved.length === 0;
      cashRecDetail = cashRecPassing
        ? `${cashRecons.rows.length} cash reconciliation${cashRecons.rows.length === 1 ? '' : 's'} complete`
        : notApproved.length > 0
          ? `${notApproved.length} cash reconciliation${notApproved.length === 1 ? '' : 's'} not yet complete`
          : 'Bank reconciliation run is missing or requires sign-off';
    }
  } catch {
    // Table may not exist — use readiness fallback
    cashRecPassing = readiness.cashRecComplete !== false;
    cashRecDetail = cashRecPassing ? 'Cash reconciliation complete' : 'Bank recon requires sign-off';
  }
  gates.push({
    id: 'cash_rec_complete',
    name: 'Cash Reconciliation Complete',
    description: 'Cash and bank account reconciliations must be completed or approved',
    passing: cashRecPassing,
    detail: cashRecDetail,
    category: 'hard',
    navigateTo: '/reconciliation',
  });

  // 12. Material JEs Approved — requires data
  const jesApproved = hasData && readiness.materialJesApproved !== false;
  const jesDetail = !hasData
    ? 'Upload a trial balance first'
    : !jesApproved
      ? 'Unapproved journal entries remain pending'
      : readiness.jeTotal === 0
        ? 'No journal entries posted'
        : 'All JEs approved or rejected';
  gates.push({
    id: 'material_jes_approved',
    name: 'Material JEs Approved',
    description: 'All journal entries must be approved or rejected (no draft, proposed, or pending-approval entries)',
    passing: jesApproved,
    detail: jesDetail,
    category: 'hard',
    navigateTo: '/adjustments',
  });

  const gatesPassing = gates.filter((g) => g.passing).length;
  const gatesTotal = gates.length;
  const hardGates = gates.filter((g) => g.category === 'hard');
  const canAdvance = hardGates.every((g) => g.passing);

  return {
    gatesPassing,
    gatesTotal,
    canAdvance,
    gates,
    raw: {
      ready: readiness.ready,
      hardBlockers: readiness.hardBlockers,
      softWarnings: readiness.softWarnings,
    },
  };
}
