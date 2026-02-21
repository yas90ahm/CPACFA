'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { FileUpload } from '@/components/shared/FileUpload';
import { FileList } from '@/components/shared/FileList';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { mockJEEvidenceByJe } from '@/lib/mock/je-evidence';
import { parseMoney } from '@/lib/format';
import { MATERIALITY_THRESHOLD } from '@/lib/types/journal-entry';
import type { JournalEntry, JournalEntryLine } from '@/lib/types/journal-entry';
import type { EvidenceFile } from '@/lib/types/evidence';
import type { SearchableSelectOption } from '@/components/shared/SearchableSelect';
import { formatMoney } from '@/lib/format';

export interface JournalEntryFormProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit' | 'view';
  entry: JournalEntry | null;
  sessionId: string;
  onSaveDraft: (entry: Partial<JournalEntry> & { lines: JournalEntryLine[] }) => void;
  onSaveAndPropose?: (entry: Partial<JournalEntry> & { lines: JournalEntryLine[] }) => void;
  onApprove?: (entry: JournalEntry) => void;
  onReject?: (entry: JournalEntry) => void;
  onPost?: (entry: JournalEntry) => void;
}

interface FormLine {
  id: string;
  accountCode: string | null;
  accountName: string | null;
  description: string;
  debit: string | null;
  credit: string | null;
}

