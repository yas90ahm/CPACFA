'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { X, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { CloseIssue } from '@/lib/types/issues';

const severityOrder: CloseIssue['severity'][] = ['CRITICAL', 'BLOCKING', 'WARNING', 'INFO'];
const severityStyles = {
  CRITICAL: 'bg-status-red-dim text-status-red border-status-red/30',
  BLOCKING: 'bg-status-amber-dim text-status-amber border-status-amber/30',
  WARNING: 'bg-status-amber-dim text-status-amber border-status-amber/20',
  INFO: 'bg-status-blue-dim text-status-blue border-status-blue/20',
};
const severityIcons = {
  CRITICAL: AlertCircle,
  BLOCKING: AlertTriangle,
  WARNING: AlertTriangle,
  INFO: Info,
};

interface IssuePanelProps {
  issues: CloseIssue[];
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onOpenRequest?: () => void;
  categoryFilter?: string;
}

export function IssuePanel({ issues, sessionId, open, onClose, onOpenRequest, categoryFilter }: IssuePanelProps) {
  const grouped = severityOrder.map((sev) => ({
    severity: sev,
    items: issues.filter((i) => i.severity === sev && (!categoryFilter || i.category === categoryFilter)),
  })).filter((g) => g.items.length > 0);

  const blockingCritical = issues.filter((i) => i.severity === 'CRITICAL' || i.severity === 'BLOCKING').length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/20"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed top-14 right-0 z-50 w-[360px] h-[calc(100vh-56px)] bg-surface border-l border-border shadow-xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-medium text-primary">Issues</h2>
          <button type="button" onClick={onClose} className="p-2 text-text-secondary hover:text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {grouped.map(({ severity, items }) => {
            const Icon = severityIcons[severity];
            return (
              <div key={severity}>
                <div className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border mb-2', severityStyles[severity])}>
                  <Icon className="w-3.5 h-3.5" />
                  {severity}
                </div>
                <ul className="space-y-2">
                  {items.map((issue) => (
                    <li key={issue.id} className="p-3 rounded-input bg-elevated border border-border-light">
                      <div className="font-medium text-sm text-primary">{issue.title}</div>
                      <div className="text-xs text-text-secondary mt-1">{issue.description}</div>
                      <Link
                        href={issue.navigateTo.replace('[sessionId]', sessionId)}
                        className="mt-2 inline-block text-xs text-accent hover:underline"
                      >
                        Go to →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </aside>
      <button
        type="button"
        onClick={onOpenRequest}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-surface border border-border shadow-lg flex items-center justify-center text-primary hover:bg-hover"
        aria-label="Open issues panel"
      >
        <AlertCircle className="w-5 h-5" />
        {blockingCritical > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-status-red text-white text-xs flex items-center justify-center">
            {blockingCritical}
          </span>
        )}
      </button>
    </>
  );
}
