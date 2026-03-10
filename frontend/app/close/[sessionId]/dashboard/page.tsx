'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCloseSession, useCloseReadiness, useCloseIssues } from '@/lib/queries/close-session';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useVariances } from '@/lib/queries/variance';
import { useStatements, useValidation } from '@/lib/queries/statements';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import { useCertification } from '@/lib/queries/certification';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { cn } from '@/lib/utils';
import {
  Check,
  Circle,
  ArrowRight,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Clock,
  BarChart3,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { OpenStateDashboard } from './OpenStateDashboard';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { GLUploadFlow } from './GLUploadFlow';
import { IntegrityRibbon } from '@/components/shared/IntegrityRibbon';
import { AIInsightsPanel } from '@/components/shared/AIInsightsPanel';
import { CloseHealthScore } from '@/components/shared/SmartCloseAssistant';
import { CloseChecklist } from '@/components/shared/CloseChecklist';
import { useHITLStaging } from '@/lib/queries/ai-insights';
import { useAuth } from '@/lib/auth';
import { canReplaceGL, isReadOnly as isRoleReadOnly } from '@/lib/permissions';

function formatMoney(v: string | null | undefined): string {
  if (!v) return '$0';
  const n = parseFloat(v);
  if (isNaN(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

const PIPELINE_STEPS = [
  { id: 'upload', label: 'Upload GL', path: 'trial-balance' },
  { id: 'map', label: 'Map Accounts', path: 'mapping' },
  { id: 'recon', label: 'Reconcile', path: 'reconciliation' },
  { id: 'adjust', label: 'Adjustments', path: 'adjustments' },
  { id: 'generate', label: 'Statements', path: 'statements' },
  { id: 'variance', label: 'Variances', path: 'variance' },
  { id: 'review', label: 'Review', path: 'review' },
  { id: 'certify', label: 'Certify', path: 'review' },
] as const;

export default function CloseDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const role = user?.role ?? 'controller';
  const readOnly = isRoleReadOnly(role);
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: certification } = useCertification(sessionId);
  const [ingestToast, setIngestToast] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [showReplaceUpload, setShowReplaceUpload] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const ingested = searchParams.get('ingested') === '1';
  const justCreated = searchParams.get('created') === '1';
  const accountsParam = searchParams.get('accounts') ?? '52';
  const unmappedParam = searchParams.get('unmapped') ?? '5';
  const effectiveState = session?.state;

  useEffect(() => {
    if (!ingested) return;
    setIngestToast(`GL imported — ${accountsParam} accounts, trial balance balanced. ${unmappedParam} accounts need mapping.`);
    const u = new URL(window.location.href);
    u.searchParams.delete('ingested');
    u.searchParams.delete('accounts');
    u.searchParams.delete('unmapped');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [ingested, accountsParam, unmappedParam]);

  const [createdToast, setCreatedToast] = useState<string | null>(null);
  useEffect(() => {
    if (!justCreated || !session) return;
    const periodLabel = session.periodLabel ?? 'this period';
    setCreatedToast(`Session created for ${periodLabel}. Prior period account mappings and AJE templates will carry forward automatically.`);
    const u = new URL(window.location.href);
    u.searchParams.delete('created');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [justCreated, session]);

  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { data: stmtData } = useStatements(sessionId);
  const { data: validation } = useValidation(sessionId);
  const { data: auditTrail } = useAuditTrail(sessionId, { limit: 10 });
  const { mappedCount, unmappedCount, rows: tbRows } = useTrialBalanceContext();
  const { data: allStaging = [] } = useHITLStaging();
  const aiPendingCount = allStaging.filter((s) => s.status === 'pending').length;

  // Loading state
  if (!session) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-[#141829] rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-24 bg-[#141829] rounded-xl" />
          <div className="h-24 bg-[#141829] rounded-xl" />
          <div className="h-24 bg-[#141829] rounded-xl" />
        </div>
        <div className="h-48 bg-[#141829] rounded-xl" />
      </div>
    );
  }

  if (effectiveState === 'OPEN') {
    return (
      <OpenStateDashboard
        sessionId={sessionId}
        periodLabel={session?.periodLabel ?? ''}
        entityName={session?.entityName ?? ''}
      />
    );
  }

  // GL Replace flow
  if (replaceFile) {
    return (
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-display text-primary">Replace GL Data — {session?.periodLabel ?? ''}</h1>
          <p className="text-text-secondary text-sm mt-1">Uploading a new GL will replace existing data. Account mappings will be preserved.</p>
        </div>
        <GLUploadFlow
          sessionId={sessionId}
          periodLabel={session?.periodLabel ?? ''}
          file={replaceFile}
          onBack={() => setReplaceFile(null)}
          skipAdvance
          replaceMode
          onComplete={() => setReplaceFile(null)}
        />
      </div>
    );
  }

  const statementsGenerated = !!session?.statementsGeneratedAt;
  const statementsStale = session?.statementsStale ?? false;
  const varianceMaterialTotal = variances.filter((v) => v.isMaterial).length;
  const varianceExplainedCount = variances.filter((v) => v.isMaterial && (v.explanationStatus === 'explained' || v.explanationStatus === 'approved')).length;
  const varianceUnexplained = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending');

  const reconTotal = reconciliations.length;
  const reconComplete = reconciliations.filter((r) => r.status === 'completed' || r.status === 'approved').length;
  const ajeTemplatePending = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const ajeTemplateResolved = ajeTemplates.filter((t) => t.periodStatus === 'applied' || t.periodStatus === 'skipped').length;
  const ajeTemplateTotal = ajeTemplates.length;
  const ajeEntryAwaitingApproval = journalEntries.filter((e) => e.status === 'proposed').length;
  const totalAccounts = tbRows.length;
  const mappingGatePassing = totalAccounts > 0 && unmappedCount === 0;

  // Gate data
  const gatesBase = readiness?.gates ?? [];
  const gatesWithMapping = gatesBase.map((g) => {
    if (g.id === 'all_accounts_mapped') return { ...g, passing: mappingGatePassing, detail: `${mappedCount}/${totalAccounts} mapped` };
    if (g.id === 'recons_complete') return { ...g, passing: reconTotal > 0 && reconComplete === reconTotal, detail: `${reconComplete}/${reconTotal} complete` };
    if (g.id === 'templates_resolved') return { ...g, passing: ajeTemplatePending === 0, detail: ajeTemplateTotal === 0 ? 'No templates' : `${ajeTemplateResolved}/${ajeTemplateTotal} resolved` };
    if (g.id === 'statements_current') return { ...g, passing: statementsGenerated && !statementsStale, detail: statementsStale ? 'Stale — regenerate' : statementsGenerated ? 'Generated' : 'Not generated' };
    if (g.id === 'variances_explained') {
      const varPassing = statementsGenerated ? (varianceMaterialTotal === 0 || varianceUnexplained.length === 0) : false;
      const varDetail = !statementsGenerated ? 'Generate statements first' : `${varianceExplainedCount}/${varianceMaterialTotal} explained`;
      return { ...g, passing: varPassing, detail: varDetail };
    }
    return g;
  });
  const gatesPassing = gatesWithMapping.filter((g) => g.passing).length;
  const gatesTotal = gatesWithMapping.length;
  const progressPct = gatesTotal > 0 ? Math.round((gatesPassing / gatesTotal) * 100) : 0;

  // Pipeline step statuses
  const pipelineStatus: Record<string, 'complete' | 'active' | 'pending'> = {};
  pipelineStatus.upload = 'complete';
  pipelineStatus.map = mappingGatePassing ? 'complete' : totalAccounts > 0 ? 'active' : 'pending';
  pipelineStatus.recon = reconTotal > 0 && reconComplete === reconTotal ? 'complete' : reconTotal > 0 ? 'active' : 'pending';
  pipelineStatus.adjust = ajeTemplateTotal > 0 && ajeTemplatePending === 0 ? 'complete' : ajeTemplateTotal > 0 ? 'active' : 'pending';
  pipelineStatus.generate = statementsGenerated && !statementsStale ? 'complete' : statementsGenerated ? 'active' : 'pending';
  pipelineStatus.variance = varianceMaterialTotal > 0 && varianceUnexplained.length === 0 ? 'complete' : varianceMaterialTotal > 0 ? 'active' : 'pending';
  const reviewState = session?.state ?? 'IN_PROGRESS';
  pipelineStatus.review = reviewState === 'UNDER_REVIEW' || reviewState === 'CERTIFIED' || reviewState === 'LOCKED' ? 'complete' : 'pending';
  pipelineStatus.certify = reviewState === 'CERTIFIED' || reviewState === 'LOCKED' ? 'complete' : reviewState === 'UNDER_REVIEW' ? 'active' : 'pending';

  const completedSteps = Object.values(pipelineStatus).filter((s) => s === 'complete').length;
  const activeStep = PIPELINE_STEPS.find((s) => pipelineStatus[s.id] === 'active');

  // Timing
  const startDate = session?.startedAt ?? session?.createdAt;
  const dayElapsed = startDate ? Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / 86400000)) : 1;
  const targetDays = 10;
  const statusLabel = dayElapsed <= targetDays * 0.7 ? 'On Track' : dayElapsed <= targetDays ? 'Behind' : 'Overdue';

  // CTA
  const firstFailing = gatesWithMapping.find((g) => !g.passing);
  const allPassing = gatesPassing === gatesTotal && gatesTotal > 0;
  const ctaLabel = allPassing
    ? (session?.state === 'IN_PROGRESS' ? 'Submit for Review' : 'Ready to Certify')
    : 'Continue Close';
  const ctaHref = allPassing
    ? `/close/${sessionId}/review`
    : firstFailing?.navigateTo
      ? firstFailing.navigateTo.replace('[sessionId]', sessionId)
      : `/close/${sessionId}/mapping`;

  // Financial highlights
  const highlights = useMemo(() => {
    if (!stmtData) return null;
    const findAmount = (lines: { lineItemName: string; amount: string; isGrandTotal?: boolean }[], pattern: RegExp): string | null => {
      const match = lines.find((l) => l.isGrandTotal && pattern.test(l.lineItemName)) ?? lines.find((l) => pattern.test(l.lineItemName));
      return match?.amount ?? null;
    };
    const isLines = stmtData.incomeStatement?.lines ?? [];
    const bsLines = stmtData.balanceSheet?.lines ?? [];
    return {
      revenue: findAmount(isLines, /revenue|sales/i),
      netIncome: findAmount(isLines, /net income|net income \(loss\)/i),
      totalAssets: findAmount(bsLines, /total assets/i),
      totalLiabilities: findAmount(bsLines, /total liabilities/i),
      totalEquity: findAmount(bsLines, /total equity|stockholders'? equity/i),
      cash: findAmount(bsLines, /cash|cash and/i),
    };
  }, [stmtData]);

  // Attention items
  const attentionItems: { text: string; link: string; linkLabel: string }[] = [];
  if (unmappedCount > 0) attentionItems.push({ text: `${unmappedCount} accounts unmapped`, link: `/close/${sessionId}/mapping?unmapped=1`, linkLabel: 'Map Accounts' });
  if (reconTotal > 0 && reconComplete < reconTotal) attentionItems.push({ text: `${reconTotal - reconComplete} reconciliations incomplete`, link: `/close/${sessionId}/reconciliation`, linkLabel: 'Reconcile' });
  if (ajeTemplatePending > 0) attentionItems.push({ text: `${ajeTemplatePending} AJE template${ajeTemplatePending !== 1 ? 's' : ''} pending`, link: `/close/${sessionId}/adjustments?tab=templates`, linkLabel: 'Resolve' });
  if (ajeEntryAwaitingApproval > 0) attentionItems.push({ text: `${ajeEntryAwaitingApproval} journal entr${ajeEntryAwaitingApproval !== 1 ? 'ies' : 'y'} awaiting approval`, link: `/close/${sessionId}/adjustments?tab=entries`, linkLabel: 'Review' });
  if (statementsStale) attentionItems.push({ text: 'Statements stale — regeneration needed', link: `/close/${sessionId}/statements`, linkLabel: 'Regenerate' });
  if (varianceUnexplained.length > 0) attentionItems.push({ text: `${varianceUnexplained.length} material variance${varianceUnexplained.length !== 1 ? 's' : ''} unexplained`, link: `/close/${sessionId}/variance`, linkLabel: 'Explain' });

  const chainIntegrity = auditTrail?.chainIntegrity ?? null;

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Toast notifications */}
      {ingestToast && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 px-4 py-3 text-sm flex items-center justify-between">
          <span>{ingestToast}</span>
          <button type="button" onClick={() => setIngestToast(null)} className="hover:opacity-80" aria-label="Dismiss">x</button>
        </div>
      )}
      {createdToast && (
        <div className="rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 text-[#7C5CFC] px-4 py-3 text-sm flex items-center justify-between">
          <span>{createdToast}</span>
          <button type="button" onClick={() => setCreatedToast(null)} className="hover:opacity-80" aria-label="Dismiss">x</button>
        </div>
      )}

      {/* Replace GL dialogs */}
      {showReplaceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl p-6 max-w-md w-full mx-4 space-y-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Replace GL Data?</h3>
            <p className="text-sm text-gray-400">
              Replacing the GL will reset your trial balance. Account mappings will be preserved.
            </p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowReplaceConfirm(false)} className="px-4 py-2 rounded-lg border border-[#2a2d3e] text-sm text-gray-300 hover:bg-[#232845]">
                Cancel
              </button>
              <button type="button" onClick={() => { setShowReplaceConfirm(false); setShowReplaceUpload(true); }} className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0]">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {showReplaceUpload && !replaceFile && (
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Upload Replacement GL File</h3>
            <button type="button" onClick={() => setShowReplaceUpload(false)} className="text-sm text-gray-400 hover:text-white">Cancel</button>
          </div>
          <FileUploadZone
            onFile={(f) => { setReplaceFile(f); setShowReplaceUpload(false); }}
            title="Drop your new GL export here"
            subtitle="or click to browse"
            hint="This will replace existing GL data for this period"
          />
        </div>
      )}

      {/* === HEADER === */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              {session?.periodLabel ?? ''} Close
            </h1>
            <IntegrityRibbon
              chainIntegrity={chainIntegrity}
              certified={!!certification}
              certifiedBy={certification?.certifiedBy}
              certifiedAt={certification?.certifiedAt}
              snapshotHash={certification?.snapshotHash}
              signature={certification?.signature}
            />
          </div>
          <p className="text-sm text-gray-500">{session?.entityName ?? ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {canReplaceGL(role) && session?.state === 'IN_PROGRESS' && (
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2a2d3e] text-xs text-gray-400 hover:bg-[#1a1d2e] hover:text-white transition-colors"
              onClick={() => setShowReplaceConfirm(true)}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Replace GL
            </button>
          )}
          {!readOnly && (session?.state === 'IN_PROGRESS' || session?.state === 'OPEN') && (
            <Link
              href={ctaHref}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors"
            >
              {ctaLabel} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* === STATUS CARDS === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Progress Card */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Close Progress</span>
            <BarChart3 className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-3xl font-semibold text-white tabular-nums">{progressPct}%</span>
            <span className="text-sm text-gray-500 mb-1">{gatesPassing}/{gatesTotal} gates</span>
          </div>
          <div className="h-2 bg-[#1a1d2e] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background: progressPct === 100 ? '#34D399' : '#7C5CFC',
              }}
            />
          </div>
        </div>

        {/* Timeline Card */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Timeline</span>
            <Clock className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-3xl font-semibold text-white tabular-nums">Day {dayElapsed}</span>
            <span className="text-sm text-gray-500 mb-1">of {targetDays}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              statusLabel === 'On Track' && 'bg-emerald-500/10 text-emerald-400',
              statusLabel === 'Behind' && 'bg-amber-500/10 text-amber-400',
              statusLabel === 'Overdue' && 'bg-red-500/10 text-red-400',
            )}>
              {statusLabel}
            </span>
            {activeStep && (
              <span className="text-xs text-gray-500">Current: {activeStep.label}</span>
            )}
          </div>
        </div>

        {/* Session State Card */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Session State</span>
            <Activity className="w-4 h-4 text-gray-600" />
          </div>
          <div className="mb-3">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
              reviewState === 'IN_PROGRESS' && 'bg-amber-500/10 text-amber-400',
              reviewState === 'UNDER_REVIEW' && 'bg-[#7C5CFC]/10 text-[#7C5CFC]',
              reviewState === 'CERTIFIED' && 'bg-emerald-500/10 text-emerald-400',
              reviewState === 'LOCKED' && 'bg-gray-500/10 text-gray-400',
            )}>
              <span className={cn(
                'w-2 h-2 rounded-full',
                reviewState === 'IN_PROGRESS' && 'bg-amber-400',
                reviewState === 'UNDER_REVIEW' && 'bg-[#7C5CFC]',
                reviewState === 'CERTIFIED' && 'bg-emerald-400',
                reviewState === 'LOCKED' && 'bg-gray-400',
              )} />
              {reviewState.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {attentionItems.length > 0
              ? `${attentionItems.length} item${attentionItems.length !== 1 ? 's' : ''} need attention`
              : 'All tasks complete'}
          </p>
        </div>

        {/* Close Health Score */}
        <CloseHealthScore
          gatesPassing={gatesPassing}
          gatesTotal={gatesTotal}
          reconComplete={reconComplete}
          reconTotal={reconTotal}
          aiPendingCount={aiPendingCount}
          chainIntegrity={chainIntegrity}
          overdueItems={attentionItems.length}
        />
      </div>

      {/* === CLOSE PROGRESS WATERFALL === */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-5">Close Pipeline</h2>
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute top-5 left-5 right-5 h-px bg-[#262C48]" />
          <div className="relative flex items-start justify-between">
            {PIPELINE_STEPS.map((step, i) => {
              const status = pipelineStatus[step.id] ?? 'pending';
              return (
                <Link
                  key={step.id}
                  href={`/close/${sessionId}/${step.path}`}
                  className="flex flex-col items-center gap-2 group relative z-10"
                  style={{ width: `${100 / PIPELINE_STEPS.length}%` }}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all',
                    status === 'complete' && 'bg-emerald-500/10 border-emerald-500 text-emerald-400',
                    status === 'active' && 'bg-[#7C5CFC]/10 border-[#7C5CFC] text-[#7C5CFC] ring-4 ring-[#7C5CFC]/10',
                    status === 'pending' && 'bg-[#1a1d2e] border-[#2a2d3e] text-gray-600',
                  )}>
                    {status === 'complete' ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={cn(
                    'text-xs font-medium text-center transition-colors',
                    status === 'complete' && 'text-emerald-400',
                    status === 'active' && 'text-white',
                    status === 'pending' && 'text-gray-600',
                  )}>
                    {step.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* === CLOSE CHECKLIST === */}
      <CloseChecklist
        sessionId={sessionId}
        periodLabel={session?.periodLabel ?? ''}
        reconComplete={reconComplete}
        reconTotal={reconTotal}
        ajeTemplatesPending={ajeTemplatePending}
        statementsGenerated={statementsGenerated}
        varianceUnexplained={varianceUnexplained.length}
        allJePosted={journalEntries.length > 0 && journalEntries.every((e) => e.status === 'posted' || e.status === 'rejected')}
      />

      {/* === GATE STATUS + FINANCIALS === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gate Status */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Gate Status</h2>
            <span className="text-xs text-gray-500 tabular-nums">{gatesPassing}/{gatesTotal} passing</span>
          </div>
          <div className="space-y-1">
            {gatesWithMapping.map((gate) => (
              <Link
                key={gate.id}
                href={(gate.navigateTo ?? '').replace('[sessionId]', sessionId)}
                className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[#1a1d2e] transition-colors group"
              >
                {gate.passing ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-amber-500/50 shrink-0" />
                )}
                <span className="flex-1 text-sm text-gray-300 group-hover:text-white transition-colors">{gate.name}</span>
                <span className="text-xs text-gray-600 font-mono">{gate.detail}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Period Summary</h2>
          {highlights && (highlights.revenue || highlights.totalAssets) ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {highlights.revenue && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Revenue</p>
                    <p className="text-lg font-semibold text-white tabular-nums">{formatMoney(highlights.revenue)}</p>
                  </div>
                )}
                {highlights.netIncome && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Net Income</p>
                    <p className="text-lg font-semibold text-white tabular-nums">{formatMoney(highlights.netIncome)}</p>
                  </div>
                )}
              </div>
              <div className="border-t border-[#262C48] pt-3 grid grid-cols-3 gap-4">
                {highlights.totalAssets && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Assets</p>
                    <p className="text-sm font-medium text-gray-300 tabular-nums">{formatMoney(highlights.totalAssets)}</p>
                  </div>
                )}
                {highlights.totalLiabilities && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Liabilities</p>
                    <p className="text-sm font-medium text-gray-300 tabular-nums">{formatMoney(highlights.totalLiabilities)}</p>
                  </div>
                )}
                {highlights.totalEquity && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Equity</p>
                    <p className="text-sm font-medium text-gray-300 tabular-nums">{formatMoney(highlights.totalEquity)}</p>
                  </div>
                )}
              </div>
              {validation?.allPassing && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 text-xs">
                  <Check className="w-3.5 h-3.5" />
                  A = L + E verified
                </div>
              )}
              {variances.length > 0 && (
                <div className="border-t border-[#262C48] pt-3">
                  <p className="text-xs text-gray-600 mb-2">vs Prior Period</p>
                  <div className="space-y-1">
                    {variances.filter((v) => v.isMaterial).slice(0, 3).map((v) => {
                      const pct = parseFloat(v.changePercent || '0');
                      return (
                        <div key={v.id} className="flex justify-between text-xs">
                          <span className="text-gray-500 truncate mr-2">{v.lineItemName}</span>
                          <span className={cn('font-mono shrink-0', pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-gray-500')}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-600 py-4 text-center">
              Generate financial statements to see period summary
            </div>
          )}
        </div>
      </div>

      {/* === AI INSIGHTS PANEL === */}
      <AIInsightsPanel sessionId={sessionId} />

      {/* === ACTION ITEMS (only if there are items) === */}
      {attentionItems.length > 0 && (
        <div className="bg-[#141829] border border-amber-500/20 rounded-xl p-5">
          <h2 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Needs Attention
          </h2>
          <div className="space-y-2">
            {attentionItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#1a1d2e] transition-colors">
                <span className="text-sm text-gray-300">{item.text}</span>
                <Link href={item.link} className="text-xs text-[#7C5CFC] hover:text-white font-medium flex items-center gap-1 shrink-0">
                  {item.linkLabel} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All clear banner */}
      {attentionItems.length === 0 && gatesTotal > 0 && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-sm">
          <Check className="w-5 h-5 shrink-0" />
          <span className="font-medium">All action items resolved — ready for review.</span>
        </div>
      )}

      {/* === RECENT ACTIVITY === */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Activity</h2>
          <Link href={`/close/${sessionId}/audit-trail`} className="text-xs text-[#7C5CFC] hover:text-white transition-colors">
            View all
          </Link>
        </div>
        {(auditTrail?.events ?? []).length === 0 ? (
          <p className="text-sm text-gray-600 py-2">No recent activity</p>
        ) : (
          <div className="space-y-0">
            {(auditTrail?.events ?? []).map((a, i) => (
              <div key={a.id} className={cn(
                'flex items-start gap-4 py-3',
                i < (auditTrail?.events ?? []).length - 1 && 'border-b border-[#1e2135]'
              )}>
                <div className="w-8 h-8 rounded-full bg-[#1a1d2e] border border-[#262C48] flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300">{a.description || a.eventType}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {a.userName ?? a.userId ?? 'System'} · {formatRelativeTime(a.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
