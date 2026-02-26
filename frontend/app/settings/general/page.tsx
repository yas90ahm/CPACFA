'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const FISCAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CURRENCIES = [{ value: 'USD', label: 'USD — US Dollar' }];

export default function GeneralSettingsPage() {
  const queryClient = useQueryClient();
  const { data: entitiesData } = useQuery({
    queryKey: ['settings-entities'],
    queryFn: () => apiFetch<{ entities: Array<{ id: string; name: string }> }>('/api/settings/entities'),
  });
  const entityId = entitiesData?.entities?.[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['settings-general', entityId],
    queryFn: () => apiFetch<{ entityName?: string; fiscalYearEnd?: number; baseCurrency?: string; autoLockDays?: number; varianceMaterialityDollar?: string; varianceMaterialityPercent?: string }>(`/api/settings/general?entityId=${entityId}`),
    enabled: !!entityId,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { entityName?: string; fiscalYearEnd?: number; baseCurrency?: string; autoLockDays?: number; varianceMaterialityDollar?: string; varianceMaterialityPercent?: string }) =>
      apiFetch(`/api/settings/general?entityId=${entityId}`, { method: 'PUT', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings-general', entityId] }),
  });

  const [entityName, setEntityName] = useState('');
  const [fiscalYearEnd, setFiscalYearEnd] = useState('December');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [autoLockDays, setAutoLockDays] = useState('0');
  const [varianceDollar, setVarianceDollar] = useState('');
  const [variancePercent, setVariancePercent] = useState('');
  const saved = updateMutation.isSuccess;

  useEffect(() => {
    if (!data) return;
    setEntityName(data.entityName ?? '');
    setFiscalYearEnd(data.fiscalYearEnd != null ? (FISCAL_MONTHS[data.fiscalYearEnd - 1] ?? 'December') : 'December');
    setBaseCurrency(data.baseCurrency ?? 'USD');
    setAutoLockDays(String(data.autoLockDays ?? 0));
    setVarianceDollar(data.varianceMaterialityDollar ?? '');
    setVariancePercent(data.varianceMaterialityPercent ?? '');
  }, [data]);

  const handleSave = () => {
    const monthIndex = FISCAL_MONTHS.indexOf(fiscalYearEnd) + 1;
    updateMutation.mutate({
      entityName: entityName || undefined,
      fiscalYearEnd: monthIndex || undefined,
      baseCurrency: baseCurrency || undefined,
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
          className={cn(
            'px-4 py-2 rounded-input text-sm font-medium',
            saved ? 'bg-status-green text-white' : 'bg-accent text-accent-contrast hover:opacity-90'
          )}
        >
          {saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
