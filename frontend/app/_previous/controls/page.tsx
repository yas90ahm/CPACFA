'use client';

import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Paperclip,
  User,
  CalendarClock,
  FileWarning,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { useCloseSession } from '@/lib/queries/close-session';
import {
  useControls,
  useControlAssertions,
  useControlEvidence,
  type CloseControl,
  type ControlEvidenceRow,
} from '@/lib/queries/data-quality';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { EvidenceAttachment, type EvidenceFile } from '@/components/shared/EvidenceAttachment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ControlStatus = 'passed' | 'failed' | 'not-tested';

function deriveControlStatus(
  control: CloseControl,
  evidence: ControlEvidenceRow[],
): ControlStatus {
  const linked = evidence.filter((e) => e.controlId === control.id);
  if (linked.length === 0) return 'not-tested';
  // Simple heuristic: if evidence exists, consider passed.
  // In a real implementation the backend would provide a pass/fail flag.
  return 'passed';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Assertions list for an expanded control */
function AssertionsList({ controlId }: { controlId: string }) {
  const { data: assertions = [], isLoading } = useControlAssertions(controlId);

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-6 rounded"
            style={{ background: 'var(--bg-surface-sunken)' }}
          />
        ))}
      </div>
    );
  }

  if (assertions.length === 0) {
    return (
      <p className="text-xs py-1" style={{ color: 'var(--text-tertiary)' }}>
        No assertions defined for this control.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p
        className="text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Assertions
      </p>
      {assertions.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 py-1.5 px-3 rounded-md text-xs"
          style={{
            background: 'var(--bg-surface-sunken)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ color: 'var(--text-primary)' }}>{a.assertionLabel}</span>
          {a.riskCategory && (
            <StatusBadge
              status="pending"
              label={a.riskCategory}
              size="sm"
              showIcon={false}
              className="ml-auto"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Evidence section for an expanded control */
function EvidenceSection({
  controlId,
  evidence,
  readOnly,
}: {
  controlId: string;
  evidence: ControlEvidenceRow[];
  readOnly: boolean;
}) {
  const controlEvidence = evidence.filter((e) => e.controlId === controlId);

  // Map ControlEvidenceRow to EvidenceFile shape for display purposes.
  // In a real implementation these would be fetched from an evidence endpoint.
  const files: EvidenceFile[] = controlEvidence.map((e) => ({
    id: e.id,
    fileName: `${e.evidenceType}-${e.evidenceId.slice(0, 8)}`,
    fileSize: 0,
    mimeType: 'application/pdf',
    hash: e.evidenceId,
    uploadedBy: '',
    uploadedAt: e.createdAt,
  }));

  if (controlEvidence.length === 0 && readOnly) {
    return (
      <p className="text-xs py-1" style={{ color: 'var(--text-tertiary)' }}>
        No evidence linked for this period.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p
        className="text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Evidence ({controlEvidence.length})
      </p>
      <EvidenceAttachment
        attachments={files}
        onUpload={() => {
          /* TODO: wire upload endpoint */
        }}
        readOnly={readOnly}
      />
    </div>
  );
}

/** Remediation plan for failed controls */
function RemediationPlan({ readOnly }: { readOnly: boolean }) {
  const [plan, setPlan] = useState('');

  return (
    <div className="space-y-1.5">
      <p
        className="text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Remediation Plan
      </p>
      <textarea
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        disabled={readOnly}
        rows={3}
        placeholder={
          readOnly
            ? 'No remediation plan provided.'
            : 'Describe the remediation steps for this failed control...'
        }
        className="w-full rounded-md px-3 py-2 text-sm resize-none focus:outline-none"
        style={{
          background: 'var(--bg-surface-sunken)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control Card
// ---------------------------------------------------------------------------

function ControlCard({
  control,
  status,
  evidenceCount,
  evidence,
  readOnly,
  isExpanded,
  onToggle,
}: {
  control: CloseControl;
  status: ControlStatus;
  evidenceCount: number;
  evidence: ControlEvidenceRow[];
  readOnly: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusToBadge = {
    passed: 'complete' as const,
    failed: 'failed' as const,
    'not-tested': 'not-started' as const,
  };

  const borderColor =
    status === 'failed'
      ? 'var(--status-error)'
      : status === 'passed'
        ? 'var(--status-success)'
        : 'var(--border-default)';

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--border-default)',
        borderLeftWidth: '3px',
        borderLeftColor: borderColor,
      }}
    >
      {/* Header row — clickable to expand */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left transition-opacity hover:opacity-90"
        aria-expanded={isExpanded}
      >
        {/* Status icon */}
        <StatusBadge status={statusToBadge[status]} showLabel={false} size="sm" />

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {control.name}
          </p>
          {control.description && (
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              {control.description}
            </p>
          )}
        </div>

        {/* Meta badges */}
        <div className="flex items-center gap-3 shrink-0">
          {control.owner && (
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <User className="w-3 h-3" />
              {control.owner}
            </span>
          )}
          {control.frequency && (
            <span
              className="inline-flex items-center gap-1 text-xs uppercase px-1.5 py-0.5 rounded"
              style={{
                color: 'var(--text-tertiary)',
                background: 'var(--bg-surface-sunken)',
              }}
            >
              <CalendarClock className="w-3 h-3" />
              {control.frequency}
            </span>
          )}

          <StatusBadge status={statusToBadge[status]} size="sm" />

          {evidenceCount > 0 && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Paperclip className="w-3 h-3" /> {evidenceCount}
            </span>
          )}

          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div
          className="px-4 pb-4 space-y-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <div className="pt-3 space-y-4">
            <AssertionsList controlId={control.id} />
            <EvidenceSection controlId={control.id} evidence={evidence} readOnly={readOnly} />
            {status === 'failed' && <RemediationPlan readOnly={readOnly} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function SummaryBar({
  passed,
  failed,
  notTested,
}: {
  passed: number;
  failed: number;
  notTested: number;
}) {
  const allPassed = failed === 0 && notTested === 0 && passed > 0;
  const hasFails = failed > 0;

  return (
    <div
      className="flex items-center gap-6 px-5 py-4 rounded-lg"
      style={{
        background: allPassed
          ? 'var(--status-success-bg)'
          : hasFails
            ? 'var(--status-error-bg)'
            : 'var(--bg-surface)',
        border: `1px solid ${
          allPassed
            ? 'var(--status-success-border)'
            : hasFails
              ? 'var(--status-error-border)'
              : 'var(--border-default)'
        }`,
      }}
    >
      <SummaryItem
        icon={<CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />}
        label="Passed"
        count={passed}
      />
      <SummaryItem
        icon={<XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />}
        label="Failed"
        count={failed}
      />
      <SummaryItem
        icon={<Clock className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
        label="Not Tested"
        count={notTested}
      />
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {count}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function ControlsSkeleton() {
  return (
    <div className="space-y-6 max-w-[1000px]">
      <div className="space-y-2 animate-pulse">
        <div
          className="h-6 w-48 rounded"
          style={{ background: 'var(--bg-surface-sunken)' }}
        />
        <div
          className="h-4 w-64 rounded"
          style={{ background: 'var(--bg-surface-sunken)' }}
        />
      </div>
      <div
        className="h-16 rounded-lg animate-pulse"
        style={{ background: 'var(--bg-surface-sunken)' }}
      />
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-20 rounded-lg animate-pulse"
          style={{ background: 'var(--bg-surface-sunken)' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ControlsPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const { data: session } = useCloseSession(sessionId);
  const periodLabel = session?.periodLabel ?? '';

  const { data: controls = [], isLoading: controlsLoading } = useControls();
  const { data: evidence = [] } = useControlEvidence(periodLabel || null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ControlStatus>('all');

  // Derive status for each control
  const controlsWithStatus = useMemo(() => {
    return controls.map((c) => {
      const status = deriveControlStatus(c, evidence);
      return {
        ...c,
        status,
        evidenceCount: evidence.filter((e) => e.controlId === c.id).length,
      };
    });
  }, [controls, evidence]);

  // Counts
  const stats = useMemo(() => {
    const passed = controlsWithStatus.filter((c) => c.status === 'passed').length;
    const failed = controlsWithStatus.filter((c) => c.status === 'failed').length;
    const notTested = controlsWithStatus.filter((c) => c.status === 'not-tested').length;
    return { passed, failed, notTested };
  }, [controlsWithStatus]);

  // Filter
  const filtered = useMemo(() => {
    if (filter === 'all') return controlsWithStatus;
    return controlsWithStatus.filter((c) => c.status === filter);
  }, [controlsWithStatus, filter]);

  const toggleExpanded = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    [],
  );

  // --- Loading ---
  if (controlsLoading) {
    return <ControlsSkeleton />;
  }

  // --- Render ---
  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Internal Controls
        </h1>
        {periodLabel && (
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Control testing for {periodLabel}
          </p>
        )}
      </div>

      {/* Summary bar */}
      {controlsWithStatus.length > 0 && (
        <SummaryBar
          passed={stats.passed}
          failed={stats.failed}
          notTested={stats.notTested}
        />
      )}

      {/* Filter tabs */}
      {controlsWithStatus.length > 0 && (
        <div className="flex items-center gap-2" role="tablist" aria-label="Filter controls">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'passed', label: 'Passed' },
              { key: 'failed', label: 'Failed' },
              { key: 'not-tested', label: 'Not Tested' },
            ] as const
          ).map(({ key, label }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter(key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-opacity"
                style={{
                  background: isActive ? 'var(--interactive-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  opacity: isActive ? 1 : 0.8,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Controls list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={controls.length === 0 ? Shield : FileWarning}
          title={
            controls.length === 0
              ? 'No controls defined'
              : 'No controls match this filter'
          }
          description={
            controls.length === 0
              ? 'Controls are configured in Settings and tested against evidence each period.'
              : 'Try selecting a different filter above.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((control) => (
            <ControlCard
              key={control.id}
              control={control}
              status={control.status}
              evidenceCount={control.evidenceCount}
              evidence={evidence}
              readOnly={readOnly}
              isExpanded={expandedId === control.id}
              onToggle={() => toggleExpanded(control.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
