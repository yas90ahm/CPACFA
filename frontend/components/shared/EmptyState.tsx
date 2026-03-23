'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateVariant = 'first-time' | 'no-results' | 'prerequisite-missing';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Action button label */
  actionLabel?: string;
  onAction?: () => void;
  /** @deprecated Use actionLabel + onAction. Legacy ctaLabel/ctaHref still supported. */
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  variant?: EmptyStateVariant;
  className?: string;
  /** When true, show a loading spinner instead of the normal empty state */
  loading?: boolean;
  /** Message shown below the spinner when loading is true */
  loadingMessage?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  ctaLabel,
  ctaHref,
  onCtaClick,
  variant = 'first-time',
  className,
  loading = false,
  loadingMessage,
}: EmptyStateProps) {
  /* ── Loading variant ── */
  if (loading) {
    return (
      <div
        className={cn('rounded-lg p-12 text-center flex flex-col items-center justify-center', className)}
        style={{
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <Loader2
          className="w-10 h-10 animate-spin mb-4"
          style={{ color: 'var(--status-info)' }}
        />
        {loadingMessage && (
          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary)', maxWidth: 400 }}
          >
            {loadingMessage}
          </p>
        )}
      </div>
    );
  }

  /* ── Normal empty state ── */
  // Resolve CTA: new props take precedence over legacy
  const resolvedLabel = actionLabel ?? ctaLabel;
  const resolvedAction = onAction ?? onCtaClick;

  const isPrereq = variant === 'prerequisite-missing';

  return (
    <div
      className={cn('rounded-lg p-12 text-center', className)}
      style={{
        border: '1px solid var(--border-default)',
        backgroundColor: isPrereq ? 'var(--status-warning-bg)' : 'var(--bg-surface)',
        borderColor: isPrereq ? 'var(--status-warning-border)' : 'var(--border-default)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {Icon && (
        <div className="mx-auto mb-4 w-12 h-12" style={{ color: isPrereq ? 'var(--status-warning)' : 'var(--text-tertiary)' }}>
          <Icon className="w-12 h-12" />
        </div>
      )}
      <p
        className="text-xl font-semibold mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </p>
      {description && (
        <p
          className="text-sm mx-auto mb-0"
          style={{
            color: 'var(--text-secondary)',
            maxWidth: 400,
          }}
        >
          {description}
        </p>
      )}

      {/* Action button */}
      {resolvedLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 mt-5 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors"
          style={{
            backgroundColor: variant === 'first-time' ? 'var(--interactive-primary)' : undefined,
            border: variant !== 'first-time' ? '1px solid var(--border-default)' : undefined,
            color: variant !== 'first-time' ? 'var(--text-primary)' : 'white',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {resolvedLabel}
        </Link>
      )}
      {resolvedLabel && resolvedAction && !ctaHref && (
        <button
          type="button"
          onClick={resolvedAction}
          className="inline-flex items-center gap-2 mt-5 px-4 py-2 text-sm font-medium rounded-md transition-colors"
          style={{
            backgroundColor: variant === 'first-time' ? 'var(--interactive-primary)' : 'var(--bg-surface)',
            border: variant !== 'first-time' ? '1px solid var(--border-default)' : undefined,
            color: variant === 'first-time' ? 'white' : 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {resolvedLabel}
        </button>
      )}
    </div>
  );
}
