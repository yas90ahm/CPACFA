'use client';

/**
 * PageAIInsight — Compact inline AI insight badge.
 *
 * A single-line strip (32-36px) showing a page-specific AI observation.
 * Purely informational — no action buttons.
 * Agency encoding: ink-blue (#3B6EA5) = Sabit/AI acted.
 */

import { Sparkles } from 'lucide-react';
import Link from 'next/link';

interface PageAIInsightProps {
  message: string;
  accentColor?: string;
  linkLabel?: string;
  linkHref?: string;
}

export default function PageAIInsight({
  message,
  accentColor = '#3B6EA5',
  linkLabel,
  linkHref,
}: PageAIInsightProps) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5"
      style={{
        borderColor: accentColor,
        backgroundColor: '#E0EAF5',
      }}
    >
      <Sparkles
        size={14}
        style={{ color: accentColor, flexShrink: 0 }}
        aria-hidden="true"
      />

      <span
        className="text-xs font-medium leading-none"
        style={{ color: accentColor }}
      >
        {message}
      </span>

      {linkLabel && linkHref && (
        <Link
          href={linkHref}
          className="ml-auto text-xs font-medium no-underline hover:underline"
          style={{ color: accentColor }}
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
