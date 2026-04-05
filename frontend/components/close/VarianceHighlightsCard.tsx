'use client';

/**
 * VarianceHighlightsCard — Shows top material variances with AI explanation status.
 * Controllers see at a glance which variances need attention and can trigger AI drafts.
 *
 * Design: Ink-blue left border (Sabit acted). Uses agency encoding per design system.
 */

import { useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { VarianceExplanationStatus, isVarianceExplained } from '@/lib/contracts/statuses';
import { apiFetch } from '@/lib/api';

interface Variance {
  id: string;
  lineItemName?: string;
  fsLineId?: string;
  isMaterial: boolean;
  explanationStatus: string;
  changePercent?: number;
  changeAmount?: string;
  currentAmount?: string;
  priorAmount?: string;
  explanation?: string;
  explanationSource?: string;
}

interface VarianceHighlightsCardProps {
  variances: Variance[];
  sessionId: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

function fmtPct(pct: number | undefined): string {
  if (pct == null) return '--';
  const abs = Math.abs(pct);
  return `${pct >= 0 ? '+' : '-'}${abs.toFixed(1)}%`;
}

function fmtAmount(amt: string | undefined): string {
  if (!amt) return '--';
  const num = parseFloat(amt);
  if (isNaN(num)) return amt;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return num < 0 ? `(${formatted})` : formatted;
}

export default function VarianceHighlightsCard({ variances, sessionId, isLoading, onRefresh }: VarianceHighlightsCardProps) {
  const [draftLoading, setDraftLoading] = useState<string | null>(null);
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});

  const material = variances
    .filter((v) => v.isMaterial)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, 5);

  const explained = material.filter((v) => isVarianceExplained(v.explanationStatus));
  const aiReady = material.filter(
    (v) => v.explanationStatus === VarianceExplanationStatus.AI_DRAFTED || v.explanationStatus === VarianceExplanationStatus.DRAFT_READY
  );
  const unexplained = material.filter((v) => v.explanationStatus === VarianceExplanationStatus.UNEXPLAINED);

  async function handleAskSabit(varianceId: string) {
    setDraftLoading(varianceId);
    try {
      const data = await apiFetch<{ draft?: string; explanation?: string }>(`/api/close/variances/${varianceId}/ai-draft`);
      setDraftTexts((prev) => ({ ...prev, [varianceId]: data.draft ?? data.explanation ?? 'No draft generated.' }));
    } catch {
      setDraftTexts((prev) => ({ ...prev, [varianceId]: 'Draft unavailable. Try again later.' }));
    } finally {
      setDraftLoading(null);
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="rounded-lg border-l-4 p-5" style={{ borderColor: '#3B6EA5', background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-4 h-4 rounded bg-[#E0EAF5] animate-pulse" />
          <div className="h-4 w-40 rounded bg-[#E0EAF5] animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-[#F5F0E8] animate-pulse mb-2" />
        ))}
      </div>
    );
  }

  // Empty state
  if (material.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-5 text-center" style={{ borderColor: '#D1C7B7', background: 'var(--bg-surface)' }}>
        <Sparkles className="mx-auto mb-2" size={20} style={{ color: '#3B6EA5' }} />
        <p className="text-sm" style={{ color: '#6B5E4F' }}>
          No material variances detected. Variances appear after statement generation with prior period comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-l-4 p-5" style={{ borderColor: '#3B6EA5', background: 'var(--bg-surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: '#3B6EA5' }} />
          <h3 className="text-sm font-medium" style={{ color: '#2C2416' }}>
            Material Variances
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: '#E0EAF5', color: '#3B6EA5' }}
          >
            {material.length}
          </span>
        </div>
        <a
          href={`/close/${sessionId}/variance`}
          className="text-xs flex items-center gap-1 hover:underline"
          style={{ color: '#3B6EA5' }}
        >
          View all <ExternalLink size={12} />
        </a>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 mb-4">
        {explained.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#E0EDE8', color: '#2D6A4F' }}>
            <CheckCircle2 size={12} /> {explained.length} explained
          </span>
        )}
        {aiReady.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#E0EAF5', color: '#3B6EA5' }}>
            <Sparkles size={12} /> {aiReady.length} AI draft{aiReady.length !== 1 ? 's' : ''} ready
          </span>
        )}
        {unexplained.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#F5E4DE', color: '#C44B2B' }}>
            <AlertCircle size={12} /> {unexplained.length} unexplained
          </span>
        )}
      </div>

      {/* Variance rows */}
      <div className="space-y-1">
        {material.map((v) => {
          const isUp = (v.changePercent ?? 0) >= 0;
          const TrendIcon = isUp ? TrendingUp : TrendingDown;
          const draft = draftTexts[v.id];
          const loading = draftLoading === v.id;

          return (
            <div key={v.id}>
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm"
                style={{ background: 'var(--bg-base)' }}
              >
                {/* Line item name */}
                <span className="flex-1 truncate font-medium" style={{ color: '#2C2416' }}>
                  {v.lineItemName ?? v.fsLineId ?? v.id}
                </span>

                {/* Change amount + pct */}
                <span className="flex items-center gap-1.5 text-xs tabular-nums font-mono" style={{ color: isUp ? '#2D6A4F' : '#C44B2B' }}>
                  <TrendIcon size={14} />
                  {fmtAmount(v.changeAmount)} ({fmtPct(v.changePercent)})
                </span>

                {/* Explanation status */}
                <div className="w-48 flex justify-end">
                  {isVarianceExplained(v.explanationStatus) ? (
                    <span className="flex items-center gap-1 text-xs" style={{ color: '#2D6A4F' }}>
                      <CheckCircle2 size={14} />
                      <span className="truncate max-w-[140px]">{v.explanation ?? 'Explained'}</span>
                    </span>
                  ) : v.explanationStatus === VarianceExplanationStatus.AI_DRAFTED || v.explanationStatus === VarianceExplanationStatus.DRAFT_READY ? (
                    <a
                      href={`/close/${sessionId}/variance`}
                      className="flex items-center gap-1 text-xs hover:underline"
                      style={{ color: '#3B6EA5' }}
                    >
                      <Sparkles size={14} /> Review AI draft
                    </a>
                  ) : (
                    <button
                      onClick={() => handleAskSabit(v.id)}
                      disabled={loading}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
                      style={{ borderColor: '#3B6EA5', color: '#3B6EA5', background: '#E0EAF5' }}
                    >
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {loading ? 'Drafting...' : 'Ask Sabit'}
                    </button>
                  )}
                </div>
              </div>

              {/* Inline AI draft (shown after Ask Sabit) */}
              {draft && (
                <div
                  className="mx-3 mb-1 px-3 py-2 rounded text-xs border-l-2"
                  style={{ borderColor: '#3B6EA5', background: '#E0EAF5', color: '#2C2416' }}
                >
                  <div className="flex items-start gap-1.5">
                    <Sparkles size={12} style={{ color: '#3B6EA5', flexShrink: 0, marginTop: 2 }} />
                    <span>{draft}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <a
                      href={`/close/${sessionId}/variance`}
                      className="text-xs px-2 py-0.5 rounded hover:opacity-80"
                      style={{ background: '#2D6A4F', color: '#F5F0E8' }}
                    >
                      Review & Accept
                    </a>
                    <span className="text-xs" style={{ color: '#6B5E4F' }}>
                      AI-drafted
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
