'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnMapper } from '@/components/ingest/ColumnMapper';
import { StepProgress } from '@/components/shared/StepProgress';
import type { FieldMapping } from '@/lib/types/ingest';
import type { GLParseResult, ValidationResult, TBPreview } from '@/lib/types/ingest';
import { parseTBFile, validateGL } from '@/lib/mock/gl-upload';
import { getTBPreviewForIngest } from '@/lib/mock/tb-preview';
import { Check, AlertTriangle, X } from 'lucide-react';

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
  onBack: () => void;
}

type Step = 'parsing' | 'mapping' | 'validating' | 'preview' | 'confirm' | 'ingesting' | 'error';

export function TBUploadFlow({ sessionId, file, onBack }: TBUploadFlowProps) {
  const router = useRouter();
  const [parseResult, setParseResult] = useState<GLParseResult | null>(null);
  const [step, setStep] = useState<Step>('parsing');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [tbPreview, setTBPreview] = useState<TBPreview | null>(null);
  const [validationError, setValidationError] = useState<ValidationResult | null>(null);

  useEffect(() => {
    setStep('parsing');
    parseTBFile(file).then((result) => {
      setParseResult(result);
      setMappings(result.autoDetectedMappings ? { ...result.autoDetectedMappings } : {});
      setStep('mapping');
    });
  }, [file]);

  const allRequiredMapped = useMemo(() => {
    return TB_REQUIRED_FIELDS.filter((f) => f.required).every((f) => mappings[f.fieldId]?.trim());
  }, [mappings]);

  const runValidation = () => {
    setStep('validating');
    const rows = parseResult?.rows ?? [];
    Promise.all([validateGL(mappings, rows), getTBPreviewForIngest()]).then(([v, tb]) => {
      setTBPreview(tb);
      if (v.passed) {
        setValidation(v);
        setValidationError(null);
        setStep('preview');
      } else {
        setValidationError(v);
        setValidation(null);
        setStep('error');
      }
    });
  };

  const ingest = () => {
    setStep('ingesting');
    setTimeout(() => {
      router.push(`/close/${sessionId}/dashboard?ingested=1&accounts=52&unmapped=5`);
    }, 1500);
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
        <h2 className="text-lg font-display text-primary">Ready to ingest</h2>
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
            Ingest & Begin Close
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

  if (step === 'error' && validationError) {
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

  return null;
}
