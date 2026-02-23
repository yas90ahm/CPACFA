'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2 } from 'lucide-react';

type ToleranceType = 'absolute' | 'percentage';

interface ReconRequirementApi {
  requirementId: string;
  accountCode: string;
  accountName: string | null;
  isRequired: boolean;
  toleranceAmount: string;
  toleranceType: ReconToleranceType;
  tolerancePercentage: string | null;
  expectedSource: string;
  requiresReviewerApproval: boolean;
}

export default function ReconciliationSettingsPage() {
  const queryClient = useQueryClient();
  const { data: entitiesData } = useQuery({
    queryKey: ['settings-entities'],
    queryFn: () => apiFetch<{ entities: Array<{ id: string; name: string }> }>('/api/settings/entities'),
  });
  const entityId = entitiesData?.entities?.[0]?.id ?? null;

  const { data: reqData, isLoading } = useQuery({
    queryKey: ['recon-requirements', entityId],
    queryFn: () => apiFetch<{ requirements: ReconRequirementApi[] }>(`/api/close/recon-requirements?entity_id=${entityId}`),
    enabled: !!entityId,
  });
  const requirements = reqData?.requirements ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/close/recon-requirements/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recon-requirements', entityId] }),
  });
  const createMutation = useMutation({
    mutationFn: (body: { entity_id: string; account_code: string; account_name?: string; tolerance_amount?: number; tolerance_type?: string; tolerance_percentage?: number | null; expected_source?: string; requires_reviewer_approval?: boolean }) =>
      apiFetch('/api/close/recon-requirements', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recon-requirements', entityId] }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { account_name?: string; tolerance_amount?: number; tolerance_type?: string; tolerance_percentage?: number | null; expected_source?: string; requires_reviewer_approval?: boolean }) =>
      apiFetch(`/api/close/recon-requirements/${id}`, { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recon-requirements', entityId] }),
  });
  const autoGenMutation = useMutation({
    mutationFn: (body: { entity_id: string; materiality_threshold?: number }) =>
      apiFetch('/api/close/recon-requirements/auto-generate', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recon-requirements', entityId] }),
  });

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ReconRequirementApi | null>(null);
  const [autoGenConfirm, setAutoGenConfirm] = useState(false);
  const [formAccountCode, setFormAccountCode] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formToleranceDollar, setFormToleranceDollar] = useState('500.00');
  const [formTolerancePercent, setFormTolerancePercent] = useState('0');
  const [formToleranceType, setFormToleranceType] = useState<ToleranceType>('absolute');
  const [formEvidenceRequired, setFormEvidenceRequired] = useState(true);
  const [formSourceDocument, setFormSourceDocument] = useState('');

  const filtered = useMemo(() => {
    let list = requirements;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.accountCode.toLowerCase().includes(q) || (r.accountName ?? '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }, [requirements, search]);

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleSaveRequirement = (req: { accountCode: string; accountName: string; toleranceDollar: string; tolerancePercent: string; toleranceType: ToleranceType; evidenceRequired: boolean; sourceDocument: string }) => {
    const expectedSource = (req.sourceDocument?.toLowerCase().replace(/\s+/g, '_') || 'other') as ReconRequirementApi['expectedSource'];
    if (editing) {
      updateMutation.mutate({
        id: editing.requirementId,
        body: {
          account_name: req.accountName || undefined,
          tolerance_amount: parseFloat(req.toleranceDollar) || 0,
          tolerance_type: req.toleranceType,
          tolerance_percentage: req.tolerancePercent ? parseFloat(req.tolerancePercent) : null,
          expected_source: expectedSource,
          requires_reviewer_approval: req.evidenceRequired,
        },
      });
    } else if (entityId) {
      createMutation.mutate({
        entity_id: entityId,
        account_code: req.accountCode,
        account_name: req.accountName || undefined,
        tolerance_amount: parseFloat(req.toleranceDollar) || 0,
        tolerance_type: req.toleranceType,
        tolerance_percentage: req.tolerancePercent ? parseFloat(req.tolerancePercent) : null,
        expected_source: expectedSource,
        requires_reviewer_approval: req.evidenceRequired,
      });
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
    setFormToleranceType('absolute');
    setFormEvidenceRequired(true);
    setFormSourceDocument('');
    setPanelOpen(true);
  };
  const openEdit = (r: ReconRequirementApi) => {
    setEditing(r);
    setFormAccountCode(r.accountCode);
    setFormAccountName(r.accountName ?? '');
    setFormToleranceDollar(r.toleranceAmount);
    setFormTolerancePercent(r.tolerancePercentage ?? '0');
    setFormToleranceType((r.toleranceType as ToleranceType) ?? 'absolute');
    setFormEvidenceRequired(r.requiresReviewerApproval);
    setFormSourceDocument(r.expectedSource?.replace(/_/g, ' ') ?? '');
    setPanelOpen(true);
  };

  const runAutoGenerate = () => {
    if (entityId) autoGenMutation.mutate({ entity_id: entityId });
    setAutoGenConfirm(false);
  };

  if (!entityId) return <div className="text-text-secondary">No entity found. Create a close session first.</div>;
  if (isLoading && requirements.length === 0) return <div className="text-text-secondary">Loading...</div>;

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
        <Link href="/close" className="text-accent hover:underline">View close sessions →</Link>
      </p>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by account code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-input border border-border bg-input px-3 py-2 text-sm w-64"
        />
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
          <p className="text-sm text-primary">This will create requirements for balance sheet accounts with default tolerances. You can adjust each one individually.</p>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setAutoGenConfirm(false)} className="px-3 py-1.5 rounded-input border border-border text-sm">Cancel</button>
            <button type="button" onClick={runAutoGenerate} className="px-3 py-1.5 rounded-input bg-accent text-accent-contrast text-sm">Confirm</button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Account Code</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Account Name</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Tolerance ($)</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Tolerance (%)</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Evidence</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Source</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Active</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.requirementId} className="border-b border-border-light hover:bg-hover/50">
                <td className="py-2.5 px-4 font-mono">{r.accountCode}</td>
                <td className="py-2.5 px-4">{r.accountName ?? '—'}</td>
                <td className="py-2.5 px-4 font-mono">${r.toleranceAmount}</td>
                <td className="py-2.5 px-4 font-mono">{r.tolerancePercentage ?? '0'}%</td>
                <td className="py-2.5 px-4">{r.requiresReviewerApproval ? 'Yes' : 'No'}</td>
                <td className="py-2.5 px-4 text-text-secondary">{r.expectedSource?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="py-2.5 px-4">{r.isRequired ? 'Yes' : 'No'}</td>
                <td className="py-2.5 px-4 flex items-center gap-1">
                  <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-input text-text-secondary hover:bg-hover hover:text-primary" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => handleDelete(r.requirementId)} className="p-1.5 rounded-input text-text-secondary hover:bg-status-red-dim hover:text-status-red" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
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
  initial: ReconRequirementApi | null;
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
        <label className="block text-xs font-medium text-text-secondary mb-1">Account Code *</label>
        <input
          type="text"
          value={accountCode}
          onChange={(e) => setAccountCode(e.target.value)}
          placeholder="e.g. 1010"
          className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm"
          readOnly={!!initial}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Account Name</label>
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="e.g. Chase Checking"
          className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-2">Tolerance Type</label>
        <div className="flex gap-4">
          {(['absolute', 'percentage'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tolType" checked={toleranceType === t} onChange={() => setToleranceType(t)} className="rounded-full" />
              {t === 'absolute' ? 'Dollar Amount' : 'Percentage'}
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
