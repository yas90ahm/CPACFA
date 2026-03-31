'use client';

import { useState, useCallback } from 'react';
import { useEBITDABridge, useAddEbitdaAddback, useDeleteEbitdaAddback } from '@/lib/queries/ebitda';
import { fmtMoney, isMoneyNegative } from '@/lib/money';
import { X, Plus, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';

interface EBITDABridgeProps {
  sessionId: string;
}

const ADDBACK_CATEGORIES = [
  { value: '', label: 'Select category...' },
  { value: 'restructuring', label: 'Restructuring' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'stock_compensation', label: 'Stock Compensation' },
  { value: 'transaction_costs', label: 'Transaction Costs' },
  { value: 'one_time', label: 'One-Time / Non-Recurring' },
  { value: 'management_fees', label: 'Management Fees' },
  { value: 'other', label: 'Other' },
];

interface BridgeLine {
  label: string;
  amount: string;
  isSeparator?: boolean;
  isBold?: boolean;
  id?: string;
  isDeletable?: boolean;
}

export function EBITDABridge({ sessionId }: EBITDABridgeProps) {
  const { data, isLoading, error } = useEBITDABridge(sessionId);
  const addMutation = useAddEbitdaAddback(sessionId);
  const deleteMutation = useDeleteEbitdaAddback(sessionId);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const handleAdd = useCallback(() => {
    if (!newLabel.trim() || !newAmount.trim()) return;
    addMutation.mutate(
      {
        label: newLabel.trim(),
        amount: newAmount.trim(),
        category: newCategory || undefined,
      },
      {
        onSuccess: () => {
          setNewLabel('');
          setNewAmount('');
          setNewCategory('');
          setShowAddForm(false);
        },
      }
    );
  }, [newLabel, newAmount, newCategory, addMutation]);

  const handleDelete = useCallback(
    (addbackId: string) => {
      deleteMutation.mutate(addbackId);
    },
    [deleteMutation]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-card border border-status-red bg-status-red-dim text-status-red text-sm">
        Failed to load EBITDA bridge: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  const bridge = data?.bridge;

  if (!bridge) {
    return (
      <EmptyState
        title="No EBITDA bridge data available"
        description="Generate financial statements first, then the EBITDA bridge will be computed from the income statement."
      />
    );
  }

  // Build bridge lines from the API response
  const lines: BridgeLine[] = [
    { label: 'Net Income', amount: bridge.netIncome ?? '0' },
    { label: '(+) Interest Expense', amount: bridge.interestExpense ?? '0' },
    { label: '(+) Tax Expense', amount: bridge.taxExpense ?? '0' },
    { label: '(+) Depreciation & Amortization', amount: bridge.depreciationAmortization ?? '0' },
    { label: 'EBITDA', amount: bridge.ebitda ?? '0', isSeparator: true, isBold: true },
  ];

  // Add-backs
  const addbacks: Array<{ id: string; label: string; amount: string; category?: string }> =
    bridge.addbacks ?? [];

  for (const ab of addbacks) {
    lines.push({
      label: `(+) ${ab.label}`,
      amount: ab.amount,
      id: ab.id,
      isDeletable: true,
    });
  }

  lines.push({
    label: 'Adjusted EBITDA',
    amount: bridge.adjustedEbitda ?? bridge.ebitda ?? '0',
    isSeparator: true,
    isBold: true,
  });

  return (
    <div className="max-w-2xl">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            const isNeg = isMoneyNegative(line.amount);
            return (
              <tr
                key={line.id ?? idx}
                className={
                  line.isSeparator ? 'border-t border-border' : ''
                }
              >
                <td
                  className={`py-2 pr-4 text-sm ${
                    line.isBold ? 'font-bold text-primary' : 'text-text-secondary'
                  }`}
                >
                  {line.label}
                </td>
                <td
                  className={`py-2 text-right font-mono tabular-nums text-sm ${
                    line.isBold ? 'font-bold text-primary' : ''
                  } ${isNeg ? 'text-status-red' : ''}`}
                >
                  {fmtMoney(line.amount, { dash: false })}
                </td>
                <td className="py-2 pl-2 w-8">
                  {line.isDeletable && line.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(line.id!)}
                      disabled={deleteMutation.isPending}
                      className="text-text-muted hover:text-status-red transition-colors p-0.5 rounded"
                      aria-label={`Remove ${line.label}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Add item button / form */}
      <div className="mt-4">
        {!showAddForm ? (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        ) : (
          <div className="p-4 rounded-card border border-border bg-surface space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g., Restructuring costs"
                  className="w-full px-3 py-1.5 rounded-input border border-border bg-surface text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Amount</label>
                <input
                  type="text"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="e.g., 150000.00"
                  className="w-full px-3 py-1.5 rounded-input border border-border bg-surface text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-1.5 rounded-input border border-border bg-surface text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {ADDBACK_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={addMutation.isPending || !newLabel.trim() || !newAmount.trim()}
                className="px-4 py-1.5 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {addMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewLabel('');
                  setNewAmount('');
                  setNewCategory('');
                }}
                className="px-4 py-1.5 rounded-input border border-border text-sm text-text-secondary hover:bg-hover"
              >
                Cancel
              </button>
            </div>
            {addMutation.isError && (
              <p className="text-sm text-status-red">
                {addMutation.error instanceof Error ? addMutation.error.message : 'Failed to add'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
