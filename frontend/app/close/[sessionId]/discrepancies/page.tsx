'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { AISuggestionBadge } from '@/components/shared/AISuggestionBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  TrendingDown,
  Brain,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  XCircle,
  Eye,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCloseSession } from '@/lib/queries/close-session';
import { useVariances } from '@/lib/queries/variance';
import { useDecisionRecords, useHITLStaging, useResolveStaging, useJustifications, type StagingItem } from '@/lib/queries/ai-insights';
import { useDataQualityExceptions, type DataQualityException } from '@/lib/queries/data-quality';
import { useCloseIssues } from '@/lib/queries/close-session';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type DiscrepancyStatus = 'open' | 'resolved' | 'dismissed';
type DiscrepancyType = 'variance' | 'shadow_audit' | 'data_quality' | 'issue';

interface UnifiedDiscrepancy {
  id: string;
  type: DiscrepancyType;
  title: string;
  description: string;
  entity?: string;
  accountType?: string;
  dollarImpact: string | null;
  severity: Severity;
  status: DiscrepancyStatus;
  detectedAt: string;
  aiResolution: string | null;
  stagingItemId: string | null;
  sourceId: string;
}

function getSeverity(d: { severity?: string; isMaterial?: boolean; changePercent?: string }): Severity {
  if (d.severity === 'critical') return 'critical';
  if (d.severity === 'warning' || d.severity === 'high') return 'high';
  if (d.isMaterial) {
    const pct = Math.abs(parseFloat(d.changePercent ?? '0'));
    return pct > 50 ? 'critical' : pct > 20 ? 'high' : 'medium';
  }
  return 'low';
}

