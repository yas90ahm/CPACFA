'use client';

import React from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExportToolbarProps {
  onExportCSV?: () => void;
  onExportExcel?: () => void;
  onExportPDF?: () => void;
  loading?: { csv?: boolean; excel?: boolean; pdf?: boolean };
}

interface ExportBtnProps {
  onClick?: () => void;
  loading?: boolean;
  icon: React.ReactNode;
  label: string;
}

function ExportBtn({ onClick, loading, icon, label }: ExportBtnProps) {
  if (!onClick) return null;
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={loading}
        className={cn(
          'inline-flex items-center justify-center h-8 w-8 rounded-[var(--radius-md)]',
          'text-[var(--text-secondary)] border border-[var(--border-default)]',
          'hover:bg-[var(--interactive-ghost-hover)] hover:text-[var(--text-primary)]',
          'transition-all duration-[var(--transition-fast)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
        )}
        aria-label={label}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      </button>
      <span
        className={cn(
          'absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium',
          'bg-[var(--interactive-primary)] text-white rounded-[var(--radius-sm)]',
          'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap',
        )}
      >
        {label}
      </span>
    </div>
  );
}

function ExportToolbar({ onExportCSV, onExportExcel, onExportPDF, loading }: ExportToolbarProps) {
  return (
    <div className="inline-flex items-center gap-1.5" role="toolbar" aria-label="Export options">
      <ExportBtn onClick={onExportCSV} loading={loading?.csv} icon={<Download className="h-4 w-4" />} label="Export CSV" />
      <ExportBtn onClick={onExportExcel} loading={loading?.excel} icon={<FileSpreadsheet className="h-4 w-4" />} label="Export Excel" />
      <ExportBtn onClick={onExportPDF} loading={loading?.pdf} icon={<FileText className="h-4 w-4" />} label="Export PDF" />
    </div>
  );
}

export { ExportToolbar, type ExportToolbarProps };
