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
import { useAuth } from '@/lib/auth';
import { canReplaceGL, isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { OperatingPartnerDashboard } from '@/components/dashboards/OperatingPartnerDashboard';
import { ReviewerDashboard } from '@/components/dashboards/ReviewerDashboard';
import { FundControllerDashboard } from '@/components/dashboards/FundControllerDashboard';
import { GLUploadFlow } from './GLUploadFlow';
import { OpenStateDashboard } from './OpenStateDashboard';
import { PipelineStepper } from '@/components/shared/PipelineStepper';
import type { PipelineStep } from '@/components/shared/PipelineStepper';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { GateIndicator } from '@/components/shared/GateIndicator';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { EmptyState } from '@/components/shared/EmptyState';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  RefreshCw,
  Zap,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* -------------------------------------------------------------------------- */
/*  Pipeline steps                                                             */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Progress ring                                                              */
/* -------------------------------------------------------------------------- */

function ProgressRing({
  value,
  max,
  size = 48,
  strokeWidth = 4,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? value / max : 0;
  const offset = circumference * (1 - pct);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0"
      aria-label={`Day ${value} of ${max}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--interactive-primary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        style={{
          fill: 'var(--text-primary)',
          fontSize: size * 0.22,
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        {value}
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  State-to-StatusBadge mapping                                               */
/* -------------------------------------------------------------------------- */

function sessionStateToBadge(state: string | undefined) {
  switch (state) {
    case 'OPEN':
      return { status: 'not-started' as const, label: 'OPEN' };
    case 'IN_PROGRESS':
      return { status: 'in-progress' as const, label: 'IN PROGRESS' };
    case 'UNDER_REVIEW':
      return { status: 'pending' as const, label: 'UNDER REVIEW' };
    case 'CERTIFIED':
      return { status: 'certified' as const, label: 'CERTIFIED' };
    case 'LOCKED':
      return { status: 'locked' as const, label: 'LOCKED' };
    default:
      return { status: 'not-started' as const, label: state ?? '' };
  }
}

/* -------------------------------------------------------------------------- */
/*  Card wrapper                                                               */
/* -------------------------------------------------------------------------- */

function Card({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn('rounded-lg', className)}
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center justify-between', className)}
      style={{ padding: '20px 24px' }}
    >
      {children}
    </div>
  );
}

function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className} style={{ padding: '0 24px 24px' }}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function CloseDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const role = user?.role ?? 'controller';
  const readOnly = isRoleReadOnly(role);

  // Data hooks
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { data: stmtData } = useStatements(sessionId);
  const { data: validation } = useValidation(sessionId);
  const { data: auditTrail } = useAuditTrail(sessionId, { limit: 8 });
  const { mappedCount, unmappedCount, rows: tbRows } = useTrialBalanceContext();

  // Local state
  const [ingestToast, setIngestToast] = useState<string | null>(null);
  const [createdToast, setCreatedToast] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [showReplaceUpload, setShowReplaceUpload] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // Search param handling
  const ingested = searchParams.get('ingested') === '1';
  const justCreated = searchParams.get('created') === '1';
  const accountsParam = searchParams.get('accounts') ?? '52';
  const unmappedParam = searchParams.get('unmapped') ?? '5';
  const effectiveState = session?.state;

  useEffect(() => {
    if (!ingested) return;
    setIngestToast(
      `GL imported — ${accountsParam} accounts, trial balance balanced. ${unmappedParam} accounts need mapping.`
    );
    const u = new URL(window.location.href);
    u.searchParams.delete('ingested');
    u.searchParams.delete('accounts');
    u.searchParams.delete('unmapped');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [ingested, accountsParam, unmappedParam]);

  useEffect(() => {
    if (!justCreated || !session) return;
    const periodLabel = session.periodLabel ?? 'this period';
    setCreatedToast(
      `Session created for ${periodLabel}. Prior period account mappings and AJE templates will carry forward automatically.`
    );
    const u = new URL(window.location.href);
    u.searchParams.delete('created');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [justCreated, session]);

  // Financial highlights from statements
  const highlights = useMemo(() => {
    if (!stmtData) return null;
    const findLine = (
      lines: {
        lineItemName: string;
        amount: string;
        priorAmount?: string;
        isGrandTotal?: boolean;
        isSubtotal?: boolean;
      }[],
      pattern: RegExp
    ) => {
      return (
        lines.find((l) => l.isGrandTotal && pattern.test(l.lineItemName)) ??
        lines.find((l) => l.isSubtotal && pattern.test(l.lineItemName)) ??
        lines.find((l) => pattern.test(l.lineItemName))
      );
    };
    const isLines = stmtData.incomeStatement?.lines ?? [];
    const bsLines = stmtData.balanceSheet?.lines ?? [];
    const revLine = findLine(isLines, /revenue|sales/i);
    const gpLine = findLine(isLines, /gross profit/i);
    const opLine = findLine(isLines, /operating income|income from operations/i);
    const ebitdaLine = findLine(isLines, /ebitda/i);
    const niLine = findLine(isLines, /net income|net income \(loss\)/i);
    return {
      revenue: revLine ? { amount: revLine.amount, prior: revLine.priorAmount } : null,
      grossProfit: gpLine ? { amount: gpLine.amount, prior: gpLine.priorAmount } : null,
      operatingIncome: opLine ? { amount: opLine.amount, prior: opLine.priorAmount } : null,
      ebitda: ebitdaLine ? { amount: ebitdaLine.amount, prior: ebitdaLine.priorAmount } : null,
      netIncome: niLine ? { amount: niLine.amount, prior: niLine.priorAmount } : null,
      totalAssets: findLine(bsLines, /total assets/i)?.amount ?? null,
      totalLiabilities: findLine(bsLines, /total liabilities/i)?.amount ?? null,
      totalEquity: findLine(bsLines, /total equity|stockholders'? equity/i)?.amount ?? null,
    };
  }, [stmtData]);

  // Derived stats
  const totalAccounts = tbRows.length;
  const statementsGenerated = !!session?.statementsGeneratedAt;
  const statementsStale = session?.statementsStale ?? false;
  const reconTotal = reconciliations.length;
  const reconComplete = reconciliations.filter(
    (r) => r.status === 'completed' || r.status === 'approved'
  ).length;
  const ajeTemplatePending = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const ajeTemplateResolved = ajeTemplates.filter(
    (t) => t.periodStatus === 'applied' || t.periodStatus === 'skipped'
  ).length;
  const ajeTemplateTotal = ajeTemplates.length;
  const varianceMaterialTotal = variances.filter((v) => v.isMaterial).length;
  const varianceExplainedCount = variances.filter(
    (v) =>
      v.isMaterial && (v.explanationStatus === 'explained' || v.explanationStatus === 'approved')
  ).length;
  const varianceUnexplained = variances.filter(
    (v) => v.isMaterial && v.explanationStatus === 'pending'
  );
  const mappingGatePassing = totalAccounts > 0 && unmappedCount === 0;

  // Gates
  const gatesBase = readiness?.gates ?? [];
  const gatesWithMapping = gatesBase.map((g) => {
    if (g.id === 'all_accounts_mapped')
      return { ...g, passing: mappingGatePassing, detail: `${mappedCount}/${totalAccounts} mapped` };
    if (g.id === 'recons_complete')
      return {
        ...g,
        passing: reconTotal > 0 && reconComplete === reconTotal,
        detail: `${reconComplete}/${reconTotal} complete`,
      };
    if (g.id === 'templates_resolved')
      return {
        ...g,
        passing: ajeTemplatePending === 0,
        detail:
          ajeTemplateTotal === 0
            ? 'No templates'
            : `${ajeTemplateResolved}/${ajeTemplateTotal} resolved`,
      };
    if (g.id === 'statements_current')
      return {
        ...g,
        passing: statementsGenerated && !statementsStale,
        detail: statementsStale
          ? 'Stale — regenerate'
          : statementsGenerated
            ? 'Generated'
            : 'Not generated',
      };
    if (g.id === 'variances_explained') {
      const varPassing = statementsGenerated
        ? varianceMaterialTotal === 0 || varianceUnexplained.length === 0
        : false;
      const varDetail = !statementsGenerated
        ? 'Generate statements first'
        : `${varianceExplainedCount}/${varianceMaterialTotal} explained`;
      return { ...g, passing: varPassing, detail: varDetail };
    }
    return g;
  });
  const gatesPassing = gatesWithMapping.filter((g) => g.passing).length;
  const gatesTotal = gatesWithMapping.length;

  // Pipeline step statuses
  const pipelineStatus: Record<string, 'complete' | 'active' | 'pending' | 'error'> = {};
  pipelineStatus.upload = 'complete';
  pipelineStatus.map = mappingGatePassing ? 'complete' : totalAccounts > 0 ? 'active' : 'pending';
  pipelineStatus.recon =
    reconTotal > 0 && reconComplete === reconTotal
      ? 'complete'
      : reconTotal > 0
        ? 'active'
        : 'pending';
  pipelineStatus.adjust =
    ajeTemplateTotal > 0 && ajeTemplatePending === 0
      ? 'complete'
      : ajeTemplateTotal > 0
        ? 'active'
        : 'pending';
  pipelineStatus.generate =
    statementsGenerated && !statementsStale ? 'complete' : statementsGenerated ? 'active' : 'pending';
  pipelineStatus.variance =
    varianceMaterialTotal > 0 && varianceUnexplained.length === 0
      ? 'complete'
      : varianceMaterialTotal > 0
        ? 'active'
        : 'pending';
  const reviewState = session?.state ?? 'IN_PROGRESS';
  pipelineStatus.review =
    reviewState === 'UNDER_REVIEW' ||
    reviewState === 'CERTIFIED' ||
    reviewState === 'LOCKED'
      ? 'complete'
      : 'pending';
  pipelineStatus.certify =
    reviewState === 'CERTIFIED' || reviewState === 'LOCKED'
      ? 'complete'
      : reviewState === 'UNDER_REVIEW'
        ? 'active'
        : 'pending';

  const stepperSteps: PipelineStep[] = PIPELINE_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    status: pipelineStatus[s.id] ?? 'pending',
  }));

  // Day tracking
  const startDate = session?.startedAt ?? session?.createdAt;
  const dayElapsed = startDate
    ? Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / 86400000))
    : 1;
  const targetDays = 10;

  // Attention items from issues
  const activeIssues = issues.filter(
    (i) => i.status !== 'RESOLVED' && i.severity !== 'INFO'
  );

  // Validation
  const balanceVerified = validation?.allPassing ?? false;

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Loading skeleton                                                         */
  /* ────────────────────────────────────────────────────────────────────────── */

  if (!session) {
    return (
      <div className="space-y-6">
        <Card>
          <div style={{ padding: '20px 24px' }} className="animate-pulse">
            <div
              className="h-6 w-48 rounded mb-2"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            />
            <div
              className="h-4 w-32 rounded mb-5"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            />
            <div
              className="h-3.5 rounded-full mb-5"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            />
            <div className="flex gap-6">
              <div
                className="h-4 w-24 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              />
              <div
                className="h-4 w-32 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              />
              <div
                className="h-4 w-20 rounded"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  OPEN state: GL Upload Flow                                               */
  /* ────────────────────────────────────────────────────────────────────────── */

  if (effectiveState === 'OPEN') {
    return (
      <OpenStateDashboard
        sessionId={sessionId}
        periodLabel={session?.periodLabel ?? ''}
        entityName={session?.entityName ?? ''}
      />
    );
  }

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Role-based dashboard routing                                             */
  /* ────────────────────────────────────────────────────────────────────────── */

  if (role === 'operating_partner') {
    return <OperatingPartnerDashboard />;
  }
  if (
    (role === 'reviewer' || role === 'admin') &&
    effectiveState === 'UNDER_REVIEW'
  ) {
    return <ReviewerDashboard sessionId={sessionId} />;
  }
  if (role === 'fund_controller') {
    return <FundControllerDashboard />;
  }

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  GL Replace flow                                                          */
  /* ────────────────────────────────────────────────────────────────────────── */

  if (replaceFile) {
    return (
      <div className="max-w-2xl space-y-8">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Replace GL Data — {session?.periodLabel ?? ''}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Uploading a new GL will replace existing data. Account mappings will be preserved.
          </p>
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

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Financial summary line items                                             */
  /* ────────────────────────────────────────────────────────────────────────── */

  const financialLines: {
    label: string;
    amount: string | null;
    prior?: string;
    variant?: 'line-item' | 'subtotal' | 'total';
  }[] = [
    {
      label: 'Revenue',
      amount: highlights?.revenue?.amount ?? null,
      prior: highlights?.revenue?.prior,
      variant: 'line-item',
    },
    {
      label: 'Gross Profit',
      amount: highlights?.grossProfit?.amount ?? null,
      prior: highlights?.grossProfit?.prior,
      variant: 'subtotal',
    },
    {
      label: 'Operating Income',
      amount: highlights?.operatingIncome?.amount ?? null,
      prior: highlights?.operatingIncome?.prior,
      variant: 'subtotal',
    },
    {
      label: 'EBITDA',
      amount: highlights?.ebitda?.amount ?? null,
      prior: highlights?.ebitda?.prior,
      variant: 'subtotal',
    },
    {
      label: 'Net Income',
      amount: highlights?.netIncome?.amount ?? null,
      prior: highlights?.netIncome?.prior,
      variant: 'total',
    },
  ];

  const hasFinancials = financialLines.some((l) => l.amount !== null);

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Main controller dashboard (12-column grid)                               */
  /* ────────────────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Toasts */}
      {ingestToast && (
        <div
          className="flex items-center justify-between px-4 py-3 text-sm"
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--status-success)',
            backgroundColor: 'var(--status-success-bg)',
            color: 'var(--status-success)',
          }}
        >
          <span>{ingestToast}</span>
          <button
            type="button"
            onClick={() => setIngestToast(null)}
            style={{ color: 'var(--status-success)' }}
            className="hover:opacity-80"
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      )}

      {createdToast && (
        <div
          className="flex items-center justify-between px-4 py-3 text-sm"
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--interactive-primary)',
            backgroundColor: 'var(--status-info-bg)',
            color: 'var(--interactive-primary)',
          }}
        >
          <span>{createdToast}</span>
          <button
            type="button"
            onClick={() => setCreatedToast(null)}
            style={{ color: 'var(--interactive-primary)' }}
            className="hover:opacity-80"
            aria-label="Dismiss"
          >
            x
          </button>
        </div>
      )}

      {/* Replace GL confirmation dialog */}
      {showReplaceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="max-w-md w-full mx-4 space-y-4" style={{ padding: 24 }}>
            <h3
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Replace GL Data?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Replacing the GL will reset your trial balance. Account mappings will be
              preserved. Any reconciliations in progress may need to be re-verified.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                className="px-4 py-2 text-sm font-medium"
                style={{
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReplaceConfirm(false);
                  setReplaceFile(null);
                  setShowReplaceUpload(true);
                }}
                className="px-4 py-2 text-sm font-medium text-white"
                style={{
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--interactive-primary)',
                }}
              >
                Continue
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Replace GL file upload zone */}
      {showReplaceUpload && !replaceFile && (
        <Card>
          <CardHeader>
            <h3
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Upload Replacement GL File
            </h3>
            <button
              type="button"
              onClick={() => setShowReplaceUpload(false)}
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </CardHeader>
          <CardBody>
            <FileUploadZone
              onFile={(f) => {
                setReplaceFile(f);
                setShowReplaceUpload(false);
              }}
              title="Drop your new GL export here"
              subtitle="or click to browse"
              hint="This will replace existing GL data for this period"
            />
          </CardBody>
        </Card>
      )}

      {/* ================================================================== */}
      {/*  ROW 1: Period Header (full width, 12 cols)                        */}
      {/* ================================================================== */}
      <section
        className="grid grid-cols-12 gap-6 items-center"
        style={{ minHeight: 72 }}
      >
        {/* Left: Period name + entity + status badge */}
        <div className="col-span-12 lg:col-span-5 flex items-center gap-4">
          <div>
            <h1
              className="font-semibold leading-tight"
              style={{
                fontSize: 24,
                color: 'var(--text-primary)',
              }}
            >
              {session?.periodLabel ?? ''} Close
            </h1>
            <p
              className="mt-0.5"
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
              }}
            >
              {session?.entityName ?? ''}
            </p>
          </div>
          <StatusBadge {...sessionStateToBadge(effectiveState)} />
        </div>

        {/* Right: Day progress ring + Pipeline stepper */}
        <div className="col-span-12 lg:col-span-7 flex items-center gap-5 justify-end flex-wrap">
          <div className="flex items-center gap-2">
            <ProgressRing value={dayElapsed} max={targetDays} size={48} strokeWidth={4} />
            <span
              className="text-sm whitespace-nowrap"
              style={{ color: 'var(--text-secondary)' }}
            >
              Day {dayElapsed} of {targetDays}
            </span>
          </div>
          <PipelineStepper
            steps={stepperSteps}
            compact={false}
            interactive
            sessionId={sessionId}
            onStepClick={(stepId) => {
              const step = PIPELINE_STEPS.find((s) => s.id === stepId);
              if (step) {
                window.location.href = `/close/${sessionId}/${step.path}`;
              }
            }}
          />
          {/* Replace GL button */}
          {canReplaceGL(role) && session?.state === 'IN_PROGRESS' && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-surface)',
              }}
              onClick={() => setShowReplaceConfirm(true)}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Replace GL
            </button>
          )}
        </div>
      </section>

      {/* ================================================================== */}
      {/*  ROW 2: Attention Panel (8 cols) + Quick Stats (4 cols)            */}
      {/* ================================================================== */}
      <section className="grid grid-cols-12 gap-6">
        {/* Attention Panel */}
        <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <h2
                  className="font-semibold"
                  style={{ fontSize: 16, color: 'var(--text-primary)' }}
                >
                  Needs Your Attention
                </h2>
                {activeIssues.length > 0 && (
                  <span
                    className="inline-flex items-center justify-center text-xs font-bold text-white"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: 'var(--status-error)',
                      fontSize: 11,
                    }}
                  >
                    {activeIssues.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody>
              {activeIssues.length === 0 ? (
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--status-success-bg)',
                    color: 'var(--status-success)',
                  }}
                >
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">
                    All clear — no items need attention
                  </span>
                </div>
              ) : (
                <ul className="space-y-1">
                  {activeIssues.map((issue, i) => (
                    <li key={issue.id ?? i}>
                      <Link
                        href={issue.navigateTo ?? `/close/${sessionId}/dashboard`}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-md transition-colors group"
                        style={{
                          borderRadius: 'var(--radius-md)',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'var(--bg-elevated)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'transparent';
                        }}
                      >
                        <AlertTriangle
                          className="w-4 h-4 flex-shrink-0 mt-0.5"
                          style={{
                            color:
                              issue.severity === 'CRITICAL' || issue.severity === 'BLOCKING'
                                ? 'var(--status-error)'
                                : 'var(--status-warning)',
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {issue.title ?? issue.description ?? issue.category}
                          </p>
                          {issue.description && issue.title && (
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {issue.description}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-xs font-medium flex items-center gap-1 flex-shrink-0 mt-0.5"
                          style={{ color: 'var(--text-link)' }}
                        >
                          Resolve <ArrowRight className="w-3 h-3" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Quick Stats (4 stacked cards) */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          {/* Gates Passing */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <p
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Gates Passing
              </p>
              <p
                className="text-xl font-bold tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {gatesPassing}{' '}
                <span
                  className="text-sm font-normal"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  / {gatesTotal}
                </span>
              </p>
              <div
                className="mt-2 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${gatesTotal > 0 ? (gatesPassing / gatesTotal) * 100 : 0}%`,
                    backgroundColor:
                      gatesPassing === gatesTotal
                        ? 'var(--status-success)'
                        : 'var(--interactive-primary)',
                  }}
                />
              </div>
            </div>
          </Card>

          {/* Accounts Mapped */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <p
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Accounts Mapped
              </p>
              <p
                className="text-xl font-bold tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {mappedCount}{' '}
                <span
                  className="text-sm font-normal"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  / {mappedCount + unmappedCount}
                </span>
              </p>
              <div
                className="mt-2 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      mappedCount + unmappedCount > 0
                        ? (mappedCount / (mappedCount + unmappedCount)) * 100
                        : 0
                    }%`,
                    backgroundColor:
                      unmappedCount === 0
                        ? 'var(--status-success)'
                        : 'var(--interactive-primary)',
                  }}
                />
              </div>
            </div>
          </Card>

          {/* Recons Complete */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <p
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Recons Complete
              </p>
              <p
                className="text-xl font-bold tabular-nums"
                style={{ color: 'var(--text-primary)' }}
              >
                {reconComplete}{' '}
                <span
                  className="text-sm font-normal"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  / {reconTotal}
                </span>
              </p>
              <div
                className="mt-2 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${reconTotal > 0 ? (reconComplete / reconTotal) * 100 : 0}%`,
                    backgroundColor:
                      reconComplete === reconTotal && reconTotal > 0
                        ? 'var(--status-success)'
                        : 'var(--interactive-primary)',
                  }}
                />
              </div>
            </div>
          </Card>

          {/* Statements */}
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <p
                className="text-xs font-medium uppercase tracking-wide mb-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Statements
              </p>
              <div className="mt-1">
                {statementsGenerated && !statementsStale ? (
                  <StatusBadge status="complete" label="Current" />
                ) : statementsStale ? (
                  <StatusBadge status="pending" label="Stale" />
                ) : (
                  <StatusBadge status="not-started" label="Not Generated" />
                )}
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  ROW 3: Financial Summary (6 cols) + Gate Status (6 cols)          */}
      {/* ================================================================== */}
      <section className="grid grid-cols-12 gap-6">
        {/* Financial Summary */}
        <div className="col-span-12 lg:col-span-6">
          <Card>
            <CardHeader>
              <h2
                className="font-semibold"
                style={{ fontSize: 16, color: 'var(--text-primary)' }}
              >
                Financial Summary
              </h2>
              {balanceVerified && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
                  style={{
                    backgroundColor: 'var(--status-success-bg)',
                    color: 'var(--status-success)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <Check className="w-3 h-3" />
                  A = L + E: Verified
                </span>
              )}
            </CardHeader>
            <CardBody>
              {hasFinancials ? (
                <div className="space-y-0">
                  {/* Table header */}
                  <div
                    className="grid grid-cols-3 gap-4 pb-2 mb-2"
                    style={{ borderBottom: '1px solid var(--border-default)' }}
                  >
                    <span
                      className="text-xs font-medium uppercase tracking-wide"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Line Item
                    </span>
                    <span
                      className="text-xs font-medium uppercase tracking-wide text-right"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Current
                    </span>
                    <span
                      className="text-xs font-medium uppercase tracking-wide text-right"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Prior
                    </span>
                  </div>
                  {financialLines
                    .filter((l) => l.amount !== null)
                    .map((line) => (
                      <div
                        key={line.label}
                        className="grid grid-cols-3 gap-4 py-2"
                        style={{
                          borderBottom:
                            line.variant === 'total'
                              ? 'none'
                              : '1px solid var(--border-default)',
                        }}
                      >
                        <span
                          className={cn(
                            'text-sm',
                            line.variant === 'total' && 'font-bold',
                            line.variant === 'subtotal' && 'font-semibold'
                          )}
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {line.label}
                        </span>
                        <MoneyCell
                          value={line.amount}
                          variant={line.variant ?? 'line-item'}
                          showCurrency
                        />
                        <MoneyCell
                          value={line.prior ?? null}
                          variant="line-item"
                          showCurrency
                          className="opacity-70"
                        />
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No financial data yet"
                  description="Generate financial statements to see summary metrics here."
                  actionLabel="Go to Statements"
                  onAction={() => {
                    window.location.href = `/close/${sessionId}/statements`;
                  }}
                />
              )}
            </CardBody>
          </Card>
        </div>

        {/* Gate Status */}
        <div className="col-span-12 lg:col-span-6">
          <Card>
            <CardHeader>
              <h2
                className="font-semibold"
                style={{ fontSize: 16, color: 'var(--text-primary)' }}
              >
                Gate Status
              </h2>
              <span
                className="text-sm tabular-nums"
                style={{
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {gatesPassing} of {gatesTotal} passing
              </span>
            </CardHeader>
            <CardBody>
              {gatesWithMapping.length > 0 ? (
                <div
                  className="divide-y"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  {gatesWithMapping.map((gate, idx) => (
                    <GateIndicator
                      key={gate.id ?? idx}
                      gateNumber={idx + 1}
                      gateName={gate.name ?? `Gate ${idx + 1}`}
                      status={
                        gate.passing
                          ? 'passed'
                          : gate.detail === 'Not yet evaluated'
                            ? 'not-evaluated'
                            : 'failed'
                      }
                      detail={gate.passing ? (gate.detail as string) : undefined}
                      failureReason={!gate.passing ? (gate.detail as string) : undefined}
                      failureLink={
                        !gate.passing && gate.navigateTo
                          ? (gate.navigateTo as string).replace(
                              '[sessionId]',
                              sessionId
                            )
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <p
                  className="text-sm py-4 text-center"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  No gates configured for this session.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  ROW 4: Recent Activity (full width)                               */}
      {/* ================================================================== */}
      <section className="grid grid-cols-12">
        <div className="col-span-12">
          <Card>
            <CardHeader>
              <h2
                className="font-semibold"
                style={{ fontSize: 16, color: 'var(--text-primary)' }}
              >
                Recent Activity
              </h2>
            </CardHeader>
            <CardBody>
              {(auditTrail?.events ?? []).length === 0 ? (
                <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
                  No recent activity recorded.
                </p>
              ) : (
                <ul className="space-y-1">
                  {(auditTrail?.events ?? []).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 py-2"
                    >
                      <span
                        className="text-xs w-[120px] flex-shrink-0 pt-0.5 tabular-nums"
                        style={{
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {formatDate(entry.timestamp)}
                      </span>
                      <span
                        className="text-sm font-medium flex-shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {entry.userName ?? entry.userId ?? 'System'}
                      </span>
                      <span
                        className="text-sm flex-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {entry.description || entry.eventType}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/close/${sessionId}/audit-trail`}
                className="inline-flex items-center gap-1 text-xs font-medium mt-4"
                style={{ color: 'var(--text-link)' }}
              >
                View full audit trail <ArrowRight className="w-3 h-3" />
              </Link>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}
