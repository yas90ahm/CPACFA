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
  const color = pct >= 80 ? 'text-emerald-400 bg-emerald-500/10' : pct >= 50 ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums', color)}>
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
      <div className="text-center py-6 text-gray-600 text-sm">
        <Sparkles className="w-5 h-5 mx-auto mb-2 text-gray-700" />
        No pending proposals
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div key={item.id} className="border border-[#262C48] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="w-full flex items-start gap-3 p-3 text-left hover:bg-[#1a1d2e] transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-[#7C5CFC] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 line-clamp-2">{item.proposedAction}</p>
                <p className="text-[10px] text-gray-600 mt-1">{item.type} · {formatRelativeTime(item.createdAt)}</p>
              </div>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 border-t border-[#1e2235]">
                {item.justification && (
                  <div className="mt-3 p-3 bg-[#0d1017] rounded-lg text-xs text-gray-400 leading-relaxed">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Justification</p>
                    {item.justification}
                  </div>
                )}
                {item.amount && (
                  <div className="mt-2 text-xs text-gray-500">
                    Impact: <span className="text-white font-mono">${item.amount}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => onResolve(item.id, 'approve')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    <ThumbsUp className="w-3 h-3" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => onResolve(item.id, 'reject', 'Not applicable for this period')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
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
      <div className="flex items-center gap-2 py-4 px-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-emerald-400 text-xs">
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
        const severityColor = severity === 'block' ? 'text-red-400' : severity === 'warn' ? 'text-amber-400' : 'text-emerald-400';
        const severityBg = severity === 'block' ? 'bg-red-500/10' : severity === 'warn' ? 'bg-amber-500/10' : 'bg-emerald-500/10';
        const SeverityIcon = severity === 'block' ? XCircle : severity === 'warn' ? AlertTriangle : CheckCircle2;

        return (
          <div key={flag.id} className={cn('border rounded-lg overflow-hidden', severity === 'block' ? 'border-red-500/20' : 'border-[#262C48]')}>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : flag.id)}
              className="w-full flex items-start gap-3 p-3 text-left hover:bg-[#1a1d2e] transition-colors"
            >
              <SeverityIcon className={cn('w-4 h-4 mt-0.5 shrink-0', severityColor)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300">{flag.proposedAction}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase', severityBg, severityColor)}>
                    {severity}
                  </span>
                  <span className="text-[10px] text-gray-600">{formatRelativeTime(flag.createdAt)}</span>
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
            </button>
            {isExpanded && flag.justification && (
              <div className="px-3 pb-3 border-t border-[#1e2235]">
                <div className="mt-3 p-3 bg-[#0d1017] rounded-lg text-xs text-gray-400 leading-relaxed">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">IRAC Analysis</p>
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
      <div className="flex items-center gap-2 py-4 px-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-emerald-400 text-xs">
        <CheckCircle2 className="w-4 h-4" />
        All GL health checks passing
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((check) => (
        <div key={check.id} className={cn(
          'p-3 rounded-lg border',
          check.status === 'fail' ? 'border-red-500/20 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5'
        )}>
          <div className="flex items-start gap-2.5">
            <Zap className={cn('w-4 h-4 mt-0.5 shrink-0', check.status === 'fail' ? 'text-red-400' : 'text-amber-400')} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-300">{check.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{check.description}</p>
              {check.findingCount > 0 && (
                <p className={cn('text-xs mt-1.5 font-medium', check.status === 'fail' ? 'text-red-400' : 'text-amber-400')}>
                  {check.findingCount} finding{check.findingCount !== 1 ? 's' : ''} — review recommended
                </p>
              )}
              {check.findings.slice(0, 3).map((f, i) => (
                <p key={i} className="text-[11px] text-gray-500 mt-1 pl-2 border-l-2 border-[#262C48]">
                  {f.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Decision Records Trail ---
function DecisionTrail({ records }: { records: DecisionRecord[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? records : records.slice(0, 5);

  if (records.length === 0) {
    return (
      <div className="text-center py-6 text-gray-600 text-sm">
        <Target className="w-5 h-5 mx-auto mb-2 text-gray-700" />
        No automated decisions recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {displayed.map((record) => (
        <div key={record.id} className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-[#1a1d2e] transition-colors">
          <div className="w-6 h-6 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center shrink-0 mt-0.5">
            <Brain className="w-3 h-3 text-[#7C5CFC]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-300 capitalize">{record.decisionType.replace(/_/g, ' ')}</span>
              <ConfidenceBadge score={record.confidenceScore} />
            </div>
            {record.rationaleText && (
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{record.rationaleText}</p>
            )}
            <p className="text-[10px] text-gray-700 mt-0.5">{formatRelativeTime(record.createdAt)}</p>
          </div>
        </div>
      ))}
      {records.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center py-2 text-xs text-[#7C5CFC] hover:text-white transition-colors"
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
    <div className="bg-[#141829] border border-[#262C48] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1e2235] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-[#7C5CFC]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">AI Insights</h2>
          <p className="text-[10px] text-gray-600">Autonomous recommendations from Sabit AI</p>
        </div>
        {pendingProposals.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#7C5CFC]/10 text-[#7C5CFC] text-[10px] font-semibold">
            {pendingProposals.length} pending
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e2235]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative',
              activeTab === tab.id ? 'text-white' : 'text-gray-600 hover:text-gray-400'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={cn(
                'min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[9px] font-bold rounded-full',
                activeTab === tab.id ? 'bg-[#7C5CFC] text-white' : 'bg-[#262C48] text-gray-400'
              )}>
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#7C5CFC]" />
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
