'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { GateEntry } from './GateStatusCard';

/* -- Types ----------------------------------------------------------------- */

export interface AttentionItem {
  priority: 'blocking' | 'action' | 'info';
  title: string;
  description: string;
  href: string;
  icon: 'gate' | 'mapping' | 'recon' | 'variance' | 'je' | 'statement';
}

export interface AttentionItemsCardProps {
  gates: GateEntry[];
  sessionId: string;
  reconComplete: number;
  reconTotal: number;
  ajeTemplatePending?: number;
  ajeTemplateTotal?: number;
  varianceExplainedCount?: number;
  varianceMaterialTotal?: number;
  mappedCount: number;
  totalAccounts: number;
  jesAwaitingApproval?: number;
  reconsInProgress?: number;
}

/* -- Helpers --------------------------------------------------------------- */

const DOT_COLORS: Record<AttentionItem['priority'], string> = {
  blocking: 'var(--status-error)',
  action: 'var(--status-warning)',
  info: 'var(--status-success)',
};

const PRIORITY_ORDER: Record<AttentionItem['priority'], number> = {
  blocking: 0,
  action: 1,
  info: 2,
};

function buildAttentionItems(props: AttentionItemsCardProps): AttentionItem[] {
  const {
    gates, sessionId, reconComplete, reconTotal,
    ajeTemplatePending = 0, ajeTemplateTotal = 0,
    varianceExplainedCount = 0, varianceMaterialTotal = 0,
    mappedCount, totalAccounts, jesAwaitingApproval = 0, reconsInProgress = 0,
  } = props;
  const base = `/close/${sessionId}`;
  const items: AttentionItem[] = [];

  for (const g of gates) {
    if (g.passing) continue;
    const id = g.id ?? '';
    if (id === 'all_accounts_mapped') {
      items.push({ priority: 'blocking', title: 'Map your accounts', description: `${mappedCount} of ${totalAccounts} classified. Close cannot advance.`, href: `${base}/mapping`, icon: 'mapping' });
    } else if (id === 'recons_complete') {
      items.push({ priority: 'blocking', title: 'Complete reconciliations', description: `${reconComplete} of ${reconTotal} complete.`, href: `${base}/reconciliation`, icon: 'recon' });
    } else if (id === 'templates_resolved') {
      items.push({ priority: 'blocking', title: 'Resolve recurring entries', description: `${ajeTemplatePending} of ${ajeTemplateTotal} templates pending.`, href: `${base}/adjustments`, icon: 'je' });
    } else if (id === 'statements_current') {
      items.push({ priority: 'blocking', title: 'Regenerate statements', description: 'Statements are stale or not yet generated.', href: `${base}/statements`, icon: 'statement' });
    } else if (id === 'variances_explained') {
      const unexplained = varianceMaterialTotal - varianceExplainedCount;
      items.push({ priority: 'blocking', title: 'Explain variances', description: `${unexplained} material variance${unexplained !== 1 ? 's' : ''} unexplained.`, href: `${base}/variance`, icon: 'variance' });
    } else if (id === 'no_blocking_issues') {
      items.push({ priority: 'blocking', title: 'Resolve blocking issues', description: g.detail ?? 'Open issues are blocking close.', href: `${base}/discrepancies`, icon: 'gate' });
    } else {
      items.push({ priority: 'blocking', title: g.name ?? id, description: g.detail ?? 'This gate is not passing.', href: `${base}/dashboard`, icon: 'gate' });
    }
  }

  if (jesAwaitingApproval > 0) {
    items.push({ priority: 'action', title: 'Journal entries awaiting approval', description: `${jesAwaitingApproval} JE${jesAwaitingApproval !== 1 ? 's' : ''} need review.`, href: `${base}/adjustments`, icon: 'je' });
  }
  if (reconsInProgress > 0) {
    items.push({ priority: 'action', title: 'Reconciliations in progress', description: `${reconsInProgress} reconciliation${reconsInProgress !== 1 ? 's' : ''} started but not complete.`, href: `${base}/reconciliation`, icon: 'recon' });
  }

  items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return items;
}

/* -- Component ------------------------------------------------------------- */

export function AttentionItemsCard(props: AttentionItemsCardProps) {
  const items = useMemo(() => buildAttentionItems(props), [props]);
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 5;
  const visible = expanded ? items : items.slice(0, LIMIT);
  const allClear = items.length === 0;

  return (
    <div
      className="rounded-[var(--radius-lg)]"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            Needs Your Attention
          </h2>
          {items.length > 0 && (
            <span
              className="inline-flex items-center justify-center text-xs font-bold text-white rounded-full"
              style={{ width: 20, height: 20, backgroundColor: 'var(--status-error)', fontSize: 11 }}
            >
              {items.length}
            </span>
          )}
        </div>
      </div>
      <div className="px-6 pb-5">
        {allClear ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)]"
            style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">All clear -- no items need attention</span>
          </div>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((item, i) => (
                <li key={`${item.icon}-${i}`}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] transition-colors hover:bg-[var(--interactive-ghost-hover)] group"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: DOT_COLORS[item.priority] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {item.title}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {item.description}
                      </p>
                    </div>
                    <span
                      className="text-xs font-medium flex items-center gap-1 flex-shrink-0"
                      style={{ color: 'var(--text-link)' }}
                    >
                      Fix <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {items.length > LIMIT && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 text-xs font-medium px-3 py-1"
                style={{ color: 'var(--text-link)' }}
              >
                {expanded ? 'Show less' : `Show all (${items.length})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
