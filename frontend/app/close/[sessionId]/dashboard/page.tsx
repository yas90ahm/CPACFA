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
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { cn } from '@/lib/utils';
import { Check, Circle, ArrowRight, Zap, AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { OpenStateDashboard } from './OpenStateDashboard';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { GLUploadFlow } from './GLUploadFlow';
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

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const PIPELINE_STEPS = [
  { id: 'upload', label: 'Upload', path: 'trial-balance' },
  { id: 'map', label: 'Map', path: 'mapping' },
  { id: 'recon', label: 'Recon', path: 'reconciliation' },
  { id: 'adjust', label: 'Adjust', path: 'adjustments' },
  { id: 'generate', label: 'Prepare', path: 'statements' },
  { id: 'variance', label: 'Variance', path: 'variance' },
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
  const { data: auditTrail } = useAuditTrail(sessionId, { limit: 8 });
  const { mappedCount, unmappedCount, rows: tbRows } = useTrialBalanceContext();

  // Wait for session to load before rendering anything
  if (!session) {
    return (
      <div className="space-y-6">
        <div className="bg-surface border border-border rounded-card p-7 animate-pulse">
          <div className="h-6 w-48 bg-elevated rounded mb-2" />
          <div className="h-4 w-32 bg-elevated rounded mb-5" />
          <div className="h-3.5 bg-elevated rounded-full mb-5" />
          <div className="flex gap-6">
            <div className="h-4 w-24 bg-elevated rounded" />
            <div className="h-4 w-32 bg-elevated rounded" />
            <div className="h-4 w-20 bg-elevated rounded" />
          </div>
        </div>
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

  // GL Replace flow: show upload flow when a replacement file has been selected
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
          onComplete={() => {
            setReplaceFile(null);
          }}
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
  const ajeApprovedNotPosted = journalEntries.find((e) => e.status === 'approved');
  const ajeRejected = journalEntries.find((e) => e.status === 'rejected');
  const totalAccounts = tbRows.length;
  const mappingGatePassing = totalAccounts > 0 && unmappedCount === 0;

  // Derive gate data
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

  // Derive pipeline step statuses
  const pipelineStatus: Record<string, 'complete' | 'active' | 'pending'> = {};
  pipelineStatus.upload = 'complete'; // Always complete once past OPEN state
  pipelineStatus.map = mappingGatePassing ? 'complete' : totalAccounts > 0 ? 'active' : 'pending';
  pipelineStatus.recon = reconTotal > 0 && reconComplete === reconTotal ? 'complete' : reconTotal > 0 ? 'active' : 'pending';
  pipelineStatus.adjust = ajeTemplateTotal > 0 && ajeTemplatePending === 0 ? 'complete' : ajeTemplateTotal > 0 ? 'active' : 'pending';
  pipelineStatus.generate = statementsGenerated && !statementsStale ? 'complete' : statementsGenerated ? 'active' : 'pending';
  pipelineStatus.variance = varianceMaterialTotal > 0 && varianceUnexplained.length === 0 ? 'complete' : varianceMaterialTotal > 0 ? 'active' : 'pending';
  const reviewState = session?.state ?? 'IN_PROGRESS';
  pipelineStatus.review = reviewState === 'UNDER_REVIEW' || reviewState === 'CERTIFIED' || reviewState === 'LOCKED' ? 'complete' : 'pending';
  pipelineStatus.certify = reviewState === 'CERTIFIED' || reviewState === 'LOCKED' ? 'complete' : reviewState === 'UNDER_REVIEW' ? 'active' : 'pending';

  // Financial highlights from statements
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

  // Validation checks
  const validationChecks = validation?.checks ?? [];
  const balanceEquation = highlights?.totalAssets && highlights?.totalLiabilities && highlights?.totalEquity;

  // "What Needs Attention" items
  const attentionItems: { icon: 'warn' | 'ok'; text: string; link: string; linkLabel: string }[] = [];
  if (unmappedCount > 0) attentionItems.push({ icon: 'warn', text: `${unmappedCount} accounts unmapped`, link: `/close/${sessionId}/mapping?unmapped=1`, linkLabel: 'Go to Mapping' });
  if (reconTotal > 0 && reconComplete < reconTotal) attentionItems.push({ icon: 'warn', text: `${reconTotal - reconComplete} reconciliations incomplete`, link: `/close/${sessionId}/reconciliation`, linkLabel: 'Go to Recon' });
  if (ajeTemplatePending > 0) attentionItems.push({ icon: 'warn', text: `${ajeTemplatePending} AJE template${ajeTemplatePending !== 1 ? 's' : ''} not resolved`, link: `/close/${sessionId}/adjustments?tab=templates`, linkLabel: 'Go to Adjustments' });
  if (ajeEntryAwaitingApproval > 0) attentionItems.push({ icon: 'warn', text: `${ajeEntryAwaitingApproval} journal entr${ajeEntryAwaitingApproval !== 1 ? 'ies' : 'y'} awaiting approval`, link: `/close/${sessionId}/adjustments?tab=entries`, linkLabel: 'Go to Adjustments' });
  if (statementsStale) attentionItems.push({ icon: 'warn', text: 'Statements stale — regeneration needed', link: `/close/${sessionId}/statements`, linkLabel: 'Go to Statements' });
  if (varianceUnexplained.length > 0) attentionItems.push({ icon: 'warn', text: `${varianceUnexplained.length} material variance${varianceUnexplained.length !== 1 ? 's' : ''} unexplained`, link: `/close/${sessionId}/variance`, linkLabel: 'Go to Variance' });
  // "OK" items
  if (totalAccounts > 0 && unmappedCount === 0) attentionItems.push({ icon: 'ok', text: 'All accounts mapped', link: '', linkLabel: '' });
  if (reconTotal > 0 && reconComplete === reconTotal) attentionItems.push({ icon: 'ok', text: 'All reconciliations complete', link: '', linkLabel: '' });
  if (journalEntries.length > 0 && journalEntries.every((e) => e.status === 'posted')) attentionItems.push({ icon: 'ok', text: 'All journal entries posted', link: '', linkLabel: '' });

  return (
    <div className="space-y-6">
      {/* Ingest toast */}
      {ingestToast && (
        <div className="rounded-input border border-status-green bg-status-green-dim text-status-green px-4 py-3 text-sm flex items-center justify-between">
          <span>{ingestToast}</span>
          <button type="button" onClick={() => setIngestToast(null)} className="text-status-green hover:opacity-80" aria-label="Dismiss">×</button>
        </div>
      )}

      {createdToast && (
        <div className="rounded-input border border-accent bg-accent-dim text-accent px-4 py-3 text-sm flex items-center justify-between">
          <span>{createdToast}</span>
          <button type="button" onClick={() => setCreatedToast(null)} className="text-accent hover:opacity-80" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Replace GL confirmation dialog */}
      {showReplaceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-border rounded-card p-6 max-w-md w-full mx-4 space-y-4 shadow-lg">
            <h3 className="text-lg font-display text-primary">Replace GL Data?</h3>
            <p className="text-sm text-text-secondary">
              Replacing the GL will reset your trial balance. Account mappings will be preserved. Any reconciliations in progress may need to be re-verified.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReplaceConfirm(false);
                  // Show file upload zone inline — we use a temporary state
                  setReplaceFile(null);
                  // We need to show the upload zone; set a flag
                  setShowReplaceUpload(true);
                }}
                className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace GL file upload zone */}
      {showReplaceUpload && !replaceFile && (
        <div className="bg-surface border border-border rounded-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary">Upload Replacement GL File</h3>
            <button type="button" onClick={() => setShowReplaceUpload(false)} className="text-sm text-text-secondary hover:text-primary">Cancel</button>
          </div>
          <FileUploadZone
            onFile={(f) => {
              setReplaceFile(f);
              setShowReplaceUpload(false);
            }}
            title="Drop your new GL export here"
            subtitle="or click to browse"
            hint="This will replace existing GL data for this period"
          />
        </div>
      )}

      {/* Hero Progress Card */}
      {(() => {
        const progressPct = gatesTotal > 0 ? Math.round((gatesPassing / gatesTotal) * 100) : 0;
        const startDate = session?.startedAt ?? session?.createdAt;
        const dayElapsed = startDate ? Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / 86400000)) : 1;
        const targetDays = 10;
        const statusLabel = dayElapsed <= targetDays * 0.7 ? 'On Track' : dayElapsed <= targetDays ? 'Behind' : 'Overdue';
        const statusColor = statusLabel === 'On Track' ? 'text-status-green' : statusLabel === 'Behind' ? 'text-status-amber' : 'text-status-red';
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

        return (
          <section className="bg-[#1a1d23] border border-border/60 rounded-card p-7 shadow-lg">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h1 className="text-2xl font-display text-white">
                  {session?.periodLabel ?? ''} Close
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">{session?.entityName ?? ''}</p>
              </div>
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90"
              >
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="flex items-center gap-4 mb-5">
              <div className="flex-1 h-3.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-2xl font-bold text-white tabular-nums">{progressPct}%</span>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-400">
                Day <span className="text-white font-medium">{dayElapsed}</span> of {targetDays}
              </span>
              <span className="text-gray-400">
                <span className="text-white font-medium">{gatesPassing}</span> of {gatesTotal} gates passing
              </span>
              <span className={cn('font-medium', statusColor)}>{statusLabel}</span>
            </div>
          </section>
        );
      })()}

      {/* Page header with Prepare Close button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-primary">{session?.periodLabel ?? ''} Close</h1>
          <p className="text-sm text-text-secondary mt-0.5">Status: {session?.state?.replace('_', ' ') ?? 'IN PROGRESS'}</p>
        </div>
        <div className="flex items-center gap-3">
          {canReplaceGL(role) && session?.state === 'IN_PROGRESS' && (
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-input border border-border text-xs font-medium text-text-secondary hover:bg-hover hover:text-primary"
              onClick={() => setShowReplaceConfirm(true)}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Replace GL Data
            </button>
          )}
          {!readOnly && (session?.state === 'IN_PROGRESS' || session?.state === 'OPEN') && (
            <button
              type="button"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90"
              onClick={() => {
                const firstIncomplete = PIPELINE_STEPS.find((s) => pipelineStatus[s.id] !== 'complete');
                if (firstIncomplete) {
                  window.location.href = `/close/${sessionId}/${firstIncomplete.path}`;
                }
              }}
            >
              <Zap className="w-4 h-4" /> Prepare Close
            </button>
          )}
        </div>
      </div>

      {/* Pipeline visualization */}
      <section className="bg-surface border border-border rounded-card p-5">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-4">Pipeline</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STEPS.map((step, i) => {
            const status = pipelineStatus[step.id] ?? 'pending';
            return (
              <div key={step.id} className="flex items-center gap-1 shrink-0">
                <Link
                  href={`/close/${sessionId}/${step.path}`}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-input text-xs font-medium transition-colors',
                    status === 'complete' && 'bg-status-green-dim text-status-green',
                    status === 'active' && 'bg-accent-dim text-accent ring-1 ring-accent/30',
                    status === 'pending' && 'bg-elevated text-text-tertiary',
                  )}
                >
                  {status === 'complete' && <Check className="w-3 h-3" />}
                  {status === 'active' && <Circle className="w-3 h-3 fill-current" />}
                  {status === 'pending' && <Circle className="w-3 h-3" />}
                  {step.label}
                </Link>
                {i < PIPELINE_STEPS.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Action Items */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">Action Items</h2>
          <span className="text-xs text-text-tertiary">
            {attentionItems.filter((i) => i.icon === 'ok').length} of {attentionItems.length} complete
          </span>
        </div>
        {attentionItems.filter((i) => i.icon === 'warn').length === 0 && attentionItems.length > 0 ? (
          <div className="bg-status-green-dim border border-status-green/30 rounded-card p-4 flex items-center gap-3 text-sm text-status-green">
            <Check className="w-5 h-5 shrink-0" />
            <span className="font-medium">All action items resolved — ready for review.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attentionItems.filter((i) => i.icon === 'warn').map((item, i) => (
              <Link
                key={i}
                href={item.link}
                className="bg-surface border border-border rounded-card p-4 hover:border-accent transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-status-amber shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">{item.text}</p>
                    <p className="text-xs text-accent mt-1 flex items-center gap-1 group-hover:underline">
                      {item.linkLabel} <ArrowRight className="w-3 h-3" />
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Gate Status + Period Summary side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gate Status */}
        <section className="bg-surface border border-border rounded-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">Gate Status</h2>
            <span className="text-sm font-mono text-primary">{gatesPassing} of {gatesTotal} passing</span>
          </div>
          <div className="h-1.5 bg-elevated rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-status-green rounded-full transition-all" style={{ width: `${gatesTotal > 0 ? (gatesPassing / gatesTotal) * 100 : 0}%` }} />
          </div>
          <ul className="space-y-1.5">
            {gatesWithMapping.map((gate) => (
              <li key={gate.id}>
                <Link
                  href={(gate.navigateTo ?? '').replace('[sessionId]', sessionId)}
                  className="flex items-center gap-2.5 py-1.5 px-2 rounded-input hover:bg-hover text-sm"
                >
                  {gate.passing ? (
                    <Check className="w-4 h-4 text-status-green shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 border-status-amber shrink-0" />
                  )}
                  <span className="flex-1 text-primary">{gate.name}</span>
                  <span className="text-xs text-text-secondary font-mono">{gate.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Period Summary */}
        <section className="bg-surface border border-border rounded-card p-5">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-4">Period Summary</h2>
          {highlights && (highlights.revenue || highlights.totalAssets) ? (
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                {highlights.revenue && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Total Revenue</dt>
                    <dd className="font-mono text-primary">{formatMoney(highlights.revenue)}</dd>
                  </div>
                )}
                {highlights.netIncome && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Net Income</dt>
                    <dd className="font-mono text-primary">{formatMoney(highlights.netIncome)}</dd>
                  </div>
                )}
                <div className="border-t border-border-light my-1" />
                {highlights.totalAssets && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Total Assets</dt>
                    <dd className="font-mono text-primary">{formatMoney(highlights.totalAssets)}</dd>
                  </div>
                )}
                {highlights.totalLiabilities && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Total Liabilities</dt>
                    <dd className="font-mono text-primary">{formatMoney(highlights.totalLiabilities)}</dd>
                  </div>
                )}
                {highlights.totalEquity && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Total Equity</dt>
                    <dd className="font-mono text-primary">{formatMoney(highlights.totalEquity)}</dd>
                  </div>
                )}
              </dl>
              {balanceEquation && (
                <div className={cn(
                  'flex items-center gap-2 text-xs px-3 py-2 rounded-input',
                  validation?.allPassing ? 'bg-status-green-dim text-status-green' : 'bg-surface-alt text-text-secondary'
                )}>
                  {validation?.allPassing && <Check className="w-3.5 h-3.5" />}
                  A = L + E {validation?.allPassing ? ' — verified' : ''}
                </div>
              )}
              {/* Prior period comparison from variance data */}
              {variances.length > 0 && (
                <div className="pt-2 border-t border-border-light">
                  <p className="text-xs text-text-tertiary mb-2">vs Prior Period:</p>
                  <div className="space-y-1">
                    {variances.filter((v) => v.isMaterial).slice(0, 3).map((v) => {
                      const pct = parseFloat(v.changePercent || '0');
                      const isUp = pct > 0;
                      return (
                        <div key={v.id} className="flex justify-between text-xs">
                          <span className="text-text-secondary truncate mr-2">{v.lineItemName}</span>
                          <span className={cn('font-mono shrink-0', isUp ? 'text-status-green' : pct < 0 ? 'text-status-red' : 'text-text-secondary')}>
                            {isUp ? '+' : ''}{pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">Generate financial statements to see period summary.</p>
          )}
        </section>
      </div>

      {/* Recent Activity */}
      <section className="bg-surface border border-border rounded-card p-5">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-4">Recent Activity</h2>
        <ul className="space-y-2">
          {(auditTrail?.events ?? []).length === 0 ? (
            <li className="text-sm text-text-tertiary">No recent activity</li>
          ) : (
            (auditTrail?.events ?? []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm py-1">
                <span className="text-xs font-mono text-text-tertiary w-16 shrink-0 pt-0.5">{formatTime(a.timestamp)}</span>
                <span className="text-text-secondary">{a.userName ?? a.userId ?? 'System'}</span>
                <span className="text-primary flex-1">{a.description || a.eventType}</span>
              </li>
            ))
          )}
        </ul>
        <Link href={`/close/${sessionId}/audit-trail`} className="mt-3 inline-block text-xs text-accent hover:underline">
          View full audit trail
        </Link>
      </section>
    </div>
  );
}
