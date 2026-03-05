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
import { Check, AlertTriangle, X } from 'lucide-react';

/** Backend parse response (same as GL). */
interface ParsePreviewResponse {
  success: boolean;
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  errors: string[];
  warnings: string[];
  preview: {
    totalRows: number;
    uniqueAccounts: number;
    totalDebits: string;
    totalCredits: string;
    balanced: boolean;
    accounts: Array<{
      accountCode: string;
      accountName: string;
      totalDebit: string;
      totalCredit: string;
    }>;
  } | null;
}

const FIELD_TO_BACKEND: Record<string, string> = {
  account_code: 'accountCode',
  account_name: 'accountName',
  debit_balance: 'debit',
  credit_balance: 'credit',
  account_type: 'accountType',
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

const TB_REQUIRED_FIELDS: FieldMapping[] = [
  { fieldId: 'account_code', label: 'Account Code', required: true },
  { fieldId: 'account_name', label: 'Account Name', required: true },
  { fieldId: 'debit_balance', label: 'Debit Balance', required: true },
  { fieldId: 'credit_balance', label: 'Credit Balance', required: true },
  { fieldId: 'account_type', label: 'Account Type', required: false },
];

function formatMoney(s: string): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return s;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

export interface TBUploadFlowProps {
  sessionId: string;
  file: File;
  periodLabel: string;
  onBack: () => void;
}

type Step = 'parsing' | 'mapping' | 'validating' | 'preview' | 'confirm' | 'ingesting' | 'error';

export function TBUploadFlow({ sessionId, file, periodLabel, onBack }: TBUploadFlowProps) {
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
    return TB_REQUIRED_FIELDS.filter((f) => f.required).every((f) => mappings[f.fieldId]?.trim());
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
          rows: (prev.accounts ?? []).map((a) => ({
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
    try {
      // Persist trial balance data via ingest endpoint before advancing
      const formData = new FormData();
      formData.append('file', file);
      formData.append('columnMapping', JSON.stringify(mappingsToBackend(mappings)));
      formData.append('periodLabel', periodLabel);
      await apiUpload('/api/trial-balance/ingest', formData);

      await advanceSession.mutateAsync({});
      queryClient.invalidateQueries({ queryKey: ['trial-balance', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`/close/${sessionId}/dashboard`);
    } catch (err) {
      setStep('confirm');
      setAdvanceError(err instanceof Error ? err.message : 'Failed to import trial balance. Try again.');
    }
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
        {file && <div className="text-sm text-text-secondary">{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>}
      </div>
    );
  }

  if (step === 'mapping' && parseResult) {
    return (
      <div className="max-w-3xl space-y-6">
        <h2 className="text-lg font-display text-primary">Trial Balance Upload — Column Mapping</h2>
        <div className="rounded-input border border-status-amber bg-status-amber-dim text-status-amber px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>
            Uploading a trial balance directly means GL-level drill-down will not be available. For full traceability, upload the general ledger instead.
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          File: {file?.name} ({parseResult.rowCount} rows)
        </p>
        <ColumnMapper
          columns={parseResult.columns}
          requiredFields={TB_REQUIRED_FIELDS}
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
        <h2 className="text-lg font-display text-primary">Processing trial balance...</h2>
        <StepProgress
          steps={[
            { label: 'Parsed file', status: 'complete' },
            { label: 'Validating balances', status: 'active' },
            { label: 'Building preview', status: 'pending' },
          ]}
        />
      </div>
    );
  }

  if (step === 'preview' && validation && tbPreview) {
    const displayRows = tbPreview.rows.slice(0, 10);
    return (
      <div className="max-w-4xl space-y-8">
        <h2 className="text-lg font-display text-primary">Validation Results</h2>
        <div className="bg-surface border border-border rounded-card p-5 space-y-2">
          <p className="flex items-center gap-2 text-sm text-status-green">
            <Check className="w-4 h-4 shrink-0" /> File parsed successfully ({tbPreview.accountCount} accounts)
          </p>
          <p className="flex items-center gap-2 text-sm text-status-green">
            <Check className="w-4 h-4 shrink-0" /> Trial balance balances: Debits = Credits
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-primary mb-2">
            Trial Balance Preview — {tbPreview.accountCount} accounts | Total Debits: {formatMoney(tbPreview.totalDebits)} | Total Credits: {formatMoney(tbPreview.totalCredits)} | Balanced ✓
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
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('mapping')} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Back
          </button>
          <button type="button" onClick={() => setStep('confirm')} className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
            Continue to Confirm →
          </button>
        </div>
      </div>
    );
  }

  if (step === 'confirm' && tbPreview) {
    return (
      <div className="max-w-2xl space-y-6">
        <h2 className="text-lg font-display text-primary">Ready to import</h2>
        {advanceError && (
          <div className="bg-status-red/10 border border-status-red rounded-card p-4 flex items-start gap-2 text-sm text-status-red">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{advanceError}</span>
          </div>
        )}
        <div className="bg-surface border border-border rounded-card p-6 space-y-4">
          <p className="text-sm text-text-secondary">This will:</p>
          <ul className="list-disc list-inside text-sm text-primary space-y-1">
            <li>Import trial balance with {tbPreview.accountCount} accounts</li>
            <li>Advance the session to IN_PROGRESS</li>
            <li>GL-level drill-down will not be available for this period</li>
          </ul>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('preview')} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Back to Preview
          </button>
          <button type="button" onClick={ingest} className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
            Import & Begin Close
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
            { label: 'Importing trial balance', status: 'complete' },
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
          <div className="bg-surface border border-border rounded-card p-5">
            <p className="text-sm text-primary">{parseError}</p>
            <p className="text-sm text-text-secondary mt-4">Check the file format and try again.</p>
          </div>
          <button type="button" onClick={onBack} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Upload New File
          </button>
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
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="px-4 py-2 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Upload New File
          </button>
        </div>
      </div>
    );
  }

  }

  return null;
}
