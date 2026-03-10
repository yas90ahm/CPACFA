'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Brain,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Zap,
} from 'lucide-react';

// ── Recon AI Helper ─────────────────────────────────────────────────────────

interface ReconAccount {
  id: string;
  accountCode: string;
  accountName: string;
  glBalance: string;
  supportingBalance: string | null;
  variance: string;
  unexplainedVariance: string;
  tolerance: string;
  status: string;
}

export function ReconAIFlags({
  reconciliations,
  materialityThreshold = 50000,
  sessionId,
}: {
  reconciliations: ReconAccount[];
  materialityThreshold?: number;
  sessionId: string;
}) {
  const flags = useMemo(() => {
    const results: { id: string; accountCode: string; accountName: string; severity: 'high' | 'medium' | 'low'; message: string; link: string }[] = [];

    for (const r of reconciliations) {
      if (r.supportingBalance == null) continue;
      const variance = Math.abs(parseFloat(r.unexplainedVariance?.replace(/[$,]/g, '') || '0'));
      const tolerance = Math.abs(parseFloat(r.tolerance?.replace(/[$,]/g, '') || '0'));
      const glBal = Math.abs(parseFloat(r.glBalance?.replace(/[$,]/g, '') || '0'));

      // Over tolerance
      if (variance > tolerance && variance > 0) {
        const severity = variance > materialityThreshold ? 'high' : variance > materialityThreshold * 0.5 ? 'medium' : 'low';
        results.push({
          id: r.id,
          accountCode: r.accountCode,
          accountName: r.accountName,
          severity,
          message: `Unexplained variance of $${variance.toLocaleString()} exceeds tolerance of $${tolerance.toLocaleString()}`,
          link: `/close/${sessionId}/reconciliation/${r.id}`,
        });
      }

      // Large balance with no supporting balance entered
      if (r.supportingBalance === null && glBal > materialityThreshold && r.status === 'not_started') {
        results.push({
          id: r.id,
          accountCode: r.accountCode,
          accountName: r.accountName,
          severity: 'medium',
          message: `Material balance ($${glBal.toLocaleString()}) not yet reconciled`,
          link: `/close/${sessionId}/reconciliation/${r.id}`,
        });
      }
    }

    return results.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [reconciliations, materialityThreshold, sessionId]);

  if (flags.length === 0) return null;

  return (
    <div className="bg-[#141829] border border-[#7C5CFC]/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-[#7C5CFC]" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-[#7C5CFC] uppercase tracking-wider">AI Reconciliation Flags</h3>
          <p className="text-[10px] text-gray-600">{flags.length} account{flags.length !== 1 ? 's' : ''} need attention</p>
        </div>
      </div>
      <div className="space-y-2">
        {flags.slice(0, 5).map((flag) => (
          <Link
            key={flag.id}
            href={flag.link}
            className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1017] hover:bg-[#1a1d2e] transition-colors group"
          >
            <AlertTriangle className={cn(
              'w-4 h-4 mt-0.5 shrink-0',
              flag.severity === 'high' ? 'text-red-400' :
              flag.severity === 'medium' ? 'text-amber-400' : 'text-yellow-500/60'
            )} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">{flag.accountCode}</span>
                <span className="text-xs text-gray-300">{flag.accountName}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{flag.message}</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-[#7C5CFC] transition-colors shrink-0 mt-1" />
          </Link>
        ))}
        {flags.length > 5 && (
          <p className="text-[10px] text-gray-600 text-center pt-1">
            +{flags.length - 5} more flagged accounts
          </p>
        )}
      </div>
    </div>
  );
}

// ── JE Classification Suggestion ─────────────────────────────────────────────

export function JEClassificationHint({
  pendingCount,
  proposedCount,
  postedCount,
  templatesPending,
}: {
  pendingCount: number;
  proposedCount: number;
  postedCount: number;
  templatesPending: number;
}) {
  const suggestions: { icon: React.ReactNode; text: string; priority: 'high' | 'normal' }[] = [];

  if (templatesPending > 0) {
    suggestions.push({
      icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
      text: `${templatesPending} recurring template${templatesPending !== 1 ? 's' : ''} ready to apply — these are pre-approved entries from prior periods`,
      priority: 'high',
    });
  }

  if (proposedCount > 0) {
    suggestions.push({
      icon: <ShieldCheck className="w-3.5 h-3.5 text-[#7C5CFC]" />,
      text: `${proposedCount} entr${proposedCount !== 1 ? 'ies' : 'y'} awaiting reviewer approval`,
      priority: 'high',
    });
  }

  if (pendingCount > 0) {
    suggestions.push({
      icon: <Sparkles className="w-3.5 h-3.5 text-sky-400" />,
      text: `${pendingCount} draft${pendingCount !== 1 ? 's' : ''} not yet submitted — review and propose when ready`,
      priority: 'normal',
    });
  }

  if (postedCount > 0 && proposedCount === 0 && pendingCount === 0 && templatesPending === 0) {
    suggestions.push({
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
      text: `All ${postedCount} entries posted. Adjustments phase complete.`,
      priority: 'normal',
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="bg-[#141829] border border-[#7C5CFC]/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-[#7C5CFC]" />
        </div>
        <h3 className="text-xs font-semibold text-[#7C5CFC] uppercase tracking-wider">AI Adjustment Insights</h3>
      </div>
      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0d1017]">
            <div className="mt-0.5 shrink-0">{s.icon}</div>
            <p className="text-[11px] text-gray-400 leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Close Checklist Suggestions ──────────────────────────────────────────────

interface ChecklistSuggestion {
  label: string;
  description: string;
  link: string;
  priority: 'blocking' | 'recommended' | 'optional';
}

export function CloseChecklistSuggestions({
  sessionId,
  unmappedCount,
  reconIncomplete,
  reconTotal,
  templatesPending,
  proposedEntries,
  statementsGenerated,
  statementsStale,
  varianceUnexplained,
  currentState,
}: {
  sessionId: string;
  unmappedCount: number;
  reconIncomplete: number;
  reconTotal: number;
  templatesPending: number;
  proposedEntries: number;
  statementsGenerated: boolean;
  statementsStale: boolean;
  varianceUnexplained: number;
  currentState: string;
}) {
  const suggestions = useMemo((): ChecklistSuggestion[] => {
    const result: ChecklistSuggestion[] = [];

    if (unmappedCount > 0) {
      result.push({
        label: 'Map remaining accounts',
        description: `${unmappedCount} accounts still unmapped. This blocks statement generation.`,
        link: `/close/${sessionId}/mapping?unmapped=1`,
        priority: 'blocking',
      });
    }

    if (reconIncomplete > 0) {
      result.push({
        label: 'Complete reconciliations',
        description: `${reconIncomplete} of ${reconTotal} reconciliations incomplete.`,
        link: `/close/${sessionId}/reconciliation`,
        priority: 'blocking',
      });
    }

    if (templatesPending > 0) {
      result.push({
        label: 'Resolve AJE templates',
        description: `${templatesPending} recurring template${templatesPending !== 1 ? 's' : ''} pending. Apply or skip each one.`,
        link: `/close/${sessionId}/adjustments?tab=templates`,
        priority: 'blocking',
      });
    }

    if (proposedEntries > 0) {
      result.push({
        label: 'Review proposed entries',
        description: `${proposedEntries} journal entr${proposedEntries !== 1 ? 'ies' : 'y'} awaiting approval.`,
        link: `/close/${sessionId}/adjustments?tab=entries`,
        priority: 'recommended',
      });
    }

    if (!statementsGenerated) {
      result.push({
        label: 'Generate financial statements',
        description: 'Statements have not been generated yet for this period.',
        link: `/close/${sessionId}/statements`,
        priority: unmappedCount === 0 ? 'blocking' : 'recommended',
      });
    } else if (statementsStale) {
      result.push({
        label: 'Regenerate statements',
        description: 'Statements are stale due to recent journal entry postings.',
        link: `/close/${sessionId}/statements`,
        priority: 'blocking',
      });
    }

    if (varianceUnexplained > 0) {
      result.push({
        label: 'Explain material variances',
        description: `${varianceUnexplained} material variance${varianceUnexplained !== 1 ? 's' : ''} need explanations.`,
        link: `/close/${sessionId}/variance`,
        priority: 'blocking',
      });
    }

    if (result.length === 0 && currentState === 'IN_PROGRESS') {
      result.push({
        label: 'Submit for review',
        description: 'All gates are passing. Ready to submit for reviewer certification.',
        link: `/close/${sessionId}/review`,
        priority: 'recommended',
      });
    }

    return result;
  }, [sessionId, unmappedCount, reconIncomplete, reconTotal, templatesPending, proposedEntries, statementsGenerated, statementsStale, varianceUnexplained, currentState]);

  if (suggestions.length === 0) return null;

  const blocking = suggestions.filter((s) => s.priority === 'blocking');
  const recommended = suggestions.filter((s) => s.priority === 'recommended');

  return (
    <div className="bg-[#141829] border border-[#7C5CFC]/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-[#7C5CFC]" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-[#7C5CFC] uppercase tracking-wider">AI Next Steps</h3>
          <p className="text-[10px] text-gray-600">
            {blocking.length > 0
              ? `${blocking.length} blocking task${blocking.length !== 1 ? 's' : ''} remaining`
              : 'All blocking tasks complete'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        {suggestions.map((s, i) => (
          <Link
            key={i}
            href={s.link}
            className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1017] hover:bg-[#1a1d2e] transition-colors group"
          >
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5',
              s.priority === 'blocking' ? 'bg-red-500/10' :
              s.priority === 'recommended' ? 'bg-amber-500/10' : 'bg-gray-500/10'
            )}>
              {s.priority === 'blocking' ? (
                <AlertTriangle className="w-3 h-3 text-red-400" />
              ) : s.priority === 'recommended' ? (
                <Sparkles className="w-3 h-3 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">{s.label}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{s.description}</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-[#7C5CFC] transition-colors shrink-0 mt-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Close Health Score ────────────────────────────────────────────────────────

export function CloseHealthScore({
  gatesPassing,
  gatesTotal,
  reconComplete,
  reconTotal,
  aiPendingCount,
  chainIntegrity,
  overdueItems,
}: {
  gatesPassing: number;
  gatesTotal: number;
  reconComplete: number;
  reconTotal: number;
  aiPendingCount: number;
  chainIntegrity: boolean | null;
  overdueItems: number;
}) {
  const score = useMemo(() => {
    if (gatesTotal === 0) return 0;

    // Gate completion: 40% weight
    const gateScore = (gatesPassing / gatesTotal) * 40;

    // Recon completion: 25% weight
    const reconScore = reconTotal > 0 ? (reconComplete / reconTotal) * 25 : 25;

    // Integrity: 20% weight
    const integrityScore = chainIntegrity === true ? 20 : chainIntegrity === false ? 0 : 10;

    // Outstanding AI proposals: 10% weight (fewer = better)
    const aiScore = aiPendingCount === 0 ? 10 : aiPendingCount <= 3 ? 7 : aiPendingCount <= 10 ? 4 : 0;

    // Overdue items: 5% weight
    const overdueScore = overdueItems === 0 ? 5 : overdueItems <= 2 ? 3 : 0;

    return Math.round(gateScore + reconScore + integrityScore + aiScore + overdueScore);
  }, [gatesPassing, gatesTotal, reconComplete, reconTotal, chainIntegrity, aiPendingCount, overdueItems]);

  const label = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Work';
  const color = score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-sky-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const bgColor = score >= 90 ? 'bg-emerald-400' : score >= 70 ? 'bg-sky-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400';
  const ringColor = score >= 90 ? 'stroke-emerald-400' : score >= 70 ? 'stroke-sky-400' : score >= 50 ? 'stroke-amber-400' : 'stroke-red-400';

  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Close Health</span>
        <TrendingUp className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex items-center gap-5">
        {/* Circular score */}
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="#1e2235" strokeWidth="6" />
            <circle
              cx="48" cy="48" r="40"
              fill="none"
              className={ringColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-2xl font-semibold tabular-nums', color)}>{score}</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-medium', color)}>{label}</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Gates</span>
              <span className="text-gray-400 tabular-nums">{gatesPassing}/{gatesTotal}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Reconciliations</span>
              <span className="text-gray-400 tabular-nums">{reconComplete}/{reconTotal}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Integrity</span>
              <span className={cn('tabular-nums', chainIntegrity === true ? 'text-emerald-400' : chainIntegrity === false ? 'text-red-400' : 'text-gray-500')}>
                {chainIntegrity === true ? 'Verified' : chainIntegrity === false ? 'Broken' : 'Unknown'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">AI Proposals</span>
              <span className={cn('tabular-nums', aiPendingCount === 0 ? 'text-emerald-400' : 'text-amber-400')}>
                {aiPendingCount === 0 ? 'None pending' : `${aiPendingCount} pending`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
