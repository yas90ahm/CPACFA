'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnMapper } from '@/components/ingest/ColumnMapper';
import { StepProgress } from '@/components/shared/StepProgress';
import { useAdvanceSession } from '@/lib/queries/close-session';
import { apiUpload } from '@/lib/api';
import type { FieldMapping } from '@/lib/types/ingest';
import type { GLParseResult, ValidationResult, TBPreview } from '@/lib/types/ingest';
import { Check, AlertTriangle, X, Download } from 'lucide-react';

/** Backend ingest response shape (for 207 partial success) */
interface IngestResponse {
  status?: 'partial' | 'success';
  message?: string;
  balancedCount?: number;
  imbalancedCount?: number;
  imbalancedEntries?: Array<{
    entryId: string;
    debits: number;
    credits: number;
    difference: number;
  }>;
}

/** Backend parse response shape */
interface ParsePreviewResponse {
  success: boolean;
  headers: string[];
  appliedMapping: Record<string, string | null>;
  suggestedMapping: Record<string, string | null>;
  errors: string[];
  warnings: string[];
  preview: {
    totalRows: number;
    validRows: number;
    uniqueAccounts: number;
    totalDebits: string;
    totalCredits: string;
    balanced: boolean;
    dateRange: { earliest: string; latest: string; totalWithDates: number } | null;
    accounts: Array<{
      accountCode: string;
      accountName: string;
      totalDebit: string;
      totalCredit: string;
      netBalance: string;
      entryCount: number;
    }>;
  } | null;
}

/** Frontend fieldId -> backend GL column key */
const FIELD_TO_BACKEND: Record<string, string> = {
  account_code: 'accountCode',
  account_name: 'accountName',
  debit_amount: 'debit',
  credit_amount: 'credit',
  date: 'date',
  description: 'description',
  reference: 'entryId',
};

function backendToAutoDetected(backend: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [frontId, backKey] of Object.entries(FIELD_TO_BACKEND)) {
    const v = backend[backKey];
    if (v) out[frontId] = v;
  }
  return out;
}

function mappingsToBackend(mappings: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [frontId, header] of Object.entries(mappings)) {
    if (!header?.trim()) continue;
    const backKey = FIELD_TO_BACKEND[frontId];
    if (backKey) out[backKey] = header.trim();
  }
  return out;
}

/** Convert "January 2026" -> "2026-01" for API period param */
function periodLabelToParam(periodLabel: string): string {
  const months: Record<string, string> = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
  };
  const match = periodLabel.trim().match(/^(\w+)\s+(\d{4})$/);
  if (match) {
    const month = months[match[1]!];
    if (month) return `${match[2]}-${month}`;
  }
  return periodLabel.replace(/\s+/g, '-');
}

const GL_REQUIRED_FIELDS: FieldMapping[] = [
  { fieldId: 'account_code', label: 'Account Code', required: true },
  { fieldId: 'account_name', label: 'Account Name', required: true },
  { fieldId: 'date', label: 'Date', required: true },
  { fieldId: 'description', label: 'Description', required: false },
  { fieldId: 'debit_amount', label: 'Debit Amount', required: true },
  { fieldId: 'credit_amount', label: 'Credit Amount', required: true },
  { fieldId: 'reference', label: 'Reference', required: false },
];

/** Escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines) */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatMoney(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return s;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

export interface GLUploadFlowProps {
  sessionId: string;
  periodLabel: string;
  file: File;
  onBack: () => void;
  /** If true, skip session advance after ingest (used for GL replacement in IN_PROGRESS state) */
  skipAdvance?: boolean;
}

type Step = 'parsing' | 'mapping' | 'validating' | 'preview' | 'confirm' | 'ingesting' | 'error';

/** Parse period bounds from a label like "February 2026" or "2026-02" */
function parsePeriodBounds(periodLabel: string): { start: Date; end: Date } | null {
  const months: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };
  const namedMatch = periodLabel.trim().match(/^(\w+)\s+(\d{4})$/);
  if (namedMatch && months[namedMatch[1]!] !== undefined) {
    const month = months[namedMatch[1]!]!;
    const year = parseInt(namedMatch[2]!, 10);
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
  }
  const isoMatch = periodLabel.trim().match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]!, 10);
    const month = parseInt(isoMatch[2]!, 10) - 1;
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
  }
  const qMatch = periodLabel.trim().match(/^(\d{4})-Q(\d)$/i);
  if (qMatch) {
    const year = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    const startMonth = (q - 1) * 3;
    return { start: new Date(year, startMonth, 1), end: new Date(year, startMonth + 3, 0) };
  }
  return null;
}

