'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isSidebarItemVisible } from '@/lib/permissions';
import {
  LayoutDashboard,
  Table,
  ArrowRightLeft,
  ShieldCheck,
  PenLine,
  FileText,
  TrendingUp,
  Award,
  History,
  Settings,
  BookOpen,
  HeartPulse,
} from 'lucide-react';

const navItems: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeProp?: 'recon' | 'adjustments';
  stale?: boolean;
  phaseComplete?: boolean;
  external?: boolean;
}[] = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'trial-balance', label: 'Trial Balance', icon: Table },
  { href: 'gl-health', label: 'GL Health', icon: HeartPulse },
  { href: 'mapping', label: 'Mapping', icon: ArrowRightLeft },
  { href: 'reconciliation', label: 'Reconciliation', icon: ShieldCheck, badgeProp: 'recon' },
  { href: 'adjustments', label: 'Adjustments', icon: PenLine, badgeProp: 'adjustments' },
  { href: 'statements', label: 'Statements', icon: FileText, stale: false },
  { href: 'variance', label: 'Variance', icon: TrendingUp, badge: 2 },
  { href: 'board-package', label: 'Board Package', icon: BookOpen },
  { href: 'review', label: 'Review & Certify', icon: Award },
  { href: 'audit-trail', label: 'Audit Trail', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings, external: true },
];

export function Sidebar({
  sessionId,
  unmappedCount = 0,
  reconIncompleteCount = 0,
  adjustmentsBadge = 0,
  statementsStale = false,
  varianceUnexplainedCount = 0,
  sessionState,
  userRole,
}: {
  sessionId: string;
  unmappedCount?: number;
  reconIncompleteCount?: number;
  adjustmentsBadge?: number;
  statementsStale?: boolean;
  varianceUnexplainedCount?: number;
  sessionState?: string;
  userRole?: string;
}) {
  const pathname = usePathname();
  const base = `/close/${sessionId}`;
  const isUnderReview = sessionState === 'UNDER_REVIEW';
  const role = userRole ?? 'controller';

  return (
    <aside className="fixed left-0 top-[56px] w-[240px] h-[calc(100vh-56px)] bg-surface border-r border-border flex flex-col z-30 print:hidden">
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
        {navItems.filter((item) => {
          if (item.external && item.href === '/settings') {
            return role !== 'operating_partner' && role !== 'auditor';
          }
          return isSidebarItemVisible(role, item.href);
        }).map((item, idx) => {
          const href = item.external ? item.href : `${base}/${item.href}`;
          const isActive = pathname === href || (item.href !== 'dashboard' && pathname?.startsWith(href));
          const isSeparator = item.label === 'Audit Trail' || item.label === 'Statements';
          return (
            <div key={item.href}>
              {isSeparator && <div className="my-2 border-t border-border-light" />}
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-input text-sm transition-colors border-l-3 border-transparent',
                  isActive
                    ? 'bg-accent-dim text-accent border-l-accent'
                    : item.href === 'review' && isUnderReview
                      ? 'bg-accent-dim/50 text-accent border-l-accent font-medium'
                      : 'text-text-secondary hover:bg-hover hover:text-primary',
                  !isActive && item.phaseComplete && 'border-l-status-green'
                )}
                style={{ borderLeftWidth: '3px' }}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.href === 'trial-balance' && unmappedCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-status-amber-dim text-status-amber">{unmappedCount}</span>
                )}
                {item.href === 'mapping' && unmappedCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-status-amber-dim text-status-amber">{unmappedCount}</span>
                )}
                {item.badgeProp === 'recon' && reconIncompleteCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-status-amber-dim text-status-amber">{reconIncompleteCount}</span>
                )}
                {item.badgeProp === 'adjustments' && adjustmentsBadge > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-status-amber-dim text-status-amber">{adjustmentsBadge}</span>
                )}
                {item.href === 'variance' && varianceUnexplainedCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-status-amber-dim text-status-amber">{varianceUnexplainedCount}</span>
                )}
                {item.href === 'statements' && statementsStale && (
                  <span className="text-xs text-status-amber">STALE</span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
