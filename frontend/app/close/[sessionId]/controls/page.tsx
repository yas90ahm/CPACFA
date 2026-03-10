'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Paperclip,
  AlertTriangle,
} from 'lucide-react';
import { useCloseSession } from '@/lib/queries/close-session';
import { useControls, useControlEvidence, type CloseControl, type ControlEvidenceRow } from '@/lib/queries/data-quality';
import { useDataQualityExceptions, useDataQualitySummary } from '@/lib/queries/data-quality';

type ControlStatus = 'passed' | 'failed' | 'untested';

function getControlStatus(control: CloseControl, evidence: ControlEvidenceRow[]): ControlStatus {
  const hasEvidence = evidence.some((e) => e.controlId === control.id);
  return hasEvidence ? 'passed' : 'untested';
}

const STATUS_CONFIG: Record<ControlStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  passed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
  untested: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Untested' },
};

export default function ControlsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: session } = useCloseSession(sessionId);
  const periodLabel = session?.periodLabel ?? '';

  const { data: controls = [], isLoading: controlsLoading } = useControls();
  const { data: evidence = [] } = useControlEvidence(periodLabel || null);
  const { data: exceptions = [] } = useDataQualityExceptions(periodLabel || undefined);
  const { data: summary } = useDataQualitySummary(periodLabel || undefined);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ControlStatus>('all');

  const controlsWithStatus = useMemo(() => {
    return controls.map((c) => ({
      ...c,
      status: getControlStatus(c, evidence),
      evidenceCount: evidence.filter((e) => e.controlId === c.id).length,
    }));
  }, [controls, evidence]);

  const filtered = filter === 'all' ? controlsWithStatus : controlsWithStatus.filter((c) => c.status === filter);

  const stats = useMemo(() => {
    const passed = controlsWithStatus.filter((c) => c.status === 'passed').length;
    const failed = controlsWithStatus.filter((c) => c.status === 'failed').length;
    const untested = controlsWithStatus.filter((c) => c.status === 'untested').length;
    const total = controlsWithStatus.length;
    const readiness = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { passed, failed, untested, total, readiness };
  }, [controlsWithStatus]);

  const openExceptions = exceptions.filter((e) => e.status === 'open').length;

  if (controlsLoading) {
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
    <div className="space-y-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#7C5CFC]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Controls Testing</h1>
            <p className="text-sm text-gray-500">SOX-style control verification for {periodLabel}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Readiness</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.readiness}%</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Passed</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.passed}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Failed</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.failed}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Untested</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{stats.untested}</p>
        </div>
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">DQ Issues</p>
          </div>
          <p className="text-2xl font-semibold text-white tabular-nums">{openExceptions}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(['all', 'passed', 'failed', 'untested'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize',
              filter === f ? 'bg-[#7C5CFC]/10 text-[#7C5CFC]' : 'text-gray-500 hover:text-gray-300 hover:bg-[#141829]'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Controls List */}
      {filtered.length === 0 ? (
        <div className="bg-[#141829] border border-[#262C48] rounded-xl p-12 text-center">
          <Shield className="w-8 h-8 mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {controls.length === 0 ? 'No controls defined yet' : 'No controls match this filter'}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Controls are defined in Settings and tested against evidence each period
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((control) => {
            const statusConf = STATUS_CONFIG[control.status];
            const StatusIcon = statusConf.icon;
            const isExpanded = expandedId === control.id;
            const controlEvidence = evidence.filter((e) => e.controlId === control.id);

            return (
              <div
                key={control.id}
                className={cn(
                  'bg-[#141829] border rounded-xl overflow-hidden transition-colors',
                  control.status === 'failed' ? 'border-red-500/20' : 'border-[#262C48]'
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : control.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-[#1a1d2e] transition-colors text-left"
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', statusConf.bg)}>
                    <StatusIcon className={cn('w-4 h-4', statusConf.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">{control.name}</p>
                    {control.description && (
                      <p className="text-[11px] text-gray-600 mt-0.5 truncate">{control.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {control.owner && (
                      <span className="text-[10px] text-gray-600">{control.owner}</span>
                    )}
                    {control.frequency && (
                      <span className="text-[9px] text-gray-600 uppercase bg-[#1e2235] px-1.5 py-0.5 rounded">{control.frequency}</span>
                    )}
                    <span className={cn('text-[10px] font-semibold uppercase px-2 py-0.5 rounded', statusConf.bg, statusConf.color)}>
                      {statusConf.label}
                    </span>
                    {control.evidenceCount > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Paperclip className="w-3 h-3" /> {control.evidenceCount}
                      </span>
                    )}
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[#1e2235]">
                    <div className="mt-3 space-y-2">
                      {controlEvidence.length > 0 ? (
                        <>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Linked Evidence</p>
                          {controlEvidence.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-3 p-2 rounded bg-[#0d1017] text-xs">
                              <Paperclip className="w-3.5 h-3.5 text-gray-600" />
                              <span className="text-gray-400">{ev.evidenceType}</span>
                              <span className="text-gray-600 font-mono text-[10px]">{ev.evidenceId.slice(0, 8)}...</span>
                              <span className="text-gray-600 ml-auto">{ev.periodLabel}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p className="text-xs text-gray-600 py-2">No evidence linked for this period</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