export function GLUploadFlow({ sessionId, periodLabel, file, onBack, skipAdvance }: GLUploadFlowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const advanceSession = useAdvanceSession(sessionId);
  const [parseResult, setParseResult] = useState<GLParseResult | null>(null);
  const [step, setStep] = useState<Step>('parsing');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [tbPreview, setTBPreview] = useState<TBPreview | null>(null);
  const [validationError, setValidationError] = useState<ValidationResult | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
  const [rawParseErrors, setRawParseErrors] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ earliest: string; latest: string; totalWithDates: number } | null>(null);
  const [importMode, setImportMode] = useState<'all' | 'period_only'>('all');

  useEffect(() => {
    setStep('parsing');
    setParseError(null);
    const formData = new FormData();
    formData.append('file', file);
    apiUpload<ParsePreviewResponse>('/api/gl/parse', formData)
      .then((result) => {
        const columns = result.headers ?? [];
        const suggested = result.suggestedMapping ?? {};
        const prev = result.preview;
        const rows: Record<string, string>[] = prev?.accounts?.map((a) => ({
          accountCode: a.accountCode,
          accountName: a.accountName,
          totalDebit: a.totalDebit,
          totalCredit: a.totalCredit,
        })) ?? [];
        setParseResult({
          columns,
          rows,
          rowCount: prev?.totalRows ?? 0,
          accountCount: prev?.uniqueAccounts ?? 0,
          autoDetectedMappings: backendToAutoDetected(suggested),
        });
        setMappings(backendToAutoDetected(suggested));
        setStep('mapping');
      })
      .catch((err) => {
        setParseError(err instanceof Error ? err.message : 'Parse failed');
        setStep('error');
      });
  }, [file]);

  const allRequiredMapped = useMemo(() => {
    return GL_REQUIRED_FIELDS.filter((f) => f.required).every((f) => mappings[f.fieldId]?.trim());
  }, [mappings]);

  const runValidation = () => {
    setStep('validating');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('columnMapping', JSON.stringify(mappingsToBackend(mappings)));
    apiUpload<ParsePreviewResponse>('/api/gl/parse', formData)
      .then((result) => {
        const prev = result.preview;
        if (!result.success && result.errors?.length) {
          setRawParseErrors(result.errors);
          setValidationError({
            passed: false,
            errors: result.errors.map((e) => ({ message: e })),
            warnings: result.warnings?.map((w) => ({ message: w })) ?? [],
          });
          setTBPreview(null);
          setStep('error');
          return;
        }
        if (!prev) {
          setValidationError({
            passed: false,
            errors: [{ message: 'No preview data from parse' }],
            warnings: [],
          });
          setStep('error');
          return;
        }
        setValidation({
          passed: true,
          errors: [],
          warnings: (result.warnings ?? []).map((w) => ({ message: w })),
        });
        setValidationError(null);
        setTBPreview({
          rows: prev.accounts.map((a) => ({
            accountCode: a.accountCode,
            accountName: a.accountName,
            debit: a.totalDebit,
            credit: a.totalCredit,
          })),
          totalDebits: prev.totalDebits,
          totalCredits: prev.totalCredits,
          balanced: prev.balanced,
          accountCount: prev.uniqueAccounts,
          newAccounts: [],
          inactiveAccounts: [],
          priorMappedCount: 0,
        });
        setDateRange(prev.dateRange ?? null);
        setStep('preview');
      })
      .catch((err) => {
        setValidationError({
          passed: false,
          errors: [{ message: err instanceof Error ? err.message : 'Validation failed' }],
          warnings: [],
        });
        setStep('error');
      });
  };

  const ingest = async () => {
    setStep('ingesting');
    setAdvanceError(null);
    setIngestResult(null);
    try {
      const period = periodLabelToParam(periodLabel);
      const formData = new FormData();
      formData.append('file', file);
      const backendMapping = mappingsToBackend(mappings);
      if (importMode === 'period_only') {
        const bounds = parsePeriodBounds(periodLabel);
        if (bounds) {
          (backendMapping as Record<string, string>).filterDateStart = bounds.start.toISOString().slice(0, 10);
          (backendMapping as Record<string, string>).filterDateEnd = bounds.end.toISOString().slice(0, 10);
        }
      }
      formData.append('columnMapping', JSON.stringify(backendMapping));
      const url = `/api/gl/ingest?period=${encodeURIComponent(period)}&sessionId=${encodeURIComponent(sessionId)}`;
      const result = await apiUpload<IngestResponse>(url, formData);
      if (result.status === 'partial' && result.imbalancedCount && result.imbalancedCount > 0) {
        setIngestResult(result);
        setAdvanceError(`Partial import: ${result.balancedCount ?? 0} entries imported, ${result.imbalancedCount} entries imbalanced. ${result.message ?? ''}`);
        setStep('confirm');
        return;
      }
      if (!skipAdvance) {
        await advanceSession.mutateAsync({});
      }
      queryClient.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['gl-health', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
      router.push(`/close/${sessionId}/dashboard`);
    } catch (err) {
      setStep('confirm');
      setAdvanceError(err instanceof Error ? err.message : 'Failed to ingest or advance. Try again.');
    }
  };

  /** Generate and download a CSV error report from validation or ingest errors */
  const downloadErrorReport = () => {
    const lines: string[] = [];

    // Check for imbalanced entries from ingest (207 partial)
    if (ingestResult?.imbalancedEntries?.length) {
      lines.push('Entry ID,Debits,Credits,Difference');
      for (const entry of ingestResult.imbalancedEntries) {
        lines.push(
          [
            csvEscape(entry.entryId),
            entry.debits.toFixed(2),
            entry.credits.toFixed(2),
            entry.difference.toFixed(2),
          ].join(',')
        );
      }
    }

    // Check for validation errors (from parse with mapping)
    if (validationError?.errors?.length) {
      if (lines.length > 0) lines.push(''); // blank separator
      lines.push('Error #,Message,Detail,Affected Rows');
      validationError.errors.forEach((e, i) => {
        lines.push(
          [
            String(i + 1),
            csvEscape(e.message),
            csvEscape(e.detail ?? ''),
            e.rows?.join('; ') ?? '',
          ].join(',')
        );
      });
    }

    // Check for raw parse errors (string[])
    if (!validationError?.errors?.length && rawParseErrors.length) {
      lines.push('Error #,Message');
      rawParseErrors.forEach((msg, i) => {
        lines.push([String(i + 1), csvEscape(msg)].join(','));
      });
    }

    // Fallback: if somehow nothing structured, dump the parseError string
    if (lines.length === 0 && parseError) {
      lines.push('Error #,Message');
      lines.push(`1,${csvEscape(parseError)}`);
    }

    if (lines.length === 0) return; // nothing to download

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gl-error-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (step === 'parsing') {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3 text-text-secondary">
          <div className="w-8 h-8 rounded-full bg-accent-dim flex items-center justify-center">
            <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <span>Reading file...</span>
        </div>
        {file && (
          <div className="text-sm text-text-secondary">
            {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}
      </div>
    );
  }

  if (step === 'mapping' && parseResult) {
    return (
      <div className="max-w-3xl space-y-6">
        <h2 className="text-lg font-display text-primary">GL Upload — Column Mapping</h2>
        <p className="text-sm text-text-secondary">
          File: {file?.name} ({(file && (file.size / 1024 / 1024).toFixed(1))} MB, {parseResult.rowCount} rows)
        </p>
        <ColumnMapper
          columns={parseResult.columns}
          requiredFields={GL_REQUIRED_FIELDS}
          autoDetectedMappings={parseResult.autoDetectedMappings}
          previewData={parseResult.rows}
          value={mappings}
          onChange={setMappings}
        />
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Back
          </button>
          <button
            type="button"
            onClick={runValidation}
            disabled={!allRequiredMapped}
            className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium disabled:opacity-50 hover:enabled:opacity-90"
          >
            Continue to Validation →
          </button>
        </div>
      </div>
    );
  }

  if (step === 'validating') {
    return (
      <div className="max-w-2xl space-y-6">
        <h2 className="text-lg font-display text-primary">Processing general ledger...</h2>
        <StepProgress
          steps={[
            { label: `Parsed ${parseResult?.rowCount?.toLocaleString() ?? '—'} entries`, status: 'complete' },
            { label: `Identified ${parseResult?.accountCount?.toLocaleString() ?? '—'} unique accounts`, status: 'complete' },
            { label: 'Aggregating trial balance...', status: 'active' },
            { label: 'Validating balances', status: 'pending' },
          ]}
        />
      </div>
    );
  }

  if (step === 'preview' && validation && tbPreview) {
    const displayRows = tbPreview.rows.slice(0, 10);
    const isBalanced = tbPreview.balanced;
    const diff = Math.abs(parseFloat(tbPreview.totalDebits) - parseFloat(tbPreview.totalCredits));

    // Date analysis
    const bounds = parsePeriodBounds(periodLabel);
    let dateStatus: 'all_in' | 'some_out' | 'all_out' | 'unknown' = 'unknown';
    let inPeriodCount = 0;
    let outOfPeriodCount = 0;
    if (dateRange && bounds) {
      const earliest = new Date(dateRange.earliest);
      const latest = new Date(dateRange.latest);
      const allIn = earliest >= bounds.start && latest <= bounds.end;
      const allOut = latest < bounds.start || earliest > bounds.end;
      if (allIn) {
        dateStatus = 'all_in';
        inPeriodCount = dateRange.totalWithDates;
      } else if (allOut) {
        dateStatus = 'all_out';
        outOfPeriodCount = dateRange.totalWithDates;
      } else {
        dateStatus = 'some_out';
        // Estimate counts: we know earliest/latest span the period boundary
        inPeriodCount = dateRange.totalWithDates; // Approximation — we show the range info
        outOfPeriodCount = dateRange.totalWithDates; // Will be clarified by the message
      }
    }

    const canProceed = isBalanced;

    return (
      <div className="max-w-4xl space-y-8">
        <h2 className="text-lg font-display text-primary">Validation Results</h2>
        <div className="bg-surface border border-border rounded-card p-5 space-y-2">
          <p className="flex items-center gap-2 text-sm text-status-green">
            <Check className="w-4 h-4 shrink-0" /> File parsed successfully ({parseResult?.rowCount ?? 0} entries)
          </p>
          <p className="flex items-center gap-2 text-sm text-status-green">
            <Check className="w-4 h-4 shrink-0" /> {tbPreview.accountCount} unique accounts identified
          </p>

          {/* Date validation */}
          {dateStatus === 'all_in' && (
            <p className="flex items-center gap-2 text-sm text-status-green">
              <Check className="w-4 h-4 shrink-0" /> All {dateRange?.totalWithDates} entries are within {periodLabel}
            </p>
          )}
          {dateStatus === 'some_out' && (
            <div className="space-y-2">
              <p className="flex items-start gap-2 text-sm text-status-amber">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Entries have dates outside {periodLabel} (earliest: {dateRange?.earliest}, latest: {dateRange?.latest}).
                  You can import all entries or filter to {periodLabel} only.
                </span>
              </p>
              <div className="ml-6 flex gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="importMode" checked={importMode === 'all'} onChange={() => setImportMode('all')} className="accent-accent" />
                  Import All Entries
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="importMode" checked={importMode === 'period_only'} onChange={() => setImportMode('period_only')} className="accent-accent" />
                  Import {periodLabel} Only
                </label>
              </div>
            </div>
          )}
          {dateStatus === 'all_out' && (
            <p className="flex items-start gap-2 text-sm text-status-red">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No entries found within {periodLabel}. All dates range from {dateRange?.earliest} to {dateRange?.latest}.
                Are you uploading the correct file?
              </span>
            </p>
          )}
          {dateStatus === 'unknown' && (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Date validation not available (no date column mapped or period not recognized)
            </p>
          )}

          {/* Balance check */}
          {isBalanced ? (
            <p className="flex items-center gap-2 text-sm text-status-green">
              <Check className="w-4 h-4 shrink-0" /> Trial balance balances: Debits = Credits
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-status-red">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Trial balance is NOT balanced. Debits: {formatMoney(tbPreview.totalDebits)}, Credits: {formatMoney(tbPreview.totalCredits)}, Difference: {formatMoney(diff.toFixed(2))}
              </span>
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-primary mb-2">
            Trial Balance Preview — {tbPreview.accountCount} accounts | Total Debits: {formatMoney(tbPreview.totalDebits)} | Total Credits: {formatMoney(tbPreview.totalCredits)} | {isBalanced ? 'Balanced \u2713' : 'NOT Balanced \u2717'}
          </h3>
          <div className="overflow-x-auto rounded-input border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">Account Code</th>
                  <th className="text-left py-2 px-3 font-medium text-text-secondary">Account Name</th>
                  <th className="text-right py-2 px-3 font-medium text-text-secondary">Debit</th>
                  <th className="text-right py-2 px-3 font-medium text-text-secondary">Credit</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => (
                  <tr key={i} className="border-b border-border-light">
                    <td className="py-1.5 px-3 font-mono">{r.accountCode}</td>
                    <td className="py-1.5 px-3">{r.accountName}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{r.debit !== '0' ? formatMoney(r.debit) : '—'}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{r.credit !== '0' ? formatMoney(r.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-surface-alt font-medium">
                  <td className="py-2 px-3" colSpan={2}>TOTALS</td>
                  <td className="py-2 px-3 text-right font-mono">{formatMoney(tbPreview.totalDebits)}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatMoney(tbPreview.totalCredits)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-text-tertiary mt-2">Showing {displayRows.length} of {tbPreview.rows.length} accounts</p>
        </div>

        <div className="flex gap-3 items-start">
          <button type="button" onClick={() => setStep('mapping')} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Back
          </button>
          {canProceed ? (
            <button type="button" onClick={() => setStep('confirm')} className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
              Continue to Confirm →
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button type="button" disabled className="px-4 py-2 rounded-input bg-elevated text-text-tertiary text-sm font-medium cursor-not-allowed">
                Cannot proceed — trial balance must be balanced
              </button>
              <button type="button" onClick={onBack} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover text-accent">
                Upload New File
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'confirm' && tbPreview) {
    return (
      <div className="max-w-2xl space-y-6">
        <h2 className="text-lg font-display text-primary">Ready to import</h2>
        {advanceError && (
          <div className="bg-status-red/10 border border-status-red rounded-card p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-status-red">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{advanceError}</span>
            </div>
            {ingestResult?.imbalancedEntries && ingestResult.imbalancedEntries.length > 0 && (
              <button
                type="button"
                onClick={downloadErrorReport}
                className="px-3 py-1.5 rounded-input bg-surface border border-border text-sm font-medium hover:bg-hover inline-flex items-center gap-2 text-primary"
              >
                <Download className="w-4 h-4" />
                Download Error Report ({ingestResult.imbalancedCount ?? ingestResult.imbalancedEntries.length} imbalanced entries)
              </button>
            )}
          </div>
        )}
        <div className="bg-surface border border-border rounded-card p-6 space-y-4">
          <p className="text-sm text-text-secondary">This will:</p>
          <ul className="list-disc list-inside text-sm text-primary space-y-1">
            <li>{skipAdvance ? 'Replace existing GL data with' : 'Import'} {parseResult?.rowCount ?? 0} GL entries{importMode === 'period_only' ? ` (filtered to ${periodLabel})` : ''}</li>
            <li>{skipAdvance ? 'Re-derive' : 'Create'} a trial balance with {tbPreview.accountCount} accounts</li>
            {!skipAdvance && <li>Advance the session to IN_PROGRESS</li>}
            {skipAdvance ? (
              <li>Account mappings will be preserved. Reconciliations may need re-verification.</li>
            ) : (
              <li>Existing account mappings from prior period will carry forward automatically</li>
            )}
          </ul>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('preview')} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Back to Preview
          </button>
          <button type="button" onClick={ingest} className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
            {skipAdvance ? 'Replace GL & Re-derive TB' : 'Import & Begin Close'}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'ingesting') {
    return (
      <div className="max-w-2xl space-y-6">
        <StepProgress
          steps={[
            { label: 'Importing GL entries', status: 'complete' },
            { label: 'Building trial balance', status: 'complete' },
            { label: 'Advancing session to IN_PROGRESS', status: 'active' },
            { label: 'Redirecting to dashboard', status: 'pending' },
          ]}
        />
      </div>
    );
  }

  if (step === 'error') {
    if (parseError) {
      return (
        <div className="max-w-2xl space-y-6">
          <h2 className="text-lg font-display text-status-red flex items-center gap-2">
            <X className="w-5 h-5" /> Parse Failed
          </h2>
          <div className="bg-surface border border-border rounded-card p-5 space-y-4">
            <p className="text-sm text-primary">{parseError}</p>
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-primary mb-2">Expected CSV format:</p>
              <p className="text-xs text-text-secondary mb-2">Your file should include columns for these fields (exact names are flexible):</p>
              <div className="bg-surface-alt rounded-input p-3 font-mono text-xs text-text-secondary overflow-x-auto">
                date, account_code, account_name, debit, credit
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                Also accepted: description, reference/entry_id. Column headers are auto-detected — common variants like &quot;GL Account&quot;, &quot;Dr&quot;, &quot;Cr&quot; work too.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onBack} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
              Upload New File
            </button>
            <button type="button" onClick={downloadErrorReport} className="px-4 py-2 rounded-input bg-surface-alt border border-border text-sm font-medium hover:bg-hover inline-flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download Error Report
            </button>
          </div>
        </div>
      );
    }
    if (validationError) {
    return (
      <div className="max-w-2xl space-y-6">
        <h2 className="text-lg font-display text-status-red flex items-center gap-2">
          <X className="w-5 h-5" /> Validation Failed
        </h2>
        <div className="bg-surface border border-border rounded-card p-5 space-y-3">
          {validationError.errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <X className="w-4 h-4 text-status-red shrink-0 mt-0.5" />
              <div>
                <p className="text-primary font-medium">{e.message}</p>
                {e.detail && <p className="text-text-secondary mt-1">{e.detail}</p>}
              </div>
            </div>
          ))}
          <p className="text-sm text-text-secondary mt-4">Please fix these issues in your source file and re-upload.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Upload New File
          </button>
          <button type="button" onClick={downloadErrorReport} className="px-4 py-2 rounded-input bg-surface-alt border border-border text-sm font-medium hover:bg-hover inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Error Report
          </button>
        </div>
      </div>
    );
  }

  }

  return null;
}
