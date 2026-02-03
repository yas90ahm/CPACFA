'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSessionTrace } from '@/lib/api';

/** Single entry from trace API (reasoning_logs). */
export interface ReasoningLogEntry {
  stepType: 'thought' | 'tool';
  timestamp: string;
  thought?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string | Record<string, unknown>;
  rawDataSeen?: unknown;
  ruleApplied?: string;
  verificationResult?: { passed: boolean; checks: string[] };
}

/** Staging item from trace API (tenant_hitl_staging). */
export interface StagingItemTrace {
  id: string;
  proposedAction: string;
  justification: string;
  status: string;
  type: string;
  amount?: number;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Heuristics: entry is "flagged" when it has a rule/verification that justifies a finding (e.g. Personal Expense). */
function isFlagged(entry: ReasoningLogEntry): boolean {
  if (entry.ruleApplied?.trim()) return true;
  const vr = entry.verificationResult;
  if (vr && Array.isArray(vr.checks) && vr.checks.length > 0) return true;
  return false;
}

/** CPA/IFRS rule to show for a flagged entry (audit trail). */
function getRuleDisplay(entry: ReasoningLogEntry): string | null {
  if (entry.ruleApplied?.trim()) return entry.ruleApplied;
  const vr = entry.verificationResult;
  if (vr?.checks?.length) return vr.checks.join('; ');
  return null;
}

function TraceStepRow({
  entry,
  index,
  expanded,
  onToggle,
}: {
  entry: ReasoningLogEntry;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const flagged = isFlagged(entry);
  const ruleDisplay = getRuleDisplay(entry);

  const label =
    entry.stepType === 'thought'
      ? 'Thought'
      : entry.stepType === 'tool'
        ? `Action: ${entry.toolName ?? 'tool'}`
        : 'Step';
  const summary =
    entry.stepType === 'thought'
      ? (entry.thought?.slice(0, 80) ?? '') + (entry.thought && entry.thought.length > 80 ? '…' : '')
      : entry.stepType === 'tool'
        ? (typeof entry.toolResult === 'string' ? entry.toolResult.slice(0, 80) : 'Result') +
          (typeof entry.toolResult === 'string' && entry.toolResult.length > 80 ? '…' : '')
        : '';

  return (
    <div className="rounded-md border border-primary-foreground/15 bg-primary/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-audit-green focus-visible:ring-offset-2 focus-visible:ring-offset-primary',
          flagged && 'border-l-4 border-l-amber-500/80 bg-amber-500/5',
          expanded && 'bg-primary/50'
        )}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-primary-foreground/70" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-primary-foreground/70" />
        )}
        <span className="font-medium text-primary-foreground">
          {entry.stepType === 'thought' ? 'Thought' : 'Action'} → {entry.stepType === 'tool' ? 'Result' : ''}
        </span>
        {flagged && (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-label="Flagged" />
        )}
        <span className="text-xs text-primary-foreground/60 truncate flex-1">{summary}</span>
      </button>
      {expanded && (
        <div className="border-t border-primary-foreground/10 px-3 py-2 space-y-2">
          {entry.stepType === 'thought' && entry.thought && (
            <p className="text-xs text-primary-foreground/90 whitespace-pre-wrap">{entry.thought}</p>
          )}
          {entry.stepType === 'tool' && (
            <>
              {entry.toolName && (
                <p className="text-xs text-primary-foreground/80">
                  <strong>Tool:</strong> {entry.toolName}
                </p>
              )}
              {entry.toolInput != null && (
                <pre className="text-[11px] font-mono text-primary-foreground/80 overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(entry.toolInput, null, 2)}
                </pre>
              )}
              {entry.toolResult != null && (
                <p className="text-xs text-primary-foreground/80">
                  <strong>Result:</strong>{' '}
                  {typeof entry.toolResult === 'string'
                    ? entry.toolResult
                    : JSON.stringify(entry.toolResult)}
                </p>
              )}
            </>
          )}
          {flagged && ruleDisplay && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                CPA / IFRS rule applied
              </p>
              <p className="text-xs text-primary-foreground/90 mt-1 whitespace-pre-wrap">
                {ruleDisplay}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface AgentThinkingHUDProps {
  sessionId: string | null;
  /** Poll interval in ms when sessionId is set; 0 = no polling. */
  pollIntervalMs?: number;
  className?: string;
}

/**
 * Agent Thinking HUD: live stream of Thought → Action → Result from session trace.
 * When an entry is flagged (e.g. "Personal Expense detected"), shows the CPA/IFRS rule used to justify it (audit trail).
 */
export function AgentThinkingHUD({
  sessionId,
  pollIntervalMs = 2000,
  className,
}: AgentThinkingHUDProps) {
  const [trace, setTrace] = React.useState<{
    reasoningLogs: ReasoningLogEntry[];
    stagingItems: StagingItemTrace[];
  } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

  const fetchTrace = React.useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSessionTrace(sessionId);
      setTrace({
        reasoningLogs: data.reasoningLogs ?? [],
        stagingItems: data.stagingItems ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trace');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (!sessionId) {
      setTrace(null);
      setError(null);
      return;
    }
    fetchTrace();
    if (pollIntervalMs <= 0) return;
    const id = setInterval(fetchTrace, pollIntervalMs);
    return () => clearInterval(id);
  }, [sessionId, pollIntervalMs, fetchTrace]);

  const logs = trace?.reasoningLogs ?? [];
  const items = trace?.stagingItems ?? [];

  return (
    <div
      className={cn('flex flex-col h-full rounded-lg overflow-hidden', className)}
      style={{ backgroundColor: 'hsl(var(--primary))' }}
    >
      <div className="p-3 border-b border-primary-foreground/10 shrink-0">
        <h3 className="text-sm font-semibold text-primary-foreground">Agent reasoning trail</h3>
        <p className="text-xs text-primary-foreground/70 mt-0.5">
          Thought → Action → Result. Flagged items show the CPA/IFRS rule applied (audit trail).
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!sessionId && (
          <div className="rounded-md border border-audit-green/30 bg-audit-green/10 px-3 py-2.5">
            <p className="text-sm text-primary-foreground/90">No session selected.</p>
            <p className="text-xs text-primary-foreground/70 mt-0.5">
              Start a supervisor chat to see the reasoning trail here.
            </p>
          </div>
        )}

        {sessionId && loading && logs.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
            <span>Loading trace…</span>
          </div>
        )}

        {sessionId && error && !trace && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {logs.length > 0 && (
          <div className="space-y-2">
            {logs.map((entry, index) => (
              <TraceStepRow
                key={`${entry.timestamp}-${index}`}
                entry={entry}
                index={index}
                expanded={expandedIndex === index}
                onToggle={() => setExpandedIndex((i) => (i === index ? null : index))}
              />
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="pt-3 border-t border-primary-foreground/10">
            <h4 className="text-xs font-semibold text-primary-foreground/90 mb-2">
              HITL staging ({items.length})
            </h4>
            <ul className="space-y-1.5">
              {items.slice(0, 10).map((item) => (
                <li
                  key={item.id}
                  className="rounded border border-primary-foreground/20 bg-primary/40 px-2.5 py-2 text-xs"
                >
                  <span className="font-medium text-primary-foreground">{item.proposedAction}</span>
                  <span className="text-primary-foreground/60 ml-1.5">({item.status})</span>
                  <p className="text-primary-foreground/80 mt-0.5">{item.justification}</p>
                </li>
              ))}
            </ul>
            {items.length > 10 && (
              <p className="text-xs text-primary-foreground/60 mt-1">
                +{items.length - 10} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
