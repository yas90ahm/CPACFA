'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ColumnDef<T> {
  id: string;
  header: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
  cell: (row: T) => React.ReactNode;
  sortKey?: keyof T | string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  sortKey?: keyof T | string | null;
  sortDir?: 'asc' | 'desc' | null;
  onSort?: (key: keyof T | string) => void;
  onRowClick?: (row: T) => void;
  expandedRowId?: string | null;
  renderExpanded?: (row: T) => React.ReactNode;
  footer?: React.ReactNode;
  emptyMessage?: string;
  loading?: boolean;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    rows,
    getRowId,
    sortKey,
    sortDir,
    onSort,
    onRowClick,
    expandedRowId,
    renderExpanded,
    footer,
    emptyMessage = 'No data',
    loading = false,
    rowClassName,
  } = props;

  if (loading) {
    return (
      <div className="rounded-card border border-border overflow-hidden bg-surface">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-alt">
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    'px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center'
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border-light">
                {columns.map((col) => (
                  <td key={col.id} className="px-4 py-3.5">
                    <div className="h-5 bg-elevated rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border overflow-hidden bg-surface">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-surface-alt">
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  'px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-text-secondary',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.align !== 'right' && col.align !== 'center' && 'text-left',
                  col.sortKey && 'cursor-pointer hover:text-primary transition-colors'
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortKey ? () => onSort?.(col.sortKey as keyof T & string) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortKey && sortKey === col.sortKey && (
                    <span className="text-accent">{sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : ''}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-text-secondary text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              const expanded = expandedRowId === id;
              return (
                <React.Fragment key={id}>
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'border-b border-border-light transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-hover',
                      rowClassName?.(row)
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          'px-4 py-3.5 text-sm',
                          col.align === 'right' && 'text-right',
                          col.align === 'center' && 'text-center'
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                  {expanded && renderExpanded && (
                    <tr className="bg-elevated border-b border-border-light">
                      <td colSpan={columns.length} className="px-4 py-4">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
        {footer && rows.length > 0 && (
          <tfoot className="sticky bottom-0 z-10 bg-surface-alt border-t-2 border-border">
            {footer}
          </tfoot>
        )}
      </table>
    </div>
  );
}
