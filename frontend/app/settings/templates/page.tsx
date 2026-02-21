'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { mockTemplateDefinitions } from '@/lib/mock/template-definitions';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Plus, Pencil, Copy, Power, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const ACTIVE_SESSION_ID = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

function formatMoney(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return s;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

export default function TemplatesSettingsPage() {
  const [templates, setTemplates] = useState(mockTemplateDefinitions);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        <Link href={`/close/${ACTIVE_SESSION_ID}/adjustments?tab=templates`} className="text-accent hover:underline">View current templates in close</Link>
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
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Last Applied</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Created By</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <Fragment key={t.id}>
                <tr className="border-b border-border-light hover:bg-hover/50">
                  <td className="py-2 px-2">
                    <button type="button" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="p-1">
                      {expandedId === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 font-medium">{t.name}</td>
                  <td className="py-2.5 px-4 font-mono text-text-secondary">{t.lines[0]?.accountCode} {t.lines[0]?.accountName}</td>
                  <td className="py-2.5 px-4 font-mono text-text-secondary">{t.lines[1]?.accountCode} {t.lines[1]?.accountName}</td>
                  <td className="py-2.5 px-4 font-mono">{formatMoney(t.lines.find((l) => parseFloat(l.debit) > 0)?.debit ?? '0')}</td>
                  <td className="py-2.5 px-4"><span className="px-1.5 py-0.5 rounded text-xs bg-surface-alt border border-border">{t.frequency}</span></td>
                  <td className="py-2.5 px-4">{t.active ? 'Yes' : 'No'}</td>
                  <td className="py-2.5 px-4 text-text-secondary">{t.lastApplied ?? 'Never'}</td>
                  <td className="py-2.5 px-4 text-text-secondary">{t.createdBy}</td>
                  <td className="py-2.5 px-4 flex items-center gap-1">
                    <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Duplicate"><Copy className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Deactivate"><Power className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-status-red-dim hover:text-status-red" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
                {expandedId === t.id && (
                  <tr className="border-b border-border-light bg-surface-alt/50">
                    <td colSpan={10} className="py-4 px-4">
                      <p className="text-text-secondary text-sm mb-2">{t.description}</p>
                      <p className="text-xs text-text-tertiary mb-2">Application history:</p>
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-text-secondary"><th className="py-1">Period</th><th>Applied</th><th>By</th><th>JE</th></tr></thead>
                        <tbody>
                          {t.applicationHistory.length ? t.applicationHistory.map((a, i) => (
                            <tr key={i}><td className="py-1">{a.periodLabel}</td><td>{new Date(a.appliedAt).toLocaleDateString()}</td><td>{a.appliedBy}</td><td>{a.jeNumber ?? '—'}</td></tr>
                          )) : <tr><td colSpan={4} className="py-2 text-text-tertiary">Never applied</td></tr>}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
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
