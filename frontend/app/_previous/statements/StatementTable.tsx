'use client';

import React, { useState, useCallback } from 'react';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney, isMoneyNegative } from '@/lib/money';
import type { StatementLineItem, AccountRollup, JournalEntryRef } from '@/lib/types/statements';

function amountCell(amount: string, isGrandTotal: boolean, isSubtotal: boolean, onClick?: () => void) {
  const hasAmount = amount && amount.trim() !== '';
  const isNeg = hasAmount && isMoneyNegative(amount);
  const showDollar = isGrandTotal || isSubtotal;
  const clickable = onClick && hasAmount && !isSubtotal && !isGrandTotal;
  return (
    <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${isGrandTotal ? 'border-t-2 border-b-[3px] border-double border-text-muted' : isSubtotal ? 'border-t border-text-muted/50' : ''}`}>
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          className="border-b border-dotted border-current hover:bg-hover rounded px-1 -mx-1"
        >
          <span className={isNeg ? 'text-status-red' : ''}>{fmtMoney(amount, { dash: false })}</span>
        </button>
      ) : hasAmount ? (
        <span className={`${isGrandTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : ''} ${isNeg ? 'text-status-red' : ''}`}>
          {fmtMoney(amount, { dollar: showDollar, dash: false })}
        </span>
      ) : (
        <span />
      )}
    </td>
  );
}

function budgetAmountCell(amount: string | undefined, isGrandTotal: boolean, isSubtotal: boolean) {
  if (!amount || !amount.trim()) return <td className="text-right font-mono tabular-nums text-sm py-1.5" />;
  const isNeg = isMoneyNegative(amount);
  return (
    <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${isGrandTotal ? 'border-t-2 border-b-[3px] border-double border-text-muted' : isSubtotal ? 'border-t border-text-muted/50' : ''}`}>
      <span className={`${isGrandTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : ''} ${isNeg ? 'text-status-red' : ''}`}>
        {fmtMoney(amount, { dash: false })}
      </span>
    </td>
  );
}

function varianceCell(amount: string | undefined, isGrandTotal: boolean, isSubtotal: boolean) {
  if (!amount || !amount.trim()) return <td className="text-right font-mono tabular-nums text-sm py-1.5" />;
  const isNeg = isMoneyNegative(amount);
  return (
    <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${isGrandTotal ? 'border-t-2 border-b-[3px] border-double border-text-muted' : isSubtotal ? 'border-t border-text-muted/50' : ''}`}>
      <span className={`${isGrandTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : ''} ${isNeg ? 'text-status-red' : 'text-status-green'}`}>
        {fmtMoney(amount, { dash: false })}
      </span>
    </td>
  );
}

function variancePctCell(pct: string | undefined, isGrandTotal: boolean, isSubtotal: boolean) {
  if (!pct || !pct.trim()) return <td className="text-right font-mono tabular-nums text-sm py-1.5" />;
  const isNeg = isMoneyNegative(pct);
  return (
    <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${isGrandTotal ? 'border-t-2 border-b-[3px] border-double border-text-muted' : isSubtotal ? 'border-t border-text-muted/50' : ''}`}>
      <span className={`${isGrandTotal ? 'font-bold' : isSubtotal ? 'font-semibold' : ''} ${isNeg ? 'text-status-red' : 'text-status-green'}`}>
        {fmtMoney(pct, { dash: false })}%
      </span>
    </td>
  );
}

export interface StatementTableProps {
  lines: StatementLineItem[];
  showPriorPeriod?: boolean;
  showChanges?: boolean;
  showBudget?: boolean;
  budgetData?: Map<string, { budget: string; variance: string; variancePct: string }>;
  /** Called with a real JE ID when user clicks a journal entry reference. */
  onOpenJeById?: (jeId: string) => void;
}

