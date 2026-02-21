'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Settings, ChevronDown, ArrowLeft } from 'lucide-react';
import type { CloseState } from '@/lib/types/close-session';

function stateClass(s: CloseState): string {
  if (s === 'OPEN') return 'bg-status-blue-dim text-status-blue border-status-blue/30';
  if (s === 'IN_PROGRESS') return 'bg-status-amber-dim text-status-amber border-status-amber/30';
  if (s === 'UNDER_REVIEW') return 'bg-accent-dim text-accent border-accent/30';
  if (s === 'CERTIFIED') return 'bg-status-green-dim text-status-green border-status-green/30';
  return 'bg-text-muted/20 text-text-secondary border-border-light';
}

export interface TopBarProps {
  entityName?: string;
  periodLabel?: string;
  state?: CloseState;
  userName?: string;
  userInitials?: string;
  /** When false, period selector is hidden (e.g. on session list). Default true when periodLabel provided. */
  showPeriod?: boolean;
  /** When 'portfolio', shows Portfolio Dashboard label instead of entity/period selectors. */
  mode?: 'close' | 'portfolio';
  /** When true (e.g. operating partner role), show Back to Portfolio link. */
  showBackToPortfolio?: boolean;
}

export function TopBar(p: TopBarProps) {
  const entityName = p.entityName ?? 'Apex Manufacturing Co.';
  const periodLabel = p.periodLabel ?? 'January 2026';
  const state = p.state ?? 'IN_PROGRESS';
  const userName = p.userName ?? 'Sarah Chen';
  const userInitials = p.userInitials ?? 'SC';
  const showPeriod = p.showPeriod !== false;
  const isPortfolio = p.mode === 'portfolio';

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-40 flex items-center justify-between px-4 bg-surface border-b border-border print:hidden">
      <div className="flex items-center gap-6">
        <span className="font-display text-lg tracking-[0.2em] uppercase text-primary">Sovereign</span>
        {isPortfolio ? (
          <span className="text-base font-medium text-primary">Portfolio Dashboard</span>
        ) : (
          <>
            {p.showBackToPortfolio && (
              <Link href="/portfolio" className="flex items-center gap-2 px-3 py-1.5 rounded-input text-text-secondary hover:bg-hover hover:text-primary text-sm">
                <ArrowLeft className="w-4 h-4" />
                Back to Portfolio
              </Link>
            )}
            <button type="button" className="flex items-center gap-2 px-3 py-1.5 rounded-input bg-hover border border-border-light text-primary text-sm">
              {entityName}
              <ChevronDown className="w-4 h-4 text-text-secondary" />
            </button>
            {showPeriod && (
              <button type="button" className="flex items-center gap-2 px-3 py-1.5 rounded-input bg-hover border border-border-light text-primary text-sm">
                {periodLabel}
                <ChevronDown className="w-4 h-4 text-text-secondary" />
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {!isPortfolio && (
          <span className={cn('px-2.5 py-1 text-xs font-medium rounded border', stateClass(state))}>
            {state.replace('_', ' ')}
          </span>
        )}
        <div className="flex items-center gap-2 pl-4 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-accent-dim flex items-center justify-center text-accent text-sm font-medium">{userInitials}</div>
          <span className="text-sm text-primary">{userName}</span>
        </div>
        <Link href="/settings" className="p-2 rounded-input text-text-secondary hover:text-primary hover:bg-hover" aria-label="Settings">
          <Settings className="w-5 h-5" />
        </Link>
      </div>
    </header>
  );
}
