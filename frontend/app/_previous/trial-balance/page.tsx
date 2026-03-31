'use client';

import { useParams } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTrialBalance } from '@/lib/queries/trial-balance';
import { useAccountAnalysis } from '@/lib/queries/account-analysis';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { EmptyState } from '@/components/shared/EmptyState';
import { apiFetch } from '@/lib/api';
import { fmtMoney, isMoneyZero } from '@/lib/money';
import { sumMoneyStrings, moneyAbs } from '@/lib/money';
import {
  Search,
  Download,
  Printer,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Upload,
} from 'lucide-react';
import type {
  TrialBalanceRow,
  AccountType,
  GLDrillDownResponse,
} from '@/lib/types/trial-balance';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const ACCOUNT_TYPE_BG: Record<AccountType, string> = {
  ASSET: 'var(--status-info-bg)',
  LIABILITY: 'var(--status-warning-bg)',
  REVENUE: 'var(--status-success-bg)',
  EXPENSE: 'var(--status-error-bg)',
  EQUITY: 'var(--ai-badge-bg)',
};

type BalanceFilterValue = 'ALL' | 'DEBIT' | 'CREDIT' | 'ZERO';

/* -------------------------------------------------------------------------- */
/*  Skeleton Loader                                                            */
/* -------------------------------------------------------------------------- */

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 40,
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor:
              i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-table-row-alt)',
          }}
        >
          {[100, 1, 100, 140, 140, 140].map((w, j) => (
            <div
              key={j}
              style={{
                width: w === 1 ? undefined : w,
                flex: w === 1 ? 1 : undefined,
                padding: '0 12px',
              }}
            >
              <div
                style={{
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: 'var(--bg-surface-sunken)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            </div>
          ))}
        </div>
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function TrialBalancePage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  /* ---- state ---- */
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | AccountType>('ALL');
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilterValue>('ALL');
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(type: string) {
    setCollapsedGroups(prev => ({ ...prev, [type]: !prev[type] }));
  }

  /* ---- data ---- */
  const { data, isLoading, error } = useTrialBalance(sessionId, isAdjusted);
  const { data: analysisAccounts } = useAccountAnalysis(sessionId);
  const excludedAccounts = useMemo(
    () => (analysisAccounts ?? []).filter((a) => a.actionTaken === 'excluded'),
    [analysisAccounts],
  );
  const excludedCount = excludedAccounts.length;

  const rows = data?.rows ?? [];
  const totalDebits = data?.totalDebits ?? '0.00';
  const totalCredits = data?.totalCredits ?? '0.00';
  const difference = sumMoneyStrings([
    totalDebits,
    `-${totalCredits.replace(/^-/, '')}`,
  ]);
  const isBalanced = moneyAbs(difference) < 0.02;

  /* ---- drill-down ---- */
  const { data: drillDown, isLoading: drillDownLoading } = useQuery({
    queryKey: ['tb-drill-down', sessionId, expandedRow],
    queryFn: () =>
      apiFetch<GLDrillDownResponse>(
        `/api/close/sessions/${sessionId}/trial-balance/${encodeURIComponent(expandedRow!)}/entries`,
      ),
    enabled: !!sessionId && !!expandedRow,
    staleTime: 30_000,
  });

  /* ---- filtering ---- */
  const filteredRows = useMemo(() => {
    let list = rows;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.accountCode.toLowerCase().includes(q) ||
          r.accountName.toLowerCase().includes(q),
      );
    }

    // Type filter
    if (typeFilter !== 'ALL') {
      list = list.filter((r) => r.accountType === typeFilter);
    }

    // Balance filter
    if (balanceFilter === 'DEBIT') {
      list = list.filter((r) => !isMoneyZero(r.debitBalance));
    } else if (balanceFilter === 'CREDIT') {
      list = list.filter((r) => !isMoneyZero(r.creditBalance));
    } else if (balanceFilter === 'ZERO') {
      list = list.filter(
        (r) => isMoneyZero(r.debitBalance) && isMoneyZero(r.creditBalance),
      );
    }

    return list;
  }, [rows, searchQuery, typeFilter, balanceFilter]);

  /* ---- grouped rows by account type ---- */
  const ACCOUNT_TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

  const groupedRows = useMemo(() => {
    const groups: { type: AccountType; accounts: typeof filteredRows; groupDebit: string; groupCredit: string; groupNet: string }[] = [];
    for (const type of ACCOUNT_TYPE_ORDER) {
      const accounts = filteredRows.filter((r) => r.accountType === type);
      if (accounts.length === 0) continue;
      const groupDebit = sumMoneyStrings(accounts.map((a) => a.debitBalance));
      const groupCredit = sumMoneyStrings(accounts.map((a) => a.creditBalance));
      const groupNet = sumMoneyStrings(accounts.map((a) => a.netBalance));
      groups.push({ type, accounts, groupDebit, groupCredit, groupNet });
    }
    return groups;
  }, [filteredRows]);

  /* ---- handlers ---- */
  const handleRowClick = useCallback(
    (accountCode: string) => {
      setExpandedRow((prev) => (prev === accountCode ? null : accountCode));
    },
    [],
  );

  const handleExportCSV = useCallback(() => {
    const headers = [
      'Account Code',
      'Account Name',
      'Type',
      'Debit (USD)',
      'Credit (USD)',
      'Net Balance',
    ];
    const csvRows = [headers];
    filteredRows.forEach((r) => {
      csvRows.push([
        r.accountCode,
        r.accountName,
        r.accountType,
        r.debitBalance,
        r.creditBalance,
        r.netBalance,
      ]);
    });
    const csv = csvRows
      .map((row) =>
        row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-${isAdjusted ? 'adjusted' : 'unadjusted'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredRows, isAdjusted]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  /* ---- render helpers ---- */
  const glEntries = expandedRow ? (drillDown?.entries ?? []).slice(0, 5) : [];

  // RENDER

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ------------------------------------------------------------------ */}
      {/*  1. Balance Banner (sticky top)                                     */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 48,
          padding: '0 24px',
          backgroundColor: isBalanced
            ? 'var(--bg-surface)'
            : 'var(--status-error-bg)',
          borderBottom: `2px solid ${isBalanced ? 'var(--status-success)' : 'var(--status-error)'}`,
        }}
      >
        {/* Left: status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {isBalanced ? (
            <Check
              size={16}
              style={{ color: 'var(--status-success)' }}
            />
          ) : (
            <AlertTriangle
              size={16}
              style={{ color: 'var(--status-error)' }}
            />
          )}
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: isBalanced
                ? 'var(--status-success)'
                : 'var(--status-error)',
            }}
          >
            {isBalanced
              ? 'Trial Balance: In Balance'
              : 'Trial Balance: OUT OF BALANCE'}
          </span>
        </div>

        {/* Center: totals */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          <span>Total Debits: {fmtMoney(totalDebits, { dollar: true })}</span>
          <span>
            Total Credits: {fmtMoney(totalCredits, { dollar: true })}
          </span>
          <span>Difference: {fmtMoney(difference, { dollar: true, dash: false })}</span>
        </div>

        {/* Right: period label */}
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
          }}
        >
          {data?.periodLabel ?? ''}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  2. Toolbar Row                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 44,
          padding: '0 24px',
          marginTop: 16,
        }}
      >
        {/* Search input */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 10,
              top: 10,
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: 36,
              paddingLeft: 34,
              paddingRight: 12,
              fontSize: 13,
              backgroundColor: 'var(--bg-surface-sunken)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as 'ALL' | AccountType)
          }
          style={{
            height: 36,
            padding: '0 12px',
            fontSize: 13,
            backgroundColor: 'var(--bg-surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        >
          <option value="ALL">Type: All</option>
          <option value="ASSET">Asset</option>
          <option value="LIABILITY">Liability</option>
          <option value="EQUITY">Equity</option>
          <option value="REVENUE">Revenue</option>
          <option value="EXPENSE">Expense</option>
        </select>

        {/* Balance filter */}
        <select
          value={balanceFilter}
          onChange={(e) =>
            setBalanceFilter(e.target.value as BalanceFilterValue)
          }
          style={{
            height: 36,
            padding: '0 12px',
            fontSize: 13,
            backgroundColor: 'var(--bg-surface-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        >
          <option value="ALL">Balance: All</option>
          <option value="DEBIT">Debit</option>
          <option value="CREDIT">Credit</option>
          <option value="ZERO">Zero</option>
        </select>

        {/* Adjusted / Unadjusted toggle */}
        <div
          style={{
            display: 'flex',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setIsAdjusted(false)}
            style={{
              padding: '0 14px',
              height: 36,
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: !isAdjusted
                ? 'var(--interactive-primary)'
                : 'var(--bg-surface)',
              color: !isAdjusted ? 'white' : 'var(--text-secondary)',
              transition: 'background-color 0.15s, color 0.15s',
            }}
          >
            Unadjusted
          </button>
          <button
            type="button"
            onClick={() => setIsAdjusted(true)}
            style={{
              padding: '0 14px',
              height: 36,
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              borderLeft: '1px solid var(--border-default)',
              cursor: 'pointer',
              backgroundColor: isAdjusted
                ? 'var(--interactive-primary)'
                : 'var(--bg-surface)',
              color: isAdjusted ? 'white' : 'var(--text-secondary)',
              transition: 'background-color 0.15s, color 0.15s',
            }}
          >
            Adjusted
          </button>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Export CSV */}
        <button
          type="button"
          onClick={handleExportCSV}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            height: 36,
            fontSize: 13,
            fontWeight: 500,
            border: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          <Download size={14} />
          Export CSV
        </button>

        {/* Print */}
        <button
          type="button"
          onClick={handlePrint}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            height: 36,
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          <Printer size={14} />
          Print
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  3. Table                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          margin: '16px 24px 0',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 44,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: 'var(--bg-surface-sunken)',
            borderBottom: '2px solid var(--border-table-header)',
          }}
        >
          <div
            style={{
              width: 100,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
            }}
          >
            Acct Code
          </div>
          <div
            style={{
              flex: 1,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
            }}
          >
            Account Name
          </div>
          <div
            style={{
              width: 100,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
            }}
          >
            Type
          </div>
          <div
            style={{
              width: 140,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
              textAlign: 'right',
            }}
          >
            Debit (USD)
          </div>
          <div
            style={{
              width: 140,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
              textAlign: 'right',
            }}
          >
            Credit (USD)
          </div>
          <div
            style={{
              width: 140,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-secondary)',
              textAlign: 'right',
            }}
          >
            Net Balance
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <SkeletonRows />
        ) : error ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              color: 'var(--status-error)',
              fontSize: 14,
            }}
          >
            Failed to load trial balance. Please try again.
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48 }}>
            <EmptyState
              icon={Upload}
              title="No Trial Balance Data"
              description="Upload a general ledger or trial balance from the dashboard to get started."
            />
          </div>
        ) : filteredRows.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 14,
            }}
          >
            No accounts match your filters.
          </div>
        ) : (
          groupedRows.map((group) => (
            <div key={group.type} style={{ marginBottom: 2 }}>
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontWeight: 500,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-surface-sunken)',
                  border: 'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
              >
                {collapsedGroups[group.type] ? <ChevronRight size={14} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} style={{ flexShrink: 0 }} />}
                <span>{group.type}</span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>({group.accounts.length} accounts)</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: 'var(--text-secondary)' }}>
                  <MoneyCell value={group.groupNet} />
                </span>
              </button>
              {/* Account rows */}
              {!collapsedGroups[group.type] && group.accounts.map((row, idx) => {
            const isExpanded = expandedRow === row.accountCode;
            return (
              <div key={row.accountCode}>
                {/* Data row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(row.accountCode)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRowClick(row.accountCode);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: 40,
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor:
                      idx % 2 === 0
                        ? 'var(--bg-surface)'
                        : 'var(--bg-table-row-alt)',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      'var(--bg-table-row-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      idx % 2 === 0
                        ? 'var(--bg-surface)'
                        : 'var(--bg-table-row-alt)';
                  }}
                >
                  {/* Account Code */}
                  <div
                    style={{
                      width: 100,
                      padding: '0 12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                    ) : (
                      <ChevronRight size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                    )}
                    {row.accountCode}
                  </div>

                  {/* Account Name */}
                  <div
                    style={{
                      flex: 1,
                      padding: '0 12px',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.accountName}
                  </div>

                  {/* Type chip */}
                  <div
                    style={{
                      width: 100,
                      padding: '0 12px',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor:
                          ACCOUNT_TYPE_BG[row.accountType] ?? 'var(--bg-surface-sunken)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {row.accountType}
                    </span>
                  </div>

                  {/* Debit */}
                  <div style={{ width: 140, padding: '0 12px' }}>
                    <MoneyCell value={row.debitBalance} />
                  </div>

                  {/* Credit */}
                  <div style={{ width: 140, padding: '0 12px' }}>
                    <MoneyCell value={row.creditBalance} />
                  </div>

                  {/* Net Balance */}
                  <div style={{ width: 140, padding: '0 12px' }}>
                    <MoneyCell value={row.netBalance} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      backgroundColor: 'var(--bg-surface-sunken)',
                      padding: '16px 24px',
                      borderLeft: '3px solid var(--interactive-primary)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {drillDownLoading ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--text-tertiary)',
                          padding: '8px 0',
                        }}
                      >
                        Loading entries...
                      </div>
                    ) : glEntries.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--text-tertiary)',
                          padding: '8px 0',
                        }}
                      >
                        No GL entries found for this account.
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Recent GL Entries
                        </div>
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr>
                              <th
                                style={{
                                  textAlign: 'left',
                                  padding: '4px 12px 4px 0',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--text-tertiary)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                Date
                              </th>
                              <th
                                style={{
                                  textAlign: 'left',
                                  padding: '4px 12px 4px 0',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--text-tertiary)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                Description
                              </th>
                              <th
                                style={{
                                  textAlign: 'right',
                                  padding: '4px 12px 4px 0',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--text-tertiary)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                Debit
                              </th>
                              <th
                                style={{
                                  textAlign: 'right',
                                  padding: '4px 0',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--text-tertiary)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                Credit
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {glEntries.map((entry) => (
                              <tr key={entry.id}>
                                <td
                                  style={{
                                    padding: '6px 12px 6px 0',
                                    fontFamily: 'var(--font-mono, monospace)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {entry.date}
                                </td>
                                <td
                                  style={{
                                    padding: '6px 12px 6px 0',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {entry.description ?? '\u2014'}
                                </td>
                                <td
                                  style={{
                                    padding: '6px 12px 6px 0',
                                    textAlign: 'right',
                                  }}
                                >
                                  <MoneyCell value={entry.debit} />
                                </td>
                                <td
                                  style={{
                                    padding: '6px 0',
                                    textAlign: 'right',
                                  }}
                                >
                                  <MoneyCell value={entry.credit} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <a
                        href={`/close/${sessionId}/trial-balance/accounts/${row.accountCode}`}
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--interactive-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        View Full Account Detail &rarr;
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
            </div>
          ))
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  4. Footer (sticky bottom)                                          */}
      {/* ------------------------------------------------------------------ */}
      {!isLoading && rows.length > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            height: 52,
            margin: '0 24px',
            padding: '0 12px',
            backgroundColor: isBalanced
              ? 'var(--bg-certified)'
              : 'var(--bg-surface)',
            borderTop: '2px solid var(--border-table-header)',
          }}
        >
          {/* TOTAL label */}
          <div
            style={{
              width: 100,
              padding: '0 12px',
              fontSize: 14,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}
          >
            Total
          </div>

          {/* Account Name spacer */}
          <div style={{ flex: 1, padding: '0 12px' }} />

          {/* Type spacer */}
          <div style={{ width: 100, padding: '0 12px' }} />

          {/* Total Debits */}
          <div style={{ width: 140, padding: '0 12px' }}>
            <MoneyCell value={totalDebits} variant="grand-total" />
          </div>

          {/* Total Credits */}
          <div style={{ width: 140, padding: '0 12px' }}>
            <MoneyCell value={totalCredits} variant="grand-total" />
          </div>

          {/* Net */}
          <div style={{ width: 140, padding: '0 12px' }}>
            <MoneyCell value={difference} variant="grand-total" zeroDisplay="zero" />
          </div>
        </div>
      )}

      {/* Excluded accounts section */}
      {excludedCount > 0 && (
        <details style={{ margin: '16px 24px 0' }}>
          <summary
            className="cursor-pointer text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {excludedCount} excluded account{excludedCount !== 1 ? 's' : ''} (not included in trial balance)
          </summary>
          <div style={{ marginTop: 8, opacity: 0.6 }}>
            {excludedAccounts.map((acct) => (
              <div
                key={acct.accountCode}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 36,
                  padding: '0 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span
                  style={{
                    width: 100,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    textDecoration: 'line-through',
                  }}
                >
                  {acct.accountCode}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    textDecoration: 'line-through',
                  }}
                >
                  {acct.accountName}
                </span>
                <span
                  style={{
                    width: 140,
                    textAlign: 'right',
                    fontSize: 13,
                    color: 'var(--text-tertiary)',
                    textDecoration: 'line-through',
                  }}
                >
                  {fmtMoney(acct.balance.net, { dollar: true })}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
