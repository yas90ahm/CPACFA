'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ChevronDown, ChevronRight, Plus, X, Pencil, Trash2 } from 'lucide-react';

interface TaxonomyLine {
  id: string;
  code: string;
  name: string;
  statement: string;
  parentId?: string;
  normalBalance?: string;
  isCustom?: boolean;
}

interface TaxonomyNode {
  id: string;
  label: string;
  statement: string;
  parentId?: string;
  normalBalance?: string;
  isCustom?: boolean;
  children?: TaxonomyNode[];
}

/** Standard (seeded) taxonomy line IDs — anything else is custom */
const STANDARD_IDS = new Set([
  'fs_revenue', 'fs_expense', 'fs_asset', 'fs_liability', 'fs_equity',
  'fs_cogs', 'fs_opex', 'fs_opex_sga', 'fs_opex_rd', 'fs_opex_da', 'fs_opex_other',
  'fs_other_income', 'fs_interest_income', 'fs_interest_expense', 'fs_other_other', 'fs_tax_expense',
  'fs_asset_current', 'fs_asset_cash', 'fs_asset_ar', 'fs_asset_inventory', 'fs_asset_prepaid', 'fs_asset_other_current',
  'fs_asset_noncurrent', 'fs_asset_ppe', 'fs_asset_intangible', 'fs_asset_goodwill', 'fs_asset_other_noncurrent',
  'fs_liability_current', 'fs_liability_ap', 'fs_liability_accrued', 'fs_liability_current_debt', 'fs_liability_other_current',
  'fs_liability_noncurrent', 'fs_liability_lt_debt', 'fs_liability_deferred_tax', 'fs_liability_other_noncurrent',
  'fs_equity_common', 'fs_equity_retained', 'fs_equity_other',
]);

