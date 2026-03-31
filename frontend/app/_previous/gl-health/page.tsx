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

const gradeStyles: Record<string, React.CSSProperties> = {
  A: { background: 'var(--status-success-bg)', color: 'var(--status-success)' },
  B: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
  C: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  D: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  F: { background: 'var(--status-error-bg)', color: 'var(--status-error)' },
};

const gradeBarStyles: Record<string, React.CSSProperties> = {
  A: { background: 'var(--status-success)' },
  B: { background: 'var(--status-info)' },
  C: { background: 'var(--status-warning)' },
  D: { background: 'var(--status-warning)' },
  F: { background: 'var(--status-error)' },
};

const statusIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

const statusStyles: Record<string, React.CSSProperties> = {
  pass: { color: 'var(--status-success)' },
  warn: { color: 'var(--status-warning)' },
  fail: { color: 'var(--status-error)' },
};

const severityIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  info: Info,
  warning: AlertCircle,
  critical: AlertTriangle,
};

const severityStyles: Record<string, React.CSSProperties> = {
  info: { color: 'var(--status-info)' },
  warning: { color: 'var(--status-warning)' },
  critical: { color: 'var(--status-error)' },
};

function CheckCard({ check }: { check: GLHealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = statusIcons[check.status] ?? CheckCircle2;
  const barStyle: React.CSSProperties = check.score >= 90
    ? { background: 'var(--status-success)' }
    : check.score >= 70
      ? { background: 'var(--status-warning)' }
      : { background: 'var(--status-error)' };

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
      >
        <StatusIcon className="w-5 h-5 shrink-0" style={statusStyles[check.status]} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{check.name}</span>
            {check.findingCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded" style={{ background: 'var(--bg-surface-raised)', color: 'var(--text-secondary)' }}>
                {check.findingCount}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-raised)' }}>
              <div className="h-full rounded-full transition-all" style={{ ...barStyle, width: `${check.score}%` }} />
            </div>
            <span className="text-xs w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{check.score}</span>
          </div>
        </div>
        {check.findingCount > 0 ? (
          expanded ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        ) : null}
      </button>

      {expanded && (check.findings ?? []).length > 0 && (
        <div className="px-4 py-2 space-y-1 max-h-64 overflow-y-auto" style={{ borderTopColor: 'var(--border-default)', borderTopWidth: '1px', borderTopStyle: 'solid' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{check.description}</p>
          {(check.findings ?? []).map((f: GLHealthFinding, i: number) => {
            const SevIcon = severityIcons[f.severity] ?? Info;
            return (
              <div key={i} className="flex items-start gap-2 py-1 text-xs">
                <SevIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={severityStyles[f.severity]} />
                <span style={{ color: 'var(--text-secondary)' }}>{f.message}</span>
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
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>GL Health Analysis</h1>
        <div className="rounded-lg p-8 text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
            Upload a General Ledger to see health analysis, or run it manually.
          </p>
          {!readOnly && <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-input transition-colors disabled:opacity-50"
            style={{ background: 'var(--interactive-primary)' }}
          >
            {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Analysis
          </button>}
        </div>
      </div>
    );
  }

  const grade = analysis.overallGrade;
  const gradeStyle = gradeStyles[grade] ?? gradeStyles.F;
  const barStyle = gradeBarStyles[grade] ?? gradeBarStyles.F;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>GL Health Analysis</h1>
            <span className="px-3 py-1 rounded-full text-lg font-bold" style={gradeStyle}>
              {grade}
            </span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {session?.periodLabel ?? analysis.periodLabel} — {analysis.findingCount} finding{analysis.findingCount !== 1 ? 's' : ''} across {(analysis.checks ?? []).length} checks
          </p>
        </div>
        {!readOnly && <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-input hover:bg-hover transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Re-run Analysis
        </button>}
      </div>

      {/* Overall Score Bar */}
      <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Overall Score</span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{analysis.overallScore} / 100</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-raised)' }}>
          <div className="h-full rounded-full transition-all" style={{ ...barStyle, width: `${analysis.overallScore}%` }} />
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
        <p className="text-xs text-right" style={{ color: 'var(--text-secondary)' }}>
          Last run: {new Date(analysis.createdAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