export function JournalEntryForm({
  open,
  onClose,
  mode,
  entry,
  sessionId,
  onSaveDraft,
  onSaveAndPropose,
  onApprove,
  onReject,
  onPost,
}: JournalEntryFormProps) {
  const { rows: tbRows } = useTrialBalanceContext();
  const mappedAccounts = useMemo(() => tbRows.filter((r) => r.mappingReportingLineId), [tbRows]);

  const accountOptions: SearchableSelectOption[] = useMemo(
    () =>
      mappedAccounts.map((r) => ({
        value: r.accountCode,
        label: `${r.accountCode} — ${r.accountName}`,
        group: r.accountType,
        subLabel: formatMoney(r.netBalance, { showDollar: true }),
      })),
    [mappedAccounts]
  );

  const [date, setDate] = useState(entry?.date ?? '2026-01-31');
  const [memo, setMemo] = useState(entry?.memo ?? '');
  const [lines, setLines] = useState<FormLine[]>([
    { id: 'line-1', accountCode: null, accountName: null, description: '', debit: null, credit: null },
    { id: 'line-2', accountCode: null, accountName: null, description: '', debit: null, credit: null },
  ]);
  const [localEvidence, setLocalEvidence] = useState<EvidenceFile[]>([]);

  useEffect(() => {
    if (!open) return;
    setDate(entry?.date ?? '2026-01-31');
    setMemo(entry?.memo ?? '');
    setLines(
      entry?.lines?.length
        ? entry.lines.map((l) => ({
            id: l.id,
            accountCode: l.accountCode,
            accountName: l.accountName,
            description: l.description ?? '',
            debit: l.debit ? String(l.debit) : null,
            credit: l.credit ? String(l.credit) : null,
          }))
        : [
            { id: 'line-1', accountCode: null, accountName: null, description: '', debit: null, credit: null },
            { id: 'line-2', accountCode: null, accountName: null, description: '', debit: null, credit: null },
          ]
    );
    setLocalEvidence([]);
  }, [open, entry?.id, entry?.date, entry?.memo, entry?.lines]);

  const totalDebits = useMemo(() => lines.reduce((s, l) => s + (l.debit ? parseMoney(l.debit) : 0), 0), [lines]);
  const totalCredits = useMemo(() => lines.reduce((s, l) => s + (l.credit ? parseMoney(l.credit) : 0), 0), [lines]);
  const difference = totalDebits - totalCredits;
  const isBalanced = Math.abs(difference) < 0.01;
  const hasMemo = memo.trim().length >= 5;
  const hasTwoLinesWithAmounts = lines.filter((l) => (l.debit && parseMoney(l.debit) !== 0) || (l.credit && parseMoney(l.credit) !== 0)).length >= 2;
  const allLinesHaveAccount = lines.every((l) => l.accountCode != null);
  const entryTotal = totalDebits;
  const evidenceRequired = entryTotal >= MATERIALITY_THRESHOLD;
  const evidenceOk = !evidenceRequired || (entry?.evidenceCount ?? 0) + localEvidence.length >= 1;
  const canSubmit = isBalanced && hasMemo && hasTwoLinesWithAmounts && allLinesHaveAccount && evidenceOk;

  const updateLine = useCallback((lineId: string, updates: Partial<FormLine>) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...updates } : l)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { id: `line-${Date.now()}`, accountCode: null, accountName: null, description: '', debit: null, credit: null }]);
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.id !== lineId) : prev));
  }, []);

  const handleAccountSelect = useCallback(
    (lineId: string, value: string | null) => {
      const acc = mappedAccounts.find((r) => r.accountCode === value);
      updateLine(lineId, { accountCode: value ?? null, accountName: acc?.accountName ?? null });
    },
    [mappedAccounts, updateLine]
  );

  const handleDebitChange = useCallback(
    (lineId: string, value: string | null) => {
      updateLine(lineId, { debit: value, credit: null });
    },
    [updateLine]
  );

  const handleCreditChange = useCallback(
    (lineId: string, value: string | null) => {
      updateLine(lineId, { credit: value, debit: null });
    },
    [updateLine]
  );

  const handleUpload = useCallback(async (file: File) => {
    const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setLocalEvidence((prev) => [
      ...prev,
      {
        id: `ev-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: 'Sarah Chen',
        uploadedAt: new Date().toISOString(),
        sha256Hash: hash,
        downloadUrl: '#',
      },
    ]);
  }, []);

  const buildEntry = useCallback((): Partial<JournalEntry> & { lines: JournalEntryLine[] } => {
    const jeLines: JournalEntryLine[] = lines.map((l) => ({
      id: l.id,
      accountCode: l.accountCode ?? '',
      accountName: l.accountName ?? '',
      description: l.description || null,
      debit: l.debit ? parseMoney(l.debit) : 0,
      credit: l.credit ? parseMoney(l.credit) : 0,
    }));
    return {
      ...(entry ?? {}),
      date,
      memo: memo.trim(),
      lines: jeLines,
    } as Partial<JournalEntry> & { lines: JournalEntryLine[] };
  }, [date, memo, lines, entry]);

  const readonly = mode === 'view';
  const title = mode === 'create' ? 'New Journal Entry' : mode === 'edit' ? `Edit Journal Entry #${entry?.jeNumber}` : `Journal Entry #${entry?.jeNumber}`;

  const footer = (
    <>
      {mode === 'create' || mode === 'edit' ? (
        <>
          <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => onSaveDraft(buildEntry())}>
            Save as Draft
          </button>
          {canSubmit && (
            <button type="button" className="px-4 py-2 rounded-input bg-accent text-white text-sm" onClick={() => onSaveAndPropose?.(buildEntry())}>
              Save & Propose
            </button>
          )}
        </>
      ) : null}
      {mode === 'view' && entry?.status === 'proposed' && (
        <>
          <button type="button" className="px-4 py-2 rounded-input border border-status-red text-status-red text-sm" onClick={() => entry && onReject?.(entry)}>
            Reject
          </button>
          <button type="button" className="px-4 py-2 rounded-input bg-status-green text-white text-sm" onClick={() => entry && onApprove?.(entry)}>
            Approve
          </button>
        </>
      )}
      {mode === 'view' && entry?.status === 'approved' && (
        <button type="button" className="px-4 py-2 rounded-input bg-accent text-white text-sm" onClick={() => entry && onPost?.(entry)}>
          Post
        </button>
      )}
    </>
  );

  return (
    <SlideOverPanel open={open} onClose={onClose} title={title} footer={footer}>
      <div className="space-y-6">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readonly} className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Memo (required, min 5 chars)</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={readonly}
            placeholder="Describe the purpose of this entry"
            className="w-full px-3 py-2 rounded-input border border-border bg-input text-sm"
          />
        </div>
        {entry?.templateName && (
          <p className="text-sm text-text-muted">From template: {entry.templateName}</p>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Line items</span>
            {!readonly && (
              <button type="button" className="text-xs text-accent hover:underline" onClick={addLine}>
                Add Line
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-secondary">Account</th>
                  <th className="text-left py-2 font-medium text-text-secondary">Description</th>
                  <th className="text-right py-2 font-medium text-text-secondary w-28">Debit</th>
                  <th className="text-right py-2 font-medium text-text-secondary w-28">Credit</th>
                  {!readonly && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-border-light">
                    <td className="py-2">
                      {readonly ? (
                        <span>{l.accountCode} — {l.accountName}</span>
                      ) : (
                        <SearchableSelect
                          value={l.accountCode}
                          onChange={(v) => handleAccountSelect(l.id, v)}
                          options={accountOptions}
                          placeholder="Select account"
                          groupOrder={['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']}
                        />
                      )}
                    </td>
                    <td className="py-2">
                      {readonly ? (
                        l.description || '—'
                      ) : (
                        <input
                          type="text"
                          value={l.description}
                          onChange={(e) => updateLine(l.id, { description: e.target.value })}
                          className="w-full px-2 py-1 rounded-input border border-border bg-input text-sm"
                        />
                      )}
                    </td>
                    <td className="py-2">
                      {readonly ? (
                        <MoneyCell value={l.debit ? parseMoney(l.debit) : 0} showDollar />
                      ) : (
                        <MoneyInput value={l.debit} onChange={(v) => handleDebitChange(l.id, v)} size="sm" disabled={!!(l.credit && parseMoney(l.credit) !== 0)} />
                      )}
                    </td>
                    <td className="py-2">
                      {readonly ? (
                        <MoneyCell value={l.credit ? parseMoney(l.credit) : 0} showDollar />
                      ) : (
                        <MoneyInput value={l.credit} onChange={(v) => handleCreditChange(l.id, v)} size="sm" disabled={!!(l.debit && parseMoney(l.debit) !== 0)} />
                      )}
                    </td>
                    {!readonly && (
                      <td className="py-2">
                        <button type="button" className="text-status-red hover:bg-status-red-dim p-1 rounded" onClick={() => removeLine(l.id)} aria-label="Remove line">
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-text-secondary">Total Debits: <MoneyCell value={totalDebits} showDollar /></span>
            <span className="text-sm text-text-secondary">Total Credits: <MoneyCell value={totalCredits} showDollar /></span>
          </div>
          <div className={isBalanced ? 'text-status-green text-sm font-medium mt-1' : 'text-status-red text-sm font-medium mt-1'}>
            {isBalanced ? '✓ Balanced' : `Out of balance by ${formatMoney(difference, { showDollar: true })}`}
          </div>
        </div>

        {evidenceRequired ? (
          <div>
            <p className="text-sm text-status-amber mb-2">Entries of $10,000 or more require supporting documentation</p>
            {!readonly && <FileUpload onUpload={handleUpload} maxSizeMB={10} />}
            {((entry?.id ? mockJEEvidenceByJe[entry.id] ?? [] : []).length + localEvidence.length > 0) && (
              <FileList files={entry?.id ? [...(mockJEEvidenceByJe[entry.id] ?? []), ...localEvidence] : localEvidence} showHash readonly={readonly} />
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Evidence optional for entries below $10,000</p>
        )}

        <div className="rounded-input border border-border p-3 space-y-2 text-sm">
          <div className={isBalanced ? 'text-status-green' : 'text-status-red'}>{isBalanced ? '✓' : '✗'} Entry is balanced (debits = credits)</div>
          <div className={hasMemo ? 'text-status-green' : 'text-status-red'}>{hasMemo ? '✓' : '✗'} Memo is provided</div>
          <div className={hasTwoLinesWithAmounts ? 'text-status-green' : 'text-status-red'}>{hasTwoLinesWithAmounts ? '✓' : '✗'} At least 2 line items with amounts</div>
          <div className={allLinesHaveAccount ? 'text-status-green' : 'text-status-red'}>{allLinesHaveAccount ? '✓' : '✗'} All line items have an account selected</div>
          <div className={evidenceRequired ? (evidenceOk ? 'text-status-green' : 'text-status-red') : 'text-status-green'}>
            {evidenceRequired ? (evidenceOk ? '✓' : '✗') : '✓'} Evidence attached (if above threshold)
          </div>
        </div>
      </div>
    </SlideOverPanel>
  );
}
