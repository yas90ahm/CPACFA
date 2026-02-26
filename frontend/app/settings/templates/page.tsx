'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { apiFetch } from '@/lib/api';
import { Plus, Pencil, Power, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

interface TemplateLine {
  accountRef: string;
  debit?: number;
  credit?: number;
  description?: string;
}

interface Template {
  id: string;
  name: string;
  memo: string;
  lines: TemplateLine[];
  frequency: 'monthly' | 'quarterly' | 'annually';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

export default function TemplatesSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['close-templates'],
    queryFn: () => apiFetch<{ templates: Template[] }>('/api/close/templates'),
  });
  const templates = data?.templates ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/close/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['close-templates'] }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; memo: string; lines: TemplateLine[]; frequency: string; isActive: boolean }> }) =>
      apiFetch(`/api/close/templates/${id}`, { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['close-templates'] }),
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading && templates.length === 0) return <div className="text-text-secondary">Loading templates...</div>;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-primary">Recurring Entry Templates</h1>
          <p className="text-text-secondary text-sm mt-1">Templates are proposed at the start of each close period</p>
        </div>
        <button type="button" onClick={() => setPanelOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      <p className="text-sm text-text-secondary">
        <Link href="/close" className="text-accent hover:underline">View close sessions</Link>
      </p>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="w-8" />
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Template Name</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Debit Account</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Credit Account</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Amount</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Frequency</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Active</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Created</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const debitLine = t.lines.find((l) => (l.debit ?? 0) > 0);
              const creditLine = t.lines.find((l) => (l.credit ?? 0) > 0);
              const amount = debitLine?.debit ?? creditLine?.credit ?? 0;
              return (
              <Fragment key={t.id}>
                <tr className="border-b border-border-light hover:bg-hover/50">
                  <td className="py-2 px-2">
                    <button type="button" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="p-1">
                      {expandedId === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 font-medium">{t.name}</td>
                  <td className="py-2.5 px-4 font-mono text-text-secondary">{debitLine?.accountRef ?? '—'}</td>
                  <td className="py-2.5 px-4 font-mono text-text-secondary">{creditLine?.accountRef ?? '—'}</td>
                  <td className="py-2.5 px-4 font-mono">{formatMoney(amount)}</td>
                  <td className="py-2.5 px-4"><span className="px-1.5 py-0.5 rounded text-xs bg-surface-alt border border-border">{t.frequency}</span></td>
                  <td className="py-2.5 px-4">{t.isActive ? 'Yes' : 'No'}</td>
                  <td className="py-2.5 px-4 text-text-secondary">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5 px-4 flex items-center gap-1">
                    <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => updateMutation.mutate({ id: t.id, body: { isActive: !t.isActive } })} className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Toggle active"><Power className="w-4 h-4" /></button>
                    <button type="button" onClick={() => deleteMutation.mutate(t.id)} className="p-1.5 rounded-input text-text-secondary hover:bg-status-red-dim hover:text-status-red" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
                {expandedId === t.id && (
                  <tr className="border-b border-border-light bg-surface-alt/50">
                    <td colSpan={9} className="py-4 px-4">
                      <p className="text-text-secondary text-sm mb-2">{t.memo}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <SlideOverPanel open={panelOpen} onClose={() => setPanelOpen(false)} title="New Recurring Entry Template" width={560} footer={
        <>
          <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setPanelOpen(false)}>Cancel</button>
          <button type="button" className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm" onClick={() => setPanelOpen(false)}>Save Template</button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Template Name *</label>
            <input type="text" placeholder="Monthly Depreciation — Equipment" className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
            <textarea rows={3} placeholder="Monthly straight-line depreciation..." className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Frequency</label>
            <div className="flex gap-4">
              {['Monthly', 'Quarterly', 'Annual'].map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm"><input type="radio" name="freq" /> {f}</label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-text-secondary mb-2">Entry Lines</p>
            <div className="space-y-2 rounded-input border border-border p-3">
              <div className="grid grid-cols-[1fr_100px_100px] gap-2 text-xs text-text-secondary">
                <span>Account</span><span>Debit</span><span>Credit</span>
              </div>
              <div className="grid grid-cols-[1fr_100px_100px] gap-2">
                <input type="text" placeholder="6400 Depreciation Expense" className="rounded-input border border-border bg-input px-2 py-1.5 text-sm" />
                <MoneyInput value="0" onChange={() => {}} size="sm" />
                <MoneyInput value={null} onChange={() => {}} size="sm" />
              </div>
              <div className="grid grid-cols-[1fr_100px_100px] gap-2">
                <input type="text" placeholder="1510 Accum. Depreciation" className="rounded-input border border-border bg-input px-2 py-1.5 text-sm" />
                <MoneyInput value={null} onChange={() => {}} size="sm" />
                <MoneyInput value="0" onChange={() => {}} size="sm" />
              </div>
              <button type="button" className="text-xs text-accent hover:underline">+ Add Line</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Default Memo</label>
            <input type="text" placeholder="Pre-fills when template is applied" className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm" />
          </div>
        </div>
      </SlideOverPanel>
    </div>
  );
}
