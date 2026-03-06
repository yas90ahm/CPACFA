'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCloseSession } from '@/lib/queries/close-session';
import { useGLHealth, useRunGLHealth } from '@/lib/queries/gl-health';
import type { GLHealthCheck, GLHealthFinding } from '@/lib/queries/gl-health';
import { cn } from '@/lib/utils';
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const gradeColors: Record<string, string> = {
  A: 'bg-status-green-dim text-status-green',
  B: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  C: 'bg-status-amber-dim text-status-amber',
  D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  F: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const gradeBarColors: Record<string, string> = {
  A: 'bg-status-green',
  B: 'bg-blue-500',
  C: 'bg-status-amber',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

const statusColors: Record<string, string> = {
  pass: 'text-status-green',
  warn: 'text-status-amber',
  fail: 'text-red-500',
};

const severityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertCircle,
  critical: AlertTriangle,
};

const severityColors: Record<string, string> = {
  info: 'text-blue-500',
  warning: 'text-status-amber',
  critical: 'text-red-500',
};

function CheckCard({ check }: { check: GLHealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = statusIcons[check.status] ?? CheckCircle2;
  const barColor = check.score >= 90 ? 'bg-status-green' : check.score >= 70 ? 'bg-status-amber' : 'bg-red-500';

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
      >
        <StatusIcon className={cn('w-5 h-5 shrink-0', statusColors[check.status])} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-primary text-sm truncate">{check.name}</span>
            {check.findingCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-surface-raised text-text-secondary">
                {check.findingCount}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${check.score}%` }} />
            </div>
            <span className="text-xs text-text-secondary w-8 text-right">{check.score}</span>
          </div>
        </div>
        {check.findingCount > 0 ? (
          expanded ? <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
        ) : null}
      </button>

      {expanded && (check.findings ?? []).length > 0 && (
        <div className="border-t border-border px-4 py-2 space-y-1 max-h-64 overflow-y-auto">
          <p className="text-xs text-text-secondary mb-2">{check.description}</p>
          {(check.findings ?? []).map((f: GLHealthFinding, i: number) => {
            const SevIcon = severityIcons[f.severity] ?? Info;
            return (
              <div key={i} className="flex items-start gap-2 py-1 text-xs">
                <SevIcon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', severityColors[f.severity])} />
                <span className="text-text-secondary">{f.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GLHealthPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');
  const { data: session } = useCloseSession(sessionId);
  const { data: analysis, isLoading } = useGLHealth(sessionId);
  const runMutation = useRunGLHealth(sessionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display text-primary">GL Health Analysis</h1>
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-text-secondary mb-4">
            Upload a General Ledger to see health analysis, or run it manually.
          </p>
          {!readOnly && <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-input hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Analysis
          </button>}
        </div>
      </div>
    );
  }

  const grade = analysis.overallGrade;
  const gradeColor = gradeColors[grade] ?? gradeColors.F;
  const barColor = gradeBarColors[grade] ?? gradeBarColors.F;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display text-primary">GL Health Analysis</h1>
            <span className={cn('px-3 py-1 rounded-full text-lg font-bold', gradeColor)}>
              {grade}
            </span>
          </div>
          <p className="text-text-secondary text-sm mt-0.5">
            {session?.periodLabel ?? analysis.periodLabel} — {analysis.findingCount} finding{analysis.findingCount !== 1 ? 's' : ''} across {(analysis.checks ?? []).length} checks
          </p>
        </div>
        {!readOnly && <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-input hover:bg-hover transition-colors disabled:opacity-50"
        >
          {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Re-run Analysis
        </button>}
      </div>

      {/* Overall Score Bar */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-primary">Overall Score</span>
          <span className="text-sm text-text-secondary">{analysis.overallScore} / 100</span>
        </div>
        <div className="h-3 bg-surface-raised rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${analysis.overallScore}%` }} />
        </div>
      </div>

      {/* Check Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(analysis.checks ?? []).map((check: GLHealthCheck) => (
          <CheckCard key={check.id} check={check} />
        ))}
      </div>

      {/* Timestamp */}
      {analysis.createdAt && (
        <p className="text-xs text-text-secondary text-right">
          Last run: {new Date(analysis.createdAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
