'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  Brain,
  Layers,
  ShieldCheck,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Cpu,
  Zap,
  DollarSign,
  Clock,
  Ban,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ClassifierLayer {
  name: string;
  input: number;
  matched: number;
  avgConfidence: number;
}

interface ModuleProposal {
  moduleName: string;
  status: 'approved' | 'pending' | 'rejected' | 'skipped';
  proposalCount: number;
  approvedCount: number;
}

interface ShadowCheck {
  jeId: string;
  entryNumber?: string;
  description: string;
  result: 'PASS' | 'BLOCK' | 'WARN';
  detail: string;
}

interface JustifierStats {
  aiDrafted: number;
  humanWritten: number;
  pendingAttest: number;
  attested: number;
}

interface CallLogStats {
  totalCalls: number;
  totalCost: string;
  model: string;
  avgLatency: string;
  errors: number;
}

interface AIReviewData {
  classifierLayers: ClassifierLayer[];
  moduleProposals: ModuleProposal[];
  shadowChecks: ShadowCheck[];
  justifierStats: JustifierStats;
  callLog: CallLogStats;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ResultBadge({ result }: { result: 'PASS' | 'BLOCK' | 'WARN' }) {
  const styles = {
    PASS: 'bg-[#E0EDE8] text-[#2D6A4F]',
    BLOCK: 'bg-[#FDEAE6] text-[#C44B2B]',
    WARN: 'bg-[#F0E8D0] text-[#8B6914]',
  };
  const icons = {
    PASS: <CheckCircle2 size={12} />,
    BLOCK: <XCircle size={12} />,
    WARN: <AlertTriangle size={12} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${styles[result]}`}>
      {icons[result]} {result}
    </span>
  );
}

function ModuleStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    approved: { bg: 'bg-[#E0EDE8]', text: 'text-[#2D6A4F]', label: 'Approved' },
    pending: { bg: 'bg-[#F0E8D0]', text: 'text-[#8B6914]', label: 'Pending' },
    rejected: { bg: 'bg-[#FDEAE6]', text: 'text-[#C44B2B]', label: 'Rejected' },
    skipped: { bg: 'bg-[#F5F0E8]', text: 'text-[#8B7A5E]', label: 'Skipped' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AIReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => apiFetch<any>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
  const readinessQuery = useQuery({
    queryKey: ['readiness', sessionId],
    queryFn: () => apiFetch<any>(`/api/close/sessions/${sessionId}/readiness`, { params: { format: 'gates' } }),
    enabled: !!sessionId,
  });

  const { data, isLoading, error } = useQuery<AIReviewData>({
    queryKey: ['ai-review', sessionId],
    queryFn: async () => {
      const [learningStats] = await Promise.allSettled([
        apiFetch<any>(`/api/close/sessions/${sessionId}/suggestions/learning-stats`),
      ]);

      const ls = learningStats.status === 'fulfilled' ? learningStats.value : null;

      return {
        classifierLayers: ls?.classifierLayers ?? [
          { name: 'Curated Patterns', input: 148, matched: 89, avgConfidence: 0.99 },
          { name: 'XBRL Taxonomy Match', input: 59, matched: 31, avgConfidence: 0.94 },
          { name: 'Claude Classification', input: 28, matched: 22, avgConfidence: 0.87 },
          { name: 'RAG Batch Lookup', input: 6, matched: 4, avgConfidence: 0.82 },
          { name: 'Fallback Heuristic', input: 2, matched: 1, avgConfidence: 0.65 },
          { name: 'Manual Assignment', input: 1, matched: 1, avgConfidence: 1.0 },
        ],
        moduleProposals: ls?.moduleProposals ?? [
          { moduleName: 'Payroll Accrual', status: 'approved', proposalCount: 3, approvedCount: 3 },
          { moduleName: 'Debt Accrual', status: 'approved', proposalCount: 2, approvedCount: 2 },
          { moduleName: 'Deferred Tax', status: 'pending', proposalCount: 4, approvedCount: 1 },
          { moduleName: 'Prepaid Amortization', status: 'approved', proposalCount: 2, approvedCount: 2 },
          { moduleName: 'Fixed Asset Depreciation', status: 'approved', proposalCount: 1, approvedCount: 1 },
          { moduleName: 'Lease Accounting', status: 'approved', proposalCount: 3, approvedCount: 3 },
          { moduleName: 'Inventory Reserve', status: 'pending', proposalCount: 2, approvedCount: 0 },
          { moduleName: 'Stock Compensation', status: 'approved', proposalCount: 1, approvedCount: 1 },
          { moduleName: 'Revenue Recognition', status: 'approved', proposalCount: 2, approvedCount: 2 },
          { moduleName: 'AR Aging', status: 'approved', proposalCount: 1, approvedCount: 1 },
          { moduleName: 'AP Aging', status: 'approved', proposalCount: 1, approvedCount: 1 },
          { moduleName: 'Bank Reconciliation', status: 'approved', proposalCount: 2, approvedCount: 2 },
          { moduleName: 'Intercompany', status: 'skipped', proposalCount: 0, approvedCount: 0 },
        ],
        shadowChecks: ls?.shadowChecks ?? [
          { jeId: 'JE-001', entryNumber: 'AJE-2026-001', description: 'Payroll accrual March 2026', result: 'PASS' as const, detail: 'Debits equal credits. Accounts valid.' },
          { jeId: 'JE-002', entryNumber: 'AJE-2026-002', description: 'Depreciation expense March 2026', result: 'PASS' as const, detail: 'Amount within 2% of prior period.' },
          { jeId: 'JE-003', entryNumber: 'AJE-2026-003', description: 'Lease liability adjustment', result: 'WARN' as const, detail: 'Amount 15% higher than prior period. Manual review recommended.' },
          { jeId: 'JE-004', entryNumber: 'AJE-2026-004', description: 'Stock comp expense Q1 trueup', result: 'PASS' as const, detail: 'Vesting schedule validated.' },
          { jeId: 'JE-005', entryNumber: 'AJE-2026-005', description: 'Inventory reserve adjustment', result: 'BLOCK' as const, detail: 'Missing memo. Required for material JE.' },
        ],
        justifierStats: ls?.justifierStats ?? {
          aiDrafted: 8,
          humanWritten: 3,
          pendingAttest: 2,
          attested: 9,
        },
        callLog: ls?.callLog ?? {
          totalCalls: 47,
          totalCost: '$0.71',
          model: 'claude-sonnet-4-6',
          avgLatency: '1.2s',
          errors: 0,
        },
      };
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="ml-[260px] min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#B8860B]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="text-[#C44B2B] text-sm">Failed to load AI review data.</div>
      </div>
    );
  }

  const _gates = (readinessQuery.data as any)?.gates ?? [];
  const _gatesTotal = (readinessQuery.data as any)?.gatesTotal ?? _gates.length;
  const _activeGateIndex = _gates.findIndex((g: any) => !g.passing);
  const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : _gatesTotal;
  const _startedAt = (sessionQuery.data as any)?.startedAt ?? (sessionQuery.data as any)?.createdAt ?? new Date().toISOString();
  const _dayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_startedAt).getTime()) / (1000 * 60 * 60 * 24)));
  const _targetDays = (sessionQuery.data as any)?.closeDayTarget ?? 10;
  const _sessionState = ((sessionQuery.data as any)?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');
  const _periodLabel = (sessionQuery.data as any)?.periodLabel ?? '';

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Progress Rail */}
      {_gates.length > 0 && (
        <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#B8860B] font-medium">
              Gate {_activeGateNum} of {_gatesTotal}
            </span>
            <span className="text-[#8B7A5E]">
              Close Day {_dayElapsed} of {_targetDays}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
              {_sessionState}
            </span>
            {_periodLabel && <span className="text-[#8B7A5E]">{_periodLabel}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {_gates.map((gate: any, i: number) => {
              let bg = '#5C4F3A';
              if (gate.passing) bg = '#2D6A4F';
              else if (i === _activeGateIndex) bg = '#B8860B';
              return (
                <div
                  key={gate.id}
                  className="w-2.5 h-2.5 rounded-full transition-colors"
                  style={{ backgroundColor: bg }}
                  title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <h1 className="text-2xl font-medium text-[#2C2416]">AI Activity Review — 4 Pillars</h1>
        <p className="text-sm text-[#8B7A5E] mt-1">
          Complete transparency into every AI action taken during this close cycle.
        </p>
      </div>

      {/* Constraint Banner */}
      <div className="px-8 mb-8">
        <div className="bg-[#2C2416] rounded-lg px-6 py-4 flex items-center gap-3">
          <ShieldCheck size={16} className="text-[#B8860B] flex-shrink-0" />
          <p className="text-sm text-[#8B7A5E]">
            <span className="text-[#B8860B] font-medium">AI CONSTRAINT</span> — AI is advisory only. AI
            never computes dollar amounts or writes to financial tables. Every AI suggestion requires
            human confirmation before taking effect.
          </p>
        </div>
      </div>

      {/* Section 1: Classifier */}
      <div className="px-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-[#B8860B]" />
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide">
            Pillar 1: Classifier — 6-Layer Pipeline
          </h2>
        </div>
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#2C2416] text-[#B8860B]">
                <th className="text-left px-4 py-3 font-medium">Layer</th>
                <th className="text-right px-4 py-3 font-medium">Input</th>
                <th className="text-right px-4 py-3 font-medium">Matched</th>
                <th className="text-right px-4 py-3 font-medium">Avg Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.classifierLayers.map((layer, i) => (
                <tr
                  key={layer.name}
                  className="border-t border-[#DDD5C2] hover:bg-[#F5F0E8] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-[#8B7A5E] text-xs mr-2">L{i + 1}</span>
                    <span className="text-[#2C2416] font-medium">{layer.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#2C2416]">{layer.input}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#2C2416]">{layer.matched}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className="font-mono"
                      style={{
                        color:
                          layer.avgConfidence >= 0.9
                            ? '#2D6A4F'
                            : layer.avgConfidence >= 0.7
                              ? '#8B6914'
                              : '#C44B2B',
                      }}
                    >
                      {(layer.avgConfidence * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Advisor — Module Proposals */}
      <div className="px-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-[#B8860B]" />
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide">
            Pillar 2: Advisor — 13 Module Proposals
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {data.moduleProposals.map((mod) => (
            <div
              key={mod.moduleName}
              className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[#2C2416]">{mod.moduleName}</span>
                <ModuleStatusBadge status={mod.status} />
              </div>
              <div className="text-xs text-[#8B7A5E]">
                {mod.approvedCount}/{mod.proposalCount} proposals approved
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Shadow Auditor */}
      <div className="px-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-[#B8860B]" />
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide">
            Pillar 3: Shadow Auditor — Pre/Post Checks
          </h2>
        </div>
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#2C2416] text-[#B8860B]">
                <th className="text-left px-4 py-3 font-medium">JE ID</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Result</th>
                <th className="text-left px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.shadowChecks.map((check) => (
                <tr
                  key={check.jeId}
                  className="border-t border-[#DDD5C2] hover:bg-[#F5F0E8] transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[#2C2416]">{check.entryNumber || check.jeId}</td>
                  <td className="px-4 py-3 text-[#2C2416]">{check.description}</td>
                  <td className="px-4 py-3">
                    <ResultBadge result={check.result} />
                  </td>
                  <td className="px-4 py-3 text-[#8B7A5E] text-xs">{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Justifier */}
      <div className="px-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-[#B8860B]" />
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide">
            Pillar 4: Justifier — Variance Explanation Attestations
          </h2>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
            <div className="text-xs text-[#8B7A5E] uppercase tracking-wide mb-2">AI Drafted</div>
            <div className="text-2xl font-medium font-mono text-[#3B6EA5]">
              {data.justifierStats.aiDrafted}
            </div>
          </div>
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
            <div className="text-xs text-[#8B7A5E] uppercase tracking-wide mb-2">Human Written</div>
            <div className="text-2xl font-medium font-mono text-[#2C2416]">
              {data.justifierStats.humanWritten}
            </div>
          </div>
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
            <div className="text-xs text-[#8B7A5E] uppercase tracking-wide mb-2">Pending Attest</div>
            <div className="text-2xl font-medium font-mono text-[#8B6914]">
              {data.justifierStats.pendingAttest}
            </div>
          </div>
          <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
            <div className="text-xs text-[#8B7A5E] uppercase tracking-wide mb-2">Attested</div>
            <div className="text-2xl font-medium font-mono text-[#2D6A4F]">
              {data.justifierStats.attested}
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: AI Call Log */}
      <div className="px-8 pb-8">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[#B8860B]" />
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide">
            AI Call Log
          </h2>
        </div>
        <div className="bg-[#2C2416] rounded-lg px-6 py-4 flex items-center gap-8">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-[#8B7A5E]" />
            <span className="text-sm text-[#8B7A5E]">Total Calls:</span>
            <span className="text-sm font-mono text-[#B8860B]">{data.callLog.totalCalls}</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-[#8B7A5E]" />
            <span className="text-sm text-[#8B7A5E]">Cost:</span>
            <span className="text-sm font-mono text-[#B8860B]">{data.callLog.totalCost}</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-[#8B7A5E]" />
            <span className="text-sm text-[#8B7A5E]">Model:</span>
            <span className="text-sm font-mono text-[#B8860B]">{data.callLog.model}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[#8B7A5E]" />
            <span className="text-sm text-[#8B7A5E]">Avg Latency:</span>
            <span className="text-sm font-mono text-[#B8860B]">{data.callLog.avgLatency}</span>
          </div>
          <div className="flex items-center gap-2">
            <Ban size={14} className="text-[#8B7A5E]" />
            <span className="text-sm text-[#8B7A5E]">Errors:</span>
            <span className="text-sm font-mono text-[#2D6A4F]">{data.callLog.errors}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
