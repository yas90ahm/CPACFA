'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useArAgingSnapshots, useArAgingDetail, useImportArAging,
  useCECLConfig, useUpdateCECLConfig, useComputeCECL, useProposeCECLAJE,
} from '@/lib/queries/ar-aging';
import { fmtMoney } from '@/lib/money';
import { Upload, Calculator, FileText, Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const BUCKET_LABELS: Record<string, string> = {
  'current': 'Current', '1-30': '1-30 Days', '31-60': '31-60 Days',
  '61-90': '61-90 Days', '91-120': '91-120 Days', '120+': '120+ Days',
};

export default function ArAgingPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: snapshots, isLoading } = useArAgingSnapshots(sessionId);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const { data: detail } = useArAgingDetail(sessionId, selectedSnapshotId);
  const { data: ceclConfig } = useCECLConfig(sessionId);
  const importAging = useImportArAging(sessionId);
  const updateConfig = useUpdateCECLConfig(sessionId);
  const computeCECL = useComputeCECL(sessionId);
  const proposeCECL = useProposeCECLAJE(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showImport, setShowImport] = useState(false);
  const [importDate, setImportDate] = useState('');
  const [importJson, setImportJson] = useState('');
  const [currentAllowance, setCurrentAllowance] = useState('0');
  const [lastComputation, setLastComputation] = useState<Record<string, unknown> | null>(null);

  const handleImport = () => {
    try {
      const rows = JSON.parse(importJson);
      if (!Array.isArray(rows)) return;
      importAging.mutate({ snapshotDate: importDate, rows }, {
        onSuccess: () => { setShowImport(false); setImportJson(''); },
      });
    } catch { /* invalid JSON */ }
  };

  const handleComputeCECL = () => {
    if (!selectedSnapshotId) return;
    computeCECL.mutate(
      { snapshotId: selectedSnapshotId, currentAllowanceBalance: Number(currentAllowance) },
      { onSuccess: (res) => setLastComputation(res.computation) }
    );
  };

  const handlePropose = () => {
    if (!lastComputation) return;
    proposeCECL.mutate({ computationId: lastComputation.id as string });
  };

  // Bucket summary from detail
  const bucketSummary = detail?.reduce((acc, d) => {
    acc[d.agingBucket] = (acc[d.agingBucket] ?? 0) + Number(d.amount);
    return acc;
  }, {} as Record<string, number>) ?? {};

  const inputStyle = { borderWidth: '1px', borderStyle: 'solid' as const, borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>AR Aging & CECL Allowance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Accounts receivable aging analysis and expected credit loss computation (ASC 326)</p>
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
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Import AR Aging Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="date" placeholder="Snapshot Date" value={importDate} onChange={(e) => setImportDate(e.target.value)} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
          </div>
          <textarea placeholder='JSON array: [{"customerName":"Acme","invoiceNumber":"INV-001","invoiceDate":"2026-01-15","dueDate":"2026-02-14","amount":5000}]' value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={4} className="w-full rounded-md px-3 py-2 text-sm font-mono" style={inputStyle} />
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
        <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>No AR aging snapshots. Import aging data to begin.</div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Aging Snapshots</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {snapshots.map((s) => (
              <button key={s.id} onClick={() => setSelectedSnapshotId(s.id)} className="p-4 rounded-lg text-left transition-all" style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: selectedSnapshotId === s.id ? 'var(--interactive-primary)' : 'var(--border-default)', background: 'var(--bg-surface)' }}>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.snapshotDate}</div>
                <div className="text-lg font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.totalAr, { dollar: true })}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.recordCount} invoices</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aging bucket summary */}
      {selectedSnapshotId && detail && detail.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Aging Bucket Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(BUCKET_LABELS).map(([key, label]) => (
              <div key={key} className="p-3 rounded-lg text-center" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
                <div className="text-base font-medium mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(bucketSummary[key] ?? 0, { dollar: true })}</div>
              </div>
            ))}
          </div>

          {/* Detail table */}
          <div className="overflow-x-auto rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-surface-sunken)' }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Invoice</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                  <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Days Out</th>
                  <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Bucket</th>
                </tr>
              </thead>
              <tbody>
                {detail.slice(0, 50).map((d) => (
                  <tr key={d.id} className="hover:bg-hover" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{d.customerName}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{d.invoiceNumber ?? '-'}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(d.amount, { dollar: true })}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{d.daysOutstanding}</td>
                    <td className="px-4 py-2 text-center"><span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }}>{BUCKET_LABELS[d.agingBucket] ?? d.agingBucket}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.length > 50 && <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>Showing 50 of {detail.length} records</div>}
          </div>
        </div>
      )}

      {/* CECL computation */}
      {selectedSnapshotId && !readOnly && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
            <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>CECL Allowance Computation</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Current Allowance Balance:</label>
            <input type="number" value={currentAllowance} onChange={(e) => setCurrentAllowance(e.target.value)} className="rounded-md px-3 py-1.5 text-sm w-40" style={inputStyle} />
            <button onClick={handleComputeCECL} disabled={computeCECL.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {computeCECL.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              Compute CECL
            </button>
          </div>

          {lastComputation && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Required Allowance</div>
                  <div className="text-lg font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(lastComputation.requiredAllowance as string, { dollar: true })}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Current Allowance</div>
                  <div className="text-lg font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(lastComputation.currentAllowance as string, { dollar: true })}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Adjustment Needed</div>
                  <div className="text-lg font-medium tabular-nums" style={{ color: Number(lastComputation.adjustmentNeeded as string) > 0 ? 'var(--status-error)' : 'var(--status-success)' }}>{fmtMoney(lastComputation.adjustmentNeeded as string, { dollar: true })}</div>
                </div>
              </div>
              {Number(lastComputation.adjustmentNeeded as string) !== 0 && (
                <button onClick={handlePropose} disabled={proposeCECL.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
                  {proposeCECL.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Propose Allowance AJE
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
