'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const FISCAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CURRENCIES = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'CNY', label: 'CNY — Chinese Yuan' },
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'MXN', label: 'MXN — Mexican Peso' },
  { value: 'BRL', label: 'BRL — Brazilian Real' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { value: 'KRW', label: 'KRW — South Korean Won' },
  { value: 'SEK', label: 'SEK — Swedish Krona' },
  { value: 'NOK', label: 'NOK — Norwegian Krone' },
  { value: 'DKK', label: 'DKK — Danish Krone' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'ZAR', label: 'ZAR — South African Rand' },
];

export default function GeneralSettingsPage() {
  const queryClient = useQueryClient();
  const { data: entitiesData } = useQuery({
    queryKey: ['settings-entities'],
    queryFn: () => apiFetch<{ entities: Array<{ id: string; name: string }> }>('/api/settings/entities'),
  });
  const entityId = entitiesData?.entities?.[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['settings-general', entityId],
    queryFn: () => apiFetch<{ entityName?: string; fiscalYearEnd?: number; fiscalYearEndDay?: number; baseCurrency?: string; functionalCurrency?: string; autoLockDays?: number; varianceMaterialityDollar?: string; varianceMaterialityPercent?: string }>(`/api/settings/general?entityId=${entityId}`),
    enabled: !!entityId,
  });

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: { entityName?: string; fiscalYearEnd?: number; fiscalYearEndDay?: number; baseCurrency?: string; functionalCurrency?: string; autoLockDays?: number; varianceMaterialityDollar?: string; varianceMaterialityPercent?: string }) =>
      apiFetch(`/api/settings/general?entityId=${entityId}`, { method: 'PUT', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-general', entityId] });
      queryClient.invalidateQueries({ queryKey: ['settings-entities'] });
      setToast({ type: 'success', message: 'Settings saved successfully.' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      setToast({ type: 'error', message: msg });
      setTimeout(() => setToast(null), 5000);
    },
  });

  const [entityName, setEntityName] = useState('');
  const [fiscalYearEnd, setFiscalYearEnd] = useState('December');
  const [fiscalYearEndDay, setFiscalYearEndDay] = useState('31');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [functionalCurrency, setFunctionalCurrency] = useState('USD');
  const [autoLockDays, setAutoLockDays] = useState('0');
  const [varianceDollar, setVarianceDollar] = useState('');
  const [variancePercent, setVariancePercent] = useState('');

  useEffect(() => {
    if (!data) return;
    setEntityName(data.entityName ?? '');
    setFiscalYearEnd(data.fiscalYearEnd != null ? (FISCAL_MONTHS[data.fiscalYearEnd - 1] ?? 'December') : 'December');
    setFiscalYearEndDay(String(data.fiscalYearEndDay ?? 31));
    setBaseCurrency(data.baseCurrency ?? 'USD');
    setFunctionalCurrency(data.functionalCurrency ?? 'USD');
    setAutoLockDays(String(data.autoLockDays ?? 0));
    setVarianceDollar(data.varianceMaterialityDollar ?? '');
    setVariancePercent(data.varianceMaterialityPercent ?? '');
  }, [data]);

  const handleSave = () => {
    const monthIndex = FISCAL_MONTHS.indexOf(fiscalYearEnd) + 1;
    updateMutation.mutate({
      entityName: entityName || undefined,
      fiscalYearEnd: monthIndex || undefined,
      fiscalYearEndDay: fiscalYearEndDay ? Number(fiscalYearEndDay) : undefined,
      baseCurrency: baseCurrency || undefined,
      functionalCurrency: functionalCurrency || undefined,
      autoLockDays: autoLockDays ? Number(autoLockDays) : undefined,
      varianceMaterialityDollar: varianceDollar || undefined,
      varianceMaterialityPercent: variancePercent || undefined,
    });
  };

  if (!entitiesData) return <div className="text-text-secondary">Loading...</div>;
  if (!entityId) return <div className="text-text-secondary">No entity found. Create a close session first.</div>;
  if (isLoading && !data) return <div className="text-text-secondary">Loading settings...</div>;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-display text-primary">General</h1>
        <p className="text-text-secondary text-sm mt-1">Entity details and close behavior</p>
      </div>

      <section className="space-y-6">
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">Entity Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Entity Name</label>
            <input
              type="text"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Fiscal Year End</label>
            <select
              value={fiscalYearEnd}
              onChange={(e) => setFiscalYearEnd(e.target.value)}
              className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-primary"
            >
              {FISCAL_MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Fiscal Year End Day</label>
            <input
              type="number"
              min={1}
              max={31}
              value={fiscalYearEndDay}
              onChange={(e) => setFiscalYearEndDay(e.target.value)}
              className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-primary"
            />
            <p className="text-xs text-text-tertiary mt-1">Day of month for fiscal year end. Most companies use the last day of the month (28, 30, or 31).</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Base Currency</label>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-primary"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Functional (Reporting) Currency</label>
            <select
              value={functionalCurrency}
              onChange={(e) => setFunctionalCurrency(e.target.value)}
              className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-primary"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-text-tertiary mt-1">Currency used for financial statements. GL amounts in other currencies are translated at upload using their exchange rate.</p>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">Close Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Auto-Lock After Certification (days)</label>
            <input
              type="number"
              min={0}
              value={autoLockDays}
              onChange={(e) => setAutoLockDays(e.target.value)}
              className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-primary"
            />
            <p className="text-xs text-text-tertiary mt-1">Certified periods auto-lock after this many days. Set to 0 for manual lock only.</p>
          </div>
          <div>
            <MoneyInput
              label="Variance Materiality Threshold"
              value={varianceDollar}
              onChange={(v) => setVarianceDollar(v ?? '')}
            />
            <p className="text-xs text-text-tertiary mt-1">Variances at or above this amount require documented explanation.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Variance Percentage Threshold</label>
            <div className="flex items-center gap-2 rounded-input border border-border bg-input">
              <input
                type="text"
                inputMode="decimal"
                value={variancePercent}
                onChange={(e) => setVariancePercent(e.target.value.replace(/[^0-9.]/g, ''))}
                className="flex-1 min-w-0 px-3 py-2 text-sm text-primary bg-transparent"
              />
              <span className="pr-3 text-text-secondary text-sm">%</span>
            </div>
            <p className="text-xs text-text-tertiary mt-1">Variances at or above this percentage require explanation, regardless of dollar amount.</p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className={cn(
            'px-4 py-2 rounded-input text-sm font-medium transition-colors',
            updateMutation.isPending
              ? 'bg-accent/50 text-accent-contrast cursor-wait'
              : 'bg-accent text-accent-contrast hover:opacity-90'
          )}
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Demo & Testing Section */}
      <DemoResetSection />

      {toast && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm shadow-lg transition-all',
            toast.type === 'success'
              ? 'border-status-green bg-status-green-dim text-status-green'
              : 'border-status-red bg-status-red-dim text-status-red'
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* ── Demo Reset Section ── */

function DemoResetSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [resetResult, setResetResult] = useState<string | null>(null);

  const resetMutation = useMutation({
    mutationFn: () => apiFetch<{ success: boolean; deleted: Record<string, number>; preserved: Record<string, number> }>('/api/settings/demo-reset', { method: 'POST' }),
    onSuccess: (data) => {
      const totalDeleted = Object.values(data.deleted).reduce((a, b) => a + b, 0);
      setResetResult(`Reset complete. ${totalDeleted} records deleted across ${Object.keys(data.deleted).length} tables. ${data.preserved.users} users preserved.`);
      setShowConfirm(false);
      setConfirmInput('');
      setTimeout(() => { window.location.href = '/close'; }, 3000);
    },
    onError: (err) => {
      setResetResult(`Reset failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  return (
    <>
      <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--border-default)' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Demo & Testing</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Removes all sessions, GL data, mappings, reconciliations, journal entries, and statements.
          Preserves your users, chart of accounts, and configuration.
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors"
          style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)', border: '1px solid var(--status-error-border)' }}
        >
          Reset All Close Data
        </button>
        {resetResult && (
          <p className="mt-3 text-xs" style={{ color: resetResult.includes('failed') ? 'var(--status-error)' : 'var(--status-success)' }}>
            {resetResult}
          </p>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setShowConfirm(false); setConfirmInput(''); }} />
          <div className="relative bg-surface border border-border rounded-card shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-sans text-lg text-primary mb-2">Reset All Close Data</h3>
            <p className="text-text-secondary text-sm mb-4">
              This will permanently delete all close data. Type <strong className="font-mono">RESET</strong> to confirm.
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="Type RESET"
              className="w-full px-3 py-2 rounded-input border border-border bg-surface text-primary mb-4 font-mono"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setShowConfirm(false); setConfirmInput(''); }} className="px-4 py-2 rounded-input border border-border text-sm">Cancel</button>
              <button
                type="button"
                onClick={() => resetMutation.mutate()}
                disabled={confirmInput !== 'RESET' || resetMutation.isPending}
                className={cn('px-4 py-2 rounded-input text-sm font-medium', confirmInput === 'RESET' ? 'text-white' : 'cursor-not-allowed opacity-50')}
                style={{ backgroundColor: confirmInput === 'RESET' ? 'var(--status-error)' : 'var(--bg-surface-sunken)', color: confirmInput === 'RESET' ? 'white' : 'var(--text-tertiary)' }}
              >
                {resetMutation.isPending ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
