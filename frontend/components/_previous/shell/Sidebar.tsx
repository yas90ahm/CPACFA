'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Building2,
  Calculator,
  Star,
  AlertTriangle,
  PieChart,
  Globe,
  GitMerge,
  BookOpen,
  HeartPulse,
  Search,
  Brain,
  Shield,
  ListChecks,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeProp?: 'recon' | 'adjustments';
  stale?: boolean;
  phaseComplete?: boolean;
  external?: boolean;
}

interface NavGroup {
  label: string;
  defaultOpen: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Pipeline',
    defaultOpen: true,
    items: [
      { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: 'trial-balance', label: '1 · Upload & Map', icon: Table },
      { href: 'mapping', label: '2 · Map Accounts', icon: ArrowRightLeft },
      { href: 'reconciliation', label: '3 · Reconciliation', icon: ShieldCheck, badgeProp: 'recon' },
      { href: 'adjustments', label: '4 · Adjustments', icon: PenLine, badgeProp: 'adjustments' },
      { href: 'statements', label: '5 · Statements', icon: FileText, stale: false },
      { href: 'variance', label: '6 · Variance', icon: TrendingUp },
      { href: 'review', label: '7 · Review & Certify', icon: Award },
    ],
  },
  {
    label: 'Accounting Modules',
    defaultOpen: false,
    items: [
      { href: 'prepaids', label: 'Prepaids', icon: FileText },
      { href: 'fixed-assets', label: 'Fixed Assets', icon: Building2 },
      { href: 'payroll-accrual', label: 'Payroll Accrual', icon: Calculator },
      { href: 'debt-accrual', label: 'Debt Accrual', icon: Calculator },
      { href: 'deferred-tax', label: 'Deferred Tax', icon: Calculator },
      { href: 'leases', label: 'Leases (ASC 842)', icon: Building2 },
      { href: 'inventory-reserve', label: 'Inventory Reserve', icon: AlertTriangle },
      { href: 'stock-compensation', label: 'Equity Comp', icon: Star },
      { href: 'impairment', label: 'Impairment', icon: AlertTriangle },
      { href: 'segments', label: 'Segments', icon: PieChart },
      { href: 'fx-translation', label: 'FX Translation', icon: Globe },
      { href: 'consolidation', label: 'Consolidation', icon: GitMerge },
      { href: 'bank-reconciliation', label: 'Bank Recon', icon: Calculator },
      { href: 'ar-aging', label: 'AR Aging', icon: Table },
      { href: 'ap-aging', label: 'AP Aging', icon: Table },
    ],
  },
  {
    label: 'Governance',
    defaultOpen: false,
    items: [
      { href: 'gl-health', label: 'GL Health', icon: HeartPulse },
      { href: 'gl-quality', label: 'GL Quality', icon: Sparkles },
      { href: 'controls', label: 'Controls', icon: Shield },
      { href: 'ai-review', label: 'AI Review', icon: Brain },
      { href: 'audit-trail', label: 'Audit Trail', icon: History },
      { href: 'audit-binder', label: 'Audit Binder', icon: BookOpen },
      { href: 'board-package', label: 'Board Package', icon: BookOpen },
      { href: 'analytics', label: 'Analytics', icon: BarChart3 },
      { href: 'checklist', label: 'Checklist', icon: ListChecks },
      { href: 'discrepancies', label: 'Discrepancies', icon: Search },
    ],
  },
];

const STORAGE_KEY_GROUPS = 'sabit-sidebar-groups';

const settingsItem: NavItem = { href: '/settings', label: 'Settings', icon: Settings, external: true };

function loadGroupState(): Record<string, boolean> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_GROUPS);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  return null;
}

