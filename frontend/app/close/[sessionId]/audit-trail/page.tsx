'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState, useCallback } from 'react';
import { useAuditTrail } from '@/lib/queries/audit-trail';
import type { AuditEvent, AuditEventType } from '@/lib/types/audit-trail';
import { cn } from '@/lib/utils';
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  Filter,
  ArrowUpDown,
  History,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Lock,
  Unlock,
  MapPin,
  Upload,
  TrendingUp,
  Shield,
  User,
  FileDown,
} from 'lucide-react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';

// Event type labels and icons — colors are now CSS variable values for inline styles
const EVENT_TYPE_CONFIG: Record<
  AuditEventType,
  { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }
> = {
  close_state_change: { label: 'Close State Change', icon: History, color: 'var(--interactive-primary)' },
  je_created: { label: 'Journal Entry', icon: FileText, color: 'var(--interactive-primary)' },
  je_proposed: { label: 'Journal Entry', icon: FileText, color: 'var(--interactive-primary)' },
  je_approved: { label: 'Journal Entry', icon: CheckCircle, color: 'var(--status-success)' },
  je_posted: { label: 'Journal Entry', icon: CheckCircle, color: 'var(--status-success)' },
  je_rejected: { label: 'Journal Entry', icon: XCircle, color: 'var(--status-error)' },
  recon_completed: { label: 'Reconciliation', icon: CheckCircle, color: 'var(--status-success)' },
  recon_approved: { label: 'Reconciliation', icon: Shield, color: 'var(--interactive-primary)' },
  mapping_changed: { label: 'Mapping', icon: MapPin, color: 'var(--status-warning)' },
  evidence_uploaded: { label: 'Evidence', icon: Upload, color: 'var(--interactive-primary)' },
  variance_explained: { label: 'Variance', icon: TrendingUp, color: 'var(--status-warning)' },
  variance_approved: { label: 'Variance', icon: CheckCircle, color: 'var(--status-success)' },
  certification: { label: 'Certification', icon: Shield, color: 'var(--status-success)' },
  lock: { label: 'Lock', icon: Lock, color: 'var(--status-error)' },
  reopen: { label: 'Reopen', icon: Unlock, color: 'var(--status-warning)' },
};

const EVENT_TYPE_GROUPS: Record<string, AuditEventType[]> = {
  'Close State Change': ['close_state_change'],
  'Journal Entry': ['je_created', 'je_proposed', 'je_approved', 'je_posted', 'je_rejected'],
  'Reconciliation': ['recon_completed', 'recon_approved'],
  'Mapping': ['mapping_changed'],
  'Variance': ['variance_explained', 'variance_approved'],
  'Evidence': ['evidence_uploaded'],
  'Certification': ['certification'],
};

