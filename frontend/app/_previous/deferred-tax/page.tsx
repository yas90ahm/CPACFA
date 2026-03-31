'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useDeferredTaxItems, useCreateDeferredTaxItem, useCalculateDeferredTax } from '@/lib/queries/deferred-tax';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { DeferredTaxItem } from '@/lib/types/deferred-tax';
import { Plus, Calculator, Loader2, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { ModuleBanner } from '@/components/shared/ModuleBanner';

const TYPE_LABEL: Record<string, string> = { temporary_difference: 'Temporary Diff', nol_carryforward: 'NOL Carryforward', tax_credit: 'Tax Credit' };

export default function DeferredTaxPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: items, isLoading } = useDeferredTaxItems(sessionId);
  const createItem = useCreateDeferredTaxItem(sessionId);
  const calculateTax = useCalculateDeferredTax(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showForm, setShowForm] = useState(false);
  const [taxRate, setTaxRate] = useState('0.21');
  const [calcResult, setCalcResult] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ description: '', itemType: 'temporary_difference', bookBasis: '', taxBasis: '', reversalPattern: '2_5_years', sourceAccount: '' });

  const handleCreate = () => {
    createItem.mutate({
      ...form,
      bookBasis: Number(form.bookBasis),
      taxBasis: Number(form.taxBasis),
    }, {
      onSuccess: () => { setShowForm(false); setForm({ description: '', itemType: 'temporary_difference', bookBasis: '', taxBasis: '', reversalPattern: '2_5_years', sourceAccount: '' }); },
    });
  };

  const handleCalculate = () => {
    calculateTax.mutate({ taxRate: Number(taxRate) }, {
      onSuccess: (data) => setCalcResult(data.result as unknown as Record<string, unknown>),
    });
  };

  return (
    <div className="space-y-6">
      <ModuleBanner sessionId={sessionId} />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Deferred Tax</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Manage temporary differences and compute deferred tax assets/liabilities</p>
        </div>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
            <Plus className="w-4 h-4" /> Add Item
          </button>
        )}
      </div>

      {!readOnly && showForm && (
        <div className="p-5 rounded-lg space-y-4" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Deferred Tax Item</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="temporary_difference">Temporary Difference</option>
              <option value="nol_carryforward">NOL Carryforward</option>
              <option value="tax_credit">Tax Credit</option>
            </select>
            <input placeholder="Book Basis" type="number" value={form.bookBasis} onChange={(e) => setForm({ ...form, bookBasis: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Tax Basis" type="number" value={form.taxBasis} onChange={(e) => setForm({ ...form, taxBasis: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={form.reversalPattern} onChange={(e) => setForm({ ...form, reversalPattern: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="1_year">1 Year</option>
              <option value="2_5_years">2-5 Years</option>
              <option value="indefinite">Indefinite</option>
            </select>
            <input placeholder="Source Account" value={form.sourceAccount} onChange={(e) => setForm({ ...form, sourceAccount: e.target.value })} className="rounded-md px-3 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createItem.isPending || !form.description} className="px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
              {createItem.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-3 p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
        <div>
          <label className="block text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Tax Rate</label>
          <input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="rounded-md px-3 py-1.5 text-sm w-24" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
        </div>
        {!readOnly && (
          <button onClick={handleCalculate} disabled={calculateTax.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-md font-medium disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
            {calculateTax.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {calculateTax.isPending ? 'Calculating…' : 'Calculate'}
          </button>
        )}
      </div>

      {calcResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>DTA (Gross)</div>
            <div className="text-lg font-medium" style={{ color: 'var(--status-success)' }}>{fmtMoney(String(calcResult.deferredTaxAssetGross))}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>DTL (Gross)</div>
            <div className="text-lg font-medium" style={{ color: 'var(--status-error)' }}>{fmtMoney(String(calcResult.deferredTaxLiabilityGross))}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Valuation Allowance</div>
            <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(String(calcResult.valuationAllowance))}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Net Deferred Tax</div>
            <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>{fmtMoney(String(calcResult.netDeferredTaxAsset))}</div>
          </div>
        </div>
      )}

      {!isLoading && (!items || items.length === 0) && !showForm ? (
        <div className="p-12 text-center" style={{ background: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', borderRadius: '0.5rem' }}>
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>No deferred tax items</p>
          <p className="text-sm max-w-md mx-auto mb-4" style={{ color: 'var(--text-secondary)' }}>
            Add temporary differences between book and tax basis to compute deferred tax assets and liabilities.
          </p>
          {!readOnly && (
            <button onClick={() => setShowForm(true)} className="px-4 py-2 text-sm text-white rounded-md font-medium hover:bg-accent/90" style={{ background: 'var(--interactive-primary)' }}>
              <Plus className="w-4 h-4 inline mr-1.5" /> Add First Item
            </button>
          )}
        </div>
      ) : (
        <DataTable<DeferredTaxItem>
          rows={items ?? []}
          getRowId={(r) => r.id}
          loading={isLoading}
          columns={[
            { id: 'description', header: 'Description', cell: (r) => r.description },
            { id: 'itemType', header: 'Type', cell: (r) => TYPE_LABEL[r.itemType] ?? r.itemType },
            { id: 'bookBasis', header: 'Book Basis', align: 'right' as const, cell: (r) => <MoneyCell value={r.bookBasis} /> },
            { id: 'taxBasis', header: 'Tax Basis', align: 'right' as const, cell: (r) => <MoneyCell value={r.taxBasis} /> },
            { id: 'difference', header: 'Difference', align: 'right' as const, cell: (r) => <MoneyCell value={String(Number(r.bookBasis) - Number(r.taxBasis))} /> },
            { id: 'reversalPattern', header: 'Reversal', cell: (r) => r.reversalPattern?.replace(/_/g, ' ') ?? '\u2014' },
          ]}
        />
      )}
    </div>
  );
}
