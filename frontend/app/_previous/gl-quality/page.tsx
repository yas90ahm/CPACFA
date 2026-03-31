'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  GitMerge,
  TrendingDown,
  ToggleLeft,
  Building2,
  UserX,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowRight,
  Zap,
  Sparkles,
  RefreshCw,
  Play,
} from 'lucide-react';
import {
  useAccountAnalysis,
  useAccountAnalysisSummary,
  useRunAccountAnalysis,
  useAccountAction,
  useBulkExclude,
} from '@/lib/queries/account-analysis';
import type {
  AccountAnalysis,
  AccountFlag,
  AccountFlagType,
  AnalysisSummary,
} from '@/lib/queries/account-analysis';
import { EmptyState } from '@/components/shared/EmptyState';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';

/* ------------------------------------------------------------------ */
/*  Grade badge styles                                                 */
/* ------------------------------------------------------------------ */

const gradeStyles: Record<string, React.CSSProperties> = {
  A: { background: 'var(--status-success-bg)', color: 'var(--status-success)' },
  B: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
  C: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  D: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  F: { background: 'var(--status-error-bg)', color: 'var(--status-error)' },
};

/* ------------------------------------------------------------------ */
/*  Flag grouping                                                      */
/* ------------------------------------------------------------------ */

type SectionKey =
  | 'test_junk'
  | 'suspense'
  | 'duplicate'
  | 'misclassified'
  | 'contra'
  | 'intercompany'
  | 'personal_expense'
  | 'inactive';

const FLAG_TO_SECTION: Record<AccountFlagType, SectionKey> = {
  junk: 'test_junk',
  test: 'test_junk',
  suspense: 'suspense',
  duplicate: 'duplicate',
  misclassified: 'misclassified',
  contra_undetected: 'contra',
  intercompany: 'intercompany',
  personal_expense: 'personal_expense',
  inactive: 'inactive',
  zero_balance: 'inactive',
  orphan: 'suspense',
};

interface SectionConfig {
  key: SectionKey;
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accentVar: string;
  accentBgVar: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: 'test_junk',
    title: 'Test & Junk Accounts',
    icon: AlertTriangle,
    accentVar: 'var(--status-error)',
    accentBgVar: 'var(--status-error-bg)',
  },
  {
    key: 'suspense',
    title: 'Suspense & Clearing',
    icon: Search,
    accentVar: 'var(--status-warning)',
    accentBgVar: 'var(--status-warning-bg)',
  },
  {
    key: 'duplicate',
    title: 'Possible Duplicates',
    icon: GitMerge,
    accentVar: 'var(--status-info)',
    accentBgVar: 'var(--status-info-bg)',
  },
  {
    key: 'misclassified',
    title: 'Balance Issues',
    icon: TrendingDown,
    accentVar: 'var(--status-warning)',
    accentBgVar: 'var(--status-warning-bg)',
  },
  {
    key: 'contra',
    title: 'Contra Accounts',
    icon: ToggleLeft,
    accentVar: 'var(--ai-primary)',
    accentBgVar: 'var(--ai-bg)',
  },
  {
    key: 'intercompany',
    title: 'Intercompany',
    icon: Building2,
    accentVar: 'var(--status-info)',
    accentBgVar: 'var(--status-info-bg)',
  },
  {
    key: 'personal_expense',
    title: 'Personal Expenses',
    icon: UserX,
    accentVar: 'var(--status-error)',
    accentBgVar: 'var(--status-error-bg)',
  },
  {
    key: 'inactive',
    title: 'Inactive Accounts',
    icon: Archive,
    accentVar: 'var(--text-tertiary)',
    accentBgVar: 'var(--bg-surface-sunken)',
  },
];

function groupAccountsBySection(accounts: AccountAnalysis[]): Record<SectionKey, AccountAnalysis[]> {
  const sections: Record<SectionKey, AccountAnalysis[]> = {
    test_junk: [],
    suspense: [],
    duplicate: [],
    misclassified: [],
    contra: [],
    intercompany: [],
    personal_expense: [],
    inactive: [],
  };

  for (const acct of accounts) {
    const placed = new Set<SectionKey>();
    for (const flag of acct.flags) {
      const section = FLAG_TO_SECTION[flag.type] ?? 'suspense';
      if (!placed.has(section)) {
        sections[section].push(acct);
        placed.add(section);
      }
    }
  }

  return sections;
}

