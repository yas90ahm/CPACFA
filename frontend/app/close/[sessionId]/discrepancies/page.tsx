'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
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
import { useCloseSession } from '@/lib/queries/close-session';
import { useVariances } from '@/lib/queries/variance';
import { useDecisionRecords, useHITLStaging, useResolveStaging, useJustifications, type StagingItem } from '@/lib/queries/ai-insights';
import { useDataQualityExceptions, type DataQualityException } from '@/lib/queries/data-quality';
import { useCloseIssues } from '@/lib/queries/close-session';

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

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Critical' },
  high: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'High' },
  medium: { color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', label: 'Medium' },
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', label: 'Low' },
};

const TYPE_CONFIG: Record<DiscrepancyType, { icon: typeof AlertTriangle; label: string; color: string }> = {
  variance: { icon: TrendingDown, label: 'Variance', color: 'text-amber-400' },
  shadow_audit: { icon: Brain, label: 'Shadow Audit', color: 'text-[#7C5CFC]' },
  data_quality: { icon: AlertTriangle, label: 'Data Quality', color: 'text-red-400' },
  issue: { icon: XCircle, label: 'Close Issue', color: 'text-rose-400' },
};

function formatMoney(v: string | null): string {
  if (!v) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  const sevConfig = SEVERITY_CONFIG[d.severity];
  const typeConfig = TYPE_CONFIG[d.type];
  const TypeIcon = typeConfig.icon;

  return (
    <div className={cn(
      'bg-[#141829] border rounded-xl overflow-hidden transition-colors',
      d.status === 'open' ? sevConfig.border : 'border-[#262C48] opacity-70'
    )}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-[#1a1d2e] transition-colors text-left"
      >
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', sevConfig.bg)}>
          <TypeIcon className={cn('w-4 h-4', typeConfig.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200">{d.title}</p>
          <p className="text-[10px] text-gray-600 mt-0.5 truncate">{d.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {d.dollarImpact && (
            <span className="text-sm font-mono text-gray-300 tabular-nums">{formatMoney(d.dollarImpact)}</span>
          )}
          <span className={cn('text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded', sevConfig.bg, sevConfig.color)}>
            {sevConfig.label}
          </span>
          <span className={cn(
            'text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded',
            d.status === 'open' ? 'bg-amber-500/10 text-amber-400' : d.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-500'
          )}>
            {d.status}
          </span>
          <span className="text-[10px] text-gray-600">{formatAge(d.detectedAt)}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1e2235]">
          <div className="mt-3 space-y-3">
            {/* Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {d.entity && (
                <div>
                  <p className="text-[9px] text-gray-600 uppercase">Entity</p>
                  <p className="text-xs text-gray-300">{d.entity}</p>
                </div>
              )}
              {d.accountType && (
                <div>
                  <p className="text-[9px] text-gray-600 uppercase">Account Type</p>
                  <p className="text-xs text-gray-300">{d.accountType}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] text-gray-600 uppercase">Type</p>
                <p className="text-xs text-gray-300">{typeConfig.label}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-600 uppercase">Impact</p>
                <p className="text-xs text-gray-300 font-mono">{formatMoney(d.dollarImpact)}</p>
              </div>
            </div>

            {/* AI Resolution */}
            {d.aiResolution && d.status === 'open' && (
              <div className="bg-[#7C5CFC]/5 border border-[#7C5CFC]/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-3.5 h-3.5 text-[#7C5CFC]" />
                  <p className="text-[10px] font-semibold text-[#7C5CFC] uppercase tracking-wider">AI-Recommended Resolution</p>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{d.aiResolution}</p>
              </div>
            )}

            {/* Actions */}
            {d.status === 'open' && (
              <div className="flex items-center gap-2 pt-1">
                {d.aiResolution && (
                  <button
                    type="button"
                    onClick={onAcceptAI}
                    disabled={isResolving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7C5CFC] text-white text-xs font-medium hover:bg-[#6B4FE0] disabled:opacity-50 transition-colors"
                  >
                    {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Accept AI Resolution
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={isResolving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#262C48] text-gray-400 text-xs hover:text-white hover:bg-[#1a1d2e] disabled:opacity-50 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
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
  const resolveStaging = useResolveStaging();

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
        severity: iss.severity === 'critical' ? 'critical' : iss.severity === 'high' ? 'high' : 'medium',
        status: iss.status === 'resolved' ? 'resolved' : 'open',
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

  const handleAcceptAI = (d: UnifiedDiscrepancy) => {
    if (d.stagingItemId) {
      resolveStaging.mutate({ id: d.stagingItemId, action: 'approve' });
    }
  };

  const handleDismiss = (d: UnifiedDiscrepancy) => {
    if (d.stagingItemId) {
      resolveStaging.mutate({ id: d.stagingItemId, action: 'reject', reason: 'Dismissed by controller' });
    }
  };

  if (variancesLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-[#141829] rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-[#141829] rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1100px]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Discrepancy Resolver</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every variance, finding, and exception in one view — {periodLabel}
        </p>
      </div>

      {/* Running total banner */}
      <div className={cn(
        'flex items-center justify-between px-5 py-4 rounded-xl border',
        openCount === 0
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : criticalCount > 0
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-amber-500/5 border-amber-500/20'
      )}>
        <div className="flex items-center gap-3">
          {openCount === 0 ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className={cn('w-5 h-5', criticalCount > 0 ? 'text-red-400' : 'text-amber-400')} />
          )}
          <div>
            <p className={cn('text-sm font-medium', openCount === 0 ? 'text-emerald-400' : 'text-white')}>
              {openCount === 0 ? 'All discrepancies resolved' : `Resolving this close: ${formatMoney(String(totalImpact))} open variance`}
            </p>
            <p className="text-[10px] text-gray-500">{openCount} open, {resolvedCount} resolved, {discrepancies.length} total</p>
          </div>
        </div>
        {openCount > 0 && (
          <span className="text-2xl font-semibold text-white tabular-nums">{formatMoney(String(totalImpact))}</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Open</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{openCount}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Resolved</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{resolvedCount}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Critical</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{criticalCount}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3.5 h-3.5 text-[#7C5CFC]" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AI Resolutions</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">
            {discrepancies.filter((d) => d.aiResolution).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-3.5 h-3.5 text-gray-600" />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="px-3 py-1.5 rounded-lg bg-[#0d1017] border border-[#262C48] text-xs text-gray-300 focus:outline-none focus:border-[#7C5CFC]/50"
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
          className="px-3 py-1.5 rounded-lg bg-[#0d1017] border border-[#262C48] text-xs text-gray-300 focus:outline-none focus:border-[#7C5CFC]/50"
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
          className="px-3 py-1.5 rounded-lg bg-[#0d1017] border border-[#262C48] text-xs text-gray-300 focus:outline-none focus:border-[#7C5CFC]/50"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {/* Discrepancy list */}
      {filtered.length === 0 ? (
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-12 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {discrepancies.length === 0 ? 'No discrepancies found' : 'No discrepancies match these filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <DiscrepancyCard
              key={d.id}
              d={d}
              onAcceptAI={() => handleAcceptAI(d)}
              onDismiss={() => handleDismiss(d)}
              isResolving={resolveStaging.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
