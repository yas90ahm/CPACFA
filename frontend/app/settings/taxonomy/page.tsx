'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TaxonomyLine {
  id: string;
  code: string;
  name: string;
  statement: string;
  parentId?: string;
}

interface TaxonomyNode {
  id: string;
  label: string;
  children?: TaxonomyNode[];
}

function buildTaxonomyTree(lines: TaxonomyLine[]): TaxonomyNode[] {
  if (!lines.length) return [];
  const map = new Map<string, TaxonomyNode>();
  for (const l of lines) {
    map.set(l.id, { id: l.id, label: l.name, children: [] });
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

function TaxonomyTree({ nodes, depth = 0, openIds, toggle }: { nodes: TaxonomyNode[]; depth?: number; openIds: Set<string>; toggle: (id: string) => void }) {
  return (
    <ul className="list-none pl-0">
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isOpen = openIds.has(node.id);

        return (
          <li key={node.id} className="py-0.5">
            <div
              className="flex items-center gap-2 py-1.5 px-2 rounded-input hover:bg-hover cursor-pointer"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => hasChildren && toggle(node.id)}
            >
              {hasChildren ? (
                isOpen ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="text-sm text-primary">{node.label}</span>
            </div>
            {hasChildren && isOpen && <TaxonomyTree nodes={node.children!} depth={depth + 1} openIds={openIds} toggle={toggle} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function TaxonomySettingsPage() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
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
          <TaxonomyTree nodes={tree} openIds={openIds} toggle={toggle} />
        )}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-input border border-border text-sm" title="Custom line items coming soon">
          + Add Line Item
        </button>
        <span className="text-xs text-text-tertiary">Custom line items coming soon.</span>
      </div>
    </div>
  );
}
