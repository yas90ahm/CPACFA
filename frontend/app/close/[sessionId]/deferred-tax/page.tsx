'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useDeferredTaxItems, useCreateDeferredTaxItem, useCalculateDeferredTax } from '@/lib/queries/deferred-tax';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { DeferredTaxItem } from '@/lib/types/deferred-tax';
import { Plus, Calculator, Loader2, FileSpreadsheet } from 'lucide-react';

const TYPE_LABEL: Record<string, string> = { temporary_difference: 'Temporary Diff', nol_carryforward: 'NOL Carryforward', tax_credit: 'Tax Credit' };

export default function DeferredTaxPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { data: items, isLoading } = useDeferredTaxItems(sessionId);
  const createItem = useCreateDeferredTaxItem(sessionId);
  const calculateTax = useCalculateDeferredTax(sessionId);

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display text-primary">Deferred Tax</h1>
          <p className="text-text-secondary text-sm mt-0.5">Manage temporary differences and compute deferred tax assets/liabilities</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-input hover:bg-hover text-text-secondary">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {showForm && (
        <div className="p-5 border border-border rounded-card bg-surface space-y-4">
          <h3 className="font-medium text-primary">New Deferred Tax Item</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
            <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary">
              <option value="temporary_difference">Temporary Difference</option>
              <option value="nol_carryforward">NOL Carryforward</option>
              <option value="tax_credit">Tax Credit</option>
            </select>
            <input placeholder="Book Basis" type="number" value={form.bookBasis} onChange={(e) => setForm({ ...form, bookBasis: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
            <input placeholder="Tax Basis" type="number" value={form.taxBasis} onChange={(e) => setForm({ ...form, taxBasis: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
            <select value={form.reversalPattern} onChange={(e) => setForm({ ...form, reversalPattern: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary">
              <option value="1_year">1 Year</option>
              <option value="2_5_years">2-5 Years</option>
              <option value="indefinite">Indefinite</option>
            </select>
            <input placeholder="Source Account" value={form.sourceAccount} onChange={(e) => setForm({ ...form, sourceAccount: e.target.value })} className="border border-border rounded-input px-3 py-1.5 text-sm bg-input text-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createItem.isPending || !form.description} className="px-4 py-1.5 text-sm bg-accent text-white rounded-input font-medium disabled:opacity-50">
              {createItem.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border border-border rounded-input text-text-secondary hover:bg-hover">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-3 p-4 border border-border rounded-card bg-surface">
        <div>
          <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1">Tax Rate</label>
          <input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="border border-border rounded-input px-3 py-1.5 text-sm w-24 bg-input text-primary" />
        </div>
        <button onClick={handleCalculate} disabled={calculateTax.isPending} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent text-white rounded-input font-medium disabled:opacity-50">
          {calculateTax.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          {calculateTax.isPending ? 'Calculating…' : 'Calculate'}
        </button>
      </div>

      {calcResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 border border-border rounded-card bg-surface">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">DTA (Gross)</div>
            <div className="text-lg font-medium text-status-green">{fmtMoney(String(calcResult.deferredTaxAssetGross))}</div>
          </div>
          <div className="p-4 border border-border rounded-card bg-surface">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">DTL (Gross)</div>
            <div className="text-lg font-medium text-status-red">{fmtMoney(String(calcResult.deferredTaxLiabilityGross))}</div>
          </div>
          <div className="p-4 border border-border rounded-card bg-surface">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Valuation Allowance</div>
            <div className="text-lg font-medium text-primary">{fmtMoney(String(calcResult.valuationAllowance))}</div>
          </div>
          <div className="p-4 border border-border rounded-card bg-surface">
            <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Net Deferred Tax</div>
            <div className="text-lg font-medium text-primary">{fmtMoney(String(calcResult.netDeferredTaxAsset))}</div>
          </div>
        </div>
      )}

      {!isLoading && (!items || items.length === 0) && !showForm ? (
        <div className="bg-surface border border-border rounded-card p-12 text-center">
          <FileSpreadsheet className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-lg font-medium text-primary mb-2">No deferred tax items</p>
          <p className="text-text-secondary text-sm max-w-md mx-auto mb-4">
            Add temporary differences between book and tax basis to compute deferred tax assets and liabilities.
          </p>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 text-sm bg-accent text-white rounded-input font-medium hover:bg-accent/90">
            <Plus className="w-4 h-4 inline mr-1.5" /> Add First Item
          </button>
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
