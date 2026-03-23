'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { usePrepaidSchedules, useCreatePrepaidSchedule, useProposeAmortization } from '@/lib/queries/prepaid';
import { fmtMoney } from '@/lib/money';
import { Plus, Play, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--status-warning)',
  proposed: 'var(--status-info)',
  posted: 'var(--status-success)',
};

export default function PrepaidsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: schedules, isLoading } = usePrepaidSchedules(sessionId);
  const createSchedule = useCreatePrepaidSchedule(sessionId);
  const proposeAmort = useProposeAmortization(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    description: '', vendor: '', prepaidAccount: '', expenseAccount: '',
    totalAmount: '', startDate: '', endDate: '',
  });
  const [periodLabel, setPeriodLabel] = useState('');

  const handleCreate = () => {
    createSchedule.mutate({
      description: form.description, vendor: form.vendor || undefined,
      prepaidAccount: form.prepaidAccount, expenseAccount: form.expenseAccount,
      totalAmount: Number(form.totalAmount), startDate: form.startDate, endDate: form.endDate,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ description: '', vendor: '', prepaidAccount: '', expenseAccount: '', totalAmount: '', startDate: '', endDate: '' });
      },
    });
  };

  const handlePropose = () => {
    if (!periodLabel) return;
    proposeAmort.mutate({ periodLabel });
  };

  const totalPrepaid = schedules?.reduce((sum, s) => sum + Number(s.totalAmount), 0) ?? 0;
  const totalRemaining = schedules?.reduce((sum, s) => sum + Number(s.remainingBalance), 0) ?? 0;
  const activeCount = schedules?.filter((s) => !s.fullyAmortized).length ?? 0;

  const inputStyle = { borderWidth: '1px', borderStyle: 'solid' as const, borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Prepaid Amortization</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Manage prepaid expense schedules and compute monthly amortization</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              <Plus className="w-4 h-4" /> Add Schedule
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Total Prepaid</div>
          <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalPrepaid, { dollar: true })}</div>
        </div>
        <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Remaining Balance</div>
          <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalRemaining, { dollar: true })}</div>
        </div>
        <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Active Schedules</div>
          <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{activeCount}</div>
        </div>
      </div>

      {/* Create form */}
      {!readOnly && showForm && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Prepaid Schedule</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
            <input placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
            <input placeholder="Prepaid Account" value={form.prepaidAccount} onChange={(e) => setForm({ ...form, prepaidAccount: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
            <input placeholder="Expense Account" value={form.expenseAccount} onChange={(e) => setForm({ ...form, expenseAccount: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
            <input placeholder="Total Amount" type="number" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createSchedule.isPending || !form.description || !form.totalAmount || !form.prepaidAccount || !form.expenseAccount || !form.startDate || !form.endDate} className="px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {createSchedule.isPending ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Propose amortization */}
      {!readOnly && (
        <div className="p-4 rounded-lg flex items-center gap-3" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <Calendar className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
          <input placeholder="Period label (e.g. 2026-03)" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="rounded-md px-3 py-1.5 text-sm flex-1 max-w-xs" style={inputStyle} />
          <button onClick={handlePropose} disabled={proposeAmort.isPending || !periodLabel || activeCount === 0} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md hover:opacity-90 disabled:opacity-50 font-medium" style={{ background: 'var(--interactive-primary)' }}>
            {proposeAmort.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {proposeAmort.isPending ? 'Proposing...' : 'Propose Amortization'}
          </button>
        </div>
      )}

      {/* Schedules table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} /></div>
      ) : !schedules || schedules.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>No prepaid schedules yet. Add one to get started.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-surface-sunken)' }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Description</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Vendor</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Total</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Monthly</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Amortized</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Remaining</th>
                <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Months</th>
                <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-hover" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)' }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>{s.description}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{s.vendor ?? '-'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.totalAmount, { dollar: true })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.monthlyAmount, { dollar: true })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.amortizedToDate, { dollar: true })}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.remainingBalance, { dollar: true })}</td>
                  <td className="px-4 py-2.5 text-center" style={{ color: 'var(--text-secondary)' }}>{s.monthsCount}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: s.fullyAmortized ? 'var(--status-success)' : 'var(--status-info)', color: '#fff' }}>
                      {s.fullyAmortized ? 'Complete' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
