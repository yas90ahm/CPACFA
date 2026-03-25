'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function ModuleBanner({ sessionId }: { sessionId: string }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 rounded-[var(--radius-md)] text-xs"
      style={{
        backgroundColor: 'var(--status-info-bg)',
        borderLeft: '3px solid var(--interactive-primary)',
        color: 'var(--text-secondary)',
      }}
    >
      <span>
        This module generates adjusting journal entries &rarr; they appear in{' '}
        <Link
          href={`/close/${sessionId}/adjustments`}
          className="font-medium underline"
          style={{ color: 'var(--interactive-primary)' }}
        >
          Adjustments
        </Link>{' '}
        for your review and approval.
      </span>
      <Link
        href={`/close/${sessionId}/adjustments`}
        className="flex items-center gap-1 font-medium flex-shrink-0 ml-4"
        style={{ color: 'var(--interactive-primary)' }}
      >
        View Adjustments <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
