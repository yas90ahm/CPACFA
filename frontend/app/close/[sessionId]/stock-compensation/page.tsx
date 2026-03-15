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
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const TYPE_LABEL: Record<string, string> = { rsu: 'RSU', option: 'Option', espp: 'ESPP', sar: 'SAR' };
const STATUS_STYLES: Record<string, React.CSSProperties> = {
  active: { background: 'var(--status-success-bg)', color: 'var(--status-success)' },
  vested: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
  forfeited: { background: 'var(--status-error-bg)', color: 'var(--status-error)' },
  exercised: { background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' },
};

export default function StockCompensationPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: grants, isLoading } = useStockGrants(sessionId);
  const { data: expenses } = useStockExpenses(sessionId);
  const { data: summary } = useCompensationSummary(sessionId);
  const createGrant = useCreateGrant(sessionId);
  const computeExpense = useComputeExpense(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

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
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Stock Compensation</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Manage equity grants and compute ASC 718 compensation expense</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              <Plus className="w-4 h-4" /> Add Grant
            </button>
            <button onClick={() => computeExpense.mutate()} disabled={computeExpense.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md font-medium hover:bg-accent/90 disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {computeExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {computeExpense.isPending ? 'Computing…' : 'Compute Period Expense'}
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Total Expense</div>
            <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(summary.totalExpense)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Active Grants</div>
            <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{summary.grantCount}</div>
          </div>
          {Object.entries(summary.byGrantType ?? {}).map(([type, amount]) => (
            <div key={type} className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{TYPE_LABEL[type] ?? type}</div>
              <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(amount)}</div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && showForm && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Grant</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="date" value={form.grantDate} onChange={(e) => setForm({ ...form, grantDate: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={form.grantType} onChange={(e) => setForm({ ...form, grantType: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="rsu">RSU</option>
              <option value="option">Option</option>
              <option value="espp">ESPP</option>
              <option value="sar">SAR</option>
            </select>
            <input placeholder="Shares Granted" type="number" value={form.sharesGranted} onChange={(e) => setForm({ ...form, sharesGranted: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Fair Value/Share" type="number" step="0.01" value={form.fairValuePerShare} onChange={(e) => setForm({ ...form, fairValuePerShare: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={form.vestingType} onChange={(e) => setForm({ ...form, vestingType: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="time">Time-based</option>
              <option value="performance">Performance</option>
              <option value="market">Market</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createGrant.isPending || !form.grantDate || !form.sharesGranted} className="px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {createGrant.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {!isLoading && (!grants || grants.length === 0) && !showForm ? (
        <div className="p-12 text-center" style={{ background: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', borderRadius: '0.5rem' }}>
          <Award className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No equity grants</p>
          <p className="text-sm max-w-md mx-auto mb-4" style={{ color: 'var(--text-secondary)' }}>
            Add stock grants (RSUs, options, ESPP) to compute ASC 718 compensation expense for the period.
          </p>
          {!readOnly && (
            <button onClick={() => setShowForm(true)} className="px-4 py-2 text-sm text-white rounded-md font-medium hover:bg-accent/90" style={{ background: 'var(--interactive-primary)' }}>
              <Plus className="w-4 h-4 inline mr-1.5" /> Add First Grant
            </button>
          )}
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-display mb-3" style={{ color: 'var(--text-primary)' }}>Grants</h2>
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
                { id: 'status', header: 'Status', cell: (r) => <span className={cn('px-2 py-0.5 rounded text-xs font-medium')} style={STATUS_STYLES[r.status] ?? {}}>{r.status}</span> },
              ]}
            />
          </div>
        </>
      )}

      {expenses && expenses.length > 0 && (
        <div>
          <h2 className="text-lg font-display mb-3" style={{ color: 'var(--text-primary)' }}>Period Expenses</h2>
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
