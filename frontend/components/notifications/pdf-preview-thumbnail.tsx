'use client';

import * as React from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PdfPreviewThumbnailProps {
  /** Blob URL for the PDF (e.g. from URL.createObjectURL(blob)). If null, shows placeholder. */
  previewUrl?: string | null;
  /** Optional label. */
  label?: string;
  /** Click to open full preview in new tab. */
  onOpenPreview?: () => void;
  className?: string;
}

/**
 * PDF preview thumbnail for the chat sidebar so the user can skim results before downloading.
 */
export function PdfPreviewThumbnail({
  previewUrl,
  label = 'PDF Preview',
  onOpenPreview,
  className,
}: PdfPreviewThumbnailProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-slate-50 overflow-hidden',
        'flex flex-col min-h-[100px] max-h-[140px]',
        className
      )}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200 bg-slate-100">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {previewUrl && onOpenPreview && (
          <button
            type="button"
            onClick={onOpenPreview}
            className="text-xs text-primary hover:underline"
          >
            Open
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        {previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            title={label}
            className="w-full h-full min-h-[80px] border-0 pointer-events-none"
            sandbox="allow-same-origin"
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center h-full min-h-[80px] text-slate-400"
            aria-hidden
          >
            <FileText className="h-8 w-8 mb-1" />
            <span className="text-xs">Report ready to download</span>
          </div>
        )}
      </div>
    </div>
  );
}
