'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCloseSession, useCloseReadiness, useCloseIssues } from '@/lib/queries/close-session';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useVariances } from '@/lib/queries/variance';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import {
  mockPhaseProgress,
  mockNextActions,
  mockRecentActivity,
} from '@/lib/mock/close-session';
import { cn } from '@/lib/utils';
import { Check, Circle, CircleDot, ArrowRight } from 'lucide-react';
import { OpenStateDashboard } from './OpenStateDashboard';

export default function CloseDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const [ingestToast, setIngestToast] = useState<string | null>(null);

  const ingested = searchParams.get('ingested') === '1';
  const accounts = searchParams.get('accounts') ?? '52';
  const unmapped = searchParams.get('unmapped') ?? '5';
  const effectiveState = ingested ? 'IN_PROGRESS' : session?.state;

  useEffect(() => {
    if (!ingested) return;
    setIngestToast(`GL imported — ${accounts} accounts, trial balance balanced. ${unmapped} accounts need mapping.`);
    const u = new URL(window.location.href);
    u.searchParams.delete('ingested');
    u.searchParams.delete('accounts');
    u.searchParams.delete('unmapped');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [ingested, accounts, unmapped]);

  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { mappedCount, unmappedCount, rows: tbRows } = useTrialBalanceContext();

  if (effectiveState === 'OPEN') {
    return (
      <OpenStateDashboard
        sessionId={sessionId}
        periodLabel={session?.periodLabel ?? ''}
        entityName={session?.entityName ?? ''}
      />
    );
  }

  const statementsGenerated = !!session?.statementsGeneratedAt;
  const statementsStale = session?.statementsStale ?? false;
  const varianceMaterialTotal = variances.filter((v) => v.isMaterial).length;
  const varianceExplainedCount = variances.filter((v) => v.isMaterial && (v.explanationStatus === 'explained' || v.explanationStatus === 'approved')).length;
  const varianceUnexplained = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending');
  const varianceExplainedPendingReview = variances.filter((v) => v.isMaterial && v.explanationStatus === 'explained');

  const reconTotal = reconciliations.length;
  const reconComplete = reconciliations.filter((r) => r.status === 'completed' || r.status === 'approved').length;
  const reconOverTolerance = reconciliations.filter((r) => r.supportingBalance != null && Math.abs(r.unexplainedVariance) > r.tolerance).length;
  const ajeTemplatePending = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const ajeTemplateResolved = ajeTemplates.filter((t) => t.periodStatus === 'applied' || t.periodStatus === 'skipped').length;
  const ajeTemplateTotal = ajeTemplates.length;
  const ajeEntryAwaitingApproval = journalEntries.filter((e) => e.status === 'proposed').length;
  const ajeApprovedNotPosted = journalEntries.find((e) => e.status === 'approved');
  const ajeRejected = journalEntries.find((e) => e.status === 'rejected');
  const totalAccounts = tbRows.length;
  const mappingGatePassing = totalAccounts > 0 && unmappedCount === 0;

  const criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
  const blockingCount = issues.filter((i) => i.severity === 'BLOCKING').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
  const infoCount = issues.filter((i) => i.severity === 'INFO').length;
  const hasBlockingOrCritical = criticalCount > 0 || blockingCount > 0;

  const gatesBase = readiness?.gates ?? [];
  const gatesWithMapping = gatesBase.map((g) => {
    if (g.id === 'map') return { ...g, passing: mappingGatePassing, detail: `${mappedCount}/${totalAccounts} mapped` };
    if (g.id === 'recon') return { ...g, passing: reconTotal > 0 && reconComplete === reconTotal, detail: `${reconComplete}/${reconTotal} complete` };
    if (g.id === 'aje') return { ...g, passing: ajeTemplateTotal > 0 && ajeTemplatePending === 0, detail: `${ajeTemplateResolved}/${ajeTemplateTotal} resolved` };
    if (g.id === 'stmt') return { ...g, passing: statementsGenerated && !statementsStale, detail: statementsStale ? 'Stale — regenerate' : statementsGenerated ? 'Generated' : 'Not generated' };
    if (g.id === 'var') return { ...g, passing: varianceMaterialTotal === 0 || varianceUnexplained.length === 0, detail: `${varianceExplainedCount}/${varianceMaterialTotal} explained` };
    return g;
  });
  const gatesPassing = gatesWithMapping.filter((g) => g.passing).length;
  const gatesTotal = gatesWithMapping.length;

  return (
    <div className="space-y-6">
      {ingestToast && (
        <div className="rounded-input border border-status-green bg-status-green-dim text-status-green px-4 py-3 text-sm flex items-center justify-between">
          <span>{ingestToast}</span>
          <button type="button" onClick={() => setIngestToast(null)} className="text-status-green hover:opacity-80" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-6">
        <section className="bg-surface border border-border rounded-card p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-4">Phase progress</h2>
          <ul className="space-y-3">
            {mockPhaseProgress.map((phase, i) => {
              const phaseWithRecon = phase.id === '3'
                ? { ...phase, fraction: `${reconComplete}/${reconTotal}`, detail: `${reconComplete} of ${reconTotal} complete${reconOverTolerance > 0 ? `, ${reconOverTolerance} over tolerance` : ''}${reconciliations.filter((r) => r.status === 'not_started').length > 0 ? `, ${reconciliations.filter((r) => r.status === 'not_started').length} not started` : ''}` }
                : phase.id === '4'
                  ? { ...phase, fraction: ajeTemplateTotal ? `${ajeTemplateResolved}/${ajeTemplateTotal}` : '', detail: ajeTemplatePending > 0 ? `${ajeTemplatePending} templates pending${ajeEntryAwaitingApproval > 0 ? `, ${ajeEntryAwaitingApproval} entry awaiting approval` : ''}` : 'All templates resolved' }
                  : phase.id === '5'
                    ? { ...phase, status: statementsGenerated && !statementsStale ? 'complete' as const : statementsGenerated ? 'in_progress' as const : 'not_started' as const, fraction: statementsStale ? 'Stale' : statementsGenerated ? 'Generated ✓' : '', detail: statementsStale ? 'Regeneration needed' : statementsGenerated ? 'Generated' : 'Not yet generated' }
                    : phase.id === '6'
                      ? { ...phase, status: varianceMaterialTotal > 0 && varianceUnexplained.length === 0 ? 'complete' as const : varianceMaterialTotal > 0 ? 'in_progress' as const : 'not_started' as const, fraction: varianceMaterialTotal ? `${varianceExplainedCount}/${varianceMaterialTotal}` : '', detail: varianceUnexplained.length > 0 ? `${varianceUnexplained.length} unexplained` : varianceExplainedPendingReview.length > 0 ? 'Review explanations' : varianceMaterialTotal ? 'All explained' : '' }
                      : phase.id === '7'
                        ? (() => {
                            const state = session?.state ?? 'IN_PROGRESS';
                            if (state === 'LOCKED') return { ...phase, status: 'complete' as const, fraction: 'Locked ✓', detail: 'Period locked' };
                            if (state === 'CERTIFIED') return { ...phase, status: 'complete' as const, fraction: 'Certified ✓', detail: 'Period certified' };
                            if (state === 'UNDER_REVIEW') return { ...phase, status: 'in_progress' as const, fraction: 'Under Review', detail: 'Awaiting certification' };
                            return { ...phase, status: 'not_started' as const, fraction: '', detail: 'Not yet submitted' };
                          })()
                        : phase;
              const isActive = phaseWithRecon.status === 'in_progress';
              const isComplete = phaseWithRecon.status === 'complete';
              return (
                <li key={phase.id}>
                  <Link
                    href={`/close/${sessionId}/${i === 0 ? 'trial-balance' : i === 1 ? 'mapping' : i === 2 ? 'reconciliation' : i === 3 ? 'adjustments' : i === 4 ? 'statements' : i === 5 ? 'variance' : i === 6 ? 'review' : 'review'}`}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-input border transition-colors',
                      isActive && 'border-l-4 border-l-accent bg-accent-dim',
                      isComplete && 'border-l-4 border-l-status-green',
                      !isActive && !isComplete && 'border-border-light hover:bg-hover'
                    )}
                    style={isActive || isComplete ? { borderLeftWidth: '4px' } : undefined}
                  >
                    {isComplete ? (
                      <Check className="w-5 h-5 text-status-green shrink-0" />
                    ) : isActive ? (
                      <CircleDot className="w-5 h-5 text-accent shrink-0 animate-pulse" />
                    ) : (
                      <Circle className="w-5 h-5 text-text-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-primary">{phase.name}</div>
                      <div className={cn('text-xs', isComplete && 'text-status-green', isActive && 'text-accent', !isComplete && !isActive && 'text-text-tertiary')}>
                        {isComplete && 'Complete'}
                        {isActive && 'In Progress'}
                        {!isComplete && !isActive && 'Not Started'}
                        {phaseWithRecon.id === '2' ? ` — ${mappedCount}/${totalAccounts} mapped` : phaseWithRecon.fraction && ` — ${phaseWithRecon.fraction}`}
                      </div>
                      {isActive && phaseWithRecon.detail && phaseWithRecon.id !== '2' && <div className="text-xs text-text-secondary mt-1">{phaseWithRecon.detail}</div>}
                      {isActive && phaseWithRecon.id === '2' && <div className="text-xs text-text-secondary mt-1">{unmappedCount === 0 ? 'All accounts mapped.' : `${unmappedCount} unmapped.`}</div>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="bg-surface border border-border rounded-card p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-4">Next actions</h2>
          <ul className="space-y-3">
            {unmappedCount > 0 && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber">
                  <div className="font-medium text-primary">Map {unmappedCount} unmapped account{unmappedCount !== 1 ? 's' : ''}</div>
                  <div className="text-xs text-text-secondary mt-1">COA mapping incomplete</div>
                  <Link href={`/close/${sessionId}/mapping?unmapped=1`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Mapping <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {reconciliations.filter((r) => r.status === 'not_started').slice(0, 1).map((r) => (
              <li key={r.id}>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber">
                  <div className="font-medium text-primary">Reconcile Account {r.accountCode} — {r.accountName}</div>
                  <div className="text-xs text-text-secondary mt-1">Not started, large balance — high priority</div>
                  <Link href={`/close/${sessionId}/reconciliation/${r.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Reconciliation <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
            {reconciliations.filter((r) => r.supportingBalance != null && Math.abs(r.unexplainedVariance) > r.tolerance).slice(0, 1).map((r) => (
              <li key={r.id}>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber">
                  <div className="font-medium text-primary">Resolve over-tolerance variance on Account {r.accountCode} — {r.accountName}</div>
                  <div className="text-xs text-text-secondary mt-1">In progress, over tolerance</div>
                  <Link href={`/close/${sessionId}/reconciliation/${r.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Reconciliation <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
            {reconciliations.filter((r) => (r.status === 'not_started' || r.status === 'in_progress') && r.supportingBalance != null && r.evidenceCount === 0).slice(0, 1).map((r) => (
              <li key={r.id}>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber/50">
                  <div className="font-medium text-primary">Upload evidence for Account {r.accountCode} — {r.accountName}</div>
                  <div className="text-xs text-text-secondary mt-1">Can&apos;t complete without it</div>
                  <Link href={`/close/${sessionId}/reconciliation/${r.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Reconciliation <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
            {ajeTemplatePending > 0 && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber">
                  <div className="font-medium text-primary">Resolve {ajeTemplatePending} pending AJE template{ajeTemplatePending !== 1 ? 's' : ''}</div>
                  <div className="text-xs text-text-secondary mt-1">Templates block advancement</div>
                  <Link href={`/close/${sessionId}/adjustments?tab=templates`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Templates <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {ajeApprovedNotPosted && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber/50">
                  <div className="font-medium text-primary">Post approved entry JE #{ajeApprovedNotPosted.jeNumber} — {ajeApprovedNotPosted.memo.slice(0, 40)}{ajeApprovedNotPosted.memo.length > 40 ? '…' : ''}</div>
                  <div className="text-xs text-text-secondary mt-1">Ready to post</div>
                  <Link href={`/close/${sessionId}/adjustments?tab=entries`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Adjustments <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {statementsStale && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber">
                  <div className="font-medium text-primary">Regenerate financial statements</div>
                  <div className="text-xs text-text-secondary mt-1">Changes were made after last generation</div>
                  <Link href={`/close/${sessionId}/statements`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Statements <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {varianceUnexplained.slice(0, 1).map((v) => (
              <li key={v.id}>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber">
                  <div className="font-medium text-primary">Explain variance: {v.lineItemName} ({parseFloat(v.changeAmount) >= 0 ? '+' : ''}{(parseFloat(v.changeAmount) / 1000).toFixed(0)}K)</div>
                  <div className="text-xs text-text-secondary mt-1">Material variance requires explanation</div>
                  <Link href={`/close/${sessionId}/variance`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Variance <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
            {varianceExplainedPendingReview.slice(0, 1).map((v) => (
              <li key={v.id}>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber/50">
                  <div className="font-medium text-primary">Review variance explanation: {v.lineItemName}</div>
                  <div className="text-xs text-text-secondary mt-1">Explanation saved, awaiting approval</div>
                  <Link href={`/close/${sessionId}/variance`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Variance <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
            {session?.state === 'IN_PROGRESS' && gatesPassing === gatesTotal && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-green">
                  <div className="font-medium text-primary">Submit period for review</div>
                  <div className="text-xs text-text-secondary mt-1">All requirements met — ready for certification</div>
                  <Link href={`/close/${sessionId}/review`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Review & Certify <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {session?.state === 'UNDER_REVIEW' && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-accent">
                  <div className="font-medium text-primary">Review and certify period</div>
                  <div className="text-xs text-text-secondary mt-1">Period submitted — awaiting certification</div>
                  <Link href={`/close/${sessionId}/review`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Review & Certify <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {session?.state === 'CERTIFIED' && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-green/50">
                  <div className="font-medium text-primary">Lock period</div>
                  <div className="text-xs text-text-secondary mt-1">Period certified — ready to lock</div>
                  <Link href={`/close/${sessionId}/review`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Review & Certify <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {ajeRejected && (
              <li>
                <div className="p-3 rounded-input border border-border-light border-l-4 border-l-status-amber/50">
                  <div className="font-medium text-primary">Review rejected entry JE #{ajeRejected.jeNumber} — {ajeRejected.memo.slice(0, 40)}{ajeRejected.memo.length > 40 ? '…' : ''}</div>
                  <div className="text-xs text-text-secondary mt-1">Rejection reason: {ajeRejected.rejectionReason?.slice(0, 50)}…</div>
                  <Link href={`/close/${sessionId}/adjustments?tab=entries`} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Open Adjustments <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            )}
            {mockNextActions.map((action) => (
              <li key={action.id}>
                <div
                  className={cn(
                    'p-3 rounded-input border border-border-light',
                    action.priority === 'BLOCKING' && 'border-l-4 border-l-status-amber',
                    action.priority === 'WARNING' && 'border-l-4 border-l-status-amber/50'
                  )}
                  style={{ borderLeftWidth: action.priority === 'BLOCKING' || action.priority === 'WARNING' ? '4px' : undefined }}
                >
                  <div className="font-medium text-primary">{action.title}</div>
                  <div className="text-xs text-text-secondary mt-1">{action.context}</div>
                  <Link
                    href={action.href.replace('[sessionId]', sessionId)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    {action.cta}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface border border-border rounded-card p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-4">Recent activity</h2>
          <ul className="space-y-2">
            {mockRecentActivity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <div className="w-7 h-7 rounded-full bg-hover flex items-center justify-center text-text-tertiary text-xs shrink-0">
                  {a.user.slice(0, 2)}
                </div>
                <div>
                  <span className="text-primary">{a.user}</span>
                  <span className="text-text-secondary"> {a.description}</span>
                  <span className="text-text-tertiary text-xs block">{a.time}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link href={`/close/${sessionId}/audit-trail`} className="mt-3 inline-block text-xs text-accent hover:underline">
            View full audit trail
          </Link>
        </section>
      </div>

      <div className="space-y-6">
        <section className="bg-surface border border-border rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-text-secondary">Readiness gates</h2>
            <span className="text-sm font-mono text-primary">{gatesPassing} of {gatesTotal} passing</span>
          </div>
          <div className="h-2 bg-elevated rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-status-green rounded-full" style={{ width: `${(gatesPassing / gatesTotal) * 100}%` }} />
          </div>
          <ul className="space-y-2">
            {gatesWithMapping.map((gate) => (
              <li key={gate.id}>
                <Link
                  href={gate.navigateTo.replace('[sessionId]', sessionId)}
                  className="flex items-center gap-3 p-2 rounded-input hover:bg-hover"
                >
                  {gate.passing ? <Check className="w-4 h-4 text-status-green shrink-0" /> : <span className="w-4 h-4 rounded-full border-2 border-status-amber shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-primary">{gate.name}</div>
                    <div className="text-xs text-text-secondary">{gate.detail}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={cn('bg-surface border rounded-card p-5', hasBlockingOrCritical && 'border-status-amber/50')}>
          <h2 className="text-sm font-medium text-text-secondary mb-3">Issue summary</h2>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 rounded text-xs bg-status-red-dim text-status-red border border-status-red/30">CRITICAL: {criticalCount}</span>
            <span className="px-2 py-0.5 rounded text-xs bg-status-amber-dim text-status-amber border border-status-amber/30">BLOCKING: {blockingCount}</span>
            <span className="px-2 py-0.5 rounded text-xs bg-status-amber-dim text-status-amber/80 border border-status-amber/20">WARNING: {warningCount}</span>
            <span className="px-2 py-0.5 rounded text-xs bg-status-blue-dim text-status-blue border border-status-blue/20">INFO: {infoCount}</span>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-issue-panel'))}
            className="mt-3 inline-block text-xs text-accent hover:underline"
          >
            View all issues
          </button>
        </section>

        <section className="bg-surface border border-border rounded-card p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-3">Session info</h2>
          <dl className="text-sm space-y-1">
            <div><dt className="text-text-tertiary inline">Entity: </dt><dd className="inline text-primary">{session?.entityName ?? '—'}</dd></div>
            <div><dt className="text-text-tertiary inline">Period: </dt><dd className="inline font-mono text-primary">{session?.periodLabel ?? '—'}</dd></div>
            <div><dt className="text-text-tertiary inline">Status: </dt><dd className="inline text-primary">{session?.state ?? '—'}</dd></div>
            <div><dt className="text-text-tertiary inline">Started: </dt><dd className="inline font-mono text-primary">Feb 1, 2026 by {session?.createdBy ?? '—'}</dd></div>
            <div><dt className="text-text-tertiary inline">Days in close: </dt><dd className="inline font-mono text-primary">4</dd></div>
            <div><dt className="text-text-tertiary inline">Prior period close: </dt><dd className="inline font-mono text-primary">6 days</dd></div>
          </dl>
        </section>
      </div>
      </div>
    </div>
  );
}
