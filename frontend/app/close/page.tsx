'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessions } from '@/lib/queries/sessions';
import { useEntities } from '@/lib/queries/entities';
import { useCreateSession } from '@/lib/queries/close-session';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { TopBar } from '@/components/shell/TopBar';
import { useAuth } from '@/lib/auth';
import { cn, getUserDisplay } from '@/lib/utils';
import type { SessionListItem } from '@/lib/types/session-list';
import type { CloseState } from '@/lib/types/close-session';
import { Lock, Plus, Calendar } from 'lucide-react';

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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <StatusBadge variant={c.variant} label={c.label} />
      {state === 'LOCKED' && <Lock style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} />}
    </span>
  );
}

function formatStarted(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const HEADER_COLUMNS = [
  { key: 'period', label: 'Period', width: 150, align: 'left' as const },
  { key: 'status', label: 'Status', width: 140, align: 'left' as const },
  { key: 'started', label: 'Started', width: 120, align: 'left' as const },
  { key: 'duration', label: 'Duration', width: 80, align: 'left' as const },
  { key: 'preparer', label: 'Preparer', width: 120, align: 'left' as const },
  { key: 'reviewer', label: 'Reviewer', width: 120, align: 'left' as const },
  { key: 'gates', label: 'Gates', width: 96, align: 'left' as const },
  { key: 'issues', label: 'Issues', width: 64, align: 'center' as const },
];

export default function ClosePage() {
  const router = useRouter();
  const { user } = useAuth();
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

  // Shared input styles for the slide-over form
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    backgroundColor: 'var(--bg-surface-sunken)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    padding: '0 12px',
    fontSize: 14,
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  };

  return (
    <>
      <TopBar
        entityName={entityName}
        showPeriod={false}
        userName={getUserDisplay(user).displayName}
        userInitials={getUserDisplay(user).initials}
      />
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--bg-base)',
          paddingTop: 56,
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
          {/* Page Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 32,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Close Periods
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  marginTop: 4,
                }}
              >
                {entityName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewSessionOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 40,
                padding: '0 16px',
                backgroundColor: 'var(--interactive-primary)',
                color: 'white',
                fontSize: 14,
                fontWeight: 500,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'background-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--interactive-primary-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--interactive-primary)';
              }}
            >
              <Plus style={{ width: 16, height: 16 }} />
              New Close Period
            </button>
          </div>

          {/* Content */}
          {sortedSessions.length === 0 ? (
            <EmptyState
              icon={Calendar}
              variant="first-time"
              title="No close periods yet"
              description="Start your first month-end close"
              actionLabel="New Close Period"
              onAction={() => setNewSessionOpen(true)}
            />
          ) : (
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      height: 44,
                      backgroundColor: 'var(--bg-surface-sunken)',
                      borderBottom: '2px solid var(--border-table-header)',
                    }}
                  >
                    {HEADER_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          textAlign: col.align,
                          padding: '0 16px',
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--text-secondary)',
                          width: col.width,
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((s, idx) => {
                    const historical = isHistorical(s);
                    const isActiveRow = mostRecentInProgress?.id === s.id && s.state === 'IN_PROGRESS';
                    const isCertified = s.state === 'CERTIFIED';
                    const isAlt = idx % 2 === 1;

                    let rowBg = isAlt ? 'var(--bg-table-row-alt)' : 'var(--bg-surface)';
                    if (isCertified) {
                      rowBg = 'var(--bg-certified)';
                    }

                    return (
                      <tr
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/close/${s.id}/dashboard`)}
                        onKeyDown={(e) => e.key === 'Enter' && router.push(`/close/${s.id}/dashboard`)}
                        style={{
                          height: 40,
                          backgroundColor: rowBg,
                          borderBottom: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          opacity: historical ? 0.85 : 1,
                          borderLeft: isActiveRow ? '4px solid var(--interactive-primary)' : '4px solid transparent',
                          transition: 'background-color var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-table-row-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = rowBg;
                        }}
                      >
                        <td
                          style={{
                            padding: '0 16px',
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {s.periodLabel}
                        </td>
                        <td style={{ padding: '0 16px' }}>
                          {stateBadge(s.state)}
                        </td>
                        <td
                          style={{
                            padding: '0 16px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {formatStarted(s.startedAt)}
                        </td>
                        <td
                          style={{
                            padding: '0 16px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {s.duration ?? '\u2014'}
                        </td>
                        <td
                          style={{
                            padding: '0 16px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {s.preparer ?? '\u2014'}
                        </td>
                        <td
                          style={{
                            padding: '0 16px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {s.reviewer ?? '\u2014'}
                        </td>
                        <td
                          style={{
                            padding: '0 16px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {s.gatesSummary === '9/9' ? 'All met \u2713' : s.gatesSummary}
                        </td>
                        <td style={{ padding: '0 16px', textAlign: 'center' }}>
                          {s.blockingIssues > 0 ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--status-warning-bg)',
                                color: 'var(--status-warning)',
                                fontSize: 12,
                              }}
                            >
                              {s.blockingIssues}
                            </span>
                          ) : (
                            '\u2014'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* New Session SlideOver */}
        <SlideOverPanel
          open={newSessionOpen}
          onClose={() => setNewSessionOpen(false)}
          title="New Close Session"
          footer={
            <>
              <button
                type="button"
                onClick={() => setNewSessionOpen(false)}
                style={{
                  padding: '0 16px',
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={!canCreate}
                style={{
                  padding: '0 16px',
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  backgroundColor: canCreate ? 'var(--interactive-primary)' : 'var(--bg-surface-sunken)',
                  color: canCreate ? 'white' : 'var(--text-tertiary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: canCreate ? 'pointer' : 'not-allowed',
                }}
              >
                {createSession.isPending ? 'Creating...' : 'Create Session'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Entity selector */}
            <div>
              <label style={labelStyle}>Entity</label>
              {entitiesLoading ? (
                <div
                  style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Loading entities...
                </div>
              ) : entities.length === 0 ? (
                <div
                  style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  No entities found. Create one in Settings first.
                </div>
              ) : (
                <select
                  value={entitySelect}
                  onChange={(e) => setEntitySelect(e.target.value)}
                  style={inputStyle}
                >
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Period date pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Period Start Date</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Period End Date</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Error message */}
            {createSession.isError && (
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--status-error)',
                  margin: 0,
                }}
              >
                Failed to create session. Try again.
              </p>
            )}
          </div>
        </SlideOverPanel>
      </div>
    </>
  );
}
