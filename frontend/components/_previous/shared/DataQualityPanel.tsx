'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Check,
} from 'lucide-react';
import {
  useDataQualityExceptions,
  useDataQualitySummary,
  useAcknowledgeException,
  useResolveException,
  type DataQualityException,
} from '@/lib/queries/data-quality';
import { useAuth } from '@/lib/auth';
import { isReadOnly } from '@/lib/permissions';

const SEVERITY_CONFIG = {
  critical: { icon: AlertOctagon, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Warning' },
  info: { icon: Info, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', label: 'Info' },
};

function ExceptionCard({ exception, onAcknowledge, onResolve, readOnly }: {
  exception: DataQualityException;
  onAcknowledge: () => void;
  onResolve: () => void;
  readOnly: boolean;
}) {
  const config = SEVERITY_CONFIG[exception.severity] ?? SEVERITY_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border', config.border, config.bg)}>
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300">{exception.message}</p>
        {exception.metric != null && (
          <p className="text-xs text-gray-500 mt-0.5 font-mono">Metric: {exception.metric.toLocaleString()}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={cn('text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', config.bg, config.color)}>
            {config.label}
          </span>
          <span className="text-xs text-gray-600 uppercase">{exception.status}</span>
        </div>
      </div>
      {!readOnly && exception.status === 'open' && (
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={onAcknowledge}
            className="p-1.5 rounded bg-gray-500/10 text-gray-400 hover:text-white text-xs"
            title="Acknowledge"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onResolve}
            className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 text-xs"
            title="Resolve"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function DataQualityPanel({ periodLabel }: { periodLabel: string }) {
  const { user } = useAuth();
  const readOnly = isReadOnly(user?.role ?? 'controller');
  const userName = user?.email ?? user?.userId ?? 'Unknown';

  const { data: exceptions = [], isLoading } = useDataQualityExceptions(periodLabel);
  const { data: summary } = useDataQualitySummary(periodLabel);
  const acknowledge = useAcknowledgeException();
  const resolve = useResolveException();

  const [expanded, setExpanded] = useState(true);
  const openExceptions = exceptions.filter((e) => e.status === 'open');
  const criticalCount = summary?.bySeverity?.critical ?? 0;
  const warningCount = summary?.bySeverity?.warning ?? 0;
  const totalOpen = openExceptions.length;

  if (isLoading) return null;
  if (totalOpen === 0 && exceptions.length === 0) return null;

  return (
    <div className={cn(
      'bg-[#141829] border rounded-xl overflow-hidden',
      criticalCount > 0 ? 'border-red-500/20' : warningCount > 0 ? 'border-amber-500/20' : 'border-[#262C48]'
    )}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-[#1a1d2e] transition-colors"
      >
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          criticalCount > 0 ? 'bg-red-500/10' : warningCount > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'
        )}>
          <ShieldAlert className={cn(
            'w-4 h-4',
            criticalCount > 0 ? 'text-red-400' : warningCount > 0 ? 'text-amber-400' : 'text-emerald-400'
          )} />
        </div>
        <div className="flex-1 text-left">
          <h3 className="text-xs font-semibold text-white">Data Quality</h3>
          <p className="text-xs text-gray-600">
            {totalOpen === 0
              ? 'All checks passing'
              : `${totalOpen} open issue${totalOpen !== 1 ? 's' : ''}`}
            {criticalCount > 0 && ` · ${criticalCount} critical`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-xs font-semibold tabular-nums">{criticalCount}</span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs font-semibold tabular-nums">{warningCount}</span>
          )}
          {totalOpen === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
        </div>
      </button>
      {expanded && openExceptions.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          {openExceptions.slice(0, 8).map((exc) => (
            <ExceptionCard
              key={exc.id}
              exception={exc}
              readOnly={readOnly}
              onAcknowledge={() => acknowledge.mutate({ id: exc.id, acknowledgedBy: userName })}
              onResolve={() => resolve.mutate({ id: exc.id, resolvedBy: userName })}
            />
          ))}
          {openExceptions.length > 8 && (
            <p className="text-xs text-gray-600 text-center pt-1">+{openExceptions.length - 8} more issues</p>
          )}
        </div>
      )}
    </div>
  );
}
