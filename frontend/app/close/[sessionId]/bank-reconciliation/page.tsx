'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo, useCallback } from 'react';
import {
  useBankTransactions,
  useBankSummary,
  useParseBankStatement,
  useIngestBankStatement,
  useRunMatching,
  useConfirmMatch,
  useRejectMatch,
} from '@/lib/queries/bank-transactions';
import type { BankTransaction, MatchGroup, ParsePreview } from '@/lib/queries/bank-transactions';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { fmtMoney } from '@/lib/money';
import {
  Upload, Play, Check, X, Filter, ArrowRightLeft,
  Loader2, CheckCircle2, XCircle, AlertCircle, Clock,
} from 'lucide-react';

/* ── Status helpers ────────────────────────────────────────────────────────── */
type FilterStatus = 'all' | 'matched' | 'unmatched' | 'confirmed';

const SColor: Record<string, string> = { confirmed: 'var(--status-success)', proposed: 'var(--status-warning)', rejected: 'var(--status-error)', unmatched: 'var(--text-tertiary)' };
const SBg: Record<string, string> = { confirmed: 'var(--status-success-bg)', proposed: 'var(--status-warning-bg)', rejected: 'var(--status-error-bg)', unmatched: 'var(--status-neutral-bg)' };
const confColor = (p: number) => p >= 95 ? 'var(--status-success)' : p >= 80 ? 'var(--status-warning)' : 'var(--status-error)';
const METHOD_LABELS: Record<string, string> = { exact: 'Exact', fuzzy: 'Fuzzy', rule: 'Rule-Based', manual: 'Manual' };

function Pills<T extends string>({ items, active, onChange }: { items: { id: T; label: string; count: number }[]; active: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Filter className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
      {items.map((p) => (
        <button key={p.id} onClick={() => onChange(p.id)} className="px-2.5 py-1 text-[0.6875rem] font-medium rounded-md transition-colors"
          style={{ backgroundColor: active === p.id ? 'var(--interactive-primary)' : 'transparent', color: active === p.id ? 'white' : 'var(--text-secondary)' }}>
          {p.label} ({p.count})
        </button>
      ))}
    </div>
  );
}

/* ── Stat Card ─────────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-3 rounded-lg"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
      {sub && (
        <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>{sub}</span>
      )}
    </div>
  );
}

/* ── Progress Bar ──────────────────────────────────────────────────────────── */

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-[200px]">
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-sunken)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: pct >= 100 ? 'var(--status-success)' : 'var(--interactive-primary)',
          }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
    </div>
  );
}

/* ── Transaction Row ───────────────────────────────────────────────────────── */

function TxnRow({ txn, highlight }: { txn: BankTransaction; highlight: boolean }) {
  const statusColor = txn.status === 'confirmed'
    ? 'var(--status-success)'
    : txn.status === 'matched'
      ? 'var(--status-warning)'
      : 'var(--text-tertiary)';

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-[0.8125rem] transition-colors"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: highlight ? 'var(--status-warning-bg)' : 'transparent',
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      <span className="w-[80px] shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
        {txn.date ? new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}
      </span>
      <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }} title={txn.description}>
        {txn.description || '--'}
      </span>
      {txn.reference && (
        <span className="text-[0.6875rem] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-surface-sunken)' }}>
          {txn.reference}
        </span>
      )}
      <span className="w-[110px] shrink-0 text-right">
        <MoneyCell value={txn.amount} />
      </span>
    </div>
  );
}

/* ── Parse Preview Modal ───────────────────────────────────────────────────── */

