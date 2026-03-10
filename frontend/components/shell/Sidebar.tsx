'use client';

import { useState } from 'react';
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
  Brain,
  ListChecks,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeProp?: 'recon' | 'adjustments' | 'unmapped' | 'variance' | 'aiPending';
  external?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Close Management',
    defaultOpen: true,
    items: [
      { href: 'trial-balance', label: 'Trial Balance', icon: Table, badgeProp: 'unmapped' },
      { href: 'gl-health', label: 'GL Health', icon: HeartPulse },
      { href: 'mapping', label: 'Account Mapping', icon: ArrowRightLeft, badgeProp: 'unmapped' },
      { href: 'reconciliation', label: 'Reconciliation', icon: ShieldCheck, badgeProp: 'recon' },
      { href: 'adjustments', label: 'Adjustments', icon: PenLine, badgeProp: 'adjustments' },
      { href: 'ai-review', label: 'AI Review', icon: Brain, badgeProp: 'aiPending' },
      { href: 'checklist', label: 'Checklist', icon: ListChecks },
    ],
  },
  {
    label: 'Reports',
    defaultOpen: true,
    items: [
      { href: 'statements', label: 'Statements', icon: FileText },
      { href: 'variance', label: 'Variance Analysis', icon: TrendingUp, badgeProp: 'variance' },
      { href: 'board-package', label: 'Board Package', icon: BookOpen },
    ],
  },
  {
    label: 'Administration',
    defaultOpen: true,
    items: [
      { href: 'review', label: 'Review & Certify', icon: Award },
      { href: 'audit-trail', label: 'Audit Trail', icon: History },
      { href: '/settings', label: 'Settings', icon: Settings, external: true },
    ],
  },
];

export function Sidebar({
  sessionId,
  unmappedCount = 0,
  reconIncompleteCount = 0,
  adjustmentsBadge = 0,
  statementsStale = false,
  varianceUnexplainedCount = 0,
  aiPendingCount = 0,
  sessionState,
  userRole,
  collapsed = false,
  onToggleCollapse,
}: {
  sessionId: string;
  unmappedCount?: number;
  reconIncompleteCount?: number;
  adjustmentsBadge?: number;
  statementsStale?: boolean;
  varianceUnexplainedCount?: number;
  aiPendingCount?: number;
  sessionState?: string;
  userRole?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const base = `/close/${sessionId}`;
  const isUnderReview = sessionState === 'UNDER_REVIEW';
  const role = userRole ?? 'controller';
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => { initial[g.label] = g.defaultOpen !== false; });
    return initial;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const getBadgeCount = (badgeProp?: string): number => {
    if (badgeProp === 'unmapped') return unmappedCount;
    if (badgeProp === 'recon') return reconIncompleteCount;
    if (badgeProp === 'adjustments') return adjustmentsBadge;
    if (badgeProp === 'variance') return varianceUnexplainedCount;
    if (badgeProp === 'aiPending') return aiPendingCount;
    return 0;
  };

  return (
    <aside className={cn(
      'fixed left-0 top-[56px] h-[calc(100vh-56px)] bg-[#0d1017] border-r border-[#1e2235] flex flex-col z-30 print:hidden transition-all duration-200',
      collapsed ? 'w-[60px]' : 'w-[240px]'
    )}>
      {/* Collapse button */}
      <div className={cn('flex items-center px-3 py-3', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md text-gray-600 hover:text-gray-400 hover:bg-[#141829] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (item.external && item.href === '/settings') {
              return role !== 'operating_partner' && role !== 'auditor';
            }
            return isSidebarItemVisible(role, item.href);
          });

          if (visibleItems.length === 0) return null;

          const isOpen = openGroups[group.label] !== false;

          return (
            <div key={group.label} className="mb-1">
              {/* Group header */}
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={cn(
                    'w-3 h-3 transition-transform duration-200',
                    !isOpen && '-rotate-90'
                  )} />
                </button>
              )}

              {/* Group items */}
              {(collapsed || isOpen) && (
                <div className="space-y-0.5 px-2">
                  {visibleItems.map((item) => {
                    const href = item.external ? item.href : `${base}/${item.href}`;
                    const isActive = pathname === href || (item.href !== 'dashboard' && pathname?.startsWith(href));
                    const badgeCount = getBadgeCount(item.badgeProp);

                    return (
                      <Link
                        key={item.href}
                        href={href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all relative',
                          collapsed ? 'justify-center p-2.5' : 'px-3 py-2',
                          isActive
                            ? 'bg-[#7C5CFC]/10 text-[#7C5CFC]'
                            : item.href === 'review' && isUnderReview
                              ? 'bg-[#7C5CFC]/5 text-[#7C5CFC]/70'
                              : 'text-gray-500 hover:bg-[#141829] hover:text-gray-300',
                        )}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#7C5CFC] rounded-r-full" />
                        )}
                        <item.icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {badgeCount > 0 && (
                              <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-semibold rounded-full bg-amber-500/10 text-amber-400 tabular-nums">
                                {badgeCount}
                              </span>
                            )}
                            {item.href === 'statements' && statementsStale && (
                              <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">STALE</span>
                            )}
                          </>
                        )}
                        {collapsed && badgeCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sabit branding at bottom */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-[#1e2235]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-700">Sabit</span>
          <span className="text-[10px] text-gray-700 ml-1.5">v1.0</span>
        </div>
      )}
    </aside>
  );
}
