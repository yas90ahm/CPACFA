'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPT = '.pdf,.csv,.xlsx,.xls';
const HEADLINE = 'Ready to Audit? Drop your files.';
const SUBTEXT = "PDF, CSV, or XLSX — I'll handle the rest.";

export interface HeroCommandCenterProps {
  /** Called when a file is dropped or selected. Supervisor routes to CPA or CFA based on file headers. */
  onFile: (file: File) => void | Promise<void>;
  /** Optional: compact variant (e.g. inline "add another file"). */
  compact?: boolean;
  /** Optional: disable while processing. */
  disabled?: boolean;
  /** Optional: show processing state. */
  processing?: boolean;
  className?: string;
}

/**
 * Single Hero Command Center: one consolidated upload dropzone.
 * Deep Navy (#1A365D) border, Audit Green glow on file hover.
 * Supervisor Agent routes by file headers (CPA vs CFA).
 */
export function HeroCommandCenter({
  onFile,
  compact = false,
  disabled = false,
  processing = false,
  className,
}: HeroCommandCenterProps) {
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
    <div className={cn('flex flex-col items-center', className)}>
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
          'w-full max-w-xl mx-auto flex flex-col items-center justify-center rounded-md border-2 border-dashed transition-all cursor-pointer select-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-audit-green focus-visible:ring-offset-2',
          compact ? 'min-h-[100px] py-4 px-4' : 'min-h-[200px] py-8 px-6',
          (disabled || processing) && 'pointer-events-none opacity-70',
          'border-primary',
          isDragOver
            ? 'border-audit-green bg-audit-green/5 shadow-[0_0_16px_hsl(var(--audit-green)/0.25)]'
            : 'bg-muted/10 hover:border-audit-green/50 hover:shadow-[0_0_12px_hsl(var(--audit-green)/0.12)]'
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
            isDragOver ? 'text-audit-green' : 'text-primary'
          )}
          aria-hidden
        />
        <p
          className={cn(
            'font-semibold text-center transition-colors text-foreground',
            compact ? 'text-sm mt-1.5' : 'text-lg mt-3',
            isDragOver && 'text-audit-green'
          )}
        >
          {HEADLINE}
        </p>
        {!compact && (
          <p
            className={cn(
              'text-sm text-center mt-1 max-w-sm transition-colors',
              isDragOver ? 'text-audit-green/90' : 'text-muted-foreground'
            )}
          >
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