function ParsePreviewPanel({
  preview,
  onConfirm,
  onCancel,
  isIngesting,
}: {
  preview: ParsePreview;
  onConfirm: () => void;
  onCancel: () => void;
  isIngesting: boolean;
}) {
  return (
    <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--interactive-primary)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Preview: {preview.rowCount} transactions detected
        </h3>
        <span className="text-[0.6875rem] px-2 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--status-info-bg)', color: 'var(--interactive-primary)' }}>
          {preview.format.toUpperCase()}
        </span>
      </div>
      <div className="flex gap-4 text-[0.8125rem]" style={{ color: 'var(--text-secondary)' }}>
        <span>Date range: {preview.dateRange.from} to {preview.dateRange.to}</span>
      </div>
      <div className="max-h-[200px] overflow-y-auto rounded" style={{ border: '1px solid var(--border-subtle)' }}>
        {preview.transactions.slice(0, 10).map((t, i) => (
          <TxnRow key={t.id ?? i} txn={t} highlight={false} />
        ))}
        {preview.rowCount > 10 && (
          <div className="py-2 text-center text-[0.8125rem]" style={{ color: 'var(--text-tertiary)' }}>
            ... and {preview.rowCount - 10} more
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md font-medium transition-colors"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isIngesting}
          className="px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-2"
          style={{ backgroundColor: 'var(--interactive-primary)', color: 'white' }}
        >
          {isIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isIngesting ? 'Importing...' : 'Confirm Import'}
        </button>
      </div>
    </div>
  );
}

/* ── Match Group Row ───────────────────────────────────────────────────────── */

function MatchGroupRow({ group, onConfirm, onReject, isActing }: { group: MatchGroup; onConfirm: () => void; onReject: () => void; isActing: boolean }) {
  const Icon = group.status === 'confirmed' ? CheckCircle2 : group.status === 'rejected' ? XCircle : Clock;
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)', borderLeft: `3px solid ${SColor[group.status]}` }}>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.6875rem] font-semibold uppercase tracking-wider shrink-0"
        style={{ color: SColor[group.status], backgroundColor: SBg[group.status] }}>
        <Icon className="w-4 h-4" />{group.status}
      </span>
      <span className="w-[70px] shrink-0 text-center text-sm font-bold tabular-nums" style={{ color: confColor(group.confidence) }}>{group.confidence}%</span>
      <span className="text-[0.6875rem] px-2 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }}>
        {METHOD_LABELS[group.method] ?? group.method}
      </span>
      <div className="flex-1 flex items-center gap-4 min-w-0">
        <div className="flex flex-col items-end">
          <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>Bank</span>
          <MoneyCell value={group.bankTotal} />
        </div>
        <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        <div className="flex flex-col items-start">
          <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>GL</span>
          <MoneyCell value={group.glTotal} />
        </div>
        {parseFloat(group.amountDifference) !== 0 && (
          <span className="text-[0.6875rem] font-semibold tabular-nums" style={{ color: 'var(--status-error)' }}>
            Diff: {fmtMoney(group.amountDifference, { dollar: true, dash: false })}
          </span>
        )}
      </div>
      <span className="text-[0.6875rem] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
        {group.bankTransactionIds.length}B / {group.glEntryIds.length}GL
      </span>
      {group.status === 'proposed' && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onConfirm} disabled={isActing} className="p-1.5 rounded-md" style={{ color: 'var(--status-success)' }} title="Confirm match" aria-label="Confirm match">
            {isActing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button onClick={onReject} disabled={isActing} className="p-1.5 rounded-md" style={{ color: 'var(--status-error)' }} title="Reject match" aria-label="Reject match">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE COMPONENT
   ══════════════════════════════════════════════════════════════════════════════ */

export default function BankReconciliationPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  /* ── Queries ─────────────────────────────────────────────────────────────── */
  const { data: transactions, isLoading: txnLoading } = useBankTransactions(sessionId);
  const { data: summary, isLoading: summaryLoading } = useBankSummary(sessionId);
  const txns = transactions ?? [];
  const matchGroups = summary?.matchGroups ?? [];

  /* ── Mutations ───────────────────────────────────────────────────────────── */
  const parseMut = useParseBankStatement(sessionId);
  const ingestMut = useIngestBankStatement(sessionId);
  const matchMut = useRunMatching(sessionId);
  const confirmMut = useConfirmMatch(sessionId);
  const rejectMut = useRejectMatch(sessionId);

  /* ── Local state ─────────────────────────────────────────────────────────── */
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [matchFilter, setMatchFilter] = useState<'all' | 'proposed' | 'confirmed' | 'rejected'>('all');
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [actingGroupId, setActingGroupId] = useState<string | null>(null);

  /* ── Derived data ────────────────────────────────────────────────────────── */
  const isLoading = txnLoading || summaryLoading;

  const filteredTxns = useMemo(() => {
    if (filter === 'all') return txns;
    if (filter === 'unmatched') return txns.filter((t) => t.status === 'unmatched');
    if (filter === 'confirmed') return txns.filter((t) => t.status === 'confirmed');
    return txns.filter((t) => t.status === 'matched' || t.status === 'confirmed');
  }, [txns, filter]);

  const filteredGroups = useMemo(() => {
    if (matchFilter === 'all') return matchGroups;
    return matchGroups.filter((g) => g.status === matchFilter);
  }, [matchGroups, matchFilter]);

  const stats = useMemo(() => {
    if (!summary) return { total: txns.length, matched: 0, unmatched: txns.length, confirmed: 0, rate: 0 };
    return {
      total: summary.totalTransactions,
      matched: summary.matched,
      unmatched: summary.unmatched,
      confirmed: summary.confirmed,
      rate: summary.matchRate,
    };
  }, [summary, txns.length]);

  /* ── Handlers ────────────────────────────────────────────────────────────── */

  const handleFileSelect = useCallback((file: File) => {
    setUploadedFile(file);
    parseMut.mutate(file, {
      onSuccess: (data) => setPreview(data),
      onError: () => setPreview(null),
    });
  }, [parseMut]);

  const handleConfirmImport = useCallback(() => {
    if (!uploadedFile) return;
    ingestMut.mutate(uploadedFile, {
      onSuccess: () => {
        setPreview(null);
        setUploadedFile(null);
      },
    });
  }, [uploadedFile, ingestMut]);

  const handleCancelPreview = useCallback(() => { setPreview(null); setUploadedFile(null); }, []);
  const handleRunMatching = useCallback(() => matchMut.mutate(), [matchMut]);

  const handleGroupAction = useCallback((groupId: string, action: 'confirm' | 'reject') => {
    setActingGroupId(groupId);
    const mut = action === 'confirm' ? confirmMut : rejectMut;
    mut.mutate(groupId, { onSettled: () => setActingGroupId(null) });
  }, [confirmMut, rejectMut]);

  /* ── Filter pills ────────────────────────────────────────────────────────── */

  const txnPills: { id: FilterStatus; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: txns.length },
    { id: 'matched', label: 'Matched', count: txns.filter((t) => t.status !== 'unmatched').length },
    { id: 'unmatched', label: 'Unmatched', count: txns.filter((t) => t.status === 'unmatched').length },
    { id: 'confirmed', label: 'Confirmed', count: txns.filter((t) => t.status === 'confirmed').length },
  ];

  const groupPills: { id: typeof matchFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: matchGroups.length },
    { id: 'proposed', label: 'Proposed', count: matchGroups.filter((g) => g.status === 'proposed').length },
    { id: 'confirmed', label: 'Confirmed', count: matchGroups.filter((g) => g.status === 'confirmed').length },
    { id: 'rejected', label: 'Rejected', count: matchGroups.filter((g) => g.status === 'rejected').length },
  ];

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6 pb-12">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Bank Reconciliation
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Match bank statement transactions to general ledger entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunMatching}
            disabled={matchMut.isPending || txns.length === 0}
            className="px-4 py-2 text-sm rounded-md font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: 'var(--interactive-primary)', color: 'white' }}
          >
            {matchMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Matching
          </button>
        </div>
      </div>

      {/* ── TOP: Upload + Summary Stats ──────────────────────────────────────── */}
      <section className="space-y-4">
        {/* Summary stats + progress bar */}
        {txns.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Total Transactions" value={stats.total} />
              <StatCard label="Matched" value={stats.matched} sub={`${stats.rate.toFixed(1)}% match rate`} />
              <StatCard label="Unmatched" value={stats.unmatched} />
              <StatCard label="Confirmed" value={stats.confirmed} />
              <StatCard
                label="Difference"
                value={fmtMoney(summary?.difference ?? '0', { dollar: true, dash: false })}
              />
            </div>
            <ProgressBar
              pct={stats.rate}
              label={`${stats.rate.toFixed(1)}% matched`}
            />
          </>
        )}

        {/* Upload zone or preview */}
        {preview ? (
          <ParsePreviewPanel
            preview={preview}
            onConfirm={handleConfirmImport}
            onCancel={handleCancelPreview}
            isIngesting={ingestMut.isPending}
          />
        ) : (
          <FileUploadZone
            onFile={handleFileSelect}
            acceptedTypes={['.csv', '.ofx', '.bai2', '.bai', 'text/csv']}
            title="Drop bank statement here"
            subtitle={txns.length > 0 ? 'Upload another statement to add transactions' : 'Upload a CSV, OFX, or BAI2 file'}
            hint="Accepted: CSV, OFX, BAI2"
          />
        )}

        {[
          parseMut.isError && `Failed to parse file: ${parseMut.error?.message ?? 'Unknown error'}`,
          ingestMut.isError && `Failed to import: ${ingestMut.error?.message ?? 'Unknown error'}`,
          matchMut.isError && `Matching failed: ${matchMut.error?.message ?? 'Unknown error'}`,
        ].filter(Boolean).map((msg, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm" style={{ color: 'var(--status-error)', backgroundColor: 'var(--status-error-bg)' }}>
            <AlertCircle className="w-4 h-4 shrink-0" />{msg}
          </div>
        ))}
      </section>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading bank transactions...</span>
        </div>
      )}

      {/* ── MIDDLE: Two-column Bank vs GL ────────────────────────────────────── */}
      {!isLoading && txns.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Transactions
            </h2>
            <Pills items={txnPills} active={filter} onChange={setFilter} />
          </div>

          <div
            className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-default)' }}
          >
            {/* Bank transactions column */}
            <div style={{ borderRight: '1px solid var(--border-default)' }}>
              <div
                className="px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]"
                style={{ backgroundColor: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}
              >
                Bank Statement ({filteredTxns.length})
              </div>
              <div className="max-h-[400px] overflow-y-auto" style={{ backgroundColor: 'var(--bg-surface)' }}>
                {filteredTxns.length === 0 ? (
                  <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    No transactions match the current filter
                  </div>
                ) : (
                  filteredTxns.map((txn) => (
                    <TxnRow
                      key={txn.id}
                      txn={txn}
                      highlight={hoveredGroupId != null && txn.matchGroupId === hoveredGroupId}
                    />
                  ))
                )}
              </div>
            </div>

            {/* GL entries column */}
            <div>
              <div
                className="px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]"
                style={{ backgroundColor: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}
              >
                General Ledger Entries
              </div>
              <div className="max-h-[400px] overflow-y-auto" style={{ backgroundColor: 'var(--bg-surface)' }}>
                {matchGroups.length === 0 ? (
                  <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Run matching to see GL entries paired with bank transactions
                  </div>
                ) : (
                  matchGroups.flatMap((g) =>
                    g.glEntryIds.map((glId) => (
                      <div
                        key={glId}
                        className="flex items-center gap-2 px-3 py-2 text-[0.8125rem]"
                        onMouseEnter={() => setHoveredGroupId(g.id)}
                        onMouseLeave={() => setHoveredGroupId(null)}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          borderLeft: `3px solid ${SColor[g.status]}`,
                          backgroundColor: hoveredGroupId === g.id ? 'var(--status-warning-bg)' : 'transparent',
                        }}
                      >
                        <span className="flex-1 truncate font-mono text-[0.75rem]" style={{ color: 'var(--text-primary)' }}>
                          {glId}
                        </span>
                        <span
                          className="text-[0.6875rem] px-1.5 py-0.5 rounded font-medium"
                          style={{ color: SColor[g.status], backgroundColor: SBg[g.status] }}
                        >
                          {g.status}
                        </span>
                        <span className="w-[110px] shrink-0 text-right">
                          <MoneyCell value={g.glTotal} />
                        </span>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── BOTTOM: Match Groups Table ───────────────────────────────────────── */}
      {!isLoading && matchGroups.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Match Groups ({matchGroups.length})
            </h2>
            <Pills items={groupPills} active={matchFilter} onChange={setMatchFilter} />
          </div>

          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface)' }}
          >
            <div className="max-h-[400px] overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  No match groups for the current filter
                </div>
              ) : (
                filteredGroups.map((g) => (
                  <div
                    key={g.id}
                    onMouseEnter={() => setHoveredGroupId(g.id)}
                    onMouseLeave={() => setHoveredGroupId(null)}
                  >
                    <MatchGroupRow
                      group={g}
                      onConfirm={() => handleGroupAction(g.id, 'confirm')}
                      onReject={() => handleGroupAction(g.id, 'reject')}
                      isActing={actingGroupId === g.id}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && txns.length === 0 && !preview && (
        <div className="text-center py-16 space-y-3">
          <ArrowRightLeft className="w-12 h-12 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            No bank transactions yet
          </h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Upload a bank statement above to begin reconciling bank transactions against your general ledger.
          </p>
        </div>
      )}
    </div>
  );
}