// Format timestamp: "Feb 4, 2:15 PM"
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day}, ${time}`;
}

// Format date for input: YYYY-MM-DD
function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

// Truncate hash: first 8 chars + "..."
function truncateHash(hash: string): string {
  return hash.length > 8 ? `${hash.slice(0, 8)}...` : hash;
}

// Render JSON state as readable key-value pairs
function renderState(state: Record<string, unknown> | null): React.ReactNode {
  if (!state || Object.keys(state).length === 0) {
    return (
      <span className="italic font-mono" style={{ color: 'var(--text-tertiary)' }}>
        N/A
      </span>
    );
  }
  return (
    <div className="space-y-1 font-mono">
      {Object.entries(state).map(([key, value]) => (
        <div key={key} className="text-sm">
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {key}:
          </span>{' '}
          <span style={{ color: 'var(--text-primary)' }}>
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Compute diff between before and after states
function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Array<{ key: string; before: unknown; after: unknown }> {
  if (!before && !after) return [];
  const allKeys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  const diff: Array<{ key: string; before: unknown; after: unknown }> = [];
  for (const key of allKeys) {
    const beforeVal = before?.[key];
    const afterVal = after?.[key];
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diff.push({ key, before: beforeVal, after: afterVal });
    }
  }
  return diff;
}

interface EventCardProps {
  event: AuditEvent;
  isExpanded: boolean;
  onToggle: () => void;
}

function EventCard({ event, isExpanded, onToggle }: EventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.eventType] ?? {
    icon: AlertCircle,
    color: 'var(--text-secondary)',
    label: event.eventType,
  };
  const Icon = config.icon;
  const diff = useMemo(
    () => computeDiff(event.beforeState, event.afterState),
    [event.beforeState, event.afterState]
  );

  return (
    <div
      className="border font-mono"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left transition-colors"
        style={{ borderRadius: 'var(--radius-lg)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5" style={{ color: config.color }}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {config.label}
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
                <div
                  className="text-sm font-medium mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {event.description}
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {event.userName}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                    Hash: {truncateHash(event.hash)}
                  </span>
                  {event.previousHash && (
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                      Prev: {truncateHash(event.previousHash)}
                    </span>
                  )}
                  <span
                    className="flex items-center gap-1"
                    style={{
                      color: event.chainValid
                        ? 'var(--status-success)'
                        : 'var(--status-error)',
                    }}
                  >
                    {event.chainValid ? (
                      <>
                        <Check className="w-3 h-3" />
                        Valid
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3" />
                        Invalid
                      </>
                    )}
                  </span>
                </div>
              </div>
              <div className="shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </div>
            </div>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div
          className="px-4 pb-4 pt-4 mt-2 space-y-4 border-t"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div>
            <h4
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Before State
            </h4>
            <div
              className="p-3"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {renderState(event.beforeState)}
            </div>
          </div>
          <div>
            <h4
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              After State
            </h4>
            <div
              className="p-3"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {renderState(event.afterState)}
            </div>
          </div>
          {diff.length > 0 && (
            <div>
              <h4
                className="text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Changes
              </h4>
              <div
                className="p-3 space-y-2 font-mono"
                style={{
                  backgroundColor: 'var(--bg-surface-sunken)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {diff.map((change) => (
                  <div key={change.key} className="text-sm">
                    <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {change.key}:
                    </span>
                    <div className="ml-4 mt-1">
                      <div className="line-through" style={{ color: 'var(--status-error)' }}>
                        {typeof change.before === 'object'
                          ? JSON.stringify(change.before, null, 2)
                          : String(change.before ?? 'null')}
                      </div>
                      <div style={{ color: 'var(--status-success)' }}>
                        {typeof change.after === 'object'
                          ? JSON.stringify(change.after, null, 2)
                          : String(change.after ?? 'null')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              Hash Chain
            </h4>
            <div
              className="p-3 space-y-1 text-xs font-mono"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Hash:</span>{' '}
                <span style={{ color: 'var(--text-primary)' }}>{event.hash}</span>
              </div>
              {event.previousHash && (
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Previous Hash:</span>{' '}
                  <span style={{ color: 'var(--text-primary)' }}>{event.previousHash}</span>
                </div>
              )}
              <div
                className="mt-2"
                style={{
                  color: event.chainValid
                    ? 'var(--status-success)'
                    : 'var(--status-error)',
                }}
              >
                Chain Status: {event.chainValid ? '✓ Valid' : '✗ Invalid'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditTrailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data, isLoading } = useAuditTrail(sessionId);
  const events = data?.events ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<Set<AuditEventType>>(new Set());
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Get unique users
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    events.forEach((e) => users.add(e.userName));
    return Array.from(users).sort();
  }, [events]);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Event type filter
    if (eventTypeFilter.size > 0) {
      filtered = filtered.filter((e) => eventTypeFilter.has(e.eventType));
    }

    // User filter
    if (userFilter) {
      filtered = filtered.filter((e) => e.userName === userFilter);
    }

    // Date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter((e) => new Date(e.timestamp) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      filtered = filtered.filter((e) => new Date(e.timestamp) <= toDate);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.description.toLowerCase().includes(query) ||
          e.userName.toLowerCase().includes(query) ||
          e.eventType.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

    return filtered;
  }, [events, eventTypeFilter, userFilter, dateFrom, dateTo, searchQuery, sortOrder]);

  // Hash chain integrity check
  const hashChainStatus = useMemo(() => {
    const invalidCount = events.filter((e) => !e.chainValid).length;
    const totalEvents = events.length;
    return {
      isValid: invalidCount === 0,
      invalidCount,
      totalEvents,
    };
  }, [events]);

  const toggleEventType = useCallback((type: AuditEventType) => {
    setEventTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-6 font-mono">
      <Breadcrumb items={[
        { label: 'Close', href: `/close/${sessionId}/dashboard` },
        { label: 'Audit Trail' },
      ]} />
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-display"
            style={{ color: 'var(--text-primary)' }}
          >
            Audit Trail
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Complete record of all actions — hash-chain verified
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const csvRows = [['Timestamp', 'Event Type', 'Description', 'User', 'Hash', 'Chain Valid']];
              filteredEvents.forEach((e) => csvRows.push([e.timestamp, e.eventType, e.description, e.userName, e.hash, String(e.chainValid)]));
              const csv = csvRows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `audit-trail-${sessionId}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-1.5 border text-sm transition-colors"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-md)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <FileDown className="w-4 h-4 inline mr-1" />
            Export CSV
          </button>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {events.length} events
          </span>
        </div>
      </div>

      {/* Hash Chain Status Banner — Shield badge */}
      <div
        className="border p-4 flex items-center gap-2"
        style={{
          borderRadius: 'var(--radius-lg)',
          backgroundColor: hashChainStatus.isValid
            ? 'var(--status-success-bg)'
            : 'var(--status-error-bg)',
          borderColor: hashChainStatus.isValid
            ? 'var(--status-success)'
            : 'var(--status-error)',
        }}
      >
        {hashChainStatus.isValid ? (
          <>
            <Shield
              className="w-5 h-5"
              style={{ color: 'var(--status-success)' }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--status-success)' }}
            >
              Chain Integrity: Verified ✓ ({hashChainStatus.totalEvents} events)
            </span>
          </>
        ) : (
          <>
            <Shield
              className="w-5 h-5"
              style={{ color: 'var(--status-error)' }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--status-error)' }}
            >
              Chain Integrity: BROKEN ({hashChainStatus.invalidCount} invalid event
              {hashChainStatus.invalidCount !== 1 ? 's' : ''})
            </span>
          </>
        )}
      </div>

      {/* Filters */}
      <div
        className="border p-4 space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Filter className="w-4 h-4" />
          Filters
        </div>

        {/* Event Type Filter */}
        <div>
          <label
            className="block text-xs mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Event Type
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(EVENT_TYPE_GROUPS).map(([groupLabel, types]) => (
              <div key={groupLabel} className="flex flex-wrap gap-2">
                {types.map((type) => {
                  const typeConfig = EVENT_TYPE_CONFIG[type];
                  const TypeIcon = typeConfig.icon;
                  const isSelected = eventTypeFilter.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleEventType(type)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors"
                      style={{
                        borderRadius: 'var(--radius-md)',
                        borderColor: isSelected
                          ? 'var(--interactive-primary)'
                          : 'var(--border-default)',
                        color: isSelected
                          ? 'var(--interactive-primary)'
                          : 'var(--text-secondary)',
                        backgroundColor: isSelected
                          ? 'var(--interactive-primary-hover)'
                          : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <TypeIcon className="w-3.5 h-3.5" />
                      {typeConfig.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* User Filter */}
        <div>
          <label
            className="block text-xs mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            User
          </label>
          <select
            value={userFilter || ''}
            onChange={(e) => setUserFilter(e.target.value || null)}
            className="w-full max-w-xs border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--bg-surface-sunken)',
              borderColor: 'var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">All Users</option>
            {uniqueUsers.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              className="block text-xs mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              From Date
            </label>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-surface-sunken)',
                  borderColor: 'var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
          <div>
            <label
              className="block text-xs mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              To Date
            </label>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'var(--bg-surface-sunken)',
                  borderColor: 'var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Search */}
        <div>
          <label
            className="block text-xs mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Search Description
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by description..."
              className="w-full border pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--bg-surface-sunken)',
                borderColor: 'var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Event List Header with Sort */}
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Showing {filteredEvents.length} of {events.length} events
        </div>
        <button
          type="button"
          onClick={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}
          className="flex items-center gap-2 px-3 py-1.5 border text-sm transition-colors"
          style={{
            borderColor: 'var(--border-default)',
            color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-md)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          <ArrowUpDown className="w-4 h-4" />
          {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
        </button>
      </div>

      {/* Event List */}
      {isLoading ? (
        <div
          className="text-center py-12"
          style={{ color: 'var(--text-secondary)' }}
        >
          Loading audit trail...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div
          className="text-center py-12"
          style={{ color: 'var(--text-secondary)' }}
        >
          No events found matching filters.
        </div>
      ) : (
        <div
          className="space-y-3 p-4"
          style={{
            backgroundColor: 'var(--bg-surface-sunken)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isExpanded={expandedId === event.id}
              onToggle={() => toggleExpanded(event.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
