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
import { useAccountAnalysisSummary } from '@/lib/queries/account-analysis';
import { useAuth } from '@/lib/auth';
import { getUserDisplay } from '@/lib/utils';
import { isReadOnly, canCertify, canLockPeriod, canSubmitForReview, isSidebarItemVisible } from '@/lib/permissions';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { QuickNavigator } from '@/components/shared/QuickNavigator';
import { TrialBalanceProvider, useTrialBalanceContext } from './context/trial-balance-context';

const SIDEBAR_COLLAPSED_KEY = 'sabit-sidebar-collapsed';

function CloseSessionInner({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const { unmappedCount } = useTrialBalanceContext();
  const role = user?.role ?? 'controller';
  const showBackToPortfolio = role === 'operating_partner' || role === 'admin';
  const readOnly = isReadOnly(role);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  const handleToggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  // Auto-collapse sidebar on medium screens (1024-1279px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280 && window.innerWidth >= 1024) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // check on mount
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ctrl+B keyboard shortcut to toggle sidebar collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Ctrl+K keyboard shortcut to open quick navigator
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuickNavOpen(prev => !prev);
      }
      if (e.key === 'Escape' && quickNavOpen) {
        setQuickNavOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [quickNavOpen]);

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
  const reconIncompleteCount = reconciliations.filter((r) => r.status !== 'approved').length;
  const adjustmentsPendingTemplates = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const adjustmentsPendingEntries = journalEntries.filter((e) => e.status === 'proposed' || e.status === 'rejected').length;
  const adjustmentsBadge = adjustmentsPendingTemplates + adjustmentsPendingEntries;
  const varianceUnexplainedCount = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending').length;
  const statementsStale = session?.statementsStale ?? false;
  const { data: glQualitySummary } = useAccountAnalysisSummary(sessionId);
  const glQualityPending = glQualitySummary?.pending ?? 0;
  const glQualityDone = glQualitySummary != null && glQualitySummary.pending === 0 && glQualitySummary.flagged > 0;

  const state = session?.state ?? 'IN_PROGRESS';
  const canAdvance = readiness?.canAdvance ?? false;
  const gatesRemaining = readiness ? readiness.gatesTotal - readiness.gatesPassing : 3;

  const paddingTop = (readOnly || role === 'reviewer') ? 'calc(56px + 40px + 32px)' : 'calc(56px + 40px)';

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
        <div
          className="fixed top-[96px] left-0 right-0 z-25 h-8 flex items-center justify-center border-b text-xs font-medium print:hidden"
          style={{
            background: 'var(--status-info-bg)',
            borderColor: 'var(--status-info-border)',
            color: 'var(--status-info)'
          }}
        >
          You are viewing this close session in read-only mode
        </div>
      )}
      {role === 'reviewer' && !readOnly && (
        <div
          className="fixed top-[96px] left-0 right-0 z-25 h-8 flex items-center justify-center border-b text-xs font-medium print:hidden"
          style={{
            background: 'var(--status-info-bg)',
            borderColor: 'var(--status-info-border)',
            color: 'var(--status-info)'
          }}
        >
          Reviewing as CFO — approval actions are available on pending items
        </div>
      )}
      <Sidebar
        sessionId={sessionId}
        unmappedCount={unmappedCount}
        reconIncompleteCount={reconIncompleteCount}
        adjustmentsBadge={adjustmentsBadge}
        statementsStale={statementsStale}
        varianceUnexplainedCount={varianceUnexplainedCount}
        glQualityPending={glQualityPending}
        glQualityDone={glQualityDone}
        sessionState={state}
        userRole={role}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <main
        className="pb-6 print:pl-0 print:pt-6 transition-[padding-left] duration-200"
        style={{
          paddingLeft: sidebarCollapsed ? '64px' : '240px',
          paddingTop,
        }}
      >
        <div className="px-8 py-6 max-w-[1400px] animate-fade-in">{children}</div>
      </main>
      <IssuePanel
        issues={issues}
        sessionId={sessionId}
        open={issuePanelOpen}
        onClose={() => setIssuePanelOpen(false)}
        onOpenRequest={() => setIssuePanelOpen(true)}
      />
      <QuickNavigator open={quickNavOpen} onClose={() => setQuickNavOpen(false)} sessionId={sessionId} />
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
