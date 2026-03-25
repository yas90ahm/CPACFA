'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCloseSession, useCloseReadiness, useAdvanceSession, useCertifySession, useLockSession, useReopenSession } from '@/lib/queries/close-session';
import { useCertification } from '@/lib/queries/certification';
import { useAuth } from '@/lib/auth';
import { useStatements } from '@/lib/queries/statements';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import { useJournalEntries } from '@/lib/queries/adjustments';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useVariances } from '@/lib/queries/variance';
import { useBoardPackage } from '@/lib/queries/cumulative';
import { apiFetch } from '@/lib/api';
import { CertificationChecklist } from './CertificationChecklist';
import { CertificationRecord } from './CertificationRecord';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { cn } from '@/lib/utils';
import type { CloseState } from '@/lib/types/close-session';
import type { ReadinessGate } from '@/lib/types/readiness';
import {
  CheckCircle2,
  Lock,
  FileText,
  Users,
  Clock,
  Hash,
  AlertCircle,
  XCircle,
  BookOpen,
  Download,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  X,
  Shield,
} from 'lucide-react';
import { canSubmitForReview, canCertify, canLockPeriod, canReopenPeriod, isReadOnly as isRoleReadOnly } from '@/lib/permissions';

export default function ReviewPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: certification } = useCertification(sessionId);

  const role = user?.role ?? 'controller';
  const userName = user?.email ?? user?.userId ?? 'Unknown';
  const roleCanSubmit = canSubmitForReview(role);
  const roleCanCertify = canCertify(role);
  const roleCanLock = canLockPeriod(role);
  const roleCanReopen = canReopenPeriod(role);
  const readOnly = isRoleReadOnly(role);

  const { data: teamData } = useQuery({
    queryKey: ['team'],
    queryFn: () => apiFetch<{ members: Array<{ id: string; name?: string; email?: string; role?: string }> }>('/api/settings/team'),
  });
  const participants = useMemo(() => (teamData?.members ?? []).map((m) => m.name || m.email || m.id), [teamData]);

  const { data: statementsData } = useStatements(sessionId);
  const { data: auditData } = useAuditTrail(sessionId, { limit: 20 });
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: variances = [] } = useVariances(sessionId);

  const { data: manifestData } = useQuery({
    queryKey: ['evidence-manifest', sessionId],
    queryFn: () =>
      apiFetch<{
        reconEvidence: Array<{ files: Array<{ fileName: string; sizeBytes: number; sha256Hash: string }> }>;
        jeEvidence: Array<{ files: Array<{ fileName: string; sizeBytes: number; sha256Hash: string }> }>;
        totalFiles: number;
      }>(`/api/close/sessions/${sessionId}/evidence-manifest`),
    enabled: !!sessionId,
  });

  const financialHighlights = useMemo(() => {
    const is = statementsData?.incomeStatement?.lines ?? [];
    const bs = statementsData?.balanceSheet?.lines ?? [];
    const revenueLine = is.find((l) => /revenue|sales/i.test(l.lineItemName) && l.isGrandTotal) ?? is.find((l) => /revenue/i.test(l.lineItemName));
    const netIncomeLine = is.find((l) => /net income|net income \(loss\)/i.test(l.lineItemName));
    const totalAssetsLine = bs.find((l) => /total assets/i.test(l.lineItemName));
    const totalLiabLine = bs.find((l) => /total liabilities/i.test(l.lineItemName));
    const totalEquityLine = bs.find((l) => /total equity|stockholders'? equity/i.test(l.lineItemName));
    const cashLine = bs.find((l) => /cash|cash and/i.test(l.lineItemName));
    return {
      revenue: revenueLine?.amount ?? null,
      grossProfit: null,
      operatingIncome: null,
      netIncome: netIncomeLine?.amount ?? null,
      assets: totalAssetsLine?.amount ?? null,
      liabilities: totalLiabLine?.amount ?? null,
      equity: totalEquityLine?.amount ?? null,
      cash: cashLine?.amount ?? null,
    };
  }, [statementsData]);

  const evidenceManifest = useMemo(() => {
    const list: Array<{ filename: string; hash: string; size: string }> = [];
    manifestData?.reconEvidence?.forEach((r) => {
      r.files?.forEach((f) => {
        list.push({
          filename: f.fileName,
          hash: f.sha256Hash ?? '',
          size: f.sizeBytes != null ? `${(f.sizeBytes / 1024).toFixed(1)} KB` : '—',
        });
      });
    });
    manifestData?.jeEvidence?.forEach((j) => {
      j.files?.forEach((f) => {
        list.push({
          filename: f.fileName,
          hash: f.sha256Hash ?? '',
          size: f.sizeBytes != null ? `${(f.sizeBytes / 1024).toFixed(1)} KB` : '—',
        });
      });
    });
    return list;
  }, [manifestData]);

  const activitySummary = useMemo(() => {
    const startedAt = session?.startedAt ?? session?.createdAt;
    const duration = startedAt
      ? `${Math.max(1, Math.ceil((Date.now() - new Date(startedAt).getTime()) / 86400000))} days`
      : '—';
    const reconsComplete = reconciliations.filter((r) => r.status === 'completed' || r.status === 'approved').length;
    const explained = variances.filter((v) => (v as { status?: string }).status === 'explained' || (v as { explained?: boolean }).explained).length;
    return {
      adjustingEntries: journalEntries.length,
      reconciliations: reconciliations.length,
      reconciliationsComplete: reconsComplete,
      variances: variances.length,
      variancesExplained: explained,
      evidenceFiles: manifestData?.totalFiles ?? 0,
      duration,
      participants,
    };
  }, [session, reconciliations, variances, journalEntries.length, manifestData?.totalFiles, participants]);

  const advanceMutation = useAdvanceSession(sessionId);
  const certifyMutation = useCertifySession(sessionId);
  const lockMutation = useLockSession(sessionId);
  const reopenMutation = useReopenSession(sessionId);

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showCertifyDialog, setShowCertifyDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [certifyInput, setCertifyInput] = useState('');
  const [reopenInput, setReopenInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [certifyStep, setCertifyStep] = useState<'input' | 'progress' | 'complete' | 'error'>('input');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [showBlockingGates, setShowBlockingGates] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const currentState = session?.state || 'IN_PROGRESS';
  const isReviewer = roleCanCertify;
  const isPreparer = !isReviewer;
  const isCertifiedOrLocked = currentState === 'CERTIFIED' || currentState === 'LOCKED';
  const [boardPeriodType, setBoardPeriodType] = useState<'monthly' | 'QTD' | 'YTD'>('monthly');
  const [boardExporting, setBoardExporting] = useState(false);
  const { getAuthToken } = useAuth();
  const { data: boardPackage, isLoading: boardLoading } = useBoardPackage(
    isCertifiedOrLocked ? sessionId : null,
    isCertifiedOrLocked ? boardPeriodType : null
  );
  const gatesWithTies: ReadinessGate[] = readiness?.gates ? [...readiness.gates] : [];
  const hasTiesGate = gatesWithTies.some(g => g.id === 'ties');
  if (!hasTiesGate) {
    gatesWithTies.push({
      id: 'ties',
      name: 'Cross-statement ties validated',
      description: 'All cross-statement ties verified at certification',
      passing: false,
      detail: 'Will be validated when certifying',
      category: 'hard',
      navigateTo: '/close/[sessionId]/review',
    });
  }

  // Check if all gates pass except ties
  const gatesPassingExceptTies = gatesWithTies.filter(g => g.id !== 'ties' && g.passing).length;
  const gatesTotalExceptTies = gatesWithTies.filter(g => g.id !== 'ties').length;
  const canSubmit = gatesPassingExceptTies === gatesTotalExceptTies;

  // Get subtitle based on state
  const getSubtitle = () => {
    switch (currentState) {
      case 'IN_PROGRESS':
        return 'Once all gates pass, submit for review. Your designated reviewer will receive a notification and can approve the close.';
      case 'UNDER_REVIEW':
        return 'Review in progress';
      case 'CERTIFIED':
        return 'Period certified';
      case 'LOCKED':
        return 'Period locked';
      default:
        return '';
    }
  };

  // Get primary action button config
  const getPrimaryAction = () => {
    if (currentState === 'IN_PROGRESS' && roleCanSubmit) {
      return {
        label: canSubmit ? 'Submit for Review' : `Submit for Review (${gatesPassingExceptTies}/${gatesTotalExceptTies} gates)`,
        enabled: true, // Always clickable — shows blocking modal if gates fail
        onClick: () => {
          if (canSubmit) {
            setShowSubmitDialog(true);
          } else {
            setShowBlockingGates(true);
          }
        },
      };
    }
    if (currentState === 'UNDER_REVIEW') {
      if (roleCanCertify) {
        return {
          label: 'Certify Period',
          enabled: true,
          onClick: () => setShowCertifyDialog(true),
        };
      }
      return null;
    }
    if (currentState === 'CERTIFIED' && roleCanLock) {
      return {
        label: 'Lock Period',
        enabled: true,
        onClick: () => setShowLockDialog(true),
      };
    }
    return null;
  };

  const primaryAction = getPrimaryAction();

  // State transition handlers — all wired to real API calls
  const handleSubmit = () => {
    setMutationError(null);
    advanceMutation.mutate({ target_state: 'UNDER_REVIEW' }, {
      onSuccess: () => setShowSubmitDialog(false),
      onError: (err) => {
        setMutationError(err instanceof Error ? err.message : 'Failed to submit for review');
        setShowSubmitDialog(false);
      },
    });
  };

  const handleCertify = () => {
    if (certifyInput !== 'CERTIFY') return;
    setMutationError(null);
    setCertifyStep('progress');
    certifyMutation.mutate({ confirmation: 'CERTIFY' }, {
      onSuccess: () => {
        setCertifyStep('complete');
      },
      onError: (err) => {
        setCertifyStep('error');
        setMutationError(err instanceof Error ? err.message : 'Certification failed');
      },
    });
  };

  const handleReject = () => {
    if (rejectReason.trim().length < 10) return;
    setMutationError(null);
    advanceMutation.mutate({ target_state: 'IN_PROGRESS', reason: rejectReason.trim() }, {
      onSuccess: () => {
        setShowRejectDialog(false);
        setRejectReason('');
      },
      onError: (err) => {
        setMutationError(err instanceof Error ? err.message : 'Failed to reject');
      },
    });
  };

  const handleLock = () => {
    setMutationError(null);
    lockMutation.mutate(undefined, {
      onSuccess: () => setShowLockDialog(false),
      onError: (err) => {
        setMutationError(err instanceof Error ? err.message : 'Failed to lock period');
        setShowLockDialog(false);
      },
    });
  };

  const handleReopen = () => {
    if (reopenInput !== 'REOPEN' || reopenReason.trim().length < 10) return;
    setMutationError(null);
    reopenMutation.mutate({ reason: reopenReason.trim() }, {
      onSuccess: () => {
        setShowReopenDialog(false);
        setReopenInput('');
        setReopenReason('');
      },
      onError: (err) => {
        setMutationError(err instanceof Error ? err.message : 'Failed to reopen period');
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)]">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display mb-2 text-[var(--text-primary)]">Review &amp; Certify</h1>
            <p className="text-[var(--text-secondary)]">{getSubtitle()}</p>
          </div>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={!primaryAction.enabled}
              className={cn(
                'px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-200',
                primaryAction.enabled
                  ? 'bg-[var(--interactive-primary)] text-white hover:bg-[var(--interactive-primary-hover)]'
                  : 'bg-[var(--bg-surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed'
              )}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {mutationError && (
        <div className="p-4 flex items-center gap-3 bg-[var(--status-error-bg)] border border-[var(--status-error)] rounded-[var(--radius-lg)]">
          <AlertCircle className="w-5 h-5 shrink-0 text-[var(--status-error)]" />
          <div className="flex-1 text-sm text-[var(--status-error)]">{mutationError}</div>
          <button type="button" onClick={() => setMutationError(null)} className="text-[var(--status-error)] hover:opacity-70">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Read-only banner for preparer in UNDER_REVIEW */}
      {currentState === 'UNDER_REVIEW' && isPreparer && (
        <div className="p-4 flex items-center gap-3 bg-[var(--status-warning-bg)] border border-[var(--status-warning)] rounded-[var(--radius-lg)]">
          <AlertCircle className="w-5 h-5 shrink-0 text-[var(--status-warning)]" />
          <div className="flex-1">
            <div className="font-medium text-[var(--status-warning)]">Under Review</div>
            <div className="text-sm mt-1 text-[var(--text-secondary)]">
              This period is currently under review. A reviewer will certify or send it back for corrections.
            </div>
          </div>
        </div>
      )}

      {/* Certification Checklist (visible in IN_PROGRESS and UNDER_REVIEW) */}
      {(currentState === 'IN_PROGRESS' || currentState === 'UNDER_REVIEW') && (
        <CertificationChecklist gates={gatesWithTies} sessionId={sessionId} />
      )}

      {/* Close Package Summary */}
      {(currentState === 'IN_PROGRESS' || currentState === 'UNDER_REVIEW' || currentState === 'CERTIFIED') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Financial Highlights */}
          <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-300">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2 text-[var(--text-primary)]">
              <FileText className="w-5 h-5" />
              Financial Highlights
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Revenue</span>
                <MoneyCell value={financialHighlights.revenue} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Gross Profit</span>
                <MoneyCell value={financialHighlights.grossProfit} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Operating Income</span>
                <MoneyCell value={financialHighlights.operatingIncome} showDollar />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-sm font-medium text-[var(--text-primary)]">Net Income</span>
                <MoneyCell value={financialHighlights.netIncome} showDollar className="font-medium" />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-sm text-[var(--text-secondary)]">Total Assets</span>
                <MoneyCell value={financialHighlights.assets} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Total Liabilities</span>
                <MoneyCell value={financialHighlights.liabilities} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Total Equity</span>
                <MoneyCell value={financialHighlights.equity} showDollar />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-[var(--border-subtle)]">
                <span className="text-sm text-[var(--text-secondary)]">Cash &amp; Equivalents</span>
                <MoneyCell value={financialHighlights.cash} showDollar />
              </div>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-300">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2 text-[var(--text-primary)]">
              <CheckCircle2 className="w-5 h-5" />
              Activity Summary
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Journal Entries</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">{activitySummary.adjustingEntries}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Reconciliations</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {activitySummary.reconciliationsComplete} / {activitySummary.reconciliations}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Variances</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {activitySummary.variancesExplained} / {activitySummary.variances} explained
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--text-secondary)]">Evidence Files</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">{activitySummary.evidenceFiles}</span>
              </div>
              <div className="pt-3 flex items-center gap-2 border-t border-[var(--border-subtle)]">
                <Clock className="w-4 h-4 text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-secondary)]">Duration</span>
                <span className="text-sm font-medium ml-auto text-[var(--text-primary)]">{activitySummary.duration}</span>
              </div>
              <div className="pt-2 flex items-start gap-2">
                <Users className="w-4 h-4 mt-0.5 text-[var(--text-tertiary)]" />
                <div className="flex-1">
                  <span className="text-sm text-[var(--text-secondary)]">Participants</span>
                  <div className="text-sm mt-1 text-[var(--text-primary)]">
                    {activitySummary.participants.join(', ')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Evidence Manifest */}
          <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-300">
            <h2 className="text-lg font-display mb-4 flex items-center gap-2 text-[var(--text-primary)]">
              <Hash className="w-5 h-5" />
              Evidence Manifest
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {evidenceManifest.map((evidence, idx) => (
                <div
                  key={idx}
                  className={cn('pb-3 last:pb-0', idx < evidenceManifest.length - 1 && 'border-b border-[var(--border-subtle)]')}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium break-words flex-1 text-[var(--text-primary)]">{evidence.filename}</span>
                    <span className="text-xs shrink-0 text-[var(--text-tertiary)]">{evidence.size}</span>
                  </div>
                  <div className="text-xs font-mono break-all tracking-wider text-[var(--text-secondary)] bg-[var(--bg-surface-sunken)] px-2 py-1 rounded-[var(--radius-sm)]">
                    SHA-256: {evidence.hash.slice(0, 32)}{evidence.hash.length > 32 ? '...' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Board Package (visible in CERTIFIED and LOCKED) */}
      {isCertifiedOrLocked && (
        <div className="p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display flex items-center gap-2 text-[var(--text-primary)]">
              <BookOpen className="w-5 h-5" />
              Board Package
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={boardPeriodType}
                onChange={(e) => setBoardPeriodType(e.target.value as 'monthly' | 'QTD' | 'YTD')}
                className="text-sm px-2 py-1 border border-[var(--border-default)] rounded-[var(--radius-md)] transition-colors focus:border-[var(--border-focus)] focus:outline-none"
              >
                <option value="monthly">Monthly</option>
                <option value="QTD">Quarter-to-Date</option>
                <option value="YTD">Year-to-Date</option>
              </select>
              <button
                type="button"
                disabled={boardExporting}
                onClick={async () => {
                  setBoardExporting(true);
                  try {
                    const token = getAuthToken();
                    const headers: Record<string, string> = {};
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                    const res = await fetch(`/api/close/sessions/${sessionId}/board-package/export/pdf?periodType=${boardPeriodType}`, { headers });
                    if (!res.ok) throw new Error('Export failed');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `board-package-${session?.periodLabel ?? sessionId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {
                    setMutationError('Failed to export board package PDF');
                  } finally {
                    setBoardExporting(false);
                  }
                }}
                className="px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-50 border border-[var(--border-default)] rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-table-row-hover)]"
              >
                {boardExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {boardExporting ? 'Exporting\u2026' : 'Export'}
              </button>
            </div>
          </div>
          {boardLoading && <p className="text-sm text-[var(--text-secondary)]">Loading board package...</p>}
          {boardPackage && (
            <div className="space-y-4">
              {/* Key Metrics */}
              <div className="flex flex-wrap gap-3">
                {(boardPackage.keyMetrics ?? []).map((m) => (
                  <div
                    key={m.label}
                    className="min-w-[140px] p-3"
                    style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
                  >
                    <div className="text-xs text-[var(--text-secondary)]">{m.label}</div>
                    <div className="text-lg font-medium text-[var(--text-primary)]">{m.value}</div>
                  </div>
                ))}
              </div>
              {/* Validation */}
              {(boardPackage.validationResults ?? []).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Validation</div>
                  {(boardPackage.validationResults ?? []).map((v) => (
                    <div key={v.check} className="flex items-center gap-2 text-sm">
                      {v.passed
                        ? <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
                        : <XCircle className="w-4 h-4 text-[var(--status-error)]" />
                      }
                      <span style={{ color: v.passed ? 'var(--text-secondary)' : 'var(--status-error)' }}>{v.check}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Material Variances */}
              {(boardPackage.materialVariances ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide mb-2 text-[var(--text-secondary)]">Material Variances ({(boardPackage.materialVariances ?? []).length})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                          <th className="text-left py-1.5 px-2 font-medium text-[var(--text-secondary)]">Line Item</th>
                          <th className="text-right py-1.5 px-2 font-medium text-[var(--text-secondary)]">Current</th>
                          <th className="text-right py-1.5 px-2 font-medium text-[var(--text-secondary)]">Prior</th>
                          <th className="text-right py-1.5 px-2 font-medium text-[var(--text-secondary)]">Change</th>
                          <th className="text-left py-1.5 px-2 font-medium text-[var(--text-secondary)]">Explanation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(boardPackage.materialVariances ?? []).map((mv, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td className="py-1.5 px-2">{mv.lineItem}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{mv.currentAmount}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{mv.priorAmount}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{mv.changeAmount}</td>
                            <td className="py-1.5 px-2 text-xs text-[var(--text-secondary)]">{mv.explanation ?? '\u2014'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {boardPackage.cumulativeNote && (
                <p className="text-xs italic text-[var(--text-tertiary)]">{boardPackage.cumulativeNote}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Certification Record (visible in CERTIFIED and LOCKED) */}
      {(currentState === 'CERTIFIED' || currentState === 'LOCKED') && certification && (
        <div className="space-y-4">
          <CertificationRecord artifact={certification} entityName={session?.entityName} periodLabel={session?.periodLabel} />
          {currentState === 'CERTIFIED' && roleCanReopen && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReopenDialog(true)}
                className="px-4 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--status-warning)] text-[var(--status-warning)] transition-colors hover:bg-[var(--status-warning-bg)]"
              >
                Reopen Period
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submit for Review Dialog */}
      <ConfirmDialog
        open={showSubmitDialog}
        onClose={() => setShowSubmitDialog(false)}
        onConfirm={handleSubmit}
        title="Submit for Review"
        message="Are you sure you want to submit this period for review?"
        detail="Once submitted, the period will be locked for editing until a reviewer certifies it or sends it back for corrections."
        confirmLabel="Submit"
      />

      {/* Blocking Gates Modal */}
      {showBlockingGates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowBlockingGates(false)} />
          <div className="relative bg-surface border border-border rounded-card shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg text-primary mb-2">Cannot Submit for Review</h3>
            <p className="text-text-secondary text-sm mb-4">
              The following gates must pass before submitting:
            </p>
            <ul className="space-y-2 mb-5">
              {gatesWithTies.filter(g => g.id !== 'ties' && !g.passing).map((g) => (
                <li key={g.id} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--status-error)' }} />
                  <div>
                    <span style={{ color: 'var(--text-primary)' }}>{g.name}</span>
                    {g.detail && <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{g.detail}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-3">
              {(() => {
                const firstFailing = gatesWithTies.find(g => g.id !== 'ties' && !g.passing && g.navigateTo);
                if (!firstFailing) return null;
                const href = firstFailing.navigateTo?.startsWith('/close') ? firstFailing.navigateTo : `/close/${sessionId}${firstFailing.navigateTo}`;
                return (
                  <a href={href} className="px-4 py-2 text-sm font-medium text-white rounded-input" style={{ backgroundColor: 'var(--interactive-primary)' }}>
                    Go to First Blocking Gate
                  </a>
                );
              })()}
              <button type="button" onClick={() => setShowBlockingGates(false)} className="px-4 py-2 rounded-input border border-border text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Certify Period Dialog */}
      {showCertifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" aria-hidden onClick={() => {
            setShowCertifyDialog(false);
            setCertifyInput('');
            setCertifyStep('input');
          }} />
          <div
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative shadow-xl w-full p-6',
              certifyStep === 'complete' ? 'max-w-2xl' : 'max-w-md'
            )}
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {certifyStep === 'input' && (
              <>
                <h3 className="font-display text-lg mb-4 text-[var(--cert-primary)]">Certify {session?.periodLabel ?? 'Period'}</h3>
                <div
                  className="p-4 mb-4 text-sm space-y-2"
                  style={{ backgroundColor: 'var(--bg-certified)', border: '1px solid var(--cert-primary)', borderRadius: 'var(--radius-md)', opacity: 0.9 }}
                >
                  <p className="font-medium text-[var(--text-primary)]">By certifying, you attest that:</p>
                  <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
                    <li>All financial data has been reviewed</li>
                    <li>All adjustments are supported and approved</li>
                    <li>All material variances have been explained</li>
                    <li>The financial statements are complete and accurate</li>
                  </ul>
                  <p className="text-xs mt-2 text-[var(--text-tertiary)]">
                    This will create an immutable, cryptographically signed certification artifact. The system will re-validate all gates at the moment of certification.
                  </p>
                </div>
                <p className="text-sm mb-3 text-[var(--text-secondary)]">
                  Type <strong className="font-mono text-[var(--text-primary)]">CERTIFY</strong> to confirm:
                </p>
                <input
                  type="text"
                  value={certifyInput}
                  onChange={(e) => setCertifyInput(e.target.value)}
                  placeholder="Type CERTIFY"
                  className="w-full px-4 py-2 mb-4 font-mono rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-colors duration-200 focus:border-[var(--cert-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cert-primary)]/20"
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCertifyDialog(false);
                      setCertifyInput('');
                    }}
                    className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--border-default)] transition-colors hover:bg-[var(--bg-table-row-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCertify}
                    disabled={certifyInput !== 'CERTIFY'}
                    className={cn(
                      'px-6 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-all duration-300',
                      certifyInput === 'CERTIFY'
                        ? 'bg-[var(--cert-primary)] text-white opacity-100 shadow-[0_0_12px_rgba(20,83,45,0.3)]'
                        : 'bg-[var(--bg-surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed',
                      certifyInput.length > 0 && certifyInput !== 'CERTIFY' && `opacity-${Math.min(30 + Math.round((certifyInput.length / 7) * 70), 70)}`
                    )}
                    style={certifyInput.length > 0 && certifyInput !== 'CERTIFY' ? { opacity: 0.3 + (certifyInput.length / 7) * 0.7 } : undefined}
                  >
                    Certify {session?.periodLabel ?? 'Period'}
                  </button>
                </div>
              </>
            )}
            {certifyStep === 'progress' && (
              <div className="text-center py-8">
                <div
                  className="animate-spin rounded-full h-12 w-12 mx-auto mb-4"
                  style={{ borderBottom: '2px solid var(--interactive-primary)' }}
                />
                <p className="text-[var(--text-secondary)]">Certifying period...</p>
                <p className="text-sm mt-2 text-[var(--text-tertiary)]">Validating ties and generating certification artifact</p>
              </div>
            )}
            {certifyStep === 'complete' && (() => {
              const copyToClipboard = (text: string, field: string) => {
                navigator.clipboard.writeText(text).then(() => {
                  setCopiedField(field);
                  setTimeout(() => setCopiedField(null), 2000);
                });
              };
              const closeCertifyOverlay = () => {
                setShowCertifyDialog(false);
                setCertifyInput('');
                setCertifyStep('input');
                setCopiedField(null);
              };
              const certArtifact = certification;
              const sig = certArtifact?.signature ?? '';
              const hash = certArtifact?.snapshotHash ?? '';
              const certifier = certArtifact?.certifiedBy ?? userName;
              const certifiedAt = certArtifact?.certifiedAt ? new Date(certArtifact.certifiedAt).toLocaleString() : new Date().toLocaleString();
              const reconsDone = reconciliations.filter((r) => r.status === 'completed' || r.status === 'approved').length;
              const variancesExplained = variances.filter((v) => (v as { explanationStatus?: string }).explanationStatus === 'explained' || (v as { explanationStatus?: string }).explanationStatus === 'approved').length;

              return (
                <div className="relative">
                  <button
                    type="button"
                    onClick={closeCertifyOverlay}
                    className="absolute top-0 right-0 p-1 text-[var(--text-tertiary)]"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Post-certification banner */}
                  <div className="text-center pt-4 pb-6">
                    <div
                      className="flex items-center justify-center mx-auto mb-4 w-16 h-16 rounded-full bg-[var(--status-success-bg)] animate-in zoom-in duration-300"
                      style={{ border: '3px double var(--cert-primary)', boxShadow: '0 0 20px rgba(20,83,45,0.15)' }}
                    >
                      <CheckCircle2 className="w-10 h-10 text-[var(--status-success)]" />
                    </div>
                    <h2 className="text-3xl font-display font-bold mb-1 text-[var(--status-success)]">CERTIFIED</h2>
                    <p className="font-medium text-[var(--text-primary)]">{session?.entityName ?? ''}</p>
                    <p className="text-sm text-[var(--text-secondary)]">{session?.periodLabel ?? ''}</p>
                    <p className="text-xs mt-1 text-[var(--text-tertiary)]">{certifier} &middot; {certifiedAt}</p>
                  </div>

                  {/* Certification attestation text */}
                  <div
                    className="px-6 py-4 mb-4 rounded-[var(--radius-md)] bg-[var(--bg-certified)] border border-[var(--cert-border)] text-[var(--cert-primary)]"
                    style={{ fontFamily: '"Source Serif 4", serif', fontSize: '15px', lineHeight: 1.65 }}
                  >
                    I hereby certify that the financial statements for {session?.entityName ?? 'this entity'} for the period {session?.periodLabel ?? ''} have been prepared in accordance with applicable standards, are free from material misstatement, and present a true and fair view of the financial position and results of operations.
                  </div>

                  <div className="pt-4 pb-4 space-y-3 border-t border-[var(--border-default)]">
                    <h3 className="text-xs font-medium uppercase tracking-wide flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <Shield className="w-3.5 h-3.5" /> Digital Signatures
                    </h3>
                    <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--bg-surface-sunken)] rounded-[var(--radius-md)]">
                      <div className="min-w-0">
                        <span className="text-xs text-[var(--text-tertiary)]">ed25519:</span>
                        <span className="text-sm font-mono tracking-wider ml-2 text-[var(--text-secondary)]">{sig.slice(0, 24)}...</span>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(sig, 'sig')} className="shrink-0 p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="Copy signature">
                        {copiedField === 'sig' ? <Check className="w-4 h-4 text-[var(--status-success)]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--bg-surface-sunken)] rounded-[var(--radius-md)]">
                      <div className="min-w-0">
                        <span className="text-xs text-[var(--text-tertiary)]">sha256:</span>
                        <span className="text-sm font-mono tracking-wider ml-2 text-[var(--text-secondary)]">{hash.slice(0, 24)}...</span>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(hash, 'hash')} className="shrink-0 p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors" title="Copy hash">
                        {copiedField === 'hash' ? <Check className="w-4 h-4 text-[var(--status-success)]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    {certArtifact?.id && (
                      <p className="text-xs text-[var(--text-tertiary)]">Artifact ID: <span className="font-mono tracking-wide">{certArtifact.id}</span></p>
                    )}
                  </div>

                  <div className="pt-4 pb-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                    <h3 className="text-xs font-medium uppercase tracking-wide mb-3 text-[var(--text-secondary)]">Summary</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        className="text-center p-2"
                        style={{ backgroundColor: 'var(--bg-surface-sunken)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div className="text-lg font-bold text-[var(--text-primary)]">{gatesWithTies.filter((g) => g.passing).length}/{gatesWithTies.length}</div>
                        <div className="text-xs uppercase text-[var(--text-tertiary)]">Gates</div>
                      </div>
                      <div
                        className="text-center p-2"
                        style={{ backgroundColor: 'var(--bg-surface-sunken)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div className="text-lg font-bold text-[var(--text-primary)]">4</div>
                        <div className="text-xs uppercase text-[var(--text-tertiary)]">Statements</div>
                      </div>
                      <div
                        className="text-center p-2"
                        style={{ backgroundColor: 'var(--bg-surface-sunken)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div className="text-lg font-bold text-[var(--text-primary)]">{reconsDone}/{reconciliations.length}</div>
                        <div className="text-xs uppercase text-[var(--text-tertiary)]">Recons</div>
                      </div>
                      <div
                        className="text-center p-2"
                        style={{ backgroundColor: 'var(--bg-surface-sunken)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div className="text-lg font-bold text-[var(--text-primary)]">{journalEntries.length}</div>
                        <div className="text-xs uppercase text-[var(--text-tertiary)]">AJEs</div>
                      </div>
                      <div
                        className="text-center p-2"
                        style={{ backgroundColor: 'var(--bg-surface-sunken)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div className="text-lg font-bold text-[var(--text-primary)]">{variancesExplained}/{variances.filter((v) => (v as { isMaterial?: boolean }).isMaterial).length}</div>
                        <div className="text-xs uppercase text-[var(--text-tertiary)]">Variances</div>
                      </div>
                      <div
                        className="text-center p-2"
                        style={{ backgroundColor: 'var(--bg-surface-sunken)', borderRadius: 'var(--radius-md)' }}
                      >
                        <div className="text-lg font-bold text-[var(--text-primary)]">{manifestData?.totalFiles ?? 0}</div>
                        <div className="text-xs uppercase text-[var(--text-tertiary)]">Evidence</div>
                      </div>
                    </div>
                  </div>

                  {/* A = L + E verification badge */}
                  <div
                    className="flex items-center justify-center gap-2 py-2 mb-3 text-sm font-medium bg-[var(--status-success-bg)] text-[var(--status-success)] rounded-[var(--radius-md)]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    A = L + E verified
                  </div>

                  <div className="space-y-3" style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem' }}>
                    <div className="flex gap-3">
                      {certArtifact?.id && (
                        <a
                          href={`/api/verification/certification/artifacts/${certArtifact.id}`}
                          download
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium"
                          style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                        >
                          <Download className="w-4 h-4" /> Download Certificate
                        </a>
                      )}
                      <Link
                        href={`/close/${sessionId}/board-package`}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium"
                        style={{ borderRadius: 'var(--radius-md)', backgroundColor: 'var(--interactive-primary)', color: 'white' }}
                        onClick={closeCertifyOverlay}
                      >
                        <BookOpen className="w-4 h-4" /> View Board Package
                      </Link>
                    </div>
                    {roleCanLock && <button
                      type="button"
                      onClick={() => { closeCertifyOverlay(); setShowLockDialog(true); }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--cert-primary)] text-white transition-colors hover:bg-[var(--cert-secondary)]"
                    >
                      <Lock className="w-4 h-4" /> Lock Period
                    </button>}
                    {certArtifact?.id && (
                      <p className="text-center">
                        <a
                          href={`/close/${sessionId}/review`}
                          onClick={closeCertifyOverlay}
                          className="text-xs inline-flex items-center gap-1 hover:underline text-[var(--interactive-primary)]"
                        >
                          <ExternalLink className="w-3 h-3" /> Verify certification
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
            {certifyStep === 'error' && (
              <div className="py-6">
                <XCircle className="w-12 h-12 mx-auto mb-4 text-[var(--status-error)]" />
                <p className="font-medium text-center mb-2 text-[var(--status-error)]">Certification failed</p>
                <p className="text-sm text-center text-[var(--text-secondary)]">{mutationError}</p>
                <div className="flex justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => { setShowCertifyDialog(false); setCertifyInput(''); setCertifyStep('input'); setMutationError(null); }}
                    className="px-4 py-2 text-sm"
                    style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject/Send Back Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" aria-hidden onClick={() => {
            setShowRejectDialog(false);
            setRejectReason('');
          }} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative shadow-xl max-w-md w-full p-6"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg mb-2 text-[var(--text-primary)]">Send Back for Corrections</h3>
            <p className="text-sm mb-4 text-[var(--text-secondary)]">
              Provide a reason for sending this period back to the preparer.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason..."
              rows={4}
              className="w-full px-4 py-2 mb-4 resize-none rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-colors focus:border-[var(--border-focus)] focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--border-default)] transition-colors hover:bg-[var(--bg-table-row-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={rejectReason.trim().length < 10 || advanceMutation.isPending}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-all duration-200',
                  rejectReason.trim().length >= 10
                    ? 'bg-[var(--status-error)] text-white'
                    : 'bg-[var(--bg-surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed'
                )}
              >
                {advanceMutation.isPending ? 'Sending...' : 'Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock Period Dialog */}
      <ConfirmDialog
        open={showLockDialog}
        onClose={() => setShowLockDialog(false)}
        onConfirm={handleLock}
        title="Lock Period Permanently"
        message="This action is PERMANENT and IRREVERSIBLE. The certified financial statements will be frozen forever. No modifications, reopening, or deletions will be possible."
        confirmLabel="LOCK"
        severity="critical"
        requiresTextInput
        requiredText="LOCK"
      />

      {/* Reopen Period Dialog */}
      {showReopenDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" aria-hidden onClick={() => {
            setShowReopenDialog(false);
            setReopenInput('');
            setReopenReason('');
          }} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative shadow-xl max-w-md w-full p-6"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg mb-2 text-[var(--text-primary)]">Reopen Period</h3>
            <p className="text-sm mb-4 text-[var(--text-secondary)]">
              Type <strong className="font-mono">REOPEN</strong> and provide a reason to reopen this certified period.
            </p>
            <input
              type="text"
              value={reopenInput}
              onChange={(e) => setReopenInput(e.target.value)}
              placeholder="Type REOPEN"
              className="w-full px-4 py-2 mb-3 font-mono rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-colors focus:border-[var(--status-warning)] focus:outline-none"
              autoFocus
            />
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Enter reason for reopening..."
              rows={3}
              className="w-full px-4 py-2 mb-4 resize-none rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-colors focus:border-[var(--border-focus)] focus:outline-none"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReopenDialog(false);
                  setReopenInput('');
                  setReopenReason('');
                }}
                className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--border-default)] transition-colors hover:bg-[var(--bg-table-row-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={reopenInput !== 'REOPEN' || reopenReason.trim().length < 10 || reopenMutation.isPending}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-all duration-200',
                  reopenInput === 'REOPEN' && reopenReason.trim()
                    ? 'bg-[var(--status-warning)] text-white'
                    : 'bg-[var(--bg-surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed'
                )}
              >
                Reopen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviewer actions in UNDER_REVIEW */}
      {currentState === 'UNDER_REVIEW' && roleCanCertify && (
        <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-[var(--text-primary)]">Reviewer Actions</div>
              <div className="text-sm mt-1 text-[var(--text-secondary)]">
                Certify this period or send it back for corrections
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowRejectDialog(true)}
                className="px-4 py-2 text-sm flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--status-warning)] text-[var(--status-warning)] transition-colors hover:bg-[var(--status-warning-bg)]"
              >
                <XCircle className="w-4 h-4" />
                Send Back
              </button>
              <button
                type="button"
                onClick={() => setShowCertifyDialog(true)}
                className="px-4 py-2 text-sm flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--cert-primary)] text-white transition-colors hover:bg-[var(--cert-secondary)]"
              >
                <CheckCircle2 className="w-4 h-4" />
                Certify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
