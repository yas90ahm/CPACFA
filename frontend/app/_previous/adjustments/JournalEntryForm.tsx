'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { FileUpload } from '@/components/shared/FileUpload';
import { FileList } from '@/components/shared/FileList';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { useCloseSession } from '@/lib/queries/close-session';
import { useAuth } from '@/lib/auth';
import { apiFetch, apiUpload } from '@/lib/api';
import { parseMoneyStr } from '@/lib/format';
import { sumMoneyStrings, moneyAbs, isMoneyZero } from '@/lib/money';
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { rows: tbRows } = useTrialBalanceContext();
  const { data: sessionData } = useCloseSession(sessionId);
  // Default JE date to session period end, falling back to today
  const defaultDate = sessionData?.periodEnd ?? new Date().toISOString().slice(0, 10);

  const { data: manifest } = useQuery({
    queryKey: ['evidence-manifest', sessionId],
    queryFn: () =>
      apiFetch<{ jeEvidence: Array<{ jeId: string; files: Array<{ id: string; fileName: string; sizeBytes: number; mimeType?: string; sha256Hash: string; uploadedBy: string; createdAt: string }> }> }>(
        `/api/close/sessions/${sessionId}/evidence-manifest`
      ),
    enabled: !!sessionId && !!entry?.id,
  });

  const evidenceFromApi: EvidenceFile[] = useMemo(() => {
    if (!entry?.id || !manifest?.jeEvidence) return [];
    const je = manifest.jeEvidence.find((j) => j.jeId === entry.id);
    return (je?.files ?? []).map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileSize: f.sizeBytes,
      mimeType: f.mimeType ?? '',
      uploadedBy: f.uploadedBy,
      uploadedAt: f.createdAt,
      sha256Hash: f.sha256Hash,
      downloadUrl: `#`,
    }));
  }, [entry?.id, manifest]);

  const uploadEvidenceMutation = useMutation({
    mutationFn: ({ jeId, file }: { jeId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiUpload(`/api/close/journal-entries/${jeId}/evidence/upload`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-manifest', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });

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

  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [memo, setMemo] = useState(entry?.memo ?? '');
  const [reverseNextPeriod, setReverseNextPeriod] = useState(false);
  const [lines, setLines] = useState<FormLine[]>([
    { id: 'line-1', accountCode: null, accountName: null, description: '', debit: null, credit: null },
    { id: 'line-2', accountCode: null, accountName: null, description: '', debit: null, credit: null },
  ]);
  const [localEvidence, setLocalEvidence] = useState<EvidenceFile[]>([]);

  useEffect(() => {
    if (!open) return;
    setDate(entry?.date ?? defaultDate);
    setMemo(entry?.memo ?? '');
    setReverseNextPeriod(!!entry?.reversalDate);
    setLines(
      entry?.lines?.length
        ? entry.lines.map((l) => ({
            id: l.id,
            accountCode: l.accountCode,
            accountName: l.accountName,
            description: l.description ?? '',
            debit: !isMoneyZero(l.debit) ? l.debit : null,
            credit: !isMoneyZero(l.credit) ? l.credit : null,
          }))
        : [
            { id: 'line-1', accountCode: null, accountName: null, description: '', debit: null, credit: null },
            { id: 'line-2', accountCode: null, accountName: null, description: '', debit: null, credit: null },
          ]
    );
    setLocalEvidence([]);
  }, [open, entry?.id, entry?.date, entry?.memo, entry?.lines]);

  const totalDebits = useMemo(() => sumMoneyStrings(lines.map(l => l.debit)), [lines]);
  const totalCredits = useMemo(() => sumMoneyStrings(lines.map(l => l.credit)), [lines]);
  const difference = moneyAbs(totalDebits) - moneyAbs(totalCredits);
  const isBalanced = Math.abs(difference) < 0.01;
  const hasMemo = memo.trim().length >= 5;
  const hasTwoLinesWithAmounts = lines.filter((l) => !isMoneyZero(l.debit) || !isMoneyZero(l.credit)).length >= 2;
  const allLinesHaveAccount = lines.every((l) => l.accountCode != null);
  const entryTotal = moneyAbs(totalDebits);
  const evidenceRequired = entryTotal >= MATERIALITY_THRESHOLD;
  const evidenceOk = !evidenceRequired || evidenceFromApi.length + localEvidence.length >= 1;
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

  const handleUpload = useCallback(
    async (file: File) => {
      if (entry?.id) {
        uploadEvidenceMutation.mutate({ jeId: entry.id, file });
      } else {
        // Compute real SHA-256 hash from file contents
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        setLocalEvidence((prev) => [
          ...prev,
          {
            id: `ev-${Date.now()}`,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            uploadedBy: user?.email ?? user?.userId ?? 'Unknown',
            uploadedAt: new Date().toISOString(),
            sha256Hash: hash,
            downloadUrl: '#',
          },
        ]);
      }
    },
    [entry?.id, user, uploadEvidenceMutation]
  );

  const computedReversalDate = useMemo(() => {
    if (!reverseNextPeriod) return null;
    // First day of the month after periodEnd
    const periodEnd = sessionData?.periodEnd;
    if (periodEnd) {
      const d = new Date(periodEnd);
      d.setMonth(d.getMonth() + 1, 1);
      return d.toISOString().slice(0, 10);
    }
    // Fallback: first day of next month from JE date
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 1);
    return d.toISOString().slice(0, 10);
  }, [reverseNextPeriod, sessionData?.periodEnd, date]);

  const buildEntry = useCallback((): Partial<JournalEntry> & { lines: JournalEntryLine[] } => {
    const jeLines: JournalEntryLine[] = lines.map((l) => ({
      id: l.id,
      accountCode: l.accountCode ?? '',
      accountName: l.accountName ?? '',
      description: l.description || null,
      debit: l.debit ? parseMoneyStr(l.debit) : '0.00',
      credit: l.credit ? parseMoneyStr(l.credit) : '0.00',
    }));
    return {
      ...(entry ?? {}),
      date,
      memo: memo.trim(),
      reversalDate: computedReversalDate,
      lines: jeLines,
    } as Partial<JournalEntry> & { lines: JournalEntryLine[] };
  }, [date, memo, lines, entry, computedReversalDate]);

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
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="reverse-next-period"
            checked={reverseNextPeriod}
            onChange={(e) => setReverseNextPeriod(e.target.checked)}
            disabled={readonly}
            className="rounded border-border"
          />
          <label htmlFor="reverse-next-period" className="text-sm text-text-secondary">
            Reverse in next period
          </label>
          {reverseNextPeriod && computedReversalDate && (
            <span className="text-xs text-text-muted ml-2">
              (reversal date: {computedReversalDate})
            </span>
          )}
          {readonly && entry?.reversalDate && (
            <span className="text-xs text-accent ml-2">
              Reversal: {entry.reversalDate}
            </span>
          )}
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
                        <MoneyCell value={l.debit} showDollar />
                      ) : (
                        <MoneyInput value={l.debit} onChange={(v) => handleDebitChange(l.id, v)} size="sm" disabled={!isMoneyZero(l.credit)} />
                      )}
                    </td>
                    <td className="py-2">
                      {readonly ? (
                        <MoneyCell value={l.credit} showDollar />
                      ) : (
                        <MoneyInput value={l.credit} onChange={(v) => handleCreditChange(l.id, v)} size="sm" disabled={!isMoneyZero(l.debit)} />
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
            <p className="text-sm text-status-amber mb-2">Entries of ${MATERIALITY_THRESHOLD.toLocaleString()} or more require supporting documentation</p>
            {!readonly && <FileUpload onUpload={handleUpload} maxSizeMB={10} />}
            {((entry?.id ? evidenceFromApi : []).length + localEvidence.length > 0) && (
              <FileList files={entry?.id ? [...evidenceFromApi, ...localEvidence] : localEvidence} showHash readonly={readonly} />
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Evidence optional for entries below ${MATERIALITY_THRESHOLD.toLocaleString()}</p>
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
