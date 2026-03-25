'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useDebtSchedules, useCreateDebtSchedule, useProposeDebtAccruals } from '@/lib/queries/debt-accrual';
import { fmtMoney } from '@/lib/money';
import { Plus, Play, Loader2, Landmark } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { ModuleBanner } from '@/components/shared/ModuleBanner';

export default function DebtAccrualPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data, isLoading } = useDebtSchedules(sessionId);
  const schedules = data?.schedules ?? [];
  const entries = data?.entries ?? [];
  // Use a placeholder entityId — the create schedule endpoint uses entity from URL
  const createSchedule = useCreateDebtSchedule(schedules[0]?.id ? '' : 'default');
  const proposeAccruals = useProposeDebtAccruals(sessionId);
  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    lenderName: '', instrumentType: 'term_loan', principalBalance: '',
    annualRate: '', interestExpenseAccount: '', accruedInterestAccount: '', maturityDate: '',
  });

  const handleCreate = () => {
    createSchedule.mutate(form, { onSuccess: () => { setShowForm(false); setForm({ lenderName: '', instrumentType: 'term_loan', principalBalance: '', annualRate: '', interestExpenseAccount: '', accruedInterestAccount: '', maturityDate: '' }); } });
  };

  return (
    <div className="space-y-6">
      <ModuleBanner sessionId={sessionId} />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Debt Interest Accrual</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Track debt instruments and compute periodic interest accruals</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              <Plus className="w-4 h-4" /> Add Schedule
            </button>
            <button onClick={() => proposeAccruals.mutate()} disabled={proposeAccruals.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md hover:bg-accent/90 disabled:opacity-50 font-medium" style={{ background: 'var(--interactive-primary)' }}>
              {proposeAccruals.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {proposeAccruals.isPending ? 'Proposing...' : 'Propose Accruals'}
            </button>
          </div>
        )}
      </div>

      {!readOnly && showForm && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Debt Schedule</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Lender Name" value={form.lenderName} onChange={(e) => setForm({ ...form, lenderName: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={form.instrumentType} onChange={(e) => setForm({ ...form, instrumentType: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="term_loan">Term Loan</option>
              <option value="revolver">Revolver</option>
              <option value="bond">Bond</option>
              <option value="note_payable">Note Payable</option>
            </select>
            <input placeholder="Principal Balance" type="number" value={form.principalBalance} onChange={(e) => setForm({ ...form, principalBalance: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Annual Rate (e.g. 0.065)" type="number" step="0.001" value={form.annualRate} onChange={(e) => setForm({ ...form, annualRate: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Interest Expense Acct" value={form.interestExpenseAccount} onChange={(e) => setForm({ ...form, interestExpenseAccount: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Accrued Interest Acct" value={form.accruedInterestAccount} onChange={(e) => setForm({ ...form, accruedInterestAccount: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input type="date" placeholder="Maturity Date" value={form.maturityDate} onChange={(e) => setForm({ ...form, maturityDate: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createSchedule.isPending || !form.lenderName || !form.principalBalance || !form.annualRate} className="px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {createSchedule.isPending ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Debt Schedules Table */}
      <div className="rounded-lg overflow-hidden" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <Landmark className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Debt Schedules ({schedules.length})</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: 'var(--text-tertiary)' }} /></div>
        ) : schedules.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No debt schedules configured</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Lender</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Type</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Principal</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Rate</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
            </tr></thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{s.lenderName}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{s.instrumentType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(s.principalBalance)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--text-primary)' }}>{(Number(s.annualRate) * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Accrual Entries Table */}
      <div className="rounded-lg overflow-hidden" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Proposed Accruals ({entries.length})</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No accruals proposed yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Period</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Days</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Accrual</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>JE</th>
            </tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{e.periodStart} to {e.periodEnd}</td>
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{e.daysInPeriod}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.accrualAmount)}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-tertiary)' }}>{e.jeId ? e.jeId.slice(0, 8) + '...' : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
