'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { mockReconRequirements, type ReconRequirement, type ToleranceType } from '@/lib/mock/recon-requirements';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const ACTIVE_SESSION_ID = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

export default function ReconciliationSettingsPage() {
  const [requirements, setRequirements] = useState<ReconRequirement[]>(mockReconRequirements);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ReconRequirement | null>(null);
  const [autoGenConfirm, setAutoGenConfirm] = useState(false);
  const [formAccountCode, setFormAccountCode] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formToleranceDollar, setFormToleranceDollar] = useState('500.00');
  const [formTolerancePercent, setFormTolerancePercent] = useState('0');
  const [formToleranceType, setFormToleranceType] = useState<ToleranceType>('dollar');
  const [formEvidenceRequired, setFormEvidenceRequired] = useState(true);
  const [formSourceDocument, setFormSourceDocument] = useState('');

  const filtered = useMemo(() => {
    let list = requirements;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.accountCode.toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q));
    }
    if (typeFilter) list = list.filter((r) => r.accountType === typeFilter);
    return [...list].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }, [requirements, search, typeFilter]);

  const accountTypes = useMemo(() => Array.from(new Set(requirements.map((r) => r.accountType))), [requirements]);

  const handleDelete = (id: string) => {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveRequirement = (req: Partial<ReconRequirement> & { accountCode: string; accountName: string }) => {
    if (editing) {
      setRequirements((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...req } as ReconRequirement : r)));
    } else {
      setRequirements((prev) => [...prev, { ...req, id: `rr-${req.accountCode}`, accountType: req.accountType ?? 'ASSET', tolerancePercent: req.tolerancePercent ?? '0', toleranceType: req.toleranceType ?? 'dollar', active: req.active ?? true } as ReconRequirement]);
    }
    setPanelOpen(false);
    setEditing(null);
  };

  const openAdd = () => {
    setEditing(null);
    setFormAccountCode('');
    setFormAccountName('');
    setFormToleranceDollar('500.00');
    setFormTolerancePercent('0');
    setFormToleranceType('dollar');
    setFormEvidenceRequired(true);
    setFormSourceDocument('');
    setPanelOpen(true);
  };
  const openEdit = (r: ReconRequirement) => {
    setEditing(r);
    setFormAccountCode(r.accountCode);
    setFormAccountName(r.accountName);
    setFormToleranceDollar(r.toleranceDollar);
    setFormTolerancePercent(r.tolerancePercent);
    setFormToleranceType(r.toleranceType);
    setFormEvidenceRequired(r.evidenceRequired);
    setFormSourceDocument(r.sourceDocument);
    setPanelOpen(true);
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-primary">Reconciliation Requirements</h1>
          <p className="text-text-secondary text-sm mt-1">Configure which accounts require reconciliation and their tolerance thresholds</p>
        </div>
        <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Add Requirement
        </button>
      </div>

      <p className="text-sm text-text-secondary">
        These requirements are used when initializing reconciliations for a new close period.{' '}
        <Link href={`/close/${ACTIVE_SESSION_ID}/reconciliation`} className="text-accent hover:underline">View current reconciliations →</Link>
      </p>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by account code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-input border border-border bg-input px-3 py-2 text-sm w-64"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-input border border-border bg-input px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {accountTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAutoGenConfirm(true)}
          className="px-3 py-2 rounded-input border border-border text-sm hover:bg-hover"
        >
          Auto-generate requirements
        </button>
      </div>

      {autoGenConfirm && (
        <div className="bg-surface-alt border border-border rounded-card p-4 flex items-center justify-between">
          <p className="text-sm text-primary">This will create requirements for 15 balance sheet accounts with default tolerances. You can adjust each one individually.</p>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setAutoGenConfirm(false)} className="px-3 py-1.5 rounded-input border border-border text-sm">Cancel</button>
            <button type="button" onClick={() => { setAutoGenConfirm(false); }} className="px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-sm">Confirm</button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Account Code</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Account Name</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Type</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Tolerance ($)</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Tolerance (%)</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Evidence</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Source Document</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Active</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-border-light hover:bg-hover/50">
                <td className="py-2.5 px-4 font-mono">{r.accountCode}</td>
                <td className="py-2.5 px-4">{r.accountName}</td>
                <td className="py-2.5 px-4">
                  <span className="px-1.5 py-0.5 rounded text-xs bg-surface-alt border border-border">{r.accountType}</span>
                </td>
                <td className="py-2.5 px-4 font-mono">${r.toleranceDollar}</td>
                <td className="py-2.5 px-4 font-mono">{r.tolerancePercent}%</td>
                <td className="py-2.5 px-4">{r.evidenceRequired ? 'Yes' : 'No'}</td>
                <td className="py-2.5 px-4 text-text-secondary">{r.sourceDocument}</td>
                <td className="py-2.5 px-4">{r.active ? 'Yes' : 'No'}</td>
                <td className="py-2.5 px-4 flex items-center gap-1">
                  <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-input text-text-secondary hover:bg-hover hover:text-primary" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => handleDelete(r.id)} className="p-1.5 rounded-input text-text-secondary hover:bg-status-red-dim hover:text-status-red" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlideOverPanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setEditing(null); }}
        title={editing ? 'Edit Reconciliation Requirement' : 'Add Reconciliation Requirement'}
        width={500}
        footer={
          <>
            <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => { setPanelOpen(false); setEditing(null); }}>Cancel</button>
            <button
              type="button"
              className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm"
              onClick={() => {
                handleSaveRequirement({
                  accountCode: formAccountCode,
                  accountName: formAccountName,
                  toleranceDollar: formToleranceDollar,
                  tolerancePercent: formTolerancePercent,
                  toleranceType: formToleranceType,
                  evidenceRequired: formEvidenceRequired,
                  sourceDocument: formSourceDocument,
                });
                setPanelOpen(false);
                setEditing(null);
              }}
            >
              Save Requirement
            </button>
          </>
        }
      >
        <ReconRequirementForm
          initial={editing}
          accountCode={formAccountCode}
          accountName={formAccountName}
          toleranceDollar={formToleranceDollar}
          tolerancePercent={formTolerancePercent}
          toleranceType={formToleranceType}
          evidenceRequired={formEvidenceRequired}
          sourceDocument={formSourceDocument}
          setAccountCode={setFormAccountCode}
          setAccountName={setFormAccountName}
          setToleranceDollar={setFormToleranceDollar}
          setTolerancePercent={setFormTolerancePercent}
          setToleranceType={setFormToleranceType}
          setEvidenceRequired={setFormEvidenceRequired}
          setSourceDocument={setFormSourceDocument}
        />
      </SlideOverPanel>
    </div>
  );
}