/* ------------------------------------------------------------------ */
/*  Summary Stat Card                                                  */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  colorVar,
  icon: Icon,
  children,
}: {
  label: string;
  value: number;
  colorVar: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg px-4 py-4 flex flex-col"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 shrink-0" style={{ color: colorVar }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      </div>
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: colorVar }}
      >
        {value}
      </span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loading                                                   */
/* ------------------------------------------------------------------ */

function PageSkeletonLoader() {
  return (
    <div style={{ padding: '24px' }}>
      {/* Header skeleton */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="h-7 rounded animate-pulse"
          style={{ width: 220, backgroundColor: 'var(--bg-surface-sunken)' }}
        />
        <div
          className="h-7 w-10 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--bg-surface-sunken)' }}
        />
      </div>
      <div
        className="h-4 rounded animate-pulse mb-6"
        style={{ width: 320, backgroundColor: 'var(--bg-surface-sunken)' }}
      />

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg p-4"
            style={{
              background: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            <div
              className="h-3 rounded animate-pulse mb-3"
              style={{ width: 80, backgroundColor: 'var(--bg-surface-sunken)' }}
            />
            <div
              className="h-8 rounded animate-pulse"
              style={{ width: 48, backgroundColor: 'var(--bg-surface-sunken)' }}
            />
          </div>
        ))}
      </div>

      {/* Section skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg mb-4"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div
              className="h-5 w-5 rounded animate-pulse"
              style={{ backgroundColor: 'var(--bg-surface-sunken)' }}
            />
            <div
              className="h-4 rounded animate-pulse flex-1"
              style={{ maxWidth: 200, backgroundColor: 'var(--bg-surface-sunken)' }}
            />
          </div>
          <div
            style={{
              borderTopColor: 'var(--border-default)',
              borderTopWidth: '1px',
              borderTopStyle: 'solid',
            }}
          >
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  borderBottomColor: 'var(--border-subtle)',
                  borderBottomWidth: '1px',
                  borderBottomStyle: 'solid',
                }}
              >
                <div
                  className="h-3 rounded animate-pulse"
                  style={{ width: 60, backgroundColor: 'var(--bg-surface-sunken)' }}
                />
                <div
                  className="h-3 rounded animate-pulse flex-1"
                  style={{ maxWidth: 250, backgroundColor: 'var(--bg-surface-sunken)' }}
                />
                <div
                  className="h-6 rounded animate-pulse"
                  style={{ width: 60, backgroundColor: 'var(--bg-surface-sunken)' }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible Flag Section                                           */
/* ------------------------------------------------------------------ */

function FlagSection({
  title,
  icon: Icon,
  count,
  accentColor,
  accentBgColor,
  accounts,
  allAccounts,
  onAction,
  bulkAction,
  actionPending,
  sectionKey,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  count: number;
  accentColor: string;
  accentBgColor: string;
  accounts: AccountAnalysis[];
  allAccounts: AccountAnalysis[];
  onAction: (code: string, action: 'excluded' | 'kept' | 'merged' | 'reclassified') => void;
  bulkAction?: () => void;
  actionPending: boolean;
  sectionKey: SectionKey;
}) {
  const [expanded, setExpanded] = useState(true);

  if (accounts.length === 0) return null;

  const bulkLabel =
    sectionKey === 'test_junk'
      ? 'Exclude All'
      : sectionKey === 'inactive'
        ? 'Exclude All Inactive'
        : undefined;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      {/* Section Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-hover transition-colors"
        style={{
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid',
          borderLeftColor: accentColor,
        }}
      >
        <Icon className="w-5 h-5 shrink-0" style={{ color: accentColor }} />
        <span className="flex-1 font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
          {title} ({count})
        </span>

        {bulkLabel && bulkAction && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              bulkAction();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                bulkAction();
              }
            }}
            className="text-xs font-medium px-2 py-1 rounded transition-colors cursor-pointer"
            style={{
              color: accentColor,
              background: accentBgColor,
            }}
          >
            {bulkLabel}
          </span>
        )}

        {expanded ? (
          <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
        )}
      </button>

      {/* Section Body */}
      {expanded && (
        <div
          style={{
            borderTopColor: 'var(--border-default)',
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
          }}
        >
          {accounts.map((acct) => (
            <AccountRow
              key={acct.accountCode}
              account={acct}
              allAccounts={allAccounts}
              accentColor={accentColor}
              accentBgColor={accentBgColor}
              sectionKey={sectionKey}
              onAction={onAction}
              actionPending={actionPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Account Row                                                        */
/* ------------------------------------------------------------------ */

function AccountRow({
  account,
  allAccounts,
  accentColor,
  accentBgColor,
  sectionKey,
  onAction,
  actionPending,
}: {
  account: AccountAnalysis;
  allAccounts: AccountAnalysis[];
  accentColor: string;
  accentBgColor: string;
  sectionKey: SectionKey;
  onAction: (code: string, action: 'excluded' | 'kept' | 'merged' | 'reclassified') => void;
  actionPending: boolean;
}) {
  const hasBalance = account.balance.net !== '0' && account.balance.net !== '0.00';
  const netNum = parseFloat(account.balance.net.replace(/[$,]/g, '') || '0');
  const isResolved = account.actionTaken != null;

  /* Render resolved state */
  if (isResolved) {
    const resolvedLabels: Record<string, { label: string; color: string; bg: string }> = {
      excluded: { label: 'Excluded', color: 'var(--status-error)', bg: 'var(--status-error-bg)' },
      kept: { label: 'Kept', color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
      merged: { label: 'Merged', color: 'var(--status-info)', bg: 'var(--status-info-bg)' },
      reclassified: { label: 'Reclassified', color: 'var(--status-info)', bg: 'var(--status-info-bg)' },
    };
    const r = resolvedLabels[account.actionTaken!] ?? resolvedLabels.kept;

    return (
      <div
        className="flex items-start gap-3 px-4 py-3 opacity-60"
        style={{
          borderBottomColor: 'var(--border-subtle)',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {account.accountCode}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {account.accountName}
            </span>
          </div>
        </div>
        <span
          className="text-xs font-medium px-2 py-1 rounded shrink-0"
          style={{ background: r.bg, color: r.color }}
        >
          {r.label}
        </span>
      </div>
    );
  }

  /* Duplicate side-by-side layout */
  if (sectionKey === 'duplicate' && account.duplicateOf) {
    const dupTarget = allAccounts.find((a) => a.accountCode === account.duplicateOf);
    return (
      <div
        className="px-4 py-3"
        style={{
          borderBottomColor: 'var(--border-subtle)',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
        }}
      >
        <div className="flex items-start gap-4">
          {/* Account A */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {account.accountCode}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {account.accountName}
              </span>
            </div>
            <div className="mt-1">
              <MoneyCell value={account.balance.net} showCurrency />
            </div>
          </div>

          {/* VS */}
          <div
            className="flex items-center justify-center px-2 py-1 text-xs font-medium rounded"
            style={{ color: 'var(--text-tertiary)', background: 'var(--bg-surface-sunken)' }}
          >
            vs
          </div>

          {/* Account B */}
          <div className="flex-1 min-w-0">
            {dupTarget ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {dupTarget.accountCode}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {dupTarget.accountName}
                  </span>
                </div>
                <div className="mt-1">
                  <MoneyCell value={dupTarget.balance.net} showCurrency />
                </div>
              </>
            ) : (
              <span className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>
                {account.duplicateOf}
              </span>
            )}
          </div>
        </div>

        {/* Flag messages */}
        {account.flags.map((flag, fi) => (
          <p key={fi} className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {flag.message}
          </p>
        ))}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => onAction(account.accountCode, 'kept')}
            disabled={actionPending}
            className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
            style={{
              borderColor: 'var(--border-default)',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: 'var(--text-secondary)',
            }}
          >
            Keep Both
          </button>
          <button
            type="button"
            onClick={() => onAction(account.accountCode, 'excluded')}
            disabled={actionPending}
            className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--status-info)' }}
          >
            Exclude One
          </button>
        </div>
      </div>
    );
  }

  /* Standard row */
  return (
    <div
      className="flex items-start gap-3 px-4 py-3"
      style={{
        borderBottomColor: 'var(--border-subtle)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
      }}
    >
      {/* Account info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {account.accountCode}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {account.accountName}
          </span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {fmtMoney(account.balance.net, { dollar: true })}
          </span>
        </div>

        {/* Flag messages */}
        {account.flags.map((flag, fi) => (
          <p key={fi} className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {flag.message}
          </p>
        ))}

        {/* Suspense: should be zero message */}
        {sectionKey === 'suspense' && (
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--status-warning)' }}>
            Should be zero at close
          </p>
        )}

        {/* Contra: suggested mapping */}
        {sectionKey === 'contra' && account.suggestedContraOf && (
          <p className="text-xs mt-1" style={{ color: 'var(--ai-primary)' }}>
            Suggested contra of: {account.suggestedContraOf}
          </p>
        )}

        {/* Test/Junk: balance warning */}
        {sectionKey === 'test_junk' && hasBalance && Math.abs(netNum) > 0 && (
          <p className="text-xs mt-1 font-medium" style={{ color: 'var(--status-error)' }}>
            Has balance of {fmtMoney(account.balance.net, { dollar: true })} -- excluding removes it from statements
          </p>
        )}

        {/* Flag chips */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {account.flags.map((flag, fi) => (
            <span
              key={fi}
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{
                background: accentBgColor,
                color: accentColor,
              }}
            >
              {flag.type.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 shrink-0 pt-1">
        {sectionKey === 'test_junk' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'excluded')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--status-error)' }}
            >
              Exclude
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Keep
            </button>
          </>
        )}

        {sectionKey === 'suspense' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--status-warning)' }}
            >
              Investigate
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Keep
            </button>
          </>
        )}

        {sectionKey === 'misclassified' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'reclassified')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--ai-primary)' }}
            >
              It&apos;s a Contra
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              It&apos;s Correct
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Investigate
            </button>
          </>
        )}

        {sectionKey === 'contra' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'reclassified')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--ai-primary)' }}
            >
              Confirm as Contra
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Not a Contra
            </button>
          </>
        )}

        {sectionKey === 'intercompany' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--status-info)' }}
            >
              Verified
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Flag for Resolution
            </button>
          </>
        )}

        {sectionKey === 'personal_expense' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'reclassified')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--status-error)' }}
            >
              Reclassify
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'excluded')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Exclude
            </button>
          </>
        )}

        {sectionKey === 'inactive' && (
          <>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'excluded')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--text-tertiary)' }}
            >
              Exclude
            </button>
            <button
              type="button"
              onClick={() => onAction(account.accountCode, 'kept')}
              disabled={actionPending}
              className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              style={{
                borderColor: 'var(--border-default)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--text-secondary)',
              }}
            >
              Keep
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI Findings Section                                                */
/* ------------------------------------------------------------------ */

