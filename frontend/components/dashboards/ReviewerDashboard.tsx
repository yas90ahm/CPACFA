'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCloseSession, useCloseReadiness, useCloseIssues } from '@/lib/queries/close-session';
import { useJournalEntries } from '@/lib/queries/adjustments';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useVariances } from '@/lib/queries/variance';
import { useHITLStaging } from '@/lib/queries/ai-insights';
import { useCertification } from '@/lib/queries/certification';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GateIndicator } from '@/components/shared/GateIndicator';
import { MoneyCell } from '@/components/shared/MoneyCell';
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
  AlertCircle,
  Brain,
  PenTool,
  Shield,
  Activity,
  ListChecks,
  PenLine,
  CheckSquare,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

export function ReviewerDashboard({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { data: staging = [] } = useHITLStaging();
  const { data: certification } = useCertification(sessionId);
  const { data: auditTrail } = useAuditTrail(sessionId, { limit: 5 });

  // FIX 3A: Financial snapshot data
  const { data: statementsData } = useQuery({
    queryKey: ['reviewer-statements', sessionId],
    queryFn: () => apiFetch<{ revenue?: string; netIncome?: string; totalAssets?: string; ebitda?: string }>(`/api/close/sessions/${sessionId}/statement-packages/latest`),
    enabled: !!sessionId,
  });

  // FIX 3B: Pending items for unified approval queue
  const { data: pendingJEs } = useQuery({
    queryKey: ['pending-jes', sessionId],
    queryFn: () => apiFetch<Array<{ id: string; memo?: string; description?: string; amount?: string; createdBy?: string; createdAt?: string }>>(`/api/close/journal-entries?sessionId=${sessionId}&status=proposed`),
    enabled: !!sessionId,
  });

  const { data: pendingRecons } = useQuery({
    queryKey: ['pending-recons', sessionId],
    queryFn: () => apiFetch<Array<{ id: string; accountName?: string; balance?: string; preparedBy?: string; completedAt?: string }>>(`/api/close/sessions/${sessionId}/reconciliations?status=pending_review`),
    enabled: !!sessionId,
  });

  // Approve/reject mutations
  const [optimisticallyRemoved, setOptimisticallyRemoved] = useState<Set<string>>(new Set());

  const approveJEMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}/approve`, { method: 'POST' }),
    onMutate: (jeId) => {
      setOptimisticallyRemoved((prev) => new Set(prev).add(`je-${jeId}`));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-jes', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
    },
  });

  const rejectJEMutation = useMutation({
    mutationFn: (jeId: string) => apiFetch(`/api/close/journal-entries/${jeId}/reject`, { method: 'POST' }),
    onMutate: (jeId) => {
      setOptimisticallyRemoved((prev) => new Set(prev).add(`je-${jeId}`));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-jes', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries', sessionId] });
    },
  });

  const approveReconMutation = useMutation({
    mutationFn: (reconId: string) => apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/approve`, { method: 'POST' }),
    onMutate: (reconId) => {
      setOptimisticallyRemoved((prev) => new Set(prev).add(`recon-${reconId}`));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-recons', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });

  const rejectReconMutation = useMutation({
    mutationFn: (reconId: string) => apiFetch(`/api/close/sessions/${sessionId}/reconciliations/${reconId}/reject`, { method: 'POST' }),
    onMutate: (reconId) => {
      setOptimisticallyRemoved((prev) => new Set(prev).add(`recon-${reconId}`));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-recons', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations', sessionId] });
    },
  });

  if (!session) {
    return (
      <div className="space-y-6 animate-pulse max-w-[1000px]">
        <div className="h-8 w-64 rounded" style={{ background: 'var(--bg-surface-sunken)' }} />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
      </div>
    );
  }

  // Items awaiting CFO action
  const jesAwaitingApproval = journalEntries.filter(e => e.status === 'proposed');
  const reconsAwaitingApproval = reconciliations.filter(r => r.status === 'completed'); // completed but not approved
  const variancesUnexplained = variances.filter(v => v.isMaterial && v.explanationStatus === 'pending');
  const aiPending = staging.filter(s => s.status === 'pending');

  const totalAwaiting = jesAwaitingApproval.length + reconsAwaitingApproval.length + variancesUnexplained.length;

  // Certification readiness
  const gatesPassing = readiness?.gatesPassing ?? 0;
  const gatesTotal = readiness?.gatesTotal ?? 0;
  const canCertify = readiness?.canAdvance && session?.state === 'UNDER_REVIEW';
  const isCertified = session?.state === 'CERTIFIED' || session?.state === 'LOCKED';
  const isUnderReview = session?.state === 'UNDER_REVIEW';

  const certChecklist = [
    { label: 'All gates passing', done: gatesPassing === gatesTotal && gatesTotal > 0 },
    { label: 'No open issues', done: issues.filter(i => i.status !== 'RESOLVED' as string && i.status !== 'WAIVED' as string).length === 0 },
    { label: 'All JEs approved or posted', done: journalEntries.every(e => e.status === 'posted' || e.status === 'approved' || e.status === 'rejected') },
    { label: 'All variances explained', done: variancesUnexplained.length === 0 },
    { label: 'Statements current', done: !!session?.statementsGeneratedAt && !session?.statementsStale },
  ];

  // Build unified pending items list (FIX 3B)
  const pendingItems: Array<{
    key: string;
    type: 'je' | 'recon' | 'variance';
    title: string;
    amount: string | null;
    submittedBy: string;
    date: string;
    id: string;
  }> = [];

  (pendingJEs ?? []).forEach((je) => {
    if (!optimisticallyRemoved.has(`je-${je.id}`)) {
      pendingItems.push({
        key: `je-${je.id}`,
        type: 'je',
        title: je.memo || je.description || `Journal Entry ${je.id.slice(0, 8)}`,
        amount: je.amount ?? null,
        submittedBy: je.createdBy ?? 'Unknown',
        date: je.createdAt ? new Date(je.createdAt).toLocaleDateString() : '',
        id: je.id,
      });
    }
  });

  (pendingRecons ?? []).forEach((r) => {
    if (!optimisticallyRemoved.has(`recon-${r.id}`)) {
      pendingItems.push({
        key: `recon-${r.id}`,
        type: 'recon',
        title: r.accountName || `Reconciliation ${r.id.slice(0, 8)}`,
        amount: r.balance ?? null,
        submittedBy: r.preparedBy ?? 'Unknown',
        date: r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '',
        id: r.id,
      });
    }
  });

  variancesUnexplained.forEach((v) => {
    const vAny = v as { id: string; lineItemName?: string; amount?: string; varianceAmount?: string };
    pendingItems.push({
      key: `var-${vAny.id}`,
      type: 'variance',
      title: vAny.lineItemName || `Variance ${vAny.id.slice(0, 8)}`,
      amount: vAny.varianceAmount ?? vAny.amount ?? null,
      submittedBy: 'System',
      date: '',
      id: vAny.id,
    });
  });

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* FIX 3A: Financial Snapshot */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Revenue', value: statementsData?.revenue },
          { label: 'Net Income', value: statementsData?.netIncome },
          { label: 'Total Assets', value: statementsData?.totalAssets },
          { label: 'EBITDA', value: statementsData?.ebitda },
        ].map((card) => (
          <div key={card.label} className="p-4 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{card.label}</div>
            <div className="text-xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
              <MoneyCell value={card.value || '0'} />
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Review Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {session?.entityName} · {session?.periodLabel}
          </p>
        </div>
        {isUnderReview && (
          <Link
            href={`/close/${sessionId}/review`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
            style={{ background: 'var(--interactive-primary)', color: 'white' }}
          >
            <Award className="w-4 h-4" />
            {canCertify ? 'Sign & Certify' : 'Review Close'}
          </Link>
        )}
      </div>

      {/* Awaiting My Action */}
      <div
        className="border rounded-xl p-5"
        style={totalAwaiting > 0
          ? { background: 'var(--status-warning-bg)', borderColor: 'var(--status-warning-border)' }
          : { background: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)' }
        }
      >
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          {totalAwaiting > 0 ? (
            <><AlertCircle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} /> Items Awaiting My Approval</>
          ) : (
            <><CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} /> All Items Reviewed</>
          )}
        </h2>
        {totalAwaiting > 0 ? (
          <div className="space-y-2">
            {jesAwaitingApproval.length > 0 && (
              <Link href={`/close/${sessionId}/adjustments?tab=entries`} className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors group hover:opacity-90" style={{ background: 'var(--bg-surface)' }}>
                <div className="flex items-center gap-3">
                  <PenTool className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{jesAwaitingApproval.length} journal entr{jesAwaitingApproval.length === 1 ? 'y' : 'ies'} awaiting approval</span>
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </Link>
            )}
            {reconsAwaitingApproval.length > 0 && (
              <Link href={`/close/${sessionId}/reconciliation`} className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors group hover:opacity-90" style={{ background: 'var(--bg-surface)' }}>
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{reconsAwaitingApproval.length} reconciliation{reconsAwaitingApproval.length === 1 ? '' : 's'} to approve</span>
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </Link>
            )}
            {variancesUnexplained.length > 0 && (
              <Link href={`/close/${sessionId}/variance`} className="flex items-center justify-between px-4 py-3 rounded-lg transition-colors group hover:opacity-90" style={{ background: 'var(--bg-surface)' }}>
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{variancesUnexplained.length} material variance{variancesUnexplained.length === 1 ? '' : 's'} unexplained</span>
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--status-success)' }}>All journal entries, reconciliations, and variances have been reviewed.</p>
        )}
      </div>

      {/* FIX 3B: Unified Approval Queue */}
      {pendingItems.length > 0 && (
        <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ListChecks className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
            Pending Your Approval ({pendingItems.length})
          </h2>
          <div className="space-y-2">
            {pendingItems.map((item) => (
              <div key={item.key} className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
                <div className="shrink-0">
                  {item.type === 'je' && <PenLine className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />}
                  {item.type === 'recon' && <CheckSquare className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />}
                  {item.type === 'variance' && <BarChart3 className="w-4 h-4" style={{ color: 'var(--status-info, var(--interactive-primary))' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {item.type === 'je' ? 'Journal Entry' : item.type === 'recon' ? 'Reconciliation' : 'Variance'}
                    {item.submittedBy && ` · ${item.submittedBy}`}
                    {item.date && ` · ${item.date}`}
                  </p>
                </div>
                {item.amount && (
                  <div className="shrink-0">
                    <MoneyCell value={item.amount} showCurrency />
                  </div>
                )}
                {item.type === 'je' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => approveJEMutation.mutate(item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}
                    >
                      <ThumbsUp className="w-3 h-3" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectJEMutation.mutate(item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                    >
                      <ThumbsDown className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
                {item.type === 'recon' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => approveReconMutation.mutate(item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}
                    >
                      <ThumbsUp className="w-3 h-3" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectReconMutation.mutate(item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                    >
                      <ThumbsDown className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
                {item.type === 'variance' && (
                  <Link
                    href={`/close/${sessionId}/variance`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0"
                    style={{ color: 'var(--interactive-primary)' }}
                  >
                    Explain <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certification Readiness + AI Justifications side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Certification Checklist */}
        <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ListChecks className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
            Certification Readiness
          </h2>
          <div className="space-y-2">
            {certChecklist.map((item, i) => (
              <GateIndicator
                key={i}
                gateNumber={i + 1}
                gateName={item.label}
                status={item.done ? 'passed' : 'not-evaluated'}
              />
            ))}
          </div>
          {isCertified && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Certified{certification?.certifiedAt ? ` on ${new Date(certification.certifiedAt).toLocaleDateString()}` : ''}
            </div>
          )}
        </div>

        {/* AI Justifications to Review */}
        <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Brain className="w-4 h-4" style={{ color: 'var(--ai-primary)' }} />
            AI Justifications
          </h2>
          {aiPending.length > 0 ? (
            <div className="space-y-2">
              {aiPending.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--status-warning)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{item.proposalType}: {item.description ?? item.id}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      Confidence: {Math.round((item.confidence ?? 0) * 100)}%
                    </p>
                  </div>
                </div>
              ))}
              {aiPending.length > 5 && (
                <p className="text-xs text-center mt-2" style={{ color: 'var(--text-tertiary)' }}>+{aiPending.length - 5} more</p>
              )}
              <Link
                href={`/close/${sessionId}/ai-review`}
                className="flex items-center justify-center gap-2 mt-3 px-4 py-2 rounded-lg border text-xs transition-colors"
                style={{ borderColor: 'var(--border-default)', color: 'var(--interactive-primary)' }}
              >
                Review All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="text-center py-6">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>All AI proposals reviewed</p>
            </div>
          )}
        </div>
      </div>

      {/* Digital Signature Status */}
      <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <PenTool className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
          Digital Signature Status
        </h2>
        {certification ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border" style={{ background: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)' }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--status-success)' }}>Signed with Ed25519</p>
                <p className="text-xs mt-0.5 font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{certification.snapshotHash?.slice(0, 32)}...</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p style={{ color: 'var(--text-tertiary)' }}>Certified By</p>
                <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>{certification.certifiedBy ?? '—'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--text-tertiary)' }}>Certified At</p>
                <p className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>{certification.certifiedAt ? new Date(certification.certifiedAt).toLocaleString() : '—'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Clock className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Not yet signed</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Complete all certification checklist items to enable signing.</p>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="border rounded-xl p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Recent Activity</h2>
          <Link href={`/close/${sessionId}/audit-trail`} className="text-xs hover:opacity-80 transition-colors" style={{ color: 'var(--interactive-primary)' }}>View all</Link>
        </div>
        {(auditTrail?.events ?? []).length === 0 ? (
          <p className="text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>No recent activity</p>
        ) : (
          <div className="space-y-0">
            {(auditTrail?.events ?? []).map((a, i) => (
              <div key={a.id} className={cn('flex items-start gap-3 py-2.5', i < (auditTrail?.events ?? []).length - 1 && 'border-b')} style={i < (auditTrail?.events ?? []).length - 1 ? { borderColor: 'var(--border-subtle)' } : undefined}>
                <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.description || a.eventType}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{a.userName ?? 'System'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
