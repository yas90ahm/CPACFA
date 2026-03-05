'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useStockGrants, useCreateGrant, useStockExpenses, useComputeExpense, useCompensationSummary } from '@/lib/queries/stock-compensation';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { StockGrant, StockExpense } from '@/lib/types/stock-compensation';
import { Plus, Play, Loader2, Award } from 'lucide-react';

const TYPE_LABEL: Record<string, string> = { rsu: 'RSU', option: 'Option', espp: 'ESPP', sar: 'SAR' };
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-status-green-dim text-status-green',
  vested: 'bg-status-blue-dim text-status-blue',
  forfeited: 'bg-status-red-dim text-status-red',
  exercised: 'bg-surface-alt text-text-secondary',
};

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display text-primary">Stock Compensation</h1>
          <p className="text-text-secondary text-sm mt-0.5">Manage equity grants and compute ASC 718 compensation expense</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-input hover:bg-hover text-text-secondary">
            <Plus className="w-4 h-4" /> Add Grant
          </button>
          <button onClick={() => computeExpense.mutate()} disabled={computeExpense.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent text-white rounded-input font-medium hover:bg-accent/90 disabled:opacity-50">
            {computeExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {computeExpense.isPending ? 'Computing…' : 'Compute Period Expense'}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-border rounded-card bg-surface">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Total Expense</div>
            <div className="text-lg font-medium text-primary">{fmtMoney(summary.totalExpense)}</div>
          </div>
          <div className="p-4 border border-border rounded-card bg-surface">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Active Grants</div>
            <div className="text-lg font-medium text-primary">{summary.grantCount}</div>
          </div>
          {Object.entries(summary.byGrantType ?? {}).map(([type, amount]) => (
            <div key={type} className="p-4 border border-border rounded-card bg-surface">
              <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">{TYPE_LABEL[type] ?? type}</div>
              <div className="text-lg font-medium text-primary">{fmtMoney(amount)}</div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="p-5 border border-border rounded-card bg-surface space-y-4">
          <h3 className="font-medium text-primary">New Grant</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="date" value={form.grantDate} onChange={(e) => setForm({ ...form, grantDate: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
            <select value={form.grantType} onChange={(e) => setForm({ ...form, grantType: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary">
              <option value="rsu">RSU</option>
              <option value="option">Option</option>
              <option value="espp">ESPP</option>
              <option value="sar">SAR</option>
            </select>
            <input placeholder="Shares Granted" type="number" value={form.sharesGranted} onChange={(e) => setForm({ ...form, sharesGranted: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
            <input placeholder="Fair Value/Share" type="number" step="0.01" value={form.fairValuePerShare} onChange={(e) => setForm({ ...form, fairValuePerShare: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
            <select value={form.vestingType} onChange={(e) => setForm({ ...form, vestingType: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary">
              <option value="time">Time-based</option>
              <option value="performance">Performance</option>
              <option value="market">Market</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createGrant.isPending || !form.grantDate || !form.sharesGranted} className="px-4 py-1.5 text-sm bg-accent text-white rounded-input font-medium disabled:opacity-50">
              {createGrant.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border border-border rounded-input text-text-secondary hover:bg-hover">Cancel</button>
          </div>
        </div>
      )}

      {!isLoading && (!grants || grants.length === 0) && !showForm ? (
        <div className="bg-surface border border-border rounded-card p-12 text-center">
          <Award className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-lg font-medium text-primary mb-2">No equity grants</p>
          <p className="text-text-secondary text-sm max-w-md mx-auto mb-4">
            Add stock grants (RSUs, options, ESPP) to compute ASC 718 compensation expense for the period.
          </p>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 text-sm bg-accent text-white rounded-input font-medium hover:bg-accent/90">
            <Plus className="w-4 h-4 inline mr-1.5" /> Add First Grant
          </button>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-display text-primary mb-3">Grants</h2>
            <DataTable<StockGrant>
              rows={grants ?? []}
              getRowId={(r) => r.id}
              loading={isLoading}
              columns={[
                { id: 'grantType', header: 'Type', cell: (r) => TYPE_LABEL[r.grantType] ?? r.grantType },
                { id: 'grantDate', header: 'Grant Date', cell: (r) => r.grantDate?.slice(0, 10) },
                { id: 'sharesGranted', header: 'Shares', align: 'right' as const, cell: (r) => r.sharesGranted.toLocaleString() },
                { id: 'fairValuePerShare', header: 'FV/Share', align: 'right' as const, cell: (r) => r.fairValuePerShare ? <MoneyCell value={r.fairValuePerShare} /> : '\u2014' },
                { id: 'vestingType', header: 'Vesting', cell: (r) => r.vestingType },
                { id: 'status', header: 'Status', cell: (r) => <span className={cn('px-2 py-0.5 rounded text-xs font-medium', STATUS_STYLES[r.status] ?? '')}>{r.status}</span> },
              ]}
            />
          </div>
        </>
      )}

      {expenses && expenses.length > 0 && (
        <div>
          <h2 className="text-lg font-display text-primary mb-3">Period Expenses</h2>
          <DataTable<StockExpense>
            rows={expenses}
            getRowId={(r) => r.id}
            columns={[
              { id: 'grantId', header: 'Grant', cell: (r) => <span className="font-mono text-xs">{r.grantId.slice(0, 12)}</span> },
              { id: 'expenseAmount', header: 'Expense', align: 'right' as const, cell: (r) => <MoneyCell value={r.expenseAmount} showDollar /> },
              { id: 'cumulativeExpense', header: 'Cumulative', align: 'right' as const, cell: (r) => <MoneyCell value={r.cumulativeExpense} showDollar /> },
              { id: 'sharesVested', header: 'Shares Vested', align: 'right' as const, cell: (r) => r.sharesVested.toLocaleString() },
            ]}
          />
        </div>
      )}
    </div>
  );
}