function buildTaxonomyTree(lines: TaxonomyLine[]): TaxonomyNode[] {
  if (!lines.length) return [];
  const map = new Map<string, TaxonomyNode>();
  for (const l of lines) {
    map.set(l.id, { id: l.id, label: l.name, statement: l.statement, parentId: l.parentId, normalBalance: l.normalBalance, isCustom: !STANDARD_IDS.has(l.id), children: [] });
  }
  const roots: TaxonomyNode[] = [];
  for (const l of lines) {
    const node = map.get(l.id)!;
    if (!l.parentId || !map.has(l.parentId)) {
      roots.push(node);
    } else {
      const parent = map.get(l.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }
  }
  return roots;
}

const STATEMENT_OPTIONS = [
  { value: 'PL', label: 'Income Statement' },
  { value: 'BS', label: 'Balance Sheet' },
  { value: 'CF', label: 'Cash Flow' },
  { value: 'OCI', label: 'Equity / OCI' },
];

function TaxonomyTree({ nodes, depth = 0, openIds, toggle, onEdit, onDelete }: {
  nodes: TaxonomyNode[];
  depth?: number;
  openIds: Set<string>;
  toggle: (id: string) => void;
  onEdit: (node: TaxonomyNode) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ul className="list-none pl-0">
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isOpen = openIds.has(node.id);

        return (
          <li key={node.id} className="py-0.5">
            <div
              className="flex items-center gap-2 py-1.5 px-2 rounded-input hover:bg-hover group"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
              <span
                className="cursor-pointer flex items-center gap-2 flex-1"
                onClick={() => hasChildren && toggle(node.id)}
              >
                {hasChildren ? (
                  isOpen ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="text-sm text-primary">{node.label}</span>
                {node.isCustom && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">Custom</span>}
              </span>
              {node.isCustom && (
                <span className="hidden group-hover:flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onEdit(node); }} className="p-1 rounded hover:bg-accent/10 text-text-tertiary hover:text-accent" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} className="p-1 rounded hover:bg-red-50 text-text-tertiary hover:text-red-600" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            {hasChildren && isOpen && <TaxonomyTree nodes={node.children!} depth={depth + 1} openIds={openIds} toggle={toggle} onEdit={onEdit} onDelete={onDelete} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function TaxonomySettingsPage() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formStatement, setFormStatement] = useState('PL');
  const [formParentId, setFormParentId] = useState('');
  const [formNormalBalance, setFormNormalBalance] = useState<'debit' | 'credit'>('debit');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiFetch<{ lines: TaxonomyLine[] }>('/api/coa-mapping/taxonomy'),
  });
  const taxonomyLines = data?.lines ?? [];
  const tree = useMemo(() => buildTaxonomyTree(taxonomyLines), [taxonomyLines]);

  /** Filter parent options to lines matching the selected statement */
  const parentOptions = useMemo(
    () => taxonomyLines.filter((l) => l.statement === formStatement),
    [taxonomyLines, formStatement],
  );

  const createMutation = useMutation({
    mutationFn: (payload: { id: string; code: string; name: string; statement: string; parentId?: string; normalBalance: string }) =>
      apiFetch('/api/coa-mapping/taxonomy', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/coa-mapping/taxonomy/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
      setDeleteConfirmId(null);
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormStatement('PL');
    setFormParentId('');
    setFormNormalBalance('debit');
  };

  const handleEdit = (node: TaxonomyNode) => {
    setEditingId(node.id);
    setFormName(node.label);
    setFormStatement(node.statement ?? 'PL');
    setFormParentId(node.parentId ?? '');
    setFormNormalBalance((node.normalBalance as 'debit' | 'credit') ?? 'debit');
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId);
  };

  const handleSubmit = () => {
    if (editingId) {
      // Update existing custom line (upsert via POST)
      createMutation.mutate({
        id: editingId,
        code: editingId,
        name: formName.trim(),
        statement: formStatement,
        parentId: formParentId || undefined,
        normalBalance: formNormalBalance,
      });
    } else {
      const slug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const id = `fs_custom_${slug}`;
      const code = id;
      createMutation.mutate({
        id,
        code,
        name: formName.trim(),
        statement: formStatement,
        parentId: formParentId || undefined,
        normalBalance: formNormalBalance,
      });
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display text-primary">Financial Statement Taxonomy</h1>
        <p className="text-text-secondary text-sm mt-1">Reporting line items and account mapping reference</p>
      </div>

      <div className="bg-surface border border-border rounded-card p-4">
        {isLoading ? (
          <p className="text-text-secondary text-sm">Loading taxonomy...</p>
        ) : tree.length === 0 ? (
          <p className="text-text-secondary text-sm">No taxonomy lines configured.</p>
        ) : (
          <TaxonomyTree nodes={tree} openIds={openIds} toggle={toggle} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 flex items-center justify-between">
          <span className="text-sm text-red-700">Delete this custom taxonomy line? Mapping rules referencing it will block deletion.</span>
          <div className="flex gap-2">
            <button onClick={confirmDelete} disabled={deleteMutation.isPending} className="px-3 py-1.5 rounded-input bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 rounded-input border border-border text-sm hover:bg-hover">Cancel</button>
          </div>
          {deleteMutation.isError && <p className="text-xs text-red-600 mt-1">{(deleteMutation.error as Error)?.message}</p>}
        </div>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border text-sm hover:bg-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Custom Line Item
        </button>
      ) : (
        <div className="bg-surface border border-border rounded-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">{editingId ? 'Edit Custom Taxonomy Line' : 'New Custom Taxonomy Line'}</h3>
            <button type="button" onClick={resetForm} className="text-text-tertiary hover:text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">Line Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Lease Liabilities"
                className="w-full px-3 py-1.5 rounded-input border border-border bg-background text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Statement</label>
              <select
                value={formStatement}
                onChange={(e) => { setFormStatement(e.target.value); setFormParentId(''); }}
                disabled={!!editingId}
                className="w-full px-3 py-1.5 rounded-input border border-border bg-background text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              >
                {STATEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Normal Balance</label>
              <select
                value={formNormalBalance}
                onChange={(e) => setFormNormalBalance(e.target.value as 'debit' | 'credit')}
                className="w-full px-3 py-1.5 rounded-input border border-border bg-background text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">Parent Section</label>
              <select
                value={formParentId}
                onChange={(e) => setFormParentId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-input border border-border bg-background text-sm text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">(Top-level — no parent)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {createMutation.isError && (
            <p className="text-xs text-red-600">Failed to {editingId ? 'update' : 'create'} line. {(createMutation.error as Error)?.message}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!formName.trim() || createMutation.isPending}
              onClick={handleSubmit}
              className="px-4 py-1.5 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? (editingId ? 'Updating...' : 'Creating...') : (editingId ? 'Update Line' : 'Create Line')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-1.5 rounded-input border border-border text-sm hover:bg-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