const SEVERITY_STYLES: Record<Severity, { color: React.CSSProperties; bg: React.CSSProperties; border: React.CSSProperties; label: string }> = {
  critical: {
    color: { color: 'var(--status-error)' },
    bg: { background: 'var(--status-error-bg)' },
    border: { borderColor: 'var(--status-error-border)', borderWidth: '1px', borderStyle: 'solid' },
    label: 'Critical',
  },
  high: {
    color: { color: 'var(--status-warning)' },
    bg: { background: 'var(--status-warning-bg)' },
    border: { borderColor: 'var(--status-warning-border)', borderWidth: '1px', borderStyle: 'solid' },
    label: 'High',
  },
  medium: {
    color: { color: 'var(--status-info)' },
    bg: { background: 'var(--status-info-bg)' },
    border: { borderColor: 'var(--status-info-border)', borderWidth: '1px', borderStyle: 'solid' },
    label: 'Medium',
  },
  low: {
    color: { color: 'var(--text-tertiary)' },
    bg: { background: 'var(--bg-surface-sunken)' },
    border: { borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' },
    label: 'Low',
  },
};

const TYPE_CONFIG: Record<DiscrepancyType, { icon: typeof AlertTriangle; label: string; color: string }> = {
  variance: { icon: TrendingDown, label: 'Variance', color: 'var(--status-warning)' },
  shadow_audit: { icon: Brain, label: 'Shadow Audit', color: 'var(--ai-primary)' },
  data_quality: { icon: AlertTriangle, label: 'Data Quality', color: 'var(--status-error)' },
  issue: { icon: XCircle, label: 'Close Issue', color: 'var(--status-error)' },
};

function formatMoney(v: string | null): string {
  return fmtMoney(v, { dollar: true });
}

function formatAge(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(ms / 86400000)}d ago`;
  } catch {
    return iso;
  }
}

function DiscrepancyCard({
  d,
  onAcceptAI,
  onDismiss,
  isResolving,
}: {
  d: UnifiedDiscrepancy;
  onAcceptAI: () => void;
  onDismiss: () => void;
  isResolving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sevConfig = SEVERITY_STYLES[d.severity];
  const typeConfig = TYPE_CONFIG[d.type];
  const TypeIcon = typeConfig.icon;

  const cardStyle: React.CSSProperties = d.status === 'open'
    ? { background: 'var(--bg-surface)', ...sevConfig.border }
    : { background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', opacity: 0.7 };

  return (
    <div
      className="rounded-xl overflow-hidden transition-colors"
      style={cardStyle}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 transition-colors text-left"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={sevConfig.bg}>
          <TypeIcon className="w-4 h-4" style={{ color: typeConfig.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{d.title}</p>
            {d.type === 'shadow_audit' && <AISuggestionBadge label="Shadow Auditor" />}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>{d.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {d.dollarImpact && (
            <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatMoney(d.dollarImpact)}</span>
          )}
          <StatusBadge
            status={sevConfig.label === 'Critical' ? 'failed' : sevConfig.label === 'Warning' ? 'pending' : 'not-started'}
            label={sevConfig.label}
            size="sm"
            showIcon={false}
          />
          <StatusBadge
            status={d.status === 'resolved' ? 'complete' : d.status === 'open' ? 'pending' : 'not-started'}
            label={d.status.toUpperCase()}
            size="sm"
            showIcon={false}
          />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatAge(d.detectedAt)}</span>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="mt-3 space-y-3">
            {/* Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {d.entity && (
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Entity</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{d.entity}</p>
                </div>
              )}
              {d.accountType && (
                <div>
                  <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Account Type</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{d.accountType}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Type</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{typeConfig.label}</p>
              </div>
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Impact</p>
                <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{formatMoney(d.dollarImpact)}</p>
              </div>
            </div>

            {/* AI Resolution */}
            {d.aiResolution && d.status === 'open' && (
              <div className="rounded-lg p-3" style={{ background: 'var(--ai-surface)', border: '1px solid var(--ai-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-3.5 h-3.5" style={{ color: 'var(--ai-primary)' }} />
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ai-primary)' }}>AI-Recommended Resolution</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{d.aiResolution}</p>
              </div>
            )}

            {/* Actions */}
            {d.status === 'open' && (d.type === 'variance' || d.type === 'shadow_audit') && (
              <div className="flex items-center gap-2 pt-1">
                {d.aiResolution && (
                  <button
                    type="button"
                    onClick={onAcceptAI}
                    disabled={isResolving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                    style={{ background: 'var(--interactive-primary)', color: 'var(--text-on-primary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--interactive-primary-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--interactive-primary)'; }}
                  >
                    {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    {d.type === 'variance' ? 'Accept as Explanation' : 'Accept AI Resolution'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isResolving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs disabled:opacity-50 transition-colors"
                  style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <Eye className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            )}
            {d.status === 'open' && (d.type === 'data_quality' || d.type === 'issue') && (
              <p className="text-xs pt-1" style={{ color: 'var(--text-tertiary)' }}>Resolve via the {d.type === 'data_quality' ? 'Data Quality' : 'Close Issues'} page</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscrepanciesPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: session } = useCloseSession(sessionId);
  const periodLabel = session?.periodLabel ?? '';

  const { data: variances = [], isLoading: variancesLoading } = useVariances(sessionId);
  const { data: staging = [] } = useHITLStaging();
  const { data: dqExceptions = [] } = useDataQualityExceptions(periodLabel || undefined);
  const { data: issues = [] } = useCloseIssues(sessionId);
  const { data: justifications = [] } = useJustifications();
  const queryClient = useQueryClient();
  const resolveStaging = useResolveStaging();
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | DiscrepancyType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DiscrepancyStatus>('all');

  // Build unified discrepancy list
  const discrepancies: UnifiedDiscrepancy[] = useMemo(() => {
    const result: UnifiedDiscrepancy[] = [];

    // Variances
    variances.filter((v) => v.isMaterial).forEach((v) => {
      const sev = getSeverity({ isMaterial: true, changePercent: v.changePercent });
      const isExplained = v.explanationStatus === 'explained' || v.explanationStatus === 'approved';
      result.push({
        id: `var-${v.id}`,
        type: 'variance',
        title: `${v.lineItemName} — ${parseFloat(v.changePercent || '0') > 0 ? '+' : ''}${parseFloat(v.changePercent || '0').toFixed(1)}% variance`,
        description: `${v.statementType} line item changed from ${formatMoney(v.priorAmount)} to ${formatMoney(v.currentAmount)}`,
        accountType: v.statementType,
        dollarImpact: v.changeAmount,
        severity: sev,
        status: isExplained ? 'resolved' : 'open',
        detectedAt: new Date().toISOString(),
        aiResolution: v.aiDraftExplanation ?? null,
        stagingItemId: null,
        sourceId: v.id,
      });
    });

    // Shadow audit findings (HITL staging items)
    staging.forEach((s) => {
      const amount = s.amount ? parseFloat(s.amount) : null;
      result.push({
        id: `sa-${s.id}`,
        type: 'shadow_audit',
        title: s.proposedAction,
        description: s.justification,
        dollarImpact: s.amount ?? null,
        severity: amount && Math.abs(amount) > 100000 ? 'high' : 'medium',
        status: s.status === 'pending' ? 'open' : s.status === 'approved' ? 'resolved' : 'dismissed',
        detectedAt: s.createdAt,
        aiResolution: s.justification,
        stagingItemId: s.id,
        sourceId: s.id,
      });
    });

    // Data quality exceptions
    dqExceptions.forEach((e) => {
      result.push({
        id: `dq-${e.id}`,
        type: 'data_quality',
        title: e.message,
        description: e.metric != null ? `Metric: ${e.metric.toLocaleString()}` : 'Data quality rule violation',
        dollarImpact: e.metric != null ? String(e.metric) : null,
        severity: e.severity === 'critical' ? 'critical' : e.severity === 'warning' ? 'high' : 'low',
        status: e.status === 'open' ? 'open' : 'resolved',
        detectedAt: e.createdAt,
        aiResolution: null,
        stagingItemId: null,
        sourceId: e.id,
      });
    });

    // Close issues
    issues.forEach((iss) => {
      result.push({
        id: `iss-${iss.id}`,
        type: 'issue',
        title: iss.title,
        description: iss.description,
        accountType: iss.category,
        dollarImpact: null,
        severity: iss.severity === 'CRITICAL' || iss.severity === 'BLOCKING' ? 'critical' : iss.severity === 'WARNING' ? 'high' : 'medium',
        status: String(iss.status).toLowerCase() === 'resolved' ? 'resolved' : 'open',
        detectedAt: iss.detectedAt,
        aiResolution: null,
        stagingItemId: null,
        sourceId: iss.id,
      });
    });

    // Sort: open first, then by severity
    const sevOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    result.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return sevOrder[a.severity] - sevOrder[b.severity];
    });

    return result;
  }, [variances, staging, dqExceptions, issues]);

  // Apply filters
  const filtered = useMemo(() => {
    let list = discrepancies;
    if (severityFilter !== 'all') list = list.filter((d) => d.severity === severityFilter);
    if (typeFilter !== 'all') list = list.filter((d) => d.type === typeFilter);
    if (statusFilter !== 'all') list = list.filter((d) => d.status === statusFilter);
    return list;
  }, [discrepancies, severityFilter, typeFilter, statusFilter]);

  // Stats
  const openCount = discrepancies.filter((d) => d.status === 'open').length;
  const resolvedCount = discrepancies.filter((d) => d.status === 'resolved').length;
  const totalImpact = discrepancies
    .filter((d) => d.status === 'open' && d.dollarImpact)
    .reduce((sum, d) => sum + Math.abs(parseFloat(d.dollarImpact!)), 0);
  const criticalCount = discrepancies.filter((d) => d.status === 'open' && d.severity === 'critical').length;

  const handleAcceptAI = async (d: UnifiedDiscrepancy) => {
    setResolvingIds((prev) => new Set(prev).add(d.id));
    try {
      if (d.type === 'shadow_audit' && d.stagingItemId) {
        resolveStaging.mutate({ id: d.stagingItemId, action: 'approve' });
      } else if (d.type === 'variance' && d.aiResolution) {
        await apiFetch(`/api/close/variances/${d.sourceId}/explain`, {
          method: 'POST',
          body: { explanation: d.aiResolution, explanation_source: 'ai_draft' },
        });
        queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['readiness', sessionId] });
      }
    } finally {
      setResolvingIds((prev) => { const n = new Set(prev); n.delete(d.id); return n; });
    }
  };

  const handleDismiss = async (d: UnifiedDiscrepancy) => {
    setResolvingIds((prev) => new Set(prev).add(d.id));
    try {
      if (d.type === 'shadow_audit' && d.stagingItemId) {
        resolveStaging.mutate({ id: d.stagingItemId, action: 'reject', reason: 'Dismissed by controller' });
      } else if (d.type === 'variance') {
        await apiFetch(`/api/close/variances/${d.sourceId}/explain`, {
          method: 'POST',
          body: { explanation: 'Reviewed and dismissed — not material or expected.', explanation_source: 'manual' },
        });
        queryClient.invalidateQueries({ queryKey: ['variances', sessionId] });
      }
    } finally {
      setResolvingIds((prev) => { const n = new Set(prev); n.delete(d.id); return n; });
    }
  };

  if (variancesLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-xl" style={{ background: 'var(--bg-surface)' }} />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--bg-surface)' }} />)}
        </div>
      </div>
    );
  }

  const bannerStyle: React.CSSProperties = openCount === 0
    ? { background: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)', borderWidth: '1px', borderStyle: 'solid' }
    : criticalCount > 0
      ? { background: 'var(--status-error-bg)', borderColor: 'var(--status-error-border)', borderWidth: '1px', borderStyle: 'solid' }
      : { background: 'var(--status-warning-bg)', borderColor: 'var(--status-warning-border)', borderWidth: '1px', borderStyle: 'solid' };

  const bannerIconStyle: React.CSSProperties = openCount === 0
    ? { color: 'var(--status-success)' }
    : criticalCount > 0
      ? { color: 'var(--status-error)' }
      : { color: 'var(--status-warning)' };

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-surface-sunken)',
    borderColor: 'var(--border-default)',
    borderWidth: '1px',
    borderStyle: 'solid',
    color: 'var(--text-secondary)',
  };

  return (
    <div className="space-y-6 max-w-[1100px]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Discrepancy Resolver</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Every variance, finding, and exception in one view — {periodLabel}
        </p>
      </div>

      {/* Running total banner */}
      <div
        className="flex items-center justify-between px-5 py-4 rounded-xl"
        style={bannerStyle}
      >
        <div className="flex items-center gap-3">
          {openCount === 0 ? (
            <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
          ) : (
            <AlertTriangle className="w-5 h-5" style={bannerIconStyle} />
          )}
          <div>
            <p className="text-sm font-medium" style={{ color: openCount === 0 ? 'var(--status-success)' : 'var(--text-primary)' }}>
              {openCount === 0 ? 'All discrepancies resolved' : `Resolving this close: ${formatMoney(String(totalImpact))} open variance`}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{openCount} open, {resolvedCount} resolved, {discrepancies.length} total</p>
          </div>
        </div>
        {openCount > 0 && (
          <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatMoney(String(totalImpact))}</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--status-warning)' }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Open</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{openCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Resolved</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{resolvedCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--status-error)' }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Critical</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{criticalCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3.5 h-3.5" style={{ color: 'var(--ai-primary)' }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>AI Resolutions</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {discrepancies.filter((d) => d.aiResolution).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={selectStyle}
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={selectStyle}
        >
          <option value="all">All Types</option>
          <option value="variance">Variances</option>
          <option value="shadow_audit">Shadow Audit</option>
          <option value="data_quality">Data Quality</option>
          <option value="issue">Close Issues</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={selectStyle}
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {/* Discrepancy list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={discrepancies.length === 0 ? 'No discrepancies found — your close is clean' : 'No discrepancies match these filters'}
          description={discrepancies.length === 0 ? 'All accounts reconcile and no shadow audit findings were raised.' : 'Try adjusting the filters above to see more results.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <DiscrepancyCard
              key={d.id}
              d={d}
              onAcceptAI={() => handleAcceptAI(d)}
              onDismiss={() => handleDismiss(d)}
              isResolving={resolvingIds.has(d.id) || resolveStaging.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
