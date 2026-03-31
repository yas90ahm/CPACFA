'use client';

/**
 * ModuleReviewTab — HITL review queue for accounting module proposals.
 *
 * Design System Principle 0: Sabit acts, controller confirms or overrides.
 * Design System Principle 1: Every Accept/Reject is accompanied by the Why.
 *
 * Color encoding:
 *   ink-blue badge = "AI Proposed" (Sabit acted)
 *   forest badge = "Controller Approved" (human confirmed)
 *   amber badge = "Needs Review"
 *   muted = "Not Applicable" or "Skipped"
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
  SkipForward,
  Info,
} from 'lucide-react';

interface ModuleProposal {
  id: string;
  moduleName: string;
  standard: string;
  status: 'needs_review' | 'approved' | 'skipped' | 'not_applicable' | 'failed';
  jeId: string | null;
  computationInputs: Record<string, unknown>;
  dataQualityFlags: Array<{ message: string; field: string; severity: 'warning' | 'info' }>;
  skipReason: string | null;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface ModuleReviewTabProps {
  sessionId: string;
}

const MODULE_DISPLAY: Record<string, { label: string; icon: string }> = {
  prepaids: { label: 'Prepaid Amortization', icon: '📋' },
  fixed_assets: { label: 'Fixed Asset Depreciation', icon: '🏭' },
  payroll_accrual: { label: 'Payroll Accrual', icon: '💰' },
  debt_accrual: { label: 'Debt Interest Accrual', icon: '🏦' },
  deferred_tax: { label: 'Deferred Tax Provision', icon: '📊' },
  leases: { label: 'Lease Accounting', icon: '📝' },
  inventory_reserve: { label: 'Inventory Reserve', icon: '📦' },
  stock_compensation: { label: 'Stock Compensation', icon: '📈' },
  impairment: { label: 'Impairment Testing', icon: '⚠' },
  ap_aging: { label: 'AP Aging & Cutoff', icon: '📑' },
  ar_aging: { label: 'AR Aging & CECL', icon: '📑' },
  segments: { label: 'Segment Reporting', icon: '🔲' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  needs_review: { label: 'NEEDS REVIEW', color: 'var(--color-needs-review)', bg: 'var(--color-needs-review-bg)' },
  approved: { label: 'APPROVED', color: 'var(--color-human-confirmed)', bg: 'var(--color-human-confirmed-bg)' },
  skipped: { label: 'SKIPPED', color: 'var(--text-tertiary)', bg: 'var(--bg-surface-sunken)' },
  not_applicable: { label: 'N/A', color: 'var(--text-tertiary)', bg: 'var(--bg-surface-sunken)' },
  failed: { label: 'FAILED', color: 'var(--color-blocking)', bg: 'var(--color-blocking-bg)' },
};

export function ModuleReviewTab({ sessionId }: ModuleReviewTabProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skipReasons, setSkipReasons] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['module-proposals', sessionId],
    queryFn: () => apiFetch<{ proposals: ModuleProposal[]; summary: { total: number; needsReview: number; reviewed: number } }>(
      `/close/sessions/${sessionId}/module-proposals`
    ),
  });

  const approveMutation = useMutation({
    mutationFn: (proposalId: string) =>
      apiFetch(`/close/sessions/${sessionId}/module-proposals/${proposalId}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['module-proposals', sessionId] }),
  });

  const skipMutation = useMutation({
    mutationFn: ({ proposalId, reason }: { proposalId: string; reason: string }) =>
      apiFetch(`/close/sessions/${sessionId}/module-proposals/${proposalId}/skip`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['module-proposals', sessionId] }),
  });

  const proposals = data?.proposals ?? [];
  const summary = data?.summary ?? { total: 0, needsReview: 0, reviewed: 0 };

  // Sort: needs_review first, then failed, then approved, then skipped/na
  const sorted = [...proposals].sort((a, b) => {
    const order: Record<string, number> = { needs_review: 0, failed: 1, approved: 2, skipped: 3, not_applicable: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  if (isLoading) {
    return <div className="py-8 text-center type-body" style={{ color: 'var(--text-tertiary)' }}>Loading module proposals...</div>;
  }

  if (proposals.length === 0) {
    return (
      <div className="py-12 text-center">
        <Info size={32} style={{ color: 'var(--text-tertiary)' }} className="mx-auto mb-3" />
        <p className="type-body" style={{ color: 'var(--text-secondary)' }}>
          No module proposals yet. Proposals are generated when a session advances to In Progress.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="flex items-center justify-between px-1 py-2">
        <p className="type-body-strong" style={{ color: 'var(--text-primary)' }}>
          {summary.reviewed} of {summary.total} modules reviewed
          {summary.needsReview > 0 && (
            <span style={{ color: 'var(--color-needs-review)' }}> — {summary.needsReview} need{summary.needsReview !== 1 ? '' : 's'} your decision</span>
          )}
        </p>
      </div>

      {/* Proposal cards */}
      {sorted.map((proposal) => {
        const display = MODULE_DISPLAY[proposal.moduleName] ?? { label: proposal.moduleName, icon: '📋' };
        const statusCfg = STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.needs_review;
        const isExpanded = expandedId === proposal.id;
        const flags = proposal.dataQualityFlags ?? [];
        const hasWarnings = flags.some((f) => f.severity === 'warning');

        return (
          <div
            key={proposal.id}
            className="border rounded-lg overflow-hidden"
            style={{
              borderColor: proposal.status === 'needs_review' ? 'var(--color-needs-review)' : 'var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            {/* Card header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg">{display.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="type-body-strong" style={{ color: 'var(--text-primary)' }}>{display.label}</span>
                  {proposal.standard && (
                    <span className="type-badge" style={{ color: 'var(--text-tertiary)' }}>{proposal.standard}</span>
                  )}
                </div>
              </div>

              {/* Data quality warnings */}
              {hasWarnings && (
                <AlertTriangle size={15} style={{ color: 'var(--color-needs-review)' }} />
              )}

              {/* Status badge */}
              <span
                className="type-badge px-2 py-0.5 rounded-sm"
                style={{ color: statusCfg.color, backgroundColor: statusCfg.bg }}
              >
                {proposal.status === 'needs_review' ? (
                  <><Sparkles size={10} className="inline mr-1" />AI PROPOSED</>
                ) : proposal.status === 'approved' ? (
                  <><ShieldCheck size={10} className="inline mr-1" />CONTROLLER APPROVED</>
                ) : (
                  statusCfg.label
                )}
              </span>

              {/* Expand toggle */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                className="p-1 rounded"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {/* Expanded detail: computation inputs + flags + actions */}
            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'var(--border-default)' }}>
                {/* Data quality flags */}
                {flags.length > 0 && (
                  <div className="space-y-1">
                    {flags.map((flag, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-3 py-2 rounded-md type-caption"
                        style={{
                          backgroundColor: flag.severity === 'warning' ? 'var(--color-needs-review-bg)' : 'var(--bg-surface-sunken)',
                          color: flag.severity === 'warning' ? 'var(--color-needs-review)' : 'var(--text-secondary)',
                        }}
                      >
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{flag.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Computation inputs ("How Sabit computed this") */}
                <div>
                  <p className="type-badge mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    HOW SABIT COMPUTED THIS
                  </p>
                  <div
                    className="rounded-md px-3 py-2 font-mono text-xs space-y-0.5"
                    style={{ backgroundColor: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }}
                  >
                    {Object.entries(proposal.computationInputs).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span style={{ color: 'var(--text-tertiary)' }}>{key}:</span>
                        <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skip reason if skipped */}
                {proposal.skipReason && (
                  <div className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
                    Skip reason: {proposal.skipReason}
                  </div>
                )}

                {/* Actions */}
                {proposal.status === 'needs_review' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => approveMutation.mutate(proposal.id)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md type-body-strong transition-colors"
                      style={{
                        backgroundColor: 'var(--color-human-confirmed)',
                        color: 'var(--text-inverse)',
                      }}
                    >
                      <CheckCircle2 size={14} />
                      Approve
                    </button>

                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        placeholder="Reason for skipping (min 10 chars)..."
                        value={skipReasons[proposal.id] ?? ''}
                        onChange={(e) => setSkipReasons((p) => ({ ...p, [proposal.id]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 rounded-md text-xs border"
                        style={{
                          backgroundColor: 'var(--bg-surface-sunken)',
                          borderColor: 'var(--border-default)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        onClick={() => skipMutation.mutate({ proposalId: proposal.id, reason: skipReasons[proposal.id] ?? '' })}
                        disabled={skipMutation.isPending || (skipReasons[proposal.id] ?? '').length < 10}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md type-body-strong border transition-colors disabled:opacity-40"
                        style={{
                          borderColor: 'var(--border-default)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <SkipForward size={14} />
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
