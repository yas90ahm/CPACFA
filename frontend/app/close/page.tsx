'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessions } from '@/lib/queries/sessions';
import { useEntities } from '@/lib/queries/entities';
import { useCreateSession } from '@/lib/queries/close-session';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { TopBar } from '@/components/shell/TopBar';
import { useAuth } from '@/lib/auth';
import { getPersona } from '@/lib/permissions';
import { cn, getUserDisplay } from '@/lib/utils';
import { FundControllerDashboard } from '@/components/dashboards/FundControllerDashboard';
import type { SessionListItem } from '@/lib/types/session-list';
import type { CloseState } from '@/lib/types/close-session';
import { Lock, Plus } from 'lucide-react';

function stateBadge(state: CloseState) {
  const map: Record<CloseState, { variant: 'success' | 'warning' | 'error' | 'info' | 'neutral'; label: string }> = {
    OPEN: { variant: 'neutral', label: 'OPEN' },
    IN_PROGRESS: { variant: 'info', label: 'IN PROGRESS' },
    UNDER_REVIEW: { variant: 'warning', label: 'UNDER REVIEW' },
    CERTIFIED: { variant: 'success', label: 'CERTIFIED' },
    LOCKED: { variant: 'neutral', label: 'LOCKED' },
  };
  const c = map[state];
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge variant={c.variant} label={c.label} />
      {state === 'LOCKED' && <Lock className="w-3 h-3 text-text-muted" />}
    </span>
  );
}

function formatStarted(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClosePage() {
  const router = useRouter();
  const { user } = useAuth();
  const persona = getPersona(user?.role ?? 'controller');

  // Fund controller gets multi-entity overview dashboard
  if (persona === 'fund_controller') {
    return (
      <>
        <TopBar
          entityName={getUserDisplay(user).displayName}
          showPeriod={false}
          userName={getUserDisplay(user).displayName}
          userInitials={getUserDisplay(user).initials}
        />
        <div className="min-h-screen bg-primary pt-14 p-6">
          <FundControllerDashboard />
        </div>
      </>
    );
  }
  const { data: entities = [], isLoading: entitiesLoading } = useEntities();
  const entitiesReady = !entitiesLoading && entities.length > 0;
  const entityId = entitiesReady ? entities[0].id : null;
  const entityName = entitiesReady ? entities[0].name : 'My Company';
  const { data: sessions = [] } = useSessions(entityId);
  const createSession = useCreateSession();
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [entitySelect, setEntitySelect] = useState('');
  // Default to prior month (controllers always close last month)
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (entities.length > 0 && !entitySelect) {
      setEntitySelect(entities[0].id);
    }
  }, [entities, entitySelect]);

  const sortedSessions = [...sessions].sort((a, b) => {
    return new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime();
  });

  const handleCreateSession = async () => {
    if (!entitySelect || !periodStart || !periodEnd) return;
    setNewSessionOpen(false);
    try {
      const res = await createSession.mutateAsync({
        entityId: entitySelect,
        periodStart,
        periodEnd,
      });
      const id = (res as { id?: string }).id ?? (res as { closeSessionId?: string }).closeSessionId;
      if (id) router.push(`/close/${id}/dashboard?created=1`);
    } catch {
      // Error shown via mutation state if needed
    }
  };

  const isHistorical = (s: SessionListItem) => s.state === 'CERTIFIED' || s.state === 'LOCKED';
  const mostRecentInProgress = sortedSessions.find((s) => s.state === 'IN_PROGRESS');

  const canCreate = !!entitySelect && !!periodStart && !!periodEnd && !createSession.isPending;

  return (
    <>
      <TopBar
        entityName={entityName}
        showPeriod={false}
        userName={getUserDisplay(user).displayName}
        userInitials={getUserDisplay(user).initials}
      />
      <div className="min-h-screen bg-primary pt-14">
      <div className="max-w-5xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display text-primary">Month-End Close</h1>
            <p className="text-text-secondary text-sm mt-0.5">{entityName}</p>
          </div>
          <button
            type="button"
            onClick={() => setNewSessionOpen(true)}
            className="px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Close Session
          </button>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="bg-surface border border-border rounded-card p-12 text-center">
            <p className="text-lg font-medium text-primary mb-2">No close sessions yet</p>
            <p className="text-text-secondary text-sm mb-6 max-w-md mx-auto">
              Start your first month-end close by creating a session and uploading your general ledger.
            </p>
            <button
              type="button"
              onClick={() => setNewSessionOpen(true)}
              className="px-6 py-2 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Close Session
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt">
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-[150px]">Period</th>
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-[120px]">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-[120px]">Started</th>
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-20">Duration</th>
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-[120px]">Preparer</th>
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-[120px]">Reviewer</th>
                  <th className="text-left py-3 px-4 font-medium text-text-secondary w-24">Gates</th>
                  <th className="text-center py-3 px-4 font-medium text-text-secondary w-16">Issues</th>
                </tr>
              </thead>
              <tbody>
                {sortedSessions.map((s) => (
                  <tr
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/close/${s.id}/dashboard`)}
                    onKeyDown={(e) => e.key === 'Enter' && router.push(`/close/${s.id}/dashboard`)}
                    className={cn(
                      'border-b border-border-light hover:bg-hover cursor-pointer',
                      isHistorical(s) && 'opacity-85',
                      mostRecentInProgress?.id === s.id && s.state === 'IN_PROGRESS' && 'border-l-4 border-l-accent'
                    )}
                    style={mostRecentInProgress?.id === s.id && s.state === 'IN_PROGRESS' ? { borderLeftWidth: '4px' } : undefined}
                  >
                    <td className="py-3 px-4 font-medium text-primary">{s.periodLabel}</td>
                    <td className="py-3 px-4">{stateBadge(s.state)}</td>
                    <td className="py-3 px-4 text-text-secondary">{formatStarted(s.startedAt)}</td>
                    <td className="py-3 px-4 text-text-secondary">{s.duration ?? '—'}</td>
                    <td className="py-3 px-4 text-text-secondary">{s.preparer ?? '—'}</td>
                    <td className="py-3 px-4 text-text-secondary">{s.reviewer ?? '—'}</td>
                    <td className="py-3 px-4 text-text-secondary">
                      {s.gatesSummary === '9/9' ? 'All met ✓' : s.gatesSummary}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {s.blockingIssues > 0 ? (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-status-amber-dim text-status-amber text-xs">
                          {s.blockingIssues}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SlideOverPanel
        open={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        title="New Close Session"
        footer={
          <>
            <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setNewSessionOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={cn(
                'px-4 py-2 rounded-input text-sm font-medium',
                canCreate ? 'bg-accent text-white' : 'bg-surface-alt text-text-muted cursor-not-allowed'
              )}
              onClick={handleCreateSession}
              disabled={!canCreate}
            >
              {createSession.isPending ? 'Creating...' : 'Create Session'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Entity</label>
            {entitiesLoading ? (
              <div className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-text-muted">
                Loading entities...
              </div>
            ) : entities.length === 0 ? (
              <div className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm text-text-muted">
                No entities found. Create one in Settings first.
              </div>
            ) : (
              <select
                value={entitySelect}
                onChange={(e) => setEntitySelect(e.target.value)}
                className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm"
              >
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Period Start Date</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Period End Date</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm" />
            </div>
          </div>
          {createSession.isError && (
            <p className="text-sm text-status-red">Failed to create session. Try again.</p>
          )}
        </div>
      </SlideOverPanel>
    </div>
    </>
  );
}