function AIFindingsSection({
  accounts,
  onAction,
  actionPending,
}: {
  accounts: AccountAnalysis[];
  onAction: (code: string, action: 'excluded' | 'kept' | 'merged' | 'reclassified') => void;
  actionPending: boolean;
}) {
  const aiAccounts = accounts.filter((a) =>
    a.flags.some((f) => f.source === 'ai'),
  );

  if (aiAccounts.length === 0) return null;

  return (
    <div
      className="rounded-lg p-5 mt-6"
      style={{
        border: '2px dashed var(--ai-border)',
        backgroundColor: 'var(--ai-bg)',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5" style={{ color: 'var(--ai-primary)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--ai-primary)' }}>
          AI Analysis Findings
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {aiAccounts.length} finding{aiAccounts.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {aiAccounts.map((acct) => {
          const aiFlags = acct.flags.filter((f) => f.source === 'ai');
          const isResolved = acct.actionTaken != null;

          return (
            <div
              key={acct.accountCode}
              className="rounded-lg p-4"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--ai-border)',
                borderWidth: '1px',
                borderStyle: 'solid',
              }}
            >
              {/* AI badge */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ color: 'var(--ai-primary)', background: 'var(--ai-bg)' }}
                >
                  AI Analysis
                </span>
                <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {acct.accountCode}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {acct.accountName}
                </span>
              </div>

              {/* AI flag details */}
              {aiFlags.map((flag, fi) => (
                <div key={fi} className="mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{
                        background: flag.severity === 'critical'
                          ? 'var(--status-error-bg)'
                          : flag.severity === 'warning'
                            ? 'var(--status-warning-bg)'
                            : 'var(--bg-surface-sunken)',
                        color: flag.severity === 'critical'
                          ? 'var(--status-error)'
                          : flag.severity === 'warning'
                            ? 'var(--status-warning)'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {flag.suggestedAction}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {flag.message}
                  </p>
                </div>
              ))}

              {/* Balance */}
              <div className="flex items-center gap-4 mt-2 mb-3">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Net: {fmtMoney(acct.balance.net, { dollar: true })}
                </span>
              </div>

              {/* Actions */}
              {!isResolved && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAction(acct.accountCode, 'excluded')}
                    disabled={actionPending}
                    className="text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
                    style={{ background: 'var(--interactive-primary)' }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction(acct.accountCode, 'kept')}
                    disabled={actionPending}
                    className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                    style={{
                      borderColor: 'var(--border-default)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Override
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction(acct.accountCode, 'kept')}
                    disabled={actionPending}
                    className="text-xs font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {isResolved && (
                <span
                  className="text-xs font-medium px-2 py-1 rounded"
                  style={{
                    background: 'var(--status-success-bg)',
                    color: 'var(--status-success)',
                  }}
                >
                  Resolved
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function GLQualityReviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = (params.sessionId as string) ?? '';

  const { data: accounts, isLoading, isError, error } = useAccountAnalysis(sessionId);
  const { data: summary } = useAccountAnalysisSummary(sessionId);
  const runAnalysis = useRunAccountAnalysis(sessionId);
  const accountAction = useAccountAction(sessionId);
  const bulkExclude = useBulkExclude(sessionId);

  const handleAction = useCallback(
    (code: string, action: 'excluded' | 'kept' | 'merged' | 'reclassified') => {
      accountAction.mutate({ accountCode: code, action });
    },
    [accountAction],
  );

  const handleBulkExclude = useCallback(() => {
    bulkExclude.mutate();
  }, [bulkExclude]);

  const flaggedAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.flags.length > 0),
    [accounts],
  );

  const sections = useMemo(
    () => groupAccountsBySection(flaggedAccounts),
    [flaggedAccounts],
  );

  const criticalPending = useMemo(() => {
    if (!accounts) return 0;
    return accounts.filter(
      (a) =>
        a.actionTaken == null &&
        a.flags.some((f) => f.severity === 'critical'),
    ).length;
  }, [accounts]);

  /* ---- Loading ---- */
  if (isLoading) {
    return <PageSkeletonLoader />;
  }

  /* ---- Error ---- */
  if (isError) {
    return (
      <div style={{ padding: '24px' }}>
        <h1 className="text-2xl font-display mb-4" style={{ color: 'var(--text-primary)' }}>
          GL Quality Review
        </h1>
        <div
          className="rounded-lg p-8 text-center"
          style={{
            background: 'var(--status-error-bg)',
            borderColor: 'var(--status-error)',
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
        >
          <AlertTriangle
            className="w-8 h-8 mx-auto mb-3"
            style={{ color: 'var(--status-error)' }}
          />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>
            Failed to load quality analysis. Please try again.
          </p>
          <button
            type="button"
            onClick={() => runAnalysis.mutate()}
            disabled={runAnalysis.isPending}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50"
            style={{ background: 'var(--interactive-primary)' }}
          >
            {runAnalysis.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ---- No analysis run yet ---- */
  if (!accounts || accounts.length === 0) {
    if (!summary) {
      return (
        <div style={{ padding: '24px' }}>
          <h1 className="text-2xl font-display mb-6" style={{ color: 'var(--text-primary)' }}>
            GL Quality Review
          </h1>
          <EmptyState
            icon={Sparkles}
            title="Run GL Quality Analysis"
            description="Analyze your chart of accounts to detect test accounts, duplicates, suspense balances, and other quality issues before mapping."
            actionLabel={runAnalysis.isPending ? 'Running...' : 'Run GL Quality Analysis'}
            onAction={() => runAnalysis.mutate()}
          />
        </div>
      );
    }
  }

  /* ---- All clean ---- */
  if (accounts && flaggedAccounts.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
          GL Quality Review
        </h1>
        <div
          className="rounded-lg p-8 text-center mt-6"
          style={{
            background: 'var(--status-success-bg)',
            borderColor: 'var(--status-success)',
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
        >
          <CheckCircle2
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'var(--status-success)' }}
          />
          <p className="text-lg font-medium" style={{ color: 'var(--status-success)' }}>
            All {summary?.total ?? accounts.length} accounts look clean -- proceed to mapping
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            No issues detected. You can proceed to mapping.
          </p>
        </div>
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => router.push(`/close/${sessionId}/mapping`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-md transition-colors"
            style={{ background: 'var(--interactive-primary)' }}
          >
            Proceed to Mapping
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const grade = summary?.grade ?? 'C';
  const gradeStyle = gradeStyles[grade] ?? gradeStyles.F;

  /* ---- Main render ---- */
  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
              GL Quality Review
            </h1>
            <span className="px-3 py-1 rounded-full text-lg font-bold" style={gradeStyle}>
              {grade}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {summary?.total ?? accounts?.length ?? 0} accounts analyzed, {summary?.flagged ?? flaggedAccounts.length} flagged
            {summary?.autoExcludable ? `, ${summary.autoExcludable} can be auto-excluded` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => runAnalysis.mutate()}
          disabled={runAnalysis.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-hover transition-colors disabled:opacity-50"
          style={{
            borderColor: 'var(--border-default)',
            borderWidth: '1px',
            borderStyle: 'solid',
            color: 'var(--text-secondary)',
          }}
        >
          {runAnalysis.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Re-run Analysis
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <SummaryCard
          label="Critical"
          value={summary?.critical ?? 0}
          colorVar="var(--status-error)"
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Warning"
          value={summary?.warning ?? 0}
          colorVar="var(--status-warning)"
          icon={AlertCircle}
        />
        <SummaryCard
          label="Info"
          value={summary?.info ?? 0}
          colorVar="var(--text-tertiary)"
          icon={Info}
        />
        <SummaryCard
          label="Auto-excludable"
          value={summary?.autoExcludable ?? 0}
          colorVar="var(--status-info)"
          icon={Zap}
        >
          {(summary?.autoExcludable ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleBulkExclude}
              disabled={bulkExclude.isPending}
              className="mt-2 text-xs font-medium px-2.5 py-1 rounded text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--status-info)' }}
            >
              {bulkExclude.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
              ) : null}
              Exclude All
            </button>
          )}
        </SummaryCard>
      </div>

      {/* Flag Sections */}
      <div className="space-y-4 mt-6">
        {SECTION_CONFIGS.map((config) => {
          const sectionAccounts = sections[config.key];
          return (
            <FlagSection
              key={config.key}
              title={config.title}
              icon={config.icon}
              count={sectionAccounts.length}
              accentColor={config.accentVar}
              accentBgColor={config.accentBgVar}
              accounts={sectionAccounts}
              allAccounts={accounts ?? []}
              onAction={handleAction}
              bulkAction={
                config.key === 'test_junk' || config.key === 'inactive'
                  ? () => {
                      for (const a of sectionAccounts) {
                        if (!a.actionTaken) {
                          accountAction.mutate({ accountCode: a.accountCode, action: 'excluded' });
                        }
                      }
                    }
                  : undefined
              }
              actionPending={accountAction.isPending}
              sectionKey={config.key}
            />
          );
        })}
      </div>

      {/* AI Findings Section */}
      <AIFindingsSection
        accounts={accounts ?? []}
        onAction={handleAction}
        actionPending={accountAction.isPending}
      />

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between mt-8 pb-4">
        <button
          type="button"
          onClick={() => router.push(`/close/${sessionId}/mapping`)}
          className="text-sm transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Skip Quality Review
        </button>

        <div className="flex items-center gap-3">
          {criticalPending > 0 && (
            <span className="text-xs" style={{ color: 'var(--status-error)' }}>
              {criticalPending} critical flag{criticalPending !== 1 ? 's' : ''} remaining
            </span>
          )}
          <button
            type="button"
            disabled={criticalPending > 0}
            onClick={() => router.push(`/close/${sessionId}/mapping`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50"
            style={{ background: 'var(--interactive-primary)' }}
          >
            {accountAction.isPending && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            Proceed to Mapping
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
