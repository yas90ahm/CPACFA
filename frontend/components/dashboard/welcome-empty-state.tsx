'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface WelcomeEmptyStateProps {
  /** Primary CTA: e.g. "Upload First File" */
  onUploadFirstFile: () => void;
  /** Optional: scroll to PDF upload section instead */
  onShowPdfUpload?: () => void;
  className?: string;
}

/**
 * Guided Value empty state: centered Welcome module when no data.
 * Headline, description, and high-prominence CTA.
 */
export function WelcomeEmptyState({
  onUploadFirstFile,
  onShowPdfUpload,
  className,
}: WelcomeEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-12 rounded-md border border-dashed border-border bg-card/50 shadow-calm',
        className
      )}
    >
      <h2 className="text-xl font-semibold text-primary mb-2">
        Ready to Audit? I&apos;m your Finance Partner.
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
        Upload a bank statement or trial balance, and I&apos;ll generate your audit-ready financials in 60 seconds.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          onClick={onUploadFirstFile}
          size="lg"
          className="rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 shadow-calm"
        >
          <Upload className="h-5 w-5" aria-hidden />
          Upload First File
        </Button>
        {onShowPdfUpload && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onShowPdfUpload}
            className="rounded-md border-border"
          >
            Or drop a PDF for smart extraction
          </Button>
        )}
      </div>
    </div>
  );
}