export function StatementTable({ lines, showPriorPeriod, showChanges, showBudget, budgetData, onOpenJeById }: StatementTableProps) {
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [expandedAccountKey, setExpandedAccountKey] = useState<string | null>(null);

  const toggleLine = useCallback((id: string) => {
    setExpandedLineId((prev) => (prev === id ? null : id));
    setExpandedAccountKey(null);
  }, []);

  const toggleAccount = useCallback((lineId: string, accountCode: string) => {
    const key = `${lineId}:${accountCode}`;
    setExpandedAccountKey((prev) => (prev === key ? null : key));
  }, []);

  /** Count the extra columns after Amount for colspan calculations */
  const extraColCount =
    (showBudget ? 3 : 0) + (showChanges ? 2 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ border: 'none' }}>
        {/* Column headers when budget or changes are shown */}
        {(showPriorPeriod || showBudget || showChanges) && (
          <thead>
            <tr className="text-xs text-text-secondary uppercase tracking-wide">
              <th className="text-left py-1.5 pr-4 font-medium" />
              {showPriorPeriod && <th className="text-right py-1.5 font-medium">Prior</th>}
              <th className="text-right py-1.5 font-medium">Amount</th>
              {showBudget && (
                <>
                  <th className="text-right py-1.5 font-medium">Budget</th>
                  <th className="text-right py-1.5 font-medium">Variance ($)</th>
                  <th className="text-right py-1.5 font-medium">Variance (%)</th>
                </>
              )}
              {showChanges && (
                <>
                  <th className="text-right py-1.5 font-medium">Change</th>
                  <th className="text-right py-1.5 font-medium">Change %</th>
                </>
              )}
            </tr>
          </thead>
        )}
        <tbody>
          {lines.map((row) => {
            const isSectionHeader = row.indentLevel === 0 && !row.amount;
            const isExpanded = expandedLineId === row.id;
            const hasAccounts = row.accounts && row.accounts.length > 0;

            // Look up budget data by the line's taxonomy ID or line ID
            const budgetEntry = showBudget && budgetData
              ? budgetData.get(row.taxonomyLineId) ?? budgetData.get(row.id)
              : undefined;

            return (
              <React.Fragment key={row.id}>
                <tr
                  className={
                    isSectionHeader
                      ? 'font-bold text-primary'
                      : row.isGrandTotal
                        ? 'border-t-2 border-border font-bold text-primary'
                        : row.isSubtotal
                          ? 'border-t border-border font-bold'
                          : ''
                  }
                >
                  <td
                    className="py-1.5 pr-4 align-baseline"
                    style={{ paddingLeft: `${(row.indentLevel ?? 1) * 24}px` }}
                  >
                    {row.lineItemName}
                  </td>
                  {showPriorPeriod && amountCell(
                    row.priorAmount ?? '',
                    row.isGrandTotal ?? false,
                    row.isSubtotal ?? false
                  )}
                  {amountCell(
                    row.amount,
                    row.isGrandTotal ?? false,
                    row.isSubtotal ?? false,
                    hasAccounts ? () => toggleLine(row.id) : undefined
                  )}
                  {showBudget && (
                    <>
                      {budgetAmountCell(
                        budgetEntry?.budget,
                        row.isGrandTotal ?? false,
                        row.isSubtotal ?? false
                      )}
                      {varianceCell(
                        budgetEntry?.variance,
                        row.isGrandTotal ?? false,
                        row.isSubtotal ?? false
                      )}
                      {variancePctCell(
                        budgetEntry?.variancePct,
                        row.isGrandTotal ?? false,
                        row.isSubtotal ?? false
                      )}
                    </>
                  )}
                  {showChanges && (
                    <>
                      {amountCell(
                        row.changeAmount ?? '',
                        row.isGrandTotal ?? false,
                        row.isSubtotal ?? false
                      )}
                      <td className={`text-right font-mono tabular-nums text-sm py-1.5 ${row.changePercent != null && isMoneyNegative(row.changePercent) ? 'text-status-red' : ''}`}>
                        {row.changePercent != null ? `${fmtMoney(row.changePercent, { dash: false })}%` : ''}
                      </td>
                    </>
                  )}
                </tr>
                {isExpanded &&
                  hasAccounts &&
                  row.accounts!.map((acc: AccountRollup) => {
                    const accKey = `${row.id}:${acc.accountCode}`;
                    const accExpanded = expandedAccountKey === accKey;
                    const baseColSpan = showPriorPeriod && showChanges ? 4 : showPriorPeriod || showChanges ? 2 : 1;
                    return (
                      <React.Fragment key={accKey}>
                        <tr className="bg-surface-alt/50 print:hidden">
                          <td className="py-1 pr-4 pl-8 text-sm text-text-secondary" colSpan={baseColSpan}>
                            |-- {acc.accountCode} {acc.accountName}
                          </td>
                          {showPriorPeriod && <td />}
                          {amountCell(acc.balance, false, false, acc.entries?.length ? () => toggleAccount(row.id, acc.accountCode) : undefined)}
                          {showBudget && <><td /><td /><td /></>}
                          {showChanges && <><td /><td /></>}
                        </tr>
                        {accExpanded &&
                          acc.entries?.map((ent) => (
                            <tr key={ent.jeId} className="bg-surface-alt/30 print:hidden">
                              <td className="py-1 pr-4 pl-12 text-sm text-text-tertiary" colSpan={baseColSpan}>
                                |-- {ent.jeNumber} {ent.memo}
                              </td>
                              {showPriorPeriod && <td />}
                              <td className="text-right font-mono text-sm py-1">
                                {ent.jeId && onOpenJeById ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenJeById(ent.jeId)}
                                    className="border-b border-dotted border-current hover:bg-hover rounded px-1 -mx-1"
                                  >
                                    <MoneyCell value={ent.amount} showDollar />
                                  </button>
                                ) : (
                                  <MoneyCell value={ent.amount} showDollar />
                                )}
                              </td>
                              {showBudget && <><td /><td /><td /></>}
                              {showChanges && <><td /><td /></>}
                            </tr>
                          ))}
                        {accExpanded && (
                          <tr className="bg-surface-alt/30 print:hidden font-medium">
                            <td className="py-1 pr-4 pl-12 text-sm" colSpan={baseColSpan}>
                              \-- Net
                            </td>
                            {showPriorPeriod && <td />}
                            {amountCell(acc.balance, false, false)}
                            {showBudget && <><td /><td /><td /></>}
                            {showChanges && <><td /><td /></>}
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
