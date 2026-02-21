'use client';

import { useState } from 'react';
import { mockTaxonomyFull } from '@/lib/mock/taxonomy-full';
import type { TaxonomyNode } from '@/lib/mock/taxonomy';
import { ChevronDown, ChevronRight } from 'lucide-react';

function formatBal(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
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
              {node.accountCount != null && (
                <span className="text-xs text-text-secondary ml-2">
                  {node.accountCount} account{node.accountCount !== 1 ? 's' : ''} mapped
                </span>
              )}
              {node.totalBalance != null && (
                <span className="text-xs font-mono text-text-secondary ml-2">{formatBal(node.totalBalance)}</span>
              )}
            </div>
            {hasChildren && isOpen && <TaxonomyTree nodes={node.children!} depth={depth + 1} openIds={openIds} toggle={toggle} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function TaxonomySettingsPage() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(['is', 'rev', 'cogs', 'opex', 'bs']));
  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display text-primary">Financial Statement Taxonomy</h1>
        <p className="text-text-secondary text-sm mt-1">Reporting line items and account mapping reference</p>
      </div>

      <div className="bg-surface border border-border rounded-card p-4">
        <TaxonomyTree nodes={mockTaxonomyFull} openIds={openIds} toggle={toggle} />
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
