'use client';

import { useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCloseSession, useCloseReadiness, useCloseIssues, useCloseTimeline } from '@/lib/queries/close-session';
import type { CloseTimelinePrediction } from '@/lib/queries/close-session';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useVariances } from '@/lib/queries/variance';
import { useStatements, useValidation } from '@/lib/queries/statements';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import { useSessionSocket } from '@/lib/socket';
import type { PipelineStep } from '@/components/shared/PipelineStepper';
import { PIPELINE_STEPS } from './PipelineCard';
import type { FinancialLine } from './FinancialHighlightsCard';
import type { GateEntry } from './GateStatusCard';

export function useDashboardData(
  sessionId: string,
  tbContext: { mappedCount: number; unmappedCount: number; rows: unknown[] },
) {
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { data: stmtData } = useStatements(sessionId);
  const { data: validation } = useValidation(sessionId);
  const { data: auditTrail } = useAuditTrail(sessionId, { limit: 8 });
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: timeline } = useCloseTimeline(sessionId);

  /* ── Real-time: invalidate React Query caches on Socket.IO events ────── */
  const queryClient = useQueryClient();
  const { on, off } = useSessionSocket(sessionId);

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const event = args[0] as { type?: string } | undefined;
      const t = event?.type;

      // Always refresh readiness and issues on any close event
      queryClient.invalidateQueries({ queryKey: ['readiness', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['issues', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['audit-events', sessionId] });

      if (t === 'cascade_complete' || t === 'je_posted') {
        queryClient.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['statements', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['validation', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['templates', sessionId] });
      }

      if (t === 'session_advanced') {
        queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
      }

      if (t === 'recon_completed' || t === 'recon_approved') {
        queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
      }

      if (t === 'statements_generated') {
        queryClient.invalidateQueries({ queryKey: ['statements', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['validation', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
      }

      if (t === 'variance_explained') {
        queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
      }

      if (t === 'readiness_changed') {
        queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
      }
    };

    on('close_event', handler);
    return () => { off('close_event', handler); };
  }, [on, off, sessionId, queryClient]);

  const { mappedCount, unmappedCount, rows: tbRows } = tbContext;
  const totalAccounts = tbRows.length;
  const statementsGenerated = !!session?.statementsGeneratedAt;
  const statementsStale = session?.statementsStale ?? false;
  const reconTotal = reconciliations.length;
  const reconComplete = reconciliations.filter((r) => r.status === 'completed' || r.status === 'approved').length;
  const ajeTemplatePending = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const ajeTemplateResolved = ajeTemplates.filter((t) => t.periodStatus === 'applied' || t.periodStatus === 'skipped').length;
  const ajeTemplateTotal = ajeTemplates.length;
  const varianceMaterialTotal = variances.filter((v) => v.isMaterial).length;
  const varianceExplainedCount = variances.filter(
    (v) => v.isMaterial && (v.explanationStatus === 'explained' || v.explanationStatus === 'approved'),
  ).length;
  const varianceUnexplained = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending');
  const jesAwaitingApproval = journalEntries.filter((je) => je.status === 'proposed').length;
  const reconsInProgress = reconciliations.filter((r) => r.status === 'in_progress').length;
  const mappingGatePassing = totalAccounts > 0 && unmappedCount === 0;
  const balanceVerified = validation?.allPassing ?? false;

  // Financial lines
  const financialLines: FinancialLine[] = useMemo(() => {
    if (!stmtData) return [];
    const find = (
      lines: { lineItemName: string; amount: string; priorAmount?: string; isGrandTotal?: boolean; isSubtotal?: boolean }[],
      p: RegExp,
    ) =>
      lines.find((l) => l.isGrandTotal && p.test(l.lineItemName)) ??
      lines.find((l) => l.isSubtotal && p.test(l.lineItemName)) ??
      lines.find((l) => p.test(l.lineItemName));
    const is = stmtData.incomeStatement?.lines ?? [];
    const bs = stmtData.balanceSheet?.lines ?? [];
    const r = find(is, /revenue|sales/i);
    const g = find(is, /gross profit/i);
    const o = find(is, /operating income|income from operations/i);
    const e = find(is, /ebitda/i);
    const n = find(is, /net income|net income \(loss\)/i);
    return [
      { label: 'Revenue', amount: r?.amount ?? null, prior: r?.priorAmount, variant: 'line-item' as const },
      { label: 'Gross Profit', amount: g?.amount ?? null, prior: g?.priorAmount, variant: 'subtotal' as const },
      { label: 'Operating Income', amount: o?.amount ?? null, prior: o?.priorAmount, variant: 'subtotal' as const },
      { label: 'EBITDA', amount: e?.amount ?? null, prior: e?.priorAmount, variant: 'subtotal' as const },
      { label: 'Net Income', amount: n?.amount ?? null, prior: n?.priorAmount, variant: 'total' as const },
    ];
  }, [stmtData]);

  // Gates with overrides
  const gatesWithMapping: GateEntry[] = useMemo(() => {
    const base = readiness?.gates ?? [];
    return base.map((g) => {
      if (g.id === 'all_accounts_mapped')
        return { ...g, passing: mappingGatePassing, detail: `${mappedCount}/${totalAccounts} mapped` };
      if (g.id === 'recons_complete')
        return { ...g, passing: reconTotal > 0 && reconComplete === reconTotal, detail: `${reconComplete}/${reconTotal} complete` };
      if (g.id === 'templates_resolved')
        return { ...g, passing: ajeTemplatePending === 0, detail: ajeTemplateTotal === 0 ? 'No templates' : `${ajeTemplateResolved}/${ajeTemplateTotal} resolved` };
      if (g.id === 'statements_current')
        return { ...g, passing: statementsGenerated && !statementsStale, detail: statementsStale ? 'Stale -- regenerate' : statementsGenerated ? 'Generated' : 'Not generated' };
      if (g.id === 'variances_explained') {
        const passing = statementsGenerated ? varianceMaterialTotal === 0 || varianceUnexplained.length === 0 : false;
        return { ...g, passing, detail: !statementsGenerated ? 'Generate statements first' : `${varianceExplainedCount}/${varianceMaterialTotal} explained` };
      }
      return g;
    });
  }, [readiness, mappingGatePassing, mappedCount, totalAccounts, reconTotal, reconComplete, ajeTemplatePending, ajeTemplateTotal, ajeTemplateResolved, statementsGenerated, statementsStale, varianceMaterialTotal, varianceUnexplained.length, varianceExplainedCount]);

  const gatesPassing = gatesWithMapping.filter((g) => g.passing).length;
  const gatesTotal = gatesWithMapping.length;

  // Pipeline stepper
  const stepperSteps: PipelineStep[] = useMemo(() => {
    const reviewState = session?.state ?? 'IN_PROGRESS';
    const gates: Record<string, boolean> = {
      upload: true,
      map: mappingGatePassing,
      recon: reconTotal > 0 && reconComplete === reconTotal,
      adjust: ajeTemplateTotal > 0 ? ajeTemplatePending === 0 : true,
      generate: statementsGenerated && !statementsStale,
      variance: varianceMaterialTotal > 0 ? varianceUnexplained.length === 0 : true,
      review: reviewState === 'UNDER_REVIEW' || reviewState === 'CERTIFIED' || reviewState === 'LOCKED',
      certify: reviewState === 'CERTIFIED' || reviewState === 'LOCKED',
    };
    const status: Record<string, 'complete' | 'active' | 'pending' | 'error'> = {};
    let blocked = false;
    for (const s of PIPELINE_STEPS) {
      if (blocked) { status[s.id] = 'pending'; }
      else if (gates[s.id]) { status[s.id] = 'complete'; }
      else { status[s.id] = 'active'; blocked = true; }
    }
    return PIPELINE_STEPS.map((s) => ({ id: s.id, label: s.label, status: status[s.id] ?? 'pending' }));
  }, [session?.state, mappingGatePassing, reconTotal, reconComplete, ajeTemplateTotal, ajeTemplatePending, statementsGenerated, statementsStale, varianceMaterialTotal, varianceUnexplained.length]);

  // Day tracking
  const startDate = session?.startedAt ?? session?.createdAt;
  const dayElapsed = startDate ? Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / 86400000)) : 1;

  return {
    session,
    issues,
    auditEvents: auditTrail?.events ?? [],
    financialLines,
    balanceVerified,
    gatesWithMapping,
    gatesPassing,
    gatesTotal,
    stepperSteps,
    dayElapsed,
    targetDays: 10,
    mappedCount,
    unmappedCount,
    totalAccounts,
    reconComplete,
    reconTotal,
    statementsGenerated,
    statementsStale,
    ajeTemplatePending,
    ajeTemplateTotal,
    varianceExplainedCount,
    varianceMaterialTotal,
    jesAwaitingApproval,
    reconsInProgress,
    timeline: timeline ?? null,
  };
}
