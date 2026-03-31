'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useApAgingSnapshots, useApAgingDetail, useImportApAging,
  useCutoffItems, useUpdateCutoffDisposition, useProposeCutoffAJEs,
} from '@/lib/queries/ap-aging';
import { fmtMoney } from '@/lib/money';
import { Upload, AlertTriangle, FileText, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const BUCKET_LABELS: Record<string, string> = {
  'current': 'Current', '1-30': '1-30 Days', '31-60': '31-60 Days',
  '61-90': '61-90 Days', '91-120': '91-120 Days', '120+': '120+ Days',
};

const DISPOSITION_COLORS: Record<string, string> = {
  review: 'var(--status-warning)',
  accrue: 'var(--status-info)',
  exclude: 'var(--status-neutral, #888)',
};

export default function ApAgingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: snapshots, isLoading } = useApAgingSnapshots(sessionId);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const { data: detail } = useApAgingDetail(sessionId, selectedSnapshotId);
  const { data: cutoffItems } = useCutoffItems(sessionId);
  const importAging = useImportApAging(sessionId);
  const updateDisposition = useUpdateCutoffDisposition(sessionId);
  const proposeCutoff = useProposeCutoffAJEs(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showImport, setShowImport] = useState(false);
  const [importDate, setImportDate] = useState('');
  const [importJson, setImportJson] = useState('');

  const handleImport = () => {
    try {
      const rows = JSON.parse(importJson);
      if (!Array.isArray(rows)) return;
      importAging.mutate({ snapshotDate: importDate, rows }, {
        onSuccess: () => { setShowImport(false); setImportJson(''); },
      });
    } catch { /* invalid JSON */ }
  };

  const handleDispositionChange = (itemId: string, disposition: string) => {
    updateDisposition.mutate({ itemId, disposition });
  };

  const handleProposeCutoff = () => {
    proposeCutoff.mutate({});
  };

  const bucketSummary = detail?.reduce((acc, d) => {
    acc[d.agingBucket] = (acc[d.agingBucket] ?? 0) + Number(d.amount);
    return acc;
  }, {} as Record<string, number>) ?? {};

  const pastDueCount = detail?.filter((d) => d.isPastDue).length ?? 0;
  const accrueCount = cutoffItems?.filter((c) => c.disposition === 'accrue' && !c.jeId).length ?? 0;

  const inputStyle = { borderWidth: '1px', borderStyle: 'solid' as const, borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>AP Aging & Cutoff Analysis</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Accounts payable aging and period-end cutoff testing</p>
        </div>
        {!readOnly && (
          <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
            <Upload className="w-4 h-4" /> Import Aging
          </button>
        )}
      </div>

      {/* Import panel */}
      {!readOnly && showImport && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Import AP Aging Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
          </div>
          <textarea placeholder='JSON array: [{"vendorName":"Supplier Co","invoiceNumber":"AP-001","invoiceDate":"2026-01-10","dueDate":"2026-02-09","amount":12000}]' value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={4} className="w-full rounded-md px-3 py-2 text-sm font-mono" style={inputStyle} />
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={importAging.isPending || !importDate || !importJson} className="px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {importAging.isPending ? 'Importing...' : 'Import'}
            </button>
            <button onClick={() => setShowImport(false)} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Snapshots */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} /></div>
      ) : !snapshots || snapshots.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>No AP aging snapshots. Import data to begin.</div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>AP Aging Snapshots</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {snapshots.map((s) => (
              <button key={s.id} onClick={() => setSelectedSnapshotId(s.id)} className="p-4 rounded-lg text-left transition-all" style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: selectedSnapshotId === s.id ? 'var(--interactive-primary)' : 'var(--border-default)', background: 'var(--bg-surface)' }}>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.snapshotDate}</div>
                <div className="text-lg font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.totalAp, { dollar: true })}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.recordCount} invoices</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aging detail */}
      {selectedSnapshotId && detail && detail.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Aging Detail</h2>
            {pastDueCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ background: 'var(--status-warning)', color: '#fff' }}>
                <AlertTriangle className="w-3 h-3" /> {pastDueCount} past due
              </span>
            )}
          </div>

          {/* Bucket summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(BUCKET_LABELS).map(([key, label]) => (
              <div key={key} className="p-3 rounded-lg text-center" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
                <div className="text-base font-medium mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(bucketSummary[key] ?? 0, { dollar: true })}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-surface-sunken)' }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Vendor</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Invoice</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Days Out</th>
                  <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Bucket</th>
                  <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Past Due</th>
                </tr>
              </thead>
              <tbody>
                {detail.slice(0, 50).map((d) => (
                  <tr key={d.id} className="hover:bg-hover" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{d.vendorName}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{d.invoiceNumber ?? '-'}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(d.amount, { dollar: true })}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.daysOutstanding}</td>
                    <td className="px-4 py-2 text-center"><span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }}>{BUCKET_LABELS[d.agingBucket] ?? d.agingBucket}</span></td>
                    <td className="px-4 py-2 text-center">{d.isPastDue ? <AlertTriangle className="w-4 h-4 mx-auto" style={{ color: 'var(--status-warning)' }} /> : <CheckCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--status-success)' }} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.length > 50 && <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>Showing 50 of {detail.length} records</div>}
          </div>
        </div>
      )}

      {/* Cutoff items */}
      {cutoffItems && cutoffItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Cutoff Items</h2>
            {!readOnly && accrueCount > 0 && (
              <button onClick={handleProposeCutoff} disabled={proposeCutoff.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
                {proposeCutoff.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Propose Cutoff AJEs ({accrueCount})
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-surface-sunken)' }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Vendor</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Invoice</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Date</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                  <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Disposition</th>
                  <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>JE</th>
                </tr>
              </thead>
              <tbody>
                {cutoffItems.map((c) => (
                  <tr key={c.id} className="hover:bg-hover" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{c.vendorName}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{c.invoiceNumber ?? '-'}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{c.invoiceDate}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(c.amount, { dollar: true })}</td>
                    <td className="px-4 py-2 text-center">
                      {!readOnly && !c.jeId ? (
                        <select value={c.disposition} onChange={(e) => handleDispositionChange(c.id, e.target.value)} className="rounded px-2 py-0.5 text-xs" style={inputStyle}>
                          <option value="review">Review</option>
                          <option value="accrue">Accrue</option>
                          <option value="exclude">Exclude</option>
                        </select>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ background: DISPOSITION_COLORS[c.disposition] ?? '#888' }}>{c.disposition}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">{c.jeId ? <CheckCircle className="w-4 h-4 mx-auto" style={{ color: 'var(--status-success)' }} /> : <span style={{ color: 'var(--text-tertiary)' }}>-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
