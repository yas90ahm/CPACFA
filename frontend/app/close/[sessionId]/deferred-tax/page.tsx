'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useDeferredTaxItems, useCreateDeferredTaxItem, useCalculateDeferredTax } from '@/lib/queries/deferred-tax';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { DeferredTaxItem } from '@/lib/types/deferred-tax';
import { Plus, Calculator } from 'lucide-react';

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Deferred Tax</h1>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-hover">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {showForm && (
        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">New Deferred Tax Item</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="temporary_difference">Temporary Difference</option>
              <option value="nol_carryforward">NOL Carryforward</option>
              <option value="tax_credit">Tax Credit</option>
            </select>
            <input placeholder="Book Basis" type="number" value={form.bookBasis} onChange={(e) => setForm({ ...form, bookBasis: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Tax Basis" type="number" value={form.taxBasis} onChange={(e) => setForm({ ...form, taxBasis: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={form.reversalPattern} onChange={(e) => setForm({ ...form, reversalPattern: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="1_year">1 Year</option>
              <option value="2_5_years">2-5 Years</option>
              <option value="indefinite">Indefinite</option>
            </select>
            <input placeholder="Source Account" value={form.sourceAccount} onChange={(e) => setForm({ ...form, sourceAccount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createItem.isPending} className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50">Create</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-3 p-4 border rounded-lg bg-surface">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Tax Rate</label>
          <input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-24" />
        </div>
        <button onClick={handleCalculate} disabled={calculateTax.isPending} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50">
          <Calculator className="w-4 h-4" /> {calculateTax.isPending ? 'Calculating...' : 'Calculate'}
        </button>
      </div>

      {calcResult && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">DTA (Gross)</div>
            <div className="text-lg font-semibold text-green-600">{fmtMoney(String(calcResult.deferredTaxAssetGross))}</div>
          </div>
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">DTL (Gross)</div>
            <div className="text-lg font-semibold text-red-600">{fmtMoney(String(calcResult.deferredTaxLiabilityGross))}</div>
          </div>
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Valuation Allowance</div>
            <div className="text-lg font-semibold">{fmtMoney(String(calcResult.valuationAllowance))}</div>
          </div>
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Net Deferred Tax</div>
            <div className="text-lg font-semibold">{fmtMoney(String(calcResult.netDeferredTaxAsset))}</div>
          </div>
        </div>
      )}

      <DataTable<DeferredTaxItem>
        rows={items ?? []}
        getRowId={(r) => r.id}
        loading={isLoading}
        columns={[
          { id: 'description', header: 'Description', cell: (r) => r.description },
          { id: 'itemType', header: 'Type', cell: (r) => TYPE_LABEL[r.itemType] ?? r.itemType },
          { id: 'bookBasis', header: 'Book Basis', cell: (r) => <MoneyCell value={r.bookBasis} /> },
          { id: 'taxBasis', header: 'Tax Basis', cell: (r) => <MoneyCell value={r.taxBasis} /> },
          { id: 'difference', header: 'Difference', cell: (r) => <MoneyCell value={String(Number(r.bookBasis) - Number(r.taxBasis))} /> },
          { id: 'reversalPattern', header: 'Reversal', cell: (r) => r.reversalPattern?.replace(/_/g, ' ') ?? '\u2014' },
        ]}
      />
    </div>
  );
}
