'use client';

import { useCallback, useRef } from 'react';
import { useReconSourceData, useUploadReconSource, useAutoMatch } from '@/lib/queries/recon-source';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Upload, CheckCircle2, AlertTriangle, Loader2, Zap } from 'lucide-react';

interface ReconSourcePanelProps {
  sessionId: string;
  reconId: string;
}

function formatDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString();
}

export function ReconSourcePanel({ sessionId, reconId }: ReconSourcePanelProps) {
  const { data: sourceData, isLoading } = useReconSourceData(sessionId, reconId);
  const uploadMutation = useUploadReconSource(sessionId, reconId);
  const autoMatchMutation = useAutoMatch(sessionId, reconId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadMutation.mutate(file);
      }
      e.target.value = '';
    },
    [uploadMutation]
  );

  const handleAutoMatch = useCallback(() => {
    autoMatchMutation.mutate();
  }, [autoMatchMutation]);

  const entries = sourceData?.entries ?? [];
  const hasEntries = entries.length > 0;
  const summary = sourceData?.matchSummary;

  return (
    <section className="bg-surface border border-border rounded-card p-6">
      <h2 className="text-sm font-medium text-text-secondary mb-4">Source Data</h2>

      {/* Upload zone */}
      {!hasEntries && !isLoading && (
        <div
          className={cn(
            'border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors',
            uploadMutation.isPending && 'opacity-50 pointer-events-none'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          {uploadMutation.isPending ? (
            <Loader2 className="w-8 h-8 mx-auto text-text-secondary animate-spin" />
          ) : (
            <Upload className="w-8 h-8 mx-auto text-text-secondary" />
          )}
          <p className="text-sm text-text-secondary mt-3">
            {uploadMutation.isPending
              ? 'Uploading...'
              : 'Upload bank statement, subledger, or lender statement (CSV)'}
          </p>
          <p className="text-xs text-text-muted mt-1">Click to select or drag and drop</p>
        </div>
      )}

      {uploadMutation.isError && (
        <div className="mt-3 rounded-input border border-status-red bg-status-red-dim text-status-red px-4 py-2 text-sm">
          Upload failed: {uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Unknown error'}
        </div>
      )}

      {/* Entries loaded: show re-upload option */}
      {hasEntries && (
        <>
          {/* Match summary */}
          {summary && (
            <div className="flex flex-wrap items-center gap-4 mb-4 py-3 px-4 rounded-input bg-elevated border border-border-light">
              <span className="text-sm text-text-secondary">
                {summary.matched} of {summary.total} entries matched ({summary.percent}%)
              </span>
              <div className="flex-1 min-w-[80px] max-w-[140px] h-2 bg-surface-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-status-green rounded-full transition-all"
                  style={{ width: `${summary.percent}%` }}
                />
              </div>
              <span className="text-sm font-mono">
                Source total: {fmtMoney(sourceData?.sourceTotal, { dollar: true })}
              </span>
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={handleAutoMatch}
              disabled={autoMatchMutation.isPending}
              className="px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
            >
              {autoMatchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {autoMatchMutation.isPending ? 'Matching...' : 'Auto-Match'}
            </button>
            <label className="px-4 py-2 rounded-input border border-border text-sm font-medium cursor-pointer hover:bg-hover flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Re-upload CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </div>

          {/* Source entries table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-secondary w-28">Date</th>
                  <th className="text-left py-2 font-medium text-text-secondary">Description</th>
                  <th className="text-right py-2 font-medium text-text-secondary w-32">Amount</th>
                  <th className="text-center py-2 font-medium text-text-secondary w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b border-border-light',
                      entry.status === 'unmatched' && 'bg-status-amber/5'
                    )}
                  >
                    <td className="py-2">{formatDate(entry.date)}</td>
                    <td className="py-2">{entry.description}</td>
                    <td className="py-2 text-right">
                      <MoneyCell value={entry.amount} showDollar />
                    </td>
                    <td className="py-2 text-center">
                      {entry.status === 'matched' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-status-green-dim text-status-green">
                          <CheckCircle2 className="w-3 h-3" />
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-status-amber-dim text-status-amber">
                          <AlertTriangle className="w-3 h-3" />
                          Unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
        </div>
      )}
    </section>
  );
}
