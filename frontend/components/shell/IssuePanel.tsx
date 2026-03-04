'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { X, AlertCircle, AlertTriangle, Info, Plus } from 'lucide-react';
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

const ISSUE_CATEGORIES = [
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'posting', label: 'Posting' },
  { value: 'classification', label: 'Classification' },
  { value: 'intake', label: 'Intake' },
  { value: 'policy', label: 'Policy' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'export_blocker', label: 'Export Blocker' },
] as const;

const ISSUE_SEVERITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'med', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

interface IssuePanelProps {
  issues: CloseIssue[];
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onOpenRequest?: () => void;
  categoryFilter?: string;
}

export function IssuePanel({ issues, sessionId, open, onClose, onOpenRequest, categoryFilter }: IssuePanelProps) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('reconciliation');
  const [newSeverity, setNewSeverity] = useState('high');
  const [createError, setCreateError] = useState<string | null>(null);

  const createIssueMutation = useMutation({
    mutationFn: (body: { closeSessionId: string; title: string; description?: string; category: string; severity: string }) =>
      apiFetch('/api/close/issues', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', sessionId] });
      setShowCreateForm(false);
      setNewTitle('');
      setNewDescription('');
      setNewCategory('reconciliation');
      setNewSeverity('high');
      setCreateError(null);
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create issue');
    },
  });

  const handleCreateIssue = () => {
    if (!newTitle.trim()) return;
    setCreateError(null);
    createIssueMutation.mutate({
      closeSessionId: sessionId,
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      category: newCategory,
      severity: newSeverity,
    });
  };

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
          'fixed top-14 right-0 z-50 w-[360px] h-[calc(100vh-56px)] bg-surface border-l border-border shadow-xl transition-transform flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-medium text-primary">Issues</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="p-1.5 rounded-input text-text-secondary hover:text-primary hover:bg-hover"
              title="Flag new issue"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button type="button" onClick={onClose} className="p-2 text-text-secondary hover:text-primary">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showCreateForm && (
          <div className="p-4 border-b border-border space-y-3 bg-surface-alt">
            <div className="text-sm font-medium text-primary">Flag New Issue</div>
            <input
              type="text"
              placeholder="Issue title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 rounded-input border border-border bg-input text-sm text-primary"
            />
            <textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-1.5 rounded-input border border-border bg-input text-sm text-primary resize-none"
            />
            <div className="flex gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-input border border-border bg-input text-sm"
              >
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-input border border-border bg-input text-sm"
              >
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            {createError && <p className="text-xs text-status-red">{createError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setCreateError(null); }}
                className="px-3 py-1.5 rounded-input border border-border text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateIssue}
                disabled={!newTitle.trim() || createIssueMutation.isPending}
                className="px-3 py-1.5 rounded-input bg-accent text-white text-xs font-medium disabled:opacity-50"
              >
                {createIssueMutation.isPending ? 'Creating...' : 'Create Issue'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {grouped.length === 0 && !showCreateForm && (
            <p className="text-sm text-text-secondary text-center py-8">No issues detected</p>
          )}
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
