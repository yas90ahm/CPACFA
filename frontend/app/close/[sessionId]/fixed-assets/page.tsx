'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useFixedAssets, useCreateFixedAsset, useDeleteFixedAsset, useRunDepreciation, useDepreciationSummary, useDepreciationRuns } from '@/lib/queries/fixed-assets';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { FixedAsset } from '@/lib/types/fixed-assets';
import type { DepreciationRun } from '@/lib/types/fixed-assets';
import { Plus, Play, Trash2 } from 'lucide-react';

const METHOD_LABEL: Record<string, string> = { straight_line: 'Straight Line', declining_balance: 'Declining Balance', units_of_production: 'Units of Prod.' };

export default function FixedAssetsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: assets, isLoading } = useFixedAssets(sessionId);
  const { data: summary } = useDepreciationSummary(sessionId);
  const { data: runs } = useDepreciationRuns(sessionId);
  const createAsset = useCreateFixedAsset(sessionId);
  const deleteAsset = useDeleteFixedAsset(sessionId);
  const runDepreciation = useRunDepreciation(sessionId);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    assetNumber: '', description: '', assetType: 'Equipment',
    cost: '', residualValue: '0', usefulLifeYears: '5',
    method: 'straight_line', depreciationStartDate: '', status: 'active',
  });

  const handleCreate = () => {
    createAsset.mutate({
      ...form,
      cost: Number(form.cost),
      residualValue: Number(form.residualValue),
      usefulLifeYears: Number(form.usefulLifeYears),
    }, {
      onSuccess: () => { setShowForm(false); setForm({ assetNumber: '', description: '', assetType: 'Equipment', cost: '', residualValue: '0', usefulLifeYears: '5', method: 'straight_line', depreciationStartDate: '', status: 'active' }); },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fixed Assets</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-hover">
            <Plus className="w-4 h-4" /> Add Asset
          </button>
          <button onClick={() => runDepreciation.mutate()} disabled={runDepreciation.isPending} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50">
            <Play className="w-4 h-4" /> {runDepreciation.isPending ? 'Running...' : 'Run Depreciation'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">New Fixed Asset</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Asset Number" value={form.assetNumber} onChange={(e) => setForm({ ...form, assetNumber: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Asset Type" value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Cost" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Residual Value" type="number" value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Useful Life (years)" type="number" value={form.usefulLifeYears} onChange={(e) => setForm({ ...form, usefulLifeYears: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="straight_line">Straight Line</option>
              <option value="declining_balance">Declining Balance</option>
            </select>
            <input type="date" placeholder="Start Date" value={form.depreciationStartDate} onChange={(e) => setForm({ ...form, depreciationStartDate: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createAsset.isPending} className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50">
              {createAsset.isPending ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Total Depreciation</div>
            <div className="text-lg font-semibold">{fmtMoney(summary.totalDepreciation)}</div>
          </div>
          {Object.entries(summary.byType).map(([type, amount]) => (
            <div key={type} className="p-4 border rounded-lg bg-surface">
              <div className="text-sm text-text-secondary">{type}</div>
              <div className="text-lg font-semibold">{fmtMoney(amount)}</div>
            </div>
          ))}
        </div>
      )}

      <DataTable<FixedAsset>
        rows={assets ?? []}
        getRowId={(r) => r.id}
        loading={isLoading}
        columns={[
          { id: 'assetNumber', header: 'Asset #', cell: (r) => <span className="font-mono text-sm">{r.assetNumber}</span> },
          { id: 'description', header: 'Description', cell: (r) => r.description },
          { id: 'assetType', header: 'Type', cell: (r) => r.assetType },
          { id: 'cost', header: 'Cost', cell: (r) => <MoneyCell value={r.cost} /> },
          { id: 'residualValue', header: 'Residual', cell: (r) => <MoneyCell value={r.residualValue} /> },
          { id: 'usefulLifeYears', header: 'Life (yrs)', cell: (r) => r.usefulLifeYears },
          { id: 'method', header: 'Method', cell: (r) => METHOD_LABEL[r.method] ?? r.method },
          { id: 'status', header: 'Status', cell: (r) => <span className={`px-1.5 py-0.5 rounded text-xs ${r.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span> },
          { id: 'actions', header: '', cell: (r) => (
            <button onClick={() => deleteAsset.mutate(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
          )},
        ]}
      />

      {runs && runs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Depreciation Runs</h2>
          <DataTable<DepreciationRun>
            rows={runs}
            getRowId={(r) => r.id}
            columns={[
              { id: 'periodLabel', header: 'Period', cell: (r) => r.periodLabel },
              { id: 'totalDepreciation', header: 'Total Depreciation', cell: (r) => <MoneyCell value={r.totalDepreciation} /> },
              { id: 'createdAt', header: 'Run Date', cell: (r) => new Date(r.createdAt).toLocaleDateString() },
            ]}
          />
        </div>
      )}
    </div>
  );
}
