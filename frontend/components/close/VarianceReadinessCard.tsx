'use client';

/**
 * VarianceReadinessCard -- Variance explanation completeness for the Review/Certify page.
 * Shows progress toward full material-variance attestation with count badges and
 * an actionable list of unexplained items.
 *
 * Agency encoding: Forest (#2D6A4F) = human confirmed, Ink Blue (#3B6EA5) = Sabit acted.
 * Left-border accent: forest when all explained, amber when work remains.
 */

import Link from 'next/link';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  VarianceExplanationStatus,
  isVarianceExplained,
} from '@/lib/contracts/statuses';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VarianceReadinessCardProps {
  variances: Array<{
    id: string;
    lineItemName?: string;
    isMaterial: boolean;
    explanationStatus: string;
    changePercent?: number;
  }>;
  sessionId: string;
  isLoading?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtPct(pct: number | undefined): string {
  if (pct == null) return '--';
  const abs = Math.abs(pct);
  return `${pct >= 0 ? '+' : '\u2212'}${abs.toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VarianceReadinessCard({
  variances,
  sessionId,
  isLoading,
}: VarianceReadinessCardProps) {
  const material = variances.filter((v) => v.isMaterial);

  const explained = material.filter((v) => isVarianceExplained(v.explanationStatus));
  const aiDraftReady = material.filter(
    (v) =>
      v.explanationStatus === VarianceExplanationStatus.AI_DRAFTED ||
      v.explanationStatus === VarianceExplanationStatus.DRAFT_READY,
  );
  const unexplainedList = material.filter(
    (v) => v.explanationStatus === VarianceExplanationStatus.UNEXPLAINED,
  );

  const allExplained = material.length > 0 && unexplainedList.length === 0 && aiDraftReady.length === 0;
  const borderColor = allExplained ? '#2D6A4F' : '#8B6914';
  const progressPct = material.length > 0 ? (explained.length / material.length) * 100 : 0;

  /* ---- Loading skeleton ---- */
  if (isLoading) {
    return (
      <div
        className="rounded-lg border-l-4 p-5"
        style={{ borderColor: '#8B6914', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#E0EAF5] animate-pulse" />
            <div className="h-4 w-44 rounded bg-[#E0EAF5] animate-pulse" />
          </div>
          <div className="h-5 w-24 rounded-full bg-[#E0EAF5] animate-pulse" />
        </div>
        {/* Progress bar placeholder */}
        <div
          className="h-2 rounded-full mb-4 animate-pulse"
          style={{ background: 'var(--bg-base)' }}
        />
        {/* Badge placeholders */}
        <div className="flex gap-3 mb-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-6 w-28 rounded-full animate-pulse"
              style={{ background: '#F5F0E8' }}
            />
          ))}
        </div>
      </div>
    );
  }

  /* ---- Empty state ---- */
  if (material.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-5 text-center"
        style={{ borderColor: '#D1C7B7', background: 'var(--bg-surface)' }}
      >
        <CheckCircle2
          className="mx-auto mb-2"
          size={20}
          style={{ color: '#2D6A4F' }}
        />
        <p className="text-sm" style={{ color: '#6B5E4F' }}>
          No material variances detected for this period.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border-l-4 p-5"
      style={{ borderColor: borderColor, background: 'var(--bg-surface)' }}
    >
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: '#2C2416' }}>
          Variance Explanations
        </h3>

        {allExplained ? (
          <span
            className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full"
            style={{ background: '#E0EDE8', color: '#2D6A4F' }}
          >
            <CheckCircle2 size={12} />
            Complete
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full"
            style={{ background: '#F5E4DE', color: '#C44B2B' }}
          >
            <AlertCircle size={12} />
            Needs Attention
          </span>
        )}
      </div>

      {/* ---- Progress bar ---- */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color: '#6B5E4F' }}>
            {explained.length} of {material.length} material variance
            {material.length !== 1 ? 's' : ''} explained
          </span>
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: '#6B5E4F' }}
          >
            {Math.round(progressPct)}%
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--bg-base)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: '#2D6A4F',
            }}
          />
        </div>
      </div>

      {/* ---- Count badges ---- */}
      <div className="flex flex-wrap gap-3 mb-4">
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#E0EDE8', color: '#2D6A4F' }}
        >
          <CheckCircle2 size={12} />
          {explained.length} Explained
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#E0EAF5', color: '#3B6EA5' }}
        >
          <Sparkles size={12} />
          {aiDraftReady.length} AI Draft Ready
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#F5E4DE', color: '#C44B2B' }}
        >
          <AlertCircle size={12} />
          {unexplainedList.length} Unexplained
        </span>
      </div>

      {/* ---- Unexplained item list ---- */}
      {unexplainedList.length > 0 && (
        <div className="space-y-1.5">
          {unexplainedList.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between px-3 py-2 rounded-md text-sm"
              style={{ background: 'var(--bg-base)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle
                  size={14}
                  className="shrink-0"
                  style={{ color: '#C44B2B' }}
                />
                <span
                  className="truncate font-medium"
                  style={{ color: '#2C2416' }}
                >
                  {v.lineItemName ?? v.id}
                </span>
                {v.changePercent != null && (
                  <span
                    className="text-xs font-mono tabular-nums shrink-0"
                    style={{ color: '#6B5E4F' }}
                  >
                    {fmtPct(v.changePercent)}
                  </span>
                )}
              </div>
              <Link
                href={`/close/${sessionId}/variance`}
                className="inline-flex items-center gap-1 text-xs shrink-0 ml-3 hover:underline"
                style={{ color: '#3B6EA5' }}
              >
                Go to Variance
                <ExternalLink size={12} />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ---- All-explained success banner ---- */}
      {allExplained && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-md"
          style={{ background: '#E0EDE8', color: '#2D6A4F' }}
        >
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="text-sm">
            All material variances explained and attested
          </span>
        </div>
      )}
    </div>
  );
}
