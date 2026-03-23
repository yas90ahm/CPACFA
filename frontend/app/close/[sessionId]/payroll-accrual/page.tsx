'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { usePayrollAccrualEntries, useProposePayrollAccrual } from '@/lib/queries/payroll-accrual';
import { fmtMoney } from '@/lib/money';
import { Play, Loader2, Users, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

export default function PayrollAccrualPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: entries, isLoading } = usePayrollAccrualEntries(sessionId);
  const proposeAccrual = useProposePayrollAccrual(sessionId);
  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({
    averageDailyPayroll: '', lastPayrollDate: '',
    wagesExpenseAccount: '', accruedWagesAccount: '',
    payrollTaxExpenseAccount: '', accruedPayrollTaxAccount: '',
    benefitsExpenseAccount: '', accruedBenefitsAccount: '',
    averageDailyTax: '', averageDailyBenefits: '',
  });

  const totalWages = (entries ?? []).reduce((sum, e) => sum + Number(e.wagesAmount), 0);
  const totalTax = (entries ?? []).reduce((sum, e) => sum + Number(e.taxAmount), 0);
  const totalBenefits = (entries ?? []).reduce((sum, e) => sum + Number(e.benefitsAmount), 0);
  const grandTotal = (entries ?? []).reduce((sum, e) => sum + Number(e.totalAmount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Payroll Accrual</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Compute and propose payroll accrual adjusting entries</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowConfig(!showConfig)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              <Settings className="w-4 h-4" /> Config
            </button>
            <button onClick={() => proposeAccrual.mutate()} disabled={proposeAccrual.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md hover:bg-accent/90 disabled:opacity-50 font-medium" style={{ background: 'var(--interactive-primary)' }}>
              {proposeAccrual.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {proposeAccrual.isPending ? 'Proposing...' : 'Propose Accrual'}
            </button>
          </div>
        )}
      </div>

      {!readOnly && showConfig && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Payroll Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Avg Daily Payroll</label>
              <input type="number" value={config.averageDailyPayroll} onChange={(e) => setConfig({ ...config, averageDailyPayroll: e.target.value })} className="w-full rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Last Payroll Date</label>
              <input type="date" value={config.lastPayrollDate} onChange={(e) => setConfig({ ...config, lastPayrollDate: e.target.value })} className="w-full rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Wages Expense Acct</label>
              <input value={config.wagesExpenseAccount} onChange={(e) => setConfig({ ...config, wagesExpenseAccount: e.target.value })} className="w-full rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Accrued Wages Acct</label>
              <input value={config.accruedWagesAccount} onChange={(e) => setConfig({ ...config, accruedWagesAccount: e.target.value })} className="w-full rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Avg Daily Tax</label>
              <input type="number" value={config.averageDailyTax} onChange={(e) => setConfig({ ...config, averageDailyTax: e.target.value })} className="w-full rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>Avg Daily Benefits</label>
              <input type="number" value={config.averageDailyBenefits} onChange={(e) => setConfig({ ...config, averageDailyBenefits: e.target.value })} className="w-full rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Save config via the entity payroll-config API endpoint</p>
        </div>
      )}

      {/* Summary Cards */}
      {(entries ?? []).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Wages</div>
            <div className="text-lg font-medium font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalWages)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Payroll Tax</div>
            <div className="text-lg font-medium font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalTax)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Benefits</div>
            <div className="text-lg font-medium font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalBenefits)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Total Accrual</div>
            <div className="text-lg font-medium font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(grandTotal)}</div>
          </div>
        </div>
      )}

      {/* Accrual Entries Table */}
      <div className="rounded-lg overflow-hidden" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <Users className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Payroll Accruals ({(entries ?? []).length})</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" style={{ color: 'var(--text-tertiary)' }} /></div>
        ) : (entries ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No payroll accruals proposed yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Period End</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Days</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Wages</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Tax</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Benefits</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Total</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Source</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>JE</th>
            </tr></thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>{e.periodEnd}</td>
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{e.daysAccrued}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.wagesAmount)}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.taxAmount)}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.benefitsAmount)}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(e.totalAmount)}</td>
                  <td className="px-4 py-2"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${e.source === 'register_import' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{e.source}</span></td>
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