function ReconRequirementForm({
  initial,
  accountCode,
  accountName,
  toleranceDollar,
  tolerancePercent,
  toleranceType,
  evidenceRequired,
  sourceDocument,
  setAccountCode,
  setAccountName,
  setToleranceDollar,
  setTolerancePercent,
  setToleranceType,
  setEvidenceRequired,
  setSourceDocument,
}: {
  initial: ReconRequirement | null;
  accountCode: string;
  accountName: string;
  toleranceDollar: string;
  tolerancePercent: string;
  toleranceType: ToleranceType;
  evidenceRequired: boolean;
  sourceDocument: string;
  setAccountCode: (v: string) => void;
  setAccountName: (v: string) => void;
  setToleranceDollar: (v: string) => void;
  setTolerancePercent: (v: string) => void;
  setToleranceType: (v: ToleranceType) => void;
  setEvidenceRequired: (v: boolean) => void;
  setSourceDocument: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Account *</label>
        <input
          type="text"
          placeholder="Search by account code or name..."
          value={accountCode ? `${accountCode} — ${accountName}` : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(' — ')) {
              const [code, ...rest] = v.split(' — ');
              setAccountCode(code?.trim() ?? '');
              setAccountName(rest.join(' — ').trim());
            }
          }}
          className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm"
        />
        {!initial && <p className="text-xs text-text-tertiary mt-1">SearchableSelect — accounts that already have requirements are disabled.</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-2">Tolerance Type</label>
        <div className="flex gap-4">
          {(['dollar', 'percentage', 'both'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tolType" checked={toleranceType === t} onChange={() => setToleranceType(t)} className="rounded-full" />
              {t === 'dollar' ? 'Dollar Amount' : t === 'percentage' ? 'Percentage' : 'Both (stricter)'}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MoneyInput label="Dollar Tolerance" value={toleranceDollar} onChange={(v) => setToleranceDollar(v ?? '')} />
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Percentage Tolerance</label>
          <div className="flex items-center rounded-input border border-border bg-input">
            <input type="text" value={tolerancePercent} onChange={(e) => setTolerancePercent(e.target.value)} className="flex-1 px-3 py-2 text-sm" />
            <span className="pr-3 text-text-secondary">%</span>
          </div>
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} />
          Require supporting document attachment
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Expected Source Document</label>
        <input type="text" value={sourceDocument} onChange={(e) => setSourceDocument(e.target.value)} placeholder="e.g. Bank statement" className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm" />
      </div>
    </div>
  );
}
