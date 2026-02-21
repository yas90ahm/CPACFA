'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { Sidebar } from '@/components/shell/Sidebar';
import { StateMachineBanner } from '@/components/shell/StateMachineBanner';
import { IssuePanel } from '@/components/shell/IssuePanel';
import { useCloseSession, useCloseIssues, useCloseReadiness } from '@/lib/queries/close-session';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useVariances } from '@/lib/queries/variance';
import { TrialBalanceProvider, useTrialBalanceContext } from './context/trial-balance-context';

function CloseSessionInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const { unmappedCount } = useTrialBalanceContext();
  useEffect(() => {
    const handler = () => setIssuePanelOpen(true);
    window.addEventListener('open-issue-panel', handler);
    return () => window.removeEventListener('open-issue-panel', handler);
  }, []);

  const { data: session } = useCloseSession(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const reconIncompleteCount = reconciliations.filter((r) => r.status !== 'approved').length;
  const adjustmentsPendingTemplates = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const adjustmentsPendingEntries = journalEntries.filter((e) => e.status === 'proposed' || e.status === 'rejected').length;
  const adjustmentsBadge = adjustmentsPendingTemplates + adjustmentsPendingEntries;
  const varianceUnexplainedCount = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending').length;
  const statementsStale = session?.statementsStale ?? false;

  const state = session?.state ?? 'IN_PROGRESS';
  const canAdvance = readiness?.canAdvance ?? false;
  const gatesRemaining = readiness ? readiness.gatesTotal - readiness.gatesPassing : 3;

  return (
    <>
      <TopBar
        entityName={session?.entityName}
        periodLabel={session?.periodLabel}
        state={state}
        userName={session?.createdBy}
        userInitials={session?.createdBy?.slice(0, 2).toUpperCase()}
        showBackToPortfolio
      />
      <StateMachineBanner
        currentState={state}
        gatesRemaining={gatesRemaining}
        canAdvance={canAdvance}
        isReviewer={false}
      />
      <Sidebar sessionId={sessionId} unmappedCount={unmappedCount} reconIncompleteCount={reconIncompleteCount} adjustmentsBadge={adjustmentsBadge} statementsStale={statementsStale} varianceUnexplainedCount={varianceUnexplainedCount} sessionState={state} />
      <main className="pl-[240px] pt-[56px] pb-6 print:pl-0 print:pt-6" style={{ paddingTop: 'calc(56px + 40px)' }}>
        <div className="p-6">{children}</div>
      </main>
      <IssuePanel
        issues={issues}
        sessionId={sessionId}
        open={issuePanelOpen}
        onClose={() => setIssuePanelOpen(false)}
        onOpenRequest={() => setIssuePanelOpen(true)}
      />
    </>
  );
}

export default function CloseSessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <TrialBalanceProvider>
      <CloseSessionInner>{children}</CloseSessionInner>
    </TrialBalanceProvider>
  );
}
