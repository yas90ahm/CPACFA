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
import { useJournalEntries, useAjeTemplates } from '@/lib/queries/adjustments';
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
import { CloseChecklistSuggestions } from '@/components/shared/SmartCloseAssistant';
import { AuditDefenseExport } from '@/components/shared/AuditDefenseExport';

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
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);

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
        return 'Pre-submission checklist';
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
        label: 'Submit for Review',
        enabled: canSubmit,
        onClick: () => setShowSubmitDialog(true),
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
      <div className="bg-surface border border-border rounded-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display text-primary mb-2">Review & Certify</h1>
            <p className="text-text-secondary">{getSubtitle()}</p>
          </div>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={!primaryAction.enabled}
              className={cn(
                'px-6 py-2.5 rounded-full text-sm font-medium transition-all',
                primaryAction.enabled
                  ? 'bg-accent text-white hover:bg-accent-hover shadow-glow-accent'
                  : 'bg-surface-alt text-text-muted cursor-not-allowed'
              )}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {mutationError && (
        <div className="bg-status-red-dim border border-status-red rounded-card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-status-red shrink-0" />
          <div className="flex-1 text-sm text-status-red">{mutationError}</div>
          <button type="button" onClick={() => setMutationError(null)} className="text-status-red hover:opacity-70">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Read-only banner for preparer in UNDER_REVIEW */}
      {currentState === 'UNDER_REVIEW' && isPreparer && (
        <div className="bg-status-amber-dim border border-status-amber rounded-card p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-status-amber shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-status-amber">Under Review</div>
            <div className="text-sm text-text-secondary mt-1">
              This period is currently under review. A reviewer will certify or send it back for corrections.
            </div>
          </div>
        </div>
      )}

      {/* Certification Checklist (visible in IN_PROGRESS and UNDER_REVIEW) */}
      {(currentState === 'IN_PROGRESS' || currentState === 'UNDER_REVIEW') && (
        <CertificationChecklist gates={gatesWithTies} sessionId={sessionId} />
      )}

      {/* AI Next Steps (visible in IN_PROGRESS) */}
      {currentState === 'IN_PROGRESS' && (
        <CloseChecklistSuggestions
          sessionId={sessionId}
          unmappedCount={0}
          reconIncomplete={reconciliations.filter((r) => r.status !== 'completed' && r.status !== 'approved').length}
          reconTotal={reconciliations.length}
          templatesPending={ajeTemplates.filter((t) => t.periodStatus === 'pending').length}
          proposedEntries={journalEntries.filter((e) => e.status === 'proposed').length}
          statementsGenerated={!!statementsData?.incomeStatement}
          statementsStale={session?.statementsStale ?? false}
          varianceUnexplained={variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending').length}
          currentState={currentState}
        />
      )}

      {/* Close Package Summary */}
      {(currentState === 'IN_PROGRESS' || currentState === 'UNDER_REVIEW' || currentState === 'CERTIFIED') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Financial Highlights */}
          <div className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-lg font-display text-primary mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Financial Highlights
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Revenue</span>
                <MoneyCell value={financialHighlights.revenue} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Gross Profit</span>
                <MoneyCell value={financialHighlights.grossProfit} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Operating Income</span>
                <MoneyCell value={financialHighlights.operatingIncome} showDollar />
              </div>
              <div className="flex justify-between items-center border-t border-border-light pt-3">
                <span className="text-sm font-medium text-primary">Net Income</span>
                <MoneyCell value={financialHighlights.netIncome} showDollar className="font-medium" />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-border-light">
                <span className="text-sm text-text-secondary">Total Assets</span>
                <MoneyCell value={financialHighlights.assets} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Total Liabilities</span>
                <MoneyCell value={financialHighlights.liabilities} showDollar />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Total Equity</span>
                <MoneyCell value={financialHighlights.equity} showDollar />
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-border-light">
                <span className="text-sm text-text-secondary">Cash & Equivalents</span>
                <MoneyCell value={financialHighlights.cash} showDollar />
              </div>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-lg font-display text-primary mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Activity Summary
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Journal Entries</span>
                <span className="text-sm font-medium text-primary">{activitySummary.adjustingEntries}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Reconciliations</span>
                <span className="text-sm font-medium text-primary">
                  {activitySummary.reconciliationsComplete} / {activitySummary.reconciliations}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Variances</span>
                <span className="text-sm font-medium text-primary">
                  {activitySummary.variancesExplained} / {activitySummary.variances} explained
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Evidence Files</span>
                <span className="text-sm font-medium text-primary">{activitySummary.evidenceFiles}</span>
              </div>
              <div className="pt-3 border-t border-border-light flex items-center gap-2">
                <Clock className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-secondary">Duration</span>
                <span className="text-sm font-medium text-primary ml-auto">{activitySummary.duration}</span>
              </div>
              <div className="pt-2 flex items-start gap-2">
                <Users className="w-4 h-4 text-text-tertiary mt-0.5" />
                <div className="flex-1">
                  <span className="text-sm text-text-secondary">Participants</span>
                  <div className="text-sm text-primary mt-1">
                    {activitySummary.participants.join(', ')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Evidence Manifest */}
          <div className="bg-surface border border-border rounded-card p-6">
            <h2 className="text-lg font-display text-primary mb-4 flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Evidence Manifest
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {evidenceManifest.map((evidence, idx) => (
                <div key={idx} className="border-b border-border-light pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-primary break-words flex-1">{evidence.filename}</span>
                    <span className="text-xs text-text-tertiary shrink-0">{evidence.size}</span>
                  </div>
                  <div className="text-xs font-mono text-text-tertiary break-all">
                    SHA-256: {evidence.hash.slice(0, 16)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Board Package (visible in CERTIFIED and LOCKED) */}
      {isCertifiedOrLocked && (
        <div className="bg-surface border border-border rounded-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display text-primary flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Board Package
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={boardPeriodType}
                onChange={(e) => setBoardPeriodType(e.target.value as 'monthly' | 'QTD' | 'YTD')}
                className="text-sm border border-border rounded-input px-2 py-1"
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
                className="px-3 py-1.5 rounded-input border border-border text-sm text-text-secondary hover:bg-hover flex items-center gap-1.5 disabled:opacity-50"
              >
                {boardExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {boardExporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>
          {boardLoading && <p className="text-sm text-text-secondary">Loading board package...</p>}
          {boardPackage && (
            <div className="space-y-4">
              {/* Key Metrics */}
              <div className="flex flex-wrap gap-3">
                {(boardPackage.keyMetrics ?? []).map((m) => (
                  <div key={m.label} className="min-w-[140px] border border-border rounded-card p-3">
                    <div className="text-xs text-text-secondary">{m.label}</div>
                    <div className="text-lg font-medium text-primary">{m.value}</div>
                  </div>
                ))}
              </div>
              {/* Validation */}
              {(boardPackage.validationResults ?? []).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Validation</div>
                  {(boardPackage.validationResults ?? []).map((v) => (
                    <div key={v.check} className="flex items-center gap-2 text-sm">
                      {v.passed ? <CheckCircle2 className="w-4 h-4 text-status-green" /> : <XCircle className="w-4 h-4 text-status-red" />}
                      <span className={v.passed ? 'text-text-secondary' : 'text-status-red'}>{v.check}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Material Variances */}
              {(boardPackage.materialVariances ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Material Variances ({(boardPackage.materialVariances ?? []).length})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-1.5 px-2 font-medium text-text-secondary">Line Item</th>
                          <th className="text-right py-1.5 px-2 font-medium text-text-secondary">Current</th>
                          <th className="text-right py-1.5 px-2 font-medium text-text-secondary">Prior</th>
                          <th className="text-right py-1.5 px-2 font-medium text-text-secondary">Change</th>
                          <th className="text-left py-1.5 px-2 font-medium text-text-secondary">Explanation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(boardPackage.materialVariances ?? []).map((mv, idx) => (
                          <tr key={idx} className="border-b border-border-light">
                            <td className="py-1.5 px-2">{mv.lineItem}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{mv.currentAmount}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{mv.priorAmount}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{mv.changeAmount}</td>
                            <td className="py-1.5 px-2 text-text-secondary text-xs">{mv.explanation ?? '\u2014'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {boardPackage.cumulativeNote && (
                <p className="text-xs text-text-tertiary italic">{boardPackage.cumulativeNote}</p>
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
                className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover"
              >
                Reopen Period
              </button>
            </div>
          )}
        </div>
      )}

      {/* Audit Defense Export */}
      <AuditDefenseExport
        sessionId={sessionId}
        periodLabel={session?.periodLabel ?? ''}
        isCertified={currentState === 'CERTIFIED' || currentState === 'LOCKED'}
      />

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
              'relative bg-surface border border-border rounded-card shadow-xl w-full p-6',
              certifyStep === 'complete' ? 'max-w-2xl' : 'max-w-md'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {certifyStep === 'input' && (
              <>
                <h3 className="font-display text-lg text-certified mb-4">Certify {session?.periodLabel ?? 'Period'}</h3>
                <div className="bg-certified-dim border border-certified/20 rounded-input p-4 mb-4 text-sm text-text-secondary space-y-2">
                  <p className="font-medium text-primary">By certifying, you attest that:</p>
                  <ul className="list-disc list-inside space-y-1 text-text-secondary">
                    <li>All financial data has been reviewed</li>
                    <li>All adjustments are supported and approved</li>
                    <li>All material variances have been explained</li>
                    <li>The financial statements are complete and accurate</li>
                  </ul>
                  <p className="text-xs text-text-tertiary mt-2">
                    This will create an immutable, cryptographically signed certification artifact. The system will re-validate all gates at the moment of certification.
                  </p>
                </div>
                <p className="text-text-secondary text-sm mb-3">
                  Type <strong className="font-mono text-primary">CERTIFY</strong> to confirm:
                </p>
                <input
                  type="text"
                  value={certifyInput}
                  onChange={(e) => setCertifyInput(e.target.value)}
                  placeholder="Type CERTIFY"
                  className="w-full px-4 py-2 rounded-input border border-border bg-surface text-primary mb-4 font-mono"
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCertifyDialog(false);
                      setCertifyInput('');
                    }}
                    className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCertify}
                    disabled={certifyInput !== 'CERTIFY'}
                    className={cn(
                      'px-6 py-2 rounded-input text-sm font-medium',
                      certifyInput === 'CERTIFY'
                        ? 'bg-certified text-black hover:opacity-90'
                        : 'bg-surface-alt text-text-muted cursor-not-allowed'
                    )}
                  >
                    Certify {session?.periodLabel ?? 'Period'}
                  </button>
                </div>
              </>
            )}
            {certifyStep === 'progress' && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
                <p className="text-text-secondary">Certifying period...</p>
                <p className="text-sm text-text-tertiary mt-2">Validating ties and generating certification artifact</p>
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
                    className="absolute top-0 right-0 p-1 text-text-tertiary hover:text-primary"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="text-center pt-4 pb-6">
                    <div className="w-20 h-20 rounded-full bg-status-green/15 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-16 h-16 text-status-green" />
                    </div>
                    <h2 className="text-3xl font-display font-bold text-status-green mb-1">CERTIFIED</h2>
                    <p className="text-primary font-medium">{session?.entityName ?? ''}</p>
                    <p className="text-text-secondary text-sm">{session?.periodLabel ?? ''}</p>
                    <p className="text-text-tertiary text-xs mt-1">{certifier} &middot; {certifiedAt}</p>
                  </div>

                  <div className="border-t border-border pt-4 pb-4 space-y-3">
                    <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> Digital Signatures
                    </h3>
                    <div className="flex items-center justify-between bg-elevated rounded-input px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-xs text-text-tertiary">ed25519:</span>
                        <span className="text-sm font-mono text-primary ml-1.5">{sig.slice(0, 16)}...</span>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(sig, 'sig')} className="shrink-0 p-1 text-text-tertiary hover:text-accent" title="Copy signature">
                        {copiedField === 'sig' ? <Check className="w-4 h-4 text-status-green" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-elevated rounded-input px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-xs text-text-tertiary">sha256:</span>
                        <span className="text-sm font-mono text-primary ml-1.5">{hash.slice(0, 16)}...</span>
                      </div>
                      <button type="button" onClick={() => copyToClipboard(hash, 'hash')} className="shrink-0 p-1 text-text-tertiary hover:text-accent" title="Copy hash">
                        {copiedField === 'hash' ? <Check className="w-4 h-4 text-status-green" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    {certArtifact?.id && (
                      <p className="text-xs text-text-tertiary">Artifact ID: <span className="font-mono">{certArtifact.id}</span></p>
                    )}
                  </div>

                  <div className="border-t border-border pt-4 pb-4">
                    <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">Summary</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 bg-elevated rounded-input">
                        <div className="text-lg font-bold text-primary">{gatesWithTies.filter((g) => g.passing).length}/{gatesWithTies.length}</div>
                        <div className="text-[10px] text-text-tertiary uppercase">Gates</div>
                      </div>
                      <div className="text-center p-2 bg-elevated rounded-input">
                        <div className="text-lg font-bold text-primary">4</div>
                        <div className="text-[10px] text-text-tertiary uppercase">Statements</div>
                      </div>
                      <div className="text-center p-2 bg-elevated rounded-input">
                        <div className="text-lg font-bold text-primary">{reconsDone}/{reconciliations.length}</div>
                        <div className="text-[10px] text-text-tertiary uppercase">Recons</div>
                      </div>
                      <div className="text-center p-2 bg-elevated rounded-input">
                        <div className="text-lg font-bold text-primary">{journalEntries.length}</div>
                        <div className="text-[10px] text-text-tertiary uppercase">AJEs</div>
                      </div>
                      <div className="text-center p-2 bg-elevated rounded-input">
                        <div className="text-lg font-bold text-primary">{variancesExplained}/{variances.filter((v) => (v as { isMaterial?: boolean }).isMaterial).length}</div>
                        <div className="text-[10px] text-text-tertiary uppercase">Variances</div>
                      </div>
                      <div className="text-center p-2 bg-elevated rounded-input">
                        <div className="text-lg font-bold text-primary">{manifestData?.totalFiles ?? 0}</div>
                        <div className="text-[10px] text-text-tertiary uppercase">Evidence</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <div className="flex gap-3">
                      {certArtifact?.id && (
                        <a
                          href={`/api/verification/certification/artifacts/${certArtifact.id}`}
                          download
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input border border-border text-sm font-medium hover:bg-hover"
                        >
                          <Download className="w-4 h-4" /> Download Certificate
                        </a>
                      )}
                      <Link
                        href={`/close/${sessionId}/board-package`}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90"
                        onClick={closeCertifyOverlay}
                      >
                        <BookOpen className="w-4 h-4" /> View Board Package
                      </Link>
                    </div>
                    {roleCanLock && <button
                      type="button"
                      onClick={() => { closeCertifyOverlay(); setShowLockDialog(true); }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-input border border-status-amber text-status-amber text-sm font-medium hover:bg-status-amber-dim"
                    >
                      <Lock className="w-4 h-4" /> Lock Period
                    </button>}
                    {certArtifact?.id && (
                      <p className="text-center">
                        <a
                          href={`/close/${sessionId}/review`}
                          onClick={closeCertifyOverlay}
                          className="text-xs text-accent hover:underline inline-flex items-center gap-1"
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
                <XCircle className="w-12 h-12 text-status-red mx-auto mb-4" />
                <p className="text-status-red font-medium text-center mb-2">Certification failed</p>
                <p className="text-sm text-text-secondary text-center">{mutationError}</p>
                <div className="flex justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => { setShowCertifyDialog(false); setCertifyInput(''); setCertifyStep('input'); setMutationError(null); }}
                    className="px-4 py-2 rounded-input border border-border text-sm"
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
            className="relative bg-surface border border-border rounded-card shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg text-primary mb-2">Send Back for Corrections</h3>
            <p className="text-text-secondary text-sm mb-4">
              Provide a reason for sending this period back to the preparer.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason..."
              rows={4}
              className="w-full px-4 py-2 rounded-input border border-border bg-surface text-primary mb-4 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={rejectReason.trim().length < 10 || advanceMutation.isPending}
                className={cn(
                  'px-4 py-2 rounded-input text-sm font-medium',
                  rejectReason.trim().length >= 10
                    ? 'bg-status-red text-white hover:opacity-90'
                    : 'bg-surface-alt text-text-muted cursor-not-allowed'
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
        title="Lock Period"
        message="Are you sure you want to lock this period?"
        detail="Once locked, this period cannot be reopened or modified. This action is irreversible."
        confirmLabel="Lock Period"
        destructive
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
            className="relative bg-surface border border-border rounded-card shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg text-primary mb-2">Reopen Period</h3>
            <p className="text-text-secondary text-sm mb-4">
              Type <strong className="font-mono">REOPEN</strong> and provide a reason to reopen this certified period.
            </p>
            <input
              type="text"
              value={reopenInput}
              onChange={(e) => setReopenInput(e.target.value)}
              placeholder="Type REOPEN"
              className="w-full px-4 py-2 rounded-input border border-border bg-surface text-primary mb-3 font-mono"
              autoFocus
            />
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Enter reason for reopening..."
              rows={3}
              className="w-full px-4 py-2 rounded-input border border-border bg-surface text-primary mb-4 resize-none"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReopenDialog(false);
                  setReopenInput('');
                  setReopenReason('');
                }}
                className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={reopenInput !== 'REOPEN' || reopenReason.trim().length < 10 || reopenMutation.isPending}
                className={cn(
                  'px-4 py-2 rounded-input text-sm font-medium',
                  reopenInput === 'REOPEN' && reopenReason.trim()
                    ? 'bg-status-red text-white hover:opacity-90'
                    : 'bg-surface-alt text-text-muted cursor-not-allowed'
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
        <div className="bg-surface border border-border rounded-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-primary">Reviewer Actions</div>
              <div className="text-sm text-text-secondary mt-1">
                Certify this period or send it back for corrections
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowRejectDialog(true)}
                className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Send Back
              </button>
              <button
                type="button"
                onClick={() => setShowCertifyDialog(true)}
                className="px-4 py-2 rounded-input bg-accent text-white text-sm hover:bg-accent/90 flex items-center gap-2"
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