function saveGroupState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function Sidebar({
  sessionId,
  mappingPendingCount = 0,
  reconIncompleteCount = 0,
  adjustmentsBadge = 0,
  statementsStale = false,
  varianceUnexplainedCount = 0,
  glQualityPending = 0,
  glQualityDone = false,
  glQualityGrade,
  sessionState,
  userRole,
  collapsed = false,
  onToggleCollapse,
}: {
  sessionId: string;
  mappingPendingCount?: number;
  reconIncompleteCount?: number;
  adjustmentsBadge?: number;
  statementsStale?: boolean;
  varianceUnexplainedCount?: number;
  glQualityPending?: number;
  glQualityDone?: boolean;
  glQualityGrade?: string;
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
    const saved = loadGroupState();
    if (saved) return saved;
    const init: Record<string, boolean> = {};
    for (const g of navGroups) init[g.label] = g.defaultOpen;
    return init;
  });

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      saveGroupState(next);
      return next;
    });
  }, []);

  const renderItemCollapsed = (item: NavItem) => {
    const href = item.external ? item.href : `${base}/${item.href}`;
    const isActive = pathname === href || (item.href !== 'dashboard' && pathname?.startsWith(href));
    const isPromotedReview = item.href === 'review' && isUnderReview && !isActive;

    return (
      <Link
        key={item.href}
        href={href}
        className={cn(
          'flex items-center justify-center w-10 h-10 mx-auto rounded-md transition-colors duration-150',
          isActive
            ? 'bg-[var(--bg-table-row-selected)] text-[var(--interactive-primary)]'
            : isPromotedReview
              ? 'bg-[var(--status-info-bg)] text-[var(--interactive-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-nav-hover)] hover:text-[var(--text-primary)]',
        )}
        title={item.label}
      >
        <item.icon className="w-5 h-5" />
      </Link>
    );
  };

  const renderBadge = (value: number) => (
    <span className="inline-flex items-center justify-center min-w-[18px] px-1.5 py-0.5 text-xs font-medium tabular-nums rounded-full bg-[var(--status-warning-bg)] text-[var(--status-warning)]">
      {value}
    </span>
  );

  const renderItem = (item: NavItem) => {
    if (collapsed) return renderItemCollapsed(item);

    const href = item.external ? item.href : `${base}/${item.href}`;
    const isActive = pathname === href || (item.href !== 'dashboard' && pathname?.startsWith(href));
    const isPromotedReview = item.href === 'review' && isUnderReview && !isActive;

    return (
      <Link
        key={item.href}
        href={href}
        className={cn(
          'group flex items-center gap-3 pl-3 pr-3 mx-2 h-9 rounded-input text-sm transition-all duration-150',
          'border-l-2',
          isActive
            ? 'bg-[var(--bg-table-row-selected)] text-[var(--interactive-primary)] border-l-[var(--interactive-primary)]'
            : isPromotedReview
              ? 'bg-[var(--status-info-bg)] text-[var(--interactive-primary)] border-l-[var(--interactive-primary)] font-medium'
              : 'text-[var(--text-secondary)] border-l-transparent hover:border-l-[var(--interactive-primary)] hover:bg-[var(--bg-nav-hover)] hover:text-[var(--text-primary)]',
          !isActive && item.phaseComplete && 'border-l-[var(--status-success)]',
        )}
        style={isActive ? { boxShadow: 'inset 2px 0 8px -4px var(--interactive-primary)' } : undefined}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.href === 'mapping' && mappingPendingCount > 0 && renderBadge(mappingPendingCount)}
        {item.badgeProp === 'recon' && reconIncompleteCount > 0 && renderBadge(reconIncompleteCount)}
        {item.badgeProp === 'adjustments' && adjustmentsBadge > 0 && renderBadge(adjustmentsBadge)}
        {item.href === 'variance' && varianceUnexplainedCount > 0 && renderBadge(varianceUnexplainedCount)}
        {item.href === 'gl-quality' && glQualityGrade && (
          <div
            className={cn(
              'w-2 h-2 rounded-full shrink-0',
              (glQualityGrade === 'A' || glQualityGrade === 'B') && 'bg-[var(--status-success)]',
              glQualityGrade === 'C' && 'bg-[var(--status-warning)]',
              glQualityGrade !== 'A' && glQualityGrade !== 'B' && glQualityGrade !== 'C' && 'bg-[var(--status-error)]',
            )}
            title={`GL Quality: ${glQualityGrade}`}
          />
        )}
        {item.href === 'gl-quality' && !glQualityGrade && glQualityDone && glQualityPending === 0 && (
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)]" />
        )}
        {item.href === 'gl-quality' && glQualityPending > 0 && renderBadge(glQualityPending)}
        {item.href === 'statements' && statementsStale && (
          <span className="inline-flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--status-warning)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-warning)]" />
            Stale
          </span>
        )}
      </Link>
    );
  };

  const showSettings = role !== 'operating_partner' && role !== 'auditor';

  return (
    <aside
      className={cn(
        'fixed left-0 top-[56px] h-[calc(100vh-56px)] border-r border-[var(--border-default)] bg-[var(--bg-nav)] flex flex-col z-30 print:hidden transition-[width] duration-200 shadow-[1px_0_0_var(--border-default)]',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <nav className="flex-1 py-2 overflow-y-auto">
        {/* UNDER_REVIEW promoted link */}
        {isUnderReview && (
          <div className={collapsed ? 'flex justify-center mb-2' : 'mx-2 mb-2'}>
            {collapsed ? (
              <Link
                href={`${base}/review`}
                className="relative flex items-center justify-center w-10 h-10 rounded-md transition-colors hover:opacity-90"
                style={{
                  background: 'var(--interactive-primary)',
                  color: 'white',
                  ...(pathname === `${base}/review`
                    ? { boxShadow: '0 0 0 2px rgba(26,95,180,0.3)' }
                    : {}),
                }}
                title="Review & Certify"
              >
                <Award className="w-5 h-5" />
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{
                    background: 'var(--status-warning)',
                    borderColor: 'var(--bg-surface)',
                  }}
                />
              </Link>
            ) : (
              <Link
                href={`${base}/review`}
                className="flex items-center gap-3 px-4 py-2.5 rounded-input text-sm font-semibold transition-colors hover:opacity-90"
                style={{
                  background: 'var(--interactive-primary)',
                  color: 'white',
                  ...(pathname === `${base}/review`
                    ? { boxShadow: '0 0 0 2px rgba(26,95,180,0.3)' }
                    : {}),
                }}
              >
                <Award className="w-4 h-4 shrink-0" />
                <span className="flex-1">Review & Certify</span>
              </Link>
            )}
          </div>
        )}

        {/* Navigation groups */}
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => isSidebarItemVisible(role, item.href));
          if (visibleItems.length === 0) return null;
          const isOpen = openGroups[group.label] ?? group.defaultOpen;

          if (collapsed) {
            // In collapsed mode, show all items as icons (no group headers, always expanded)
            return (
              <div key={group.label} className="mb-1 space-y-1 py-1">
                {visibleItems.map(renderItem)}
              </div>
            );
          }

          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center gap-2 w-full px-4 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-150"
              >
                <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform duration-200', !isOpen && '-rotate-90')} />
                <span>{group.label}</span>
              </button>
              {isOpen && (
                <div className="space-y-0.5 animate-collapse-down">
                  {visibleItems.map(renderItem)}
                </div>
              )}
            </div>
          );
        })}

        {/* Settings */}
        {showSettings && (
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
            {renderItem(settingsItem)}
          </div>
        )}
      </nav>

      {/* Collapse toggle button */}
      <div className="border-t border-[var(--border-subtle)] py-2 flex justify-center print:hidden">
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-nav-hover)] transition-colors duration-150"
          title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" />
            : <PanelLeftClose className="w-4 h-4" />
          }
        </button>
      </div>
    </aside>
  );
}
