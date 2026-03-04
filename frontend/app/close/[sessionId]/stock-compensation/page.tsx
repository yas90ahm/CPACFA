'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useStockGrants, useCreateGrant, useStockExpenses, useComputeExpense, useCompensationSummary } from '@/lib/queries/stock-compensation';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { StockGrant, StockExpense } from '@/lib/types/stock-compensation';
import { Plus, Play } from 'lucide-react';

const TYPE_LABEL: Record<string, string> = { rsu: 'RSU', option: 'Option', espp: 'ESPP', sar: 'SAR' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-green-100 text-green-700', vested: 'bg-blue-100 text-blue-700', forfeited: 'bg-red-100 text-red-700', exercised: 'bg-gray-100 text-gray-600' };

export default function StockCompensationPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: grants, isLoading } = useStockGrants(sessionId);
  const { data: expenses } = useStockExpenses(sessionId);
  const { data: summary } = useCompensationSummary(sessionId);
  const createGrant = useCreateGrant(sessionId);
  const computeExpense = useComputeExpense(sessionId);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    grantDate: '', grantType: 'rsu', sharesGranted: '', fairValuePerShare: '', vestingType: 'time',
  });

  const handleCreate = () => {
    createGrant.mutate({
      ...form,
      sharesGranted: Number(form.sharesGranted),
      fairValuePerShare: Number(form.fairValuePerShare),
      vestingSchedule: [],
      status: 'active',
    }, {
      onSuccess: () => { setShowForm(false); setForm({ grantDate: '', grantType: 'rsu', sharesGranted: '', fairValuePerShare: '', vestingType: 'time' }); },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stock Compensation</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-hover">
            <Plus className="w-4 h-4" /> Add Grant
          </button>
          <button onClick={() => computeExpense.mutate()} disabled={computeExpense.isPending} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50">
            <Play className="w-4 h-4" /> {computeExpense.isPending ? 'Computing...' : 'Compute Period Expense'}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Total Expense</div>
            <div className="text-lg font-semibold">{fmtMoney(summary.totalExpense)}</div>
          </div>
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Active Grants</div>
            <div className="text-lg font-semibold">{summary.grantCount}</div>
          </div>
          {Object.entries(summary.byGrantType).map(([type, amount]) => (
            <div key={type} className="p-4 border rounded-lg bg-surface">
              <div className="text-sm text-text-secondary">{TYPE_LABEL[type] ?? type}</div>
              <div className="text-lg font-semibold">{fmtMoney(amount)}</div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">New Grant</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="date" value={form.grantDate} onChange={(e) => setForm({ ...form, grantDate: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={form.grantType} onChange={(e) => setForm({ ...form, grantType: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="rsu">RSU</option>
              <option value="option">Option</option>
              <option value="espp">ESPP</option>
              <option value="sar">SAR</option>
            </select>
            <input placeholder="Shares Granted" type="number" value={form.sharesGranted} onChange={(e) => setForm({ ...form, sharesGranted: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Fair Value/Share" type="number" step="0.01" value={form.fairValuePerShare} onChange={(e) => setForm({ ...form, fairValuePerShare: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={form.vestingType} onChange={(e) => setForm({ ...form, vestingType: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="time">Time-based</option>
              <option value="performance">Performance</option>
              <option value="market">Market</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createGrant.isPending} className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50">Create</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2">Grants</h2>
        <DataTable<StockGrant>
          rows={grants ?? []}
          getRowId={(r) => r.id}
          loading={isLoading}
          columns={[
            { id: 'grantType', header: 'Type', cell: (r) => TYPE_LABEL[r.grantType] ?? r.grantType },
            { id: 'grantDate', header: 'Grant Date', cell: (r) => r.grantDate?.slice(0, 10) },
            { id: 'sharesGranted', header: 'Shares', cell: (r) => r.sharesGranted.toLocaleString() },
            { id: 'fairValuePerShare', header: 'FV/Share', cell: (r) => r.fairValuePerShare ? <MoneyCell value={r.fairValuePerShare} /> : '\u2014' },
            { id: 'vestingType', header: 'Vesting', cell: (r) => r.vestingType },
            { id: 'status', header: 'Status', cell: (r) => <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLOR[r.status] ?? ''}`}>{r.status}</span> },
          ]}
        />
      </div>

      {expenses && expenses.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Period Expenses</h2>
          <DataTable<StockExpense>
            rows={expenses}
            getRowId={(r) => r.id}
            columns={[
              { id: 'grantId', header: 'Grant', cell: (r) => <span className="font-mono text-xs">{r.grantId.slice(0, 12)}</span> },
              { id: 'expenseAmount', header: 'Expense', cell: (r) => <MoneyCell value={r.expenseAmount} /> },
              { id: 'cumulativeExpense', header: 'Cumulative', cell: (r) => <MoneyCell value={r.cumulativeExpense} /> },
              { id: 'sharesVested', header: 'Shares Vested', cell: (r) => r.sharesVested.toLocaleString() },
            ]}
          />
        </div>
      )}
    </div>
  );
}
