'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Activity,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Target,
  Zap,
} from 'lucide-react';
import { useHITLStaging, useResolveStaging, useDecisionRecords, type StagingItem, type DecisionRecord } from '@/lib/queries/ai-insights';
import { useGLHealth, type GLHealthCheck } from '@/lib/queries/gl-health';

interface AIInsightsPanelProps {
  sessionId: string;
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'var(--status-success)' : pct >= 50 ? 'var(--status-warning)' : 'var(--status-error)';
  const bg = pct >= 80 ? 'var(--status-success-bg)' : pct >= 50 ? 'var(--status-warning-bg)' : 'var(--status-error-bg)';
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums"
      style={{ color, background: bg }}
    >
      {pct}%
    </span>
  );
}

// --- Advisor Proposals Section ---
function AdvisorProposals({ items, onResolve, resolving }: {
  items: StagingItem[];
  onResolve: (id: string, action: 'approve' | 'reject', reason?: string) => void;
  resolving: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        <Sparkles className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
        No pending proposals
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div key={item.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="w-full flex items-start gap-3 p-3 text-left transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-sunken)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
            >
              <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--ai-text)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{item.proposedAction}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{item.type} · {formatRelativeTime(item.createdAt)}</p>
              </div>
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              }
            </button>
            {isExpanded && (
              <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                {item.justification && (
                  <div className="mt-3 p-3 rounded-lg text-xs leading-relaxed" style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Justification</p>
                    {item.justification}
                  </div>
                )}
                {item.amount && (
                  <div className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Impact: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>${item.amount}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => onResolve(item.id, 'approve')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}
                  >
                    <ThumbsUp className="w-3 h-3" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => onResolve(item.id, 'reject', 'Not applicable for this period')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                  >
                    <ThumbsDown className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Risk Flags Section ---
function RiskFlags({ staging }: { staging: StagingItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const flagItems = staging.filter((s) => s.type === 'flag_override');

  if (flagItems.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 rounded-lg text-xs" style={{ background: 'var(--status-success-bg)', border: '1px solid var(--status-success)', color: 'var(--status-success)' }}>
        <CheckCircle2 className="w-4 h-4" />
        No risk flags detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {flagItems.map((flag) => {
        const isExpanded = expandedId === flag.id;
        const severity = flag.payload?.severity as string ?? 'warn';
        const severityColor = severity === 'block' ? 'var(--status-error)' : severity === 'warn' ? 'var(--status-warning)' : 'var(--status-success)';
        const severityBg = severity === 'block' ? 'var(--status-error-bg)' : severity === 'warn' ? 'var(--status-warning-bg)' : 'var(--status-success-bg)';
        const SeverityIcon = severity === 'block' ? XCircle : severity === 'warn' ? AlertTriangle : CheckCircle2;

        return (
          <div
            key={flag.id}
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${severity === 'block' ? 'var(--status-error)' : 'var(--border-default)'}` }}
          >
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : flag.id)}
              className="w-full flex items-start gap-3 p-3 text-left transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-sunken)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
            >
              <SeverityIcon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: severityColor }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{flag.proposedAction}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold uppercase" style={{ background: severityBg, color: severityColor }}>
                    {severity}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatRelativeTime(flag.createdAt)}</span>
                </div>
              </div>
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              }
            </button>
            {isExpanded && flag.justification && (
              <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                <div className="mt-3 p-3 rounded-lg text-xs leading-relaxed" style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>IRAC Analysis</p>
                  {flag.justification}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- GL Health Cards ---
function GLHealthCards({ checks }: { checks: GLHealthCheck[] }) {
  const warnings = checks.filter((c) => c.status !== 'pass');
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 rounded-lg text-xs" style={{ background: 'var(--status-success-bg)', border: '1px solid var(--status-success)', color: 'var(--status-success)' }}>
        <CheckCircle2 className="w-4 h-4" />
        All GL health checks passing
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((check) => {
        const isFail = check.status === 'fail';
        return (
          <div
            key={check.id}
            className="p-3 rounded-lg"
            style={{
              border: `1px solid ${isFail ? 'var(--status-error)' : 'var(--status-warning)'}`,
              background: isFail ? 'var(--status-error-bg)' : 'var(--status-warning-bg)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: isFail ? 'var(--status-error)' : 'var(--status-warning)' }} />
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{check.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{check.description}</p>
                {check.findingCount > 0 && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: isFail ? 'var(--status-error)' : 'var(--status-warning)' }}>
                    {check.findingCount} finding{check.findingCount !== 1 ? 's' : ''} — review recommended
                  </p>
                )}
                {check.findings.slice(0, 3).map((f, i) => (
                  <p key={i} className="text-[11px] mt-1 pl-2" style={{ color: 'var(--text-tertiary)', borderLeft: '2px solid var(--border-default)' }}>
                    {f.message}
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Decision Records Trail ---
function DecisionTrail({ records }: { records: DecisionRecord[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? records : records.slice(0, 5);

  if (records.length === 0) {
    return (
      <div className="text-center py-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        <Target className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
        No automated decisions recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {displayed.map((record) => (
        <div
          key={record.id}
          className="flex items-start gap-3 py-2.5 px-3 rounded-lg transition-colors"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-sunken)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--ai-bg)' }}>
            <Brain className="w-3 h-3" style={{ color: 'var(--ai-text)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium capitalize" style={{ color: 'var(--text-secondary)' }}>{record.decisionType.replace(/_/g, ' ')}</span>
              <ConfidenceBadge score={record.confidenceScore} />
            </div>
            {record.rationaleText && (
              <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{record.rationaleText}</p>
            )}
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{formatRelativeTime(record.createdAt)}</p>
          </div>
        </div>
      ))}
      {records.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center py-2 text-xs transition-colors"
          style={{ color: 'var(--ai-text)' }}
        >
          {showAll ? 'Show less' : `Show all ${records.length} decisions`}
        </button>
      )}
    </div>
  );
}

// --- Main Panel ---
export function AIInsightsPanel({ sessionId }: AIInsightsPanelProps) {
  const [activeTab, setActiveTab] = useState<'proposals' | 'risks' | 'health' | 'decisions'>('proposals');
  const { data: allStaging = [] } = useHITLStaging();
  const { data: glHealth } = useGLHealth(sessionId);
  const { data: decisions = [] } = useDecisionRecords(sessionId);
  const resolve = useResolveStaging();

  const pendingProposals = allStaging.filter((s) => s.status === 'pending' && s.type !== 'flag_override');
  const riskFlags = allStaging.filter((s) => s.type === 'flag_override');
  const glChecks = glHealth?.checks ?? [];
  const glWarnings = glChecks.filter((c) => c.status !== 'pass');

  const handleResolve = (id: string, action: 'approve' | 'reject', reason?: string) => {
    resolve.mutate({ id, action, reason });
  };

  const tabs = [
    { id: 'proposals' as const, label: 'Proposals', count: pendingProposals.length, icon: Sparkles },
    { id: 'risks' as const, label: 'Risk Flags', count: riskFlags.length, icon: ShieldAlert },
    { id: 'health' as const, label: 'GL Health', count: glWarnings.length, icon: Activity },
    { id: 'decisions' as const, label: 'Decisions', count: decisions.length, icon: Brain },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--ai-bg)' }}>
          <Brain className="w-4 h-4" style={{ color: 'var(--ai-text)' }} />
        </div>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Insights</h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Autonomous recommendations from Sabit AI</p>
        </div>
        {pendingProposals.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'var(--ai-bg)', color: 'var(--ai-text)' }}>
            {pendingProposals.length} pending
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-default)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative"
            style={{ color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span
                className="min-w-[16px] h-[16px] flex items-center justify-center px-1 text-xs font-bold rounded-full"
                style={activeTab === tab.id
                  ? { background: 'var(--ai-text)', color: '#fff' }
                  : { background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }
                }
              >
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--ai-text)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        {activeTab === 'proposals' && (
          <AdvisorProposals items={pendingProposals} onResolve={handleResolve} resolving={resolve.isPending} />
        )}
        {activeTab === 'risks' && <RiskFlags staging={allStaging} />}
        {activeTab === 'health' && <GLHealthCards checks={glChecks} />}
        {activeTab === 'decisions' && <DecisionTrail records={decisions} />}
      </div>
    </div>
  );
}
