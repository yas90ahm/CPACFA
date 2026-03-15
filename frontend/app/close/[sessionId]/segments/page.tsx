'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useSegments, useCreateSegment, useSegmentFinancials, useSegmentReconciliations, useReportabilityCheck } from '@/lib/queries/segments';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import type { OperatingSegment, SegmentFinancials, ReportabilityResult } from '@/lib/types/segments';
import { Plus, Play, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

export default function SegmentsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: segments, isLoading } = useSegments(sessionId);
  const { data: financials } = useSegmentFinancials(sessionId);
  const createSegment = useCreateSegment(sessionId);
  const reportabilityCheck = useReportabilityCheck(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showForm, setShowForm] = useState(false);
  const [reportability, setReportability] = useState<ReportabilityResult | null>(null);
  const [form, setForm] = useState({ segmentName: '', description: '', codmReportBasis: '', isReportable: true });

  const handleCreate = () => {
    createSegment.mutate(form, {
      onSuccess: () => { setShowForm(false); setForm({ segmentName: '', description: '', codmReportBasis: '', isReportable: true }); },
    });
  };

  const handleReportabilityCheck = () => {
    reportabilityCheck.mutate(undefined, {
      onSuccess: (data) => setReportability(data.result),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Segment Reporting</h1>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
              <Plus className="w-4 h-4" /> Add Segment
            </button>
            <button onClick={handleReportabilityCheck} disabled={reportabilityCheck.isPending} className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              <Play className="w-4 h-4" /> {reportabilityCheck.isPending ? 'Checking...' : 'Run Reportability Check'}
            </button>
          </div>
        )}
      </div>

      {!readOnly && showForm && (
        <div className="p-4 rounded-lg space-y-3" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium">New Operating Segment</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Segment Name" value={form.segmentName} onChange={(e) => setForm({ ...form, segmentName: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            <input placeholder="CODM Report Basis" value={form.codmReportBasis} onChange={(e) => setForm({ ...form, codmReportBasis: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isReportable} onChange={(e) => setForm({ ...form, isReportable: e.target.checked })} />
              Is Reportable
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createSegment.isPending} className="px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>Create</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>Cancel</button>
          </div>
        </div>
      )}

      {reportability && (
        <div className="p-4 rounded-lg space-y-3" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Reportability Results (ASC 280)</h3>
            {reportability.aggregateTestPassed ? (
              <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--status-success)' }}><CheckCircle className="w-4 h-4" /> 75% test passed</span>
            ) : (
              <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--status-error)' }}><XCircle className="w-4 h-4" /> 75% test failed ({reportability.aggregateRevenuePercent}%)</span>
            )}
          </div>
          <DataTable<ReportabilityResult['segments'][number]>
            rows={reportability.segments}
            getRowId={(r) => r.segmentId}
            columns={[
              { id: 'segmentName', header: 'Segment', cell: (r) => r.segmentName },
              { id: 'revenuePercent', header: 'Revenue %', cell: (r) => `${r.revenuePercent}%` },
              { id: 'profitLossPercent', header: 'P&L %', cell: (r) => `${r.profitLossPercent}%` },
              { id: 'assetsPercent', header: 'Assets %', cell: (r) => `${r.assetsPercent}%` },
              { id: 'isReportable', header: 'Reportable', cell: (r) => r.isReportable ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} /> : <XCircle className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} /> },
              { id: 'thresholdsMet', header: 'Thresholds Met', cell: (r) => (r.thresholdsMet ?? []).join(', ') || '\u2014' },
            ]}
          />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2">Operating Segments</h2>
        <DataTable<OperatingSegment>
          rows={segments ?? []}
          getRowId={(r) => r.id}
          loading={isLoading}
          columns={[
            { id: 'segmentName', header: 'Name', cell: (r) => r.segmentName },
            { id: 'description', header: 'Description', cell: (r) => r.description ?? '\u2014' },
            { id: 'codmReportBasis', header: 'CODM Basis', cell: (r) => r.codmReportBasis ?? '\u2014' },
            { id: 'isReportable', header: 'Reportable', cell: (r) => r.isReportable ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} /> : <XCircle className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} /> },
          ]}
        />
      </div>

      {financials && financials.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Segment Financials</h2>
          <DataTable<SegmentFinancials>
            rows={financials}
            getRowId={(r) => r.id}
            columns={[
              { id: 'segmentId', header: 'Segment', cell: (r) => {
                const seg = (segments ?? []).find((s) => s.id === r.segmentId);
                return seg?.segmentName ?? r.segmentId;
              }},
              { id: 'revenue', header: 'Revenue', cell: (r) => r.revenue ? <MoneyCell value={r.revenue} /> : '\u2014' },
              { id: 'externalRevenue', header: 'External Rev.', cell: (r) => r.externalRevenue ? <MoneyCell value={r.externalRevenue} /> : '\u2014' },
              { id: 'profitLoss', header: 'P&L', cell: (r) => r.profitLoss ? <MoneyCell value={r.profitLoss} /> : '\u2014' },
              { id: 'assets', header: 'Assets', cell: (r) => r.assets ? <MoneyCell value={r.assets} /> : '\u2014' },
            ]}
          />
        </div>
      )}
    </div>
  );
}
