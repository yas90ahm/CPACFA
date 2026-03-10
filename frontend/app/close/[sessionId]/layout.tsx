'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { Sidebar } from '@/components/shell/Sidebar';
import { StateMachineBanner } from '@/components/shell/StateMachineBanner';
import { IssuePanel } from '@/components/shell/IssuePanel';
import { useCloseSession, useCloseIssues, useCloseReadiness } from '@/lib/queries/close-session';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useVariances } from '@/lib/queries/variance';
import { useHITLStaging } from '@/lib/queries/ai-insights';
import { useAuth } from '@/lib/auth';
import { getUserDisplay } from '@/lib/utils';
import { isReadOnly, canCertify, canLockPeriod, canSubmitForReview, isSidebarItemVisible } from '@/lib/permissions';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { VerifiedCloseWorkflow } from '@/components/shared/VerifiedCloseWorkflow';
import { TrialBalanceProvider, useTrialBalanceContext } from './context/trial-balance-context';

function CloseSessionInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { unmappedCount } = useTrialBalanceContext();
  const role = user?.role ?? 'controller';
  const showBackToPortfolio = role === 'operating_partner' || role === 'admin';
  const readOnly = isReadOnly(role);

  // URL-level route protection: redirect restricted roles away from pages they can't access
  useEffect(() => {
    if (!pathname || !sessionId) return;
    const segments = pathname.split('/').filter(Boolean);
    const sessionIdx = segments.indexOf(sessionId);
    const pageSegment = sessionIdx >= 0 && segments.length > sessionIdx + 1 ? segments[sessionIdx + 1] : 'dashboard';
    const testHref = `/close/${sessionId}/${pageSegment}`;
    if (!isSidebarItemVisible(role, testHref)) {
      router.replace(`/close/${sessionId}/dashboard`);
    }
  }, [pathname, sessionId, role, router]);

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
  const { data: allStaging = [] } = useHITLStaging();
  const aiPendingCount = allStaging.filter((s) => s.status === 'pending').length;
  const reconIncompleteCount = reconciliations.filter((r) => r.status !== 'approved').length;
  const adjustmentsPendingTemplates = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const adjustmentsPendingEntries = journalEntries.filter((e) => e.status === 'proposed' || e.status === 'rejected').length;
  const adjustmentsBadge = adjustmentsPendingTemplates + adjustmentsPendingEntries;
  const varianceUnexplainedCount = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending').length;
  const statementsStale = session?.statementsStale ?? false;

  const state = session?.state ?? 'IN_PROGRESS';
  const canAdvance = readiness?.canAdvance ?? false;
  const gatesRemaining = readiness ? readiness.gatesTotal - readiness.gatesPassing : 3;

  const sidebarWidth = sidebarCollapsed ? '60px' : '240px';

  return (
    <>
      <TopBar
        entityName={session?.entityName}
        periodLabel={session?.periodLabel}
        state={state}
        userName={getUserDisplay(user).displayName}
        userInitials={getUserDisplay(user).initials}
        showBackToPortfolio={showBackToPortfolio}
      />
      <StateMachineBanner
        currentState={state}
        sessionId={sessionId}
        gatesRemaining={gatesRemaining}
        canAdvance={canAdvance}
        isReviewer={canCertify(role)}
        isReadOnly={readOnly}
        canLock={canLockPeriod(role)}
        canSubmit={canSubmitForReview(role)}
      />
      {readOnly && (
        <div className="fixed top-[96px] left-0 right-0 z-25 h-8 flex items-center justify-center bg-status-blue-dim border-b border-status-blue/30 text-status-blue text-xs font-medium print:hidden">
          You are viewing this close session in read-only mode
        </div>
      )}
      <Sidebar
        sessionId={sessionId}
        unmappedCount={unmappedCount}
        reconIncompleteCount={reconIncompleteCount}
        adjustmentsBadge={adjustmentsBadge}
        statementsStale={statementsStale}
        varianceUnexplainedCount={varianceUnexplainedCount}
        aiPendingCount={aiPendingCount}
        sessionState={state}
        userRole={role}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      <main
        className="pb-6 print:pl-0 print:pt-6 transition-all duration-200"
        style={{
          paddingLeft: sidebarWidth,
          paddingTop: readOnly ? 'calc(56px + 40px + 32px)' : 'calc(56px + 40px)',
        }}
      >
        <div className="p-6">
          <VerifiedCloseWorkflow sessionId={sessionId} />
          {children}
        </div>
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
  const params = useParams();
  const sessionId = (params?.sessionId as string) ?? '';
  return (
    <ErrorBoundary>
      <TrialBalanceProvider sessionId={sessionId}>
        <CloseSessionInner>{children}</CloseSessionInner>
      </TrialBalanceProvider>
    </ErrorBoundary>
  );
}
