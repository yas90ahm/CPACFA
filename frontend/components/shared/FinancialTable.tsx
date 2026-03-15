'use client';

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { MoneyCell, type MoneyCellVariant } from './MoneyCell';
import { fmtMoney, cmpMoney } from '@/lib/money';

export interface Column {
  key: string;
  label: string;
  type?: 'text' | 'money' | 'percentage' | 'date' | 'status' | 'action';
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: Record<string, any>, index: number) => ReactNode;
}

export interface FinancialTableProps {
  columns: Column[];
  data: Record<string, any>[];
  groupBy?: string;
  showSubtotals?: boolean;
  showGrandTotal?: boolean;
  sortable?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selectedRows: Record<string, any>[]) => void;
  onRowClick?: (row: Record<string, any>) => void;
  expandable?: boolean;
  renderExpanded?: (row: Record<string, any>) => ReactNode;
  stickyHeader?: boolean;
  stickyColumns?: number;
  emptyState?: ReactNode;
  loadingState?: boolean;
  lockedPeriod?: boolean;
  className?: string;
}

type SortDir = 'asc' | 'desc' | null;

export function FinancialTable({
  columns,
  data,
  groupBy,
  showSubtotals = false,
  showGrandTotal = false,
  sortable = true,
  selectable = false,
  onSelectionChange,
  onRowClick,
  expandable = false,
  renderExpanded,
  stickyHeader = true,
  stickyColumns = 0,
  emptyState,
  loadingState = false,
  lockedPeriod = false,
  className,
}: FinancialTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
      else setSortDir('asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey, sortDir]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find(c => c.key === sortKey);
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (col?.type === 'money') {
        cmp = cmpMoney(av, bv);
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  const toggleExpand = useCallback((idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const toggleSelect = useCallback((idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      if (onSelectionChange) {
        const rows = [...next].map(i => sortedData[i]).filter(Boolean);
        onSelectionChange(rows);
      }
      return next;
    });
  }, [sortedData, onSelectionChange]);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === sortedData.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const all = new Set(sortedData.map((_, i) => i));
      setSelected(all);
      onSelectionChange?.(sortedData);
    }
  }, [selected.size, sortedData, onSelectionChange]);

  const getAlign = (col: Column) => {
    if (col.align) return col.align;
    if (col.type === 'money' || col.type === 'percentage') return 'right';
    return 'left';
  };

  if (loadingState) {
    return (
      <div className={cn('overflow-x-auto', className)}>
        <table className="w-full">
          <thead>
            <tr style={{ height: 44 }}>
              {columns.map(col => (
                <th key={col.key} className="px-3 py-3 text-left" style={{ width: col.width }}>
                  <div className="h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-surface-sunken)', width: '60%' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }).map((_, i) => (
              <tr key={i} style={{ height: 40 }}>
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-2">
                    <div
                      className="h-3 rounded animate-pulse"
                      style={{
                        backgroundColor: 'var(--bg-surface-sunken)',
                        width: col.type === 'money' ? '80%' : '70%',
                        marginLeft: getAlign(col) === 'right' ? 'auto' : undefined,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data.length && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : undefined} style={{ backgroundColor: 'var(--bg-surface)' }}>
          <tr style={{ height: 44, borderBottom: '2px solid var(--border-table-header)' }}>
            {selectable && (
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === sortedData.length && sortedData.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded"
                />
              </th>
            )}
            {expandable && <th className="w-10 px-2" />}
            {columns.map((col, ci) => {
              const align = getAlign(col);
              const isSortable = sortable && col.sortable !== false && col.type !== 'action';
              const isSticky = ci < stickyColumns;
              return (
                <th
                  key={col.key}
                  className={cn(
                    'px-3 py-3',
                    isSortable && 'cursor-pointer select-none hover:opacity-80',
                    isSticky && 'sticky left-0 z-[5]'
                  )}
                  style={{
                    width: col.width,
                    textAlign: align,
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    backgroundColor: isSticky ? 'var(--bg-surface)' : undefined,
                  }}
                  onClick={isSortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSortable && sortKey === col.key && sortDir === 'asc' && <ArrowUp className="w-3 h-3" />}
                    {isSortable && sortKey === col.key && sortDir === 'desc' && <ArrowDown className="w-3 h-3" />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, i) => {
            const isExpanded = expanded.has(i);
            const isSelected = selected.has(i);
            const isAlt = i % 2 === 1;
            return (
              <FinancialTableRow
                key={row.id ?? i}
                row={row}
                index={i}
                columns={columns}
                isAlt={isAlt}
                isExpanded={isExpanded}
                isSelected={isSelected}
                expandable={expandable}
                selectable={selectable}
                renderExpanded={renderExpanded}
                stickyColumns={stickyColumns}
                lockedPeriod={lockedPeriod}
                onRowClick={onRowClick}
                onToggleExpand={toggleExpand}
                onToggleSelect={toggleSelect}
                getAlign={getAlign}
              />
            );
          })}
          {showGrandTotal && (
            <tr
              style={{
                height: 44,
                borderTop: '2px solid var(--border-table-header)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              {selectable && <td />}
              {expandable && <td />}
              {columns.map((col, ci) => {
                if (ci === 0) {
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-2"
                      style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-number-total)' }}
                    >
                      Grand Total
                    </td>
                  );
                }
                if (col.type === 'money') {
                  const vals = sortedData.map(r => r[col.key]);
                  const sum = vals.reduce((acc: number, v: any) => {
                    const clean = String(v ?? '0').replace(/[$,()]/g, '');
                    const n = parseFloat(clean) || 0;
                    return acc + n;
                  }, 0);
                  return (
                    <td key={col.key} className="px-4 py-2" style={{ textAlign: 'right' }}>
                      <MoneyCell value={sum.toFixed(2)} variant="grand-total" locked={lockedPeriod} />
                    </td>
                  );
                }
                return <td key={col.key} />;
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  row: Record<string, any>;
  index: number;
  columns: Column[];
  isAlt: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  expandable: boolean;
  selectable: boolean;
  renderExpanded?: (row: Record<string, any>) => ReactNode;
  stickyColumns: number;
  lockedPeriod: boolean;
  onRowClick?: (row: Record<string, any>) => void;
  onToggleExpand: (i: number) => void;
  onToggleSelect: (i: number) => void;
  getAlign: (col: Column) => string;
}

function FinancialTableRow({
  row, index, columns, isAlt, isExpanded, isSelected, expandable, selectable,
  renderExpanded, stickyColumns, lockedPeriod, onRowClick, onToggleExpand, onToggleSelect, getAlign,
}: RowProps) {
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <>
      <tr
        className={cn(
          onRowClick && 'cursor-pointer',
          'transition-colors duration-75'
        )}
        style={{
          height: 40,
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: isSelected
            ? 'var(--bg-table-row-selected)'
            : isAlt
              ? 'var(--bg-table-row-alt)'
              : 'var(--bg-surface)',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = isAlt ? 'var(--bg-table-row-alt)' : 'var(--bg-surface)';
        }}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {selectable && (
          <td className="w-10 px-3 py-2" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(index)}
              className="w-4 h-4 rounded"
            />
          </td>
        )}
        {expandable && (
          <td className="w-10 px-2" onClick={e => { e.stopPropagation(); onToggleExpand(index); }}>
            <ChevronIcon
              className="w-4 h-4 transition-transform duration-200 ease-out cursor-pointer"
              style={{ color: 'var(--text-tertiary)' }}
            />
          </td>
        )}
        {columns.map((col, ci) => {
          const align = getAlign(col);
          const isSticky = ci < stickyColumns;
          const value = row[col.key];

          if (col.render) {
            return (
              <td
                key={col.key}
                className={cn('py-2', isSticky && 'sticky left-0 z-[3]')}
                style={{
                  textAlign: align as any,
                  padding: col.type === 'money' ? '8px 16px' : '8px 12px',
                  backgroundColor: isSticky ? (isAlt ? 'var(--bg-table-row-alt)' : 'var(--bg-surface)') : undefined,
                  fontSize: '0.8125rem',
                  lineHeight: '1.385',
                }}
              >
                {col.render(value, row, index)}
              </td>
            );
          }

          if (col.type === 'money') {
            return (
              <td
                key={col.key}
                className={cn(isSticky && 'sticky left-0 z-[3]')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: isSticky ? (isAlt ? 'var(--bg-table-row-alt)' : 'var(--bg-surface)') : undefined,
                }}
              >
                <MoneyCell value={value} locked={lockedPeriod} />
              </td>
            );
          }

          if (col.type === 'percentage') {
            return (
              <td
                key={col.key}
                style={{
                  textAlign: 'right',
                  padding: '8px 16px',
                  fontSize: '0.8125rem',
                  fontVariantNumeric: 'tabular-nums lining-nums',
                  color: 'var(--text-primary)',
                }}
              >
                {value != null ? `${value}%` : '—'}
              </td>
            );
          }

          return (
            <td
              key={col.key}
              className={cn(isSticky && 'sticky left-0 z-[3]')}
              style={{
                textAlign: align as any,
                padding: '8px 12px',
                fontSize: '0.8125rem',
                lineHeight: '1.385',
                color: 'var(--text-primary)',
                backgroundColor: isSticky ? (isAlt ? 'var(--bg-table-row-alt)' : 'var(--bg-surface)') : undefined,
              }}
            >
              {value ?? '—'}
            </td>
          );
        })}
      </tr>
      {expandable && isExpanded && renderExpanded && (
        <tr>
          <td colSpan={columns.length + (selectable ? 1 : 0) + 1} style={{ padding: 0 }}>
            <div
              className="overflow-hidden animate-in slide-in-from-top-2 duration-200"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderBottom: '1px solid var(--border-subtle)',
                padding: '12px 16px',
              }}
            >
              {renderExpanded(row)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
