'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Check, Pencil, X, RefreshCw, Loader2, AlertCircle } from 'lucide-react';

export type AISuggestionType = 'classification' | 'justification' | 'shadow-audit' | 'variance-draft' | 'advisor';

export interface AISuggestionCardProps {
  /** New spec-compliant props */
  type?: AISuggestionType;
  suggestion?: string;
  confidence?: number;
  reasoning?: string;
  gaapCitation?: string;
  modelName?: string;
  accepted?: boolean;
  onAccept?: () => void;
  onModify?: () => void;
  onReject?: () => void;
  onRegenerate?: () => void;
  loading?: boolean;
  error?: string;
  /** Legacy wrapper props — backward compat */
  title?: ReactNode;
  advisoryLabel?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 90
    ? 'var(--ai-primary)'
    : value >= 70
      ? 'var(--status-warning)'
      : 'var(--status-error)';

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-1.5 rounded-full overflow-hidden"
        style={{ width: 120, backgroundColor: 'var(--border-default)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="text-xs font-semibold"
        style={{ color }}
      >
        {value}%
      </span>
      {value < 70 && (
        <span
          className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded"
          style={{ color: 'var(--status-error)', backgroundColor: 'var(--status-error-bg)' }}
        >
          LOW CONFIDENCE
        </span>
      )}
    </div>
  );
}

export function AISuggestionCard(p: AISuggestionCardProps) {
  const [editMode, setEditMode] = useState(false);
  const isLegacyMode = p.children != null;

  // Legacy mode: render as a wrapper container
  if (isLegacyMode) {
    return (
      <div
        className={cn('rounded-lg p-4', p.className)}
        style={{
          border: '1.5px dashed var(--ai-border)',
          backgroundColor: 'var(--ai-bg)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-ai-label)' }}>
            {p.title ?? (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                AI Suggested
              </>
            )}
          </span>
          {p.advisoryLabel && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.advisoryLabel}</span>
          )}
        </div>
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{p.children}</div>
        {p.actions && <div className="mt-3 flex flex-wrap gap-2">{p.actions}</div>}
      </div>
    );
  }

  // New mode: full AI suggestion card per spec
  if (p.loading) {
    return (
      <div
        className={cn('rounded-lg p-4', p.className)}
        style={{
          border: '1.5px dashed var(--ai-border)',
          backgroundColor: 'var(--ai-bg)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--ai-primary)' }} />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Generating...</span>
        </div>
        <div className="mt-3 space-y-2">
          {[80, 100, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded animate-pulse"
              style={{ width: `${w}%`, backgroundColor: 'var(--ai-border)' }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (p.error) {
    return (
      <div
        className={cn('rounded-lg p-4', p.className)}
        style={{
          border: '1.5px dashed var(--ai-border)',
          backgroundColor: 'var(--ai-bg)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--status-error)' }}>Unable to generate suggestion</span>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>{p.error || 'Try again or enter manually.'}</p>
        {p.onRegenerate && (
          <button
            type="button"
            onClick={p.onRegenerate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md"
            style={{
              color: 'var(--interactive-primary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // Accepted state
  if (p.accepted) {
    return (
      <div
        className={cn('rounded-lg p-4', p.className)}
        style={{
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] px-2 py-0.5 rounded"
            style={{ color: 'var(--status-success)', backgroundColor: 'var(--status-success-bg)' }}
          >
            <Check className="w-3 h-3" />
            Accepted
          </span>
          <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>(originally AI-suggested)</span>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{p.suggestion}</p>
        {p.gaapCitation && (
          <p className="text-xs mt-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{p.gaapCitation}</p>
        )}
        {p.onModify && (
          <button
            type="button"
            onClick={() => { setEditMode(true); p.onModify?.(); }}
            className="mt-2 text-sm font-medium"
            style={{ color: 'var(--text-link)' }}
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  // Default: pending decision
  return (
    <div
      className={cn('rounded-lg p-4', p.className)}
      style={{
        border: '1.5px dashed var(--ai-border)',
        backgroundColor: 'var(--ai-bg)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span
          className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] px-2 py-1 rounded"
          style={{ color: 'var(--ai-badge-text)', backgroundColor: 'var(--ai-badge-bg)' }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Suggested
        </span>
        {p.modelName && (
          <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>{p.modelName}</span>
        )}
      </div>

      {/* Confidence */}
      {p.confidence != null && (
        <div className="mb-3">
          <ConfidenceBar value={p.confidence} />
        </div>
      )}

      {/* Suggestion text */}
      {p.suggestion && (
        <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{p.suggestion}</p>
      )}

      {/* Reasoning */}
      {p.reasoning && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{p.reasoning}</p>
      )}

      {/* GAAP citation */}
      {p.gaapCitation && (
        <p className="text-xs mb-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{p.gaapCitation}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        {p.onAccept && (
          <button
            type="button"
            onClick={p.onAccept}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors"
            style={{ backgroundColor: 'var(--interactive-primary)' }}
          >
            <Check className="w-3.5 h-3.5" />
            Accept
          </button>
        )}
        {p.onModify && (
          <button
            type="button"
            onClick={p.onModify}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            style={{
              color: 'var(--interactive-primary)',
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--interactive-secondary)',
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Modify
          </button>
        )}
        {p.onReject && (
          <button
            type="button"
            onClick={p.onReject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            style={{ color: 'var(--interactive-destructive)' }}
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        )}
        {p.onRegenerate && (
          <button
            type="button"
            onClick={p.onRegenerate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ml-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>
        )}
      </div>
    </div>
  );
}
