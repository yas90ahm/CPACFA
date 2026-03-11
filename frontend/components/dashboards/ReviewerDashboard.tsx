'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCloseSession, useCloseReadiness, useCloseIssues } from '@/lib/queries/close-session';
import { useJournalEntries } from '@/lib/queries/adjustments';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useVariances } from '@/lib/queries/variance';
import { useHITLStaging } from '@/lib/queries/ai-insights';
import { useCertification } from '@/lib/queries/certification';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import { cn } from '@/lib/utils';
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
} from 'lucide-react';

export function ReviewerDashboard({ sessionId }: { sessionId: string }) {
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { data: staging = [] } = useHITLStaging();
  const { data: certification } = useCertification(sessionId);
  const { data: auditTrail } = useAuditTrail(sessionId, { limit: 5 });

  if (!session) {
    return (
      <div className="space-y-6 animate-pulse max-w-[1000px]">
        <div className="h-8 w-64 bg-[#1e2235] rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-[#141829] rounded-xl" />)}
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
    { label: 'No open issues', done: issues.filter(i => (i as Record<string, unknown>).status !== 'verified' && (i as Record<string, unknown>).status !== 'waived').length === 0 },
    { label: 'All JEs approved or posted', done: journalEntries.every(e => e.status === 'posted' || e.status === 'approved' || e.status === 'rejected') },
    { label: 'All variances explained', done: variancesUnexplained.length === 0 },
    { label: 'Statements current', done: !!session?.statementsGeneratedAt && !session?.statementsStale },
  ];

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Review Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {session?.entityName} · {session?.periodLabel}
          </p>
        </div>
        {isUnderReview && (
          <Link
            href={`/close/${sessionId}/review`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors"
          >
            <Award className="w-4 h-4" />
            {canCertify ? 'Sign & Certify' : 'Review Close'}
          </Link>
        )}
      </div>

      {/* Awaiting My Action */}
      <div className={cn(
        'border rounded-xl p-5',
        totalAwaiting > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20'
      )}>
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          {totalAwaiting > 0 ? (
            <><AlertCircle className="w-4 h-4 text-amber-400" /> Items Awaiting My Approval</>
          ) : (
            <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> All Items Reviewed</>
          )}
        </h2>
        {totalAwaiting > 0 ? (
          <div className="space-y-2">
            {jesAwaitingApproval.length > 0 && (
              <Link href={`/close/${sessionId}/adjustments?tab=entries`} className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#141829] hover:bg-[#1a1d2e] transition-colors group">
                <div className="flex items-center gap-3">
                  <PenTool className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-gray-300">{jesAwaitingApproval.length} journal entr{jesAwaitingApproval.length === 1 ? 'y' : 'ies'} awaiting approval</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-[#7C5CFC] transition-colors" />
              </Link>
            )}
            {reconsAwaitingApproval.length > 0 && (
              <Link href={`/close/${sessionId}/reconciliation`} className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#141829] hover:bg-[#1a1d2e] transition-colors group">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-gray-300">{reconsAwaitingApproval.length} reconciliation{reconsAwaitingApproval.length === 1 ? '' : 's'} to approve</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-[#7C5CFC] transition-colors" />
              </Link>
            )}
            {variancesUnexplained.length > 0 && (
              <Link href={`/close/${sessionId}/variance`} className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#141829] hover:bg-[#1a1d2e] transition-colors group">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-gray-300">{variancesUnexplained.length} material variance{variancesUnexplained.length === 1 ? '' : 's'} unexplained</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-[#7C5CFC] transition-colors" />
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-emerald-400/70">All journal entries, reconciliations, and variances have been reviewed.</p>
        )}
      </div>

      {/* Certification Readiness + AI Justifications side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Certification Checklist */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-[#7C5CFC]" />
            Certification Readiness
          </h2>
          <div className="space-y-2">
            {certChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-amber-500/50 shrink-0" />
                )}
                <span className={cn('text-sm', item.done ? 'text-gray-300' : 'text-gray-500')}>{item.label}</span>
              </div>
            ))}
          </div>
          {isCertified && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Certified{certification?.certifiedAt ? ` on ${new Date(certification.certifiedAt).toLocaleDateString()}` : ''}
            </div>
          )}
        </div>

        {/* AI Justifications to Review */}
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#7C5CFC]" />
            AI Justifications
          </h2>
          {aiPending.length > 0 ? (
            <div className="space-y-2">
              {aiPending.slice(0, 5).map(item => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#0d1017]">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">{item.proposalType}: {item.description ?? item.id}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Confidence: {Math.round((item.confidence ?? 0) * 100)}%
                    </p>
                  </div>
                </div>
              ))}
              {aiPending.length > 5 && (
                <p className="text-[10px] text-gray-600 text-center mt-2">+{aiPending.length - 5} more</p>
              )}
              <Link
                href={`/close/${sessionId}/ai-review`}
                className="flex items-center justify-center gap-2 mt-3 px-4 py-2 rounded-lg border border-[#262C48] text-xs text-[#7C5CFC] hover:bg-[#7C5CFC]/5 transition-colors"
              >
                Review All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/30 mx-auto mb-2" />
              <p className="text-sm text-gray-500">All AI proposals reviewed</p>
            </div>
          )}
        </div>
      </div>

      {/* Digital Signature Status */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <PenTool className="w-4 h-4 text-[#7C5CFC]" />
          Digital Signature Status
        </h2>
        {certification ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm text-emerald-400 font-medium">Signed with Ed25519</p>
                <p className="text-[10px] text-gray-500 mt-0.5 font-mono truncate">{certification.snapshotHash?.slice(0, 32)}...</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-gray-500">Certified By</p>
                <p className="text-gray-300 mt-0.5">{certification.certifiedBy ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Certified At</p>
                <p className="text-gray-300 mt-0.5">{certification.certifiedAt ? new Date(certification.certifiedAt).toLocaleString() : '—'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Not yet signed</p>
            <p className="text-[10px] text-gray-600 mt-1">Complete all certification checklist items to enable signing.</p>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Activity</h2>
          <Link href={`/close/${sessionId}/audit-trail`} className="text-xs text-[#7C5CFC] hover:text-white transition-colors">View all</Link>
        </div>
        {(auditTrail?.events ?? []).length === 0 ? (
          <p className="text-sm text-gray-600 py-2">No recent activity</p>
        ) : (
          <div className="space-y-0">
            {(auditTrail?.events ?? []).map((a, i) => (
              <div key={a.id} className={cn('flex items-start gap-3 py-2.5', i < (auditTrail?.events ?? []).length - 1 && 'border-b border-[#1e2135]')}>
                <Activity className="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-300">{a.description || a.eventType}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{a.userName ?? 'System'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
