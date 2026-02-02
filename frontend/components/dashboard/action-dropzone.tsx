'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPT = '.pdf,.csv,.xlsx,.xls';
const HEADLINE = 'Ready to Audit? Drop your files.';
const SUBTEXT =
  "PDF, CSV, or XLSX — I'll handle the extraction, classification, and analysis.";

export interface ActionDropzoneProps {
  /** Called when a file is dropped or selected; parent routes by type (CPA vs CFA). */
  onFile: (file: File) => void | Promise<void>;
  /** Optional: show compact variant (e.g. for "Add more data"). */
  compact?: boolean;
  /** Optional: disable while processing. */
  disabled?: boolean;
  /** Optional: processing state to show inline feedback. */
  processing?: boolean;
  className?: string;
}

/**
 * Single Command Center hero: one high-prominence dropzone.
 * Accepts PDF, CSV, XLSX. Parent handles intelligent routing (Supervisor → CPA vs CFA).
 */
export function ActionDropzone({
  onFile,
  compact = false,
  disabled = false,
  processing = false,
  className,
}: ActionDropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || processing) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (!['pdf', 'csv', 'xlsx', 'xls'].includes(ext)) return;
    void Promise.resolve(onFile(f));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !processing) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || disabled || processing) return;
    void Promise.resolve(onFile(f));
  };

  const clickInput = () => {
    if (!disabled && !processing) inputRef.current?.click();
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={clickInput}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clickInput();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Drop PDF, CSV, or XLSX here or click to browse"
        className={cn(
          'flex flex-col items-center justify-center rounded-md border-2 border-dashed transition-all cursor-pointer select-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          compact ? 'min-h-[100px] py-4 px-4' : 'min-h-[200px] py-8 px-6',
          (disabled || processing) && 'pointer-events-none opacity-70',
          isDragOver
            ? 'border-audit-green bg-audit-green/5 shadow-[0_0_0_3px_hsl(var(--audit-green)/0.15)]'
            : 'border-border bg-muted/20 hover:border-muted-foreground/30 hover:bg-muted/30'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="hidden"
          aria-hidden
        />
        <Upload
          className={cn(
            'shrink-0 transition-colors',
            compact ? 'h-8 w-8' : 'h-12 w-12',
            isDragOver ? 'text-audit-green' : 'text-muted-foreground'
          )}
          aria-hidden
        />
        <p
          className={cn(
            'font-medium text-center transition-colors',
            compact ? 'text-sm' : 'text-base mt-2',
            isDragOver ? 'text-audit-green' : 'text-foreground'
          )}
        >
          {HEADLINE}
        </p>
        {!compact && (
          <p className="text-sm text-muted-foreground text-center mt-1 max-w-md">
            {SUBTEXT}
          </p>
        )}
        {processing && (
          <p className="text-xs text-audit-green mt-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-audit-green animate-pulse" />
            Routing and processing…
          </p>
        )}
      </div>
    </div>
  );
}
