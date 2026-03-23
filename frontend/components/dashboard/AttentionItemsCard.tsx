'use client';

import Link from 'next/link';
import type { CloseIssue } from '@/lib/types/issues';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface AttentionItemsCardProps {
  issues: CloseIssue[];
  sessionId: string;
}

/* ── Card shell ───────────────────────────────────────────────────────────── */

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-lg)]"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function AttentionItemsCard({ issues, sessionId }: AttentionItemsCardProps) {
  const activeIssues = issues.filter(
    (i) => i.status !== 'RESOLVED' && i.severity !== 'INFO',
  );

  return (
    <CardShell>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h2
            className="font-semibold text-base"
            style={{ color: 'var(--text-primary)' }}
          >
            Needs Your Attention
          </h2>
          {activeIssues.length > 0 && (
            <span
              className="inline-flex items-center justify-center text-xs font-bold text-white rounded-full"
              style={{
                width: 20,
                height: 20,
                backgroundColor: 'var(--status-error)',
                fontSize: 11,
              }}
            >
              {activeIssues.length}
            </span>
          )}
        </div>
      </div>
      <div className="px-6 pb-5">
        {activeIssues.length === 0 ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)]"
            style={{
              backgroundColor: 'var(--status-success-bg)',
              color: 'var(--status-success)',
            }}
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">
              All clear -- no items need attention
            </span>
          </div>
        ) : (
          <ul className="space-y-1">
            {activeIssues.map((issue, i) => (
              <li key={issue.id ?? i}>
                <Link
                  href={issue.navigateTo ?? `/close/${sessionId}/dashboard`}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-[var(--radius-md)] transition-colors hover:bg-[var(--interactive-ghost-hover)] group"
                >
                  <AlertTriangle
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    style={{
                      color:
                        issue.severity === 'CRITICAL' || issue.severity === 'BLOCKING'
                          ? 'var(--status-error)'
                          : 'var(--status-warning)',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {issue.title ?? issue.description ?? issue.category}
                    </p>
                    {issue.description && issue.title && (
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {issue.description}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-xs font-medium flex items-center gap-1 flex-shrink-0 mt-0.5"
                    style={{ color: 'var(--text-link)' }}
                  >
                    Resolve <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CardShell>
  );
}
