'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentThoughtStream, type ThoughtStreamStep } from './agent-thought-stream-context';

/** Activity chip icons and labels for tools (Reasoning Chips). */
const TOOL_CHIP: Record<string, { icon: string; label: string }> = {
  buildFinancialStatements: { icon: '📄', label: 'Extracting' },
  classifyAccount: { icon: '🧠', label: 'Categorizing Ledger' },
  computeRatios: { icon: '⚖️', label: 'Verifying GAAP' },
  forensicRescan: { icon: '🛠️', label: 'Forensic Rescan' },
};

function getChipLabel(step: ThoughtStreamStep): string {
  if (step.type === 'thought' && step.thought) {
    const t = step.thought.trim();
    if (t.length > 52) return `${t.slice(0, 49)}…`;
    return t || 'Reasoning…';
  }
  if (step.type === 'tool') {
    const def = TOOL_CHIP[step.toolName ?? ''] ?? { icon: '🛠️', label: step.toolName ?? 'Tool' };
    let count: number | undefined;
    if (step.toolInput && typeof step.toolInput === 'object') {
      const o = step.toolInput as Record<string, unknown>;
      if (Array.isArray(o.entries)) count = o.entries.length;
      else if (Array.isArray(o.raw_rows)) count = o.raw_rows.length;
    }
    const suffix = typeof count === 'number' ? ` ${count} Transactions…` : '…';
    return `${def.label}${suffix}`;
  }
  return '…';
}

function getChipIcon(step: ThoughtStreamStep): string {
  if (step.type === 'tool') {
    return TOOL_CHIP[step.toolName ?? '']?.icon ?? '🛠️';
  }
  return '🔍';
}

/** Source Truth panel: GAAP rule / tool input+result or thought content. */
function SourceTruthBlock({
  step,
  open,
  onToggle,
}: {
  step: ThoughtStreamStep;
  open: boolean;
  onToggle: () => void;
}) {
  const hasToolData = step.type === 'tool' && (step.toolInput !== undefined || (typeof step.toolResult === 'string' && step.toolResult.length > 0));
  const hasThought = step.type === 'thought' && step.thought?.trim();
  const hasContent = hasToolData || hasThought;
  if (!hasContent) return null;

  let jsonStr = '';
  if (step.type === 'tool') {
    try {
      if (step.toolInput !== undefined && step.toolResult !== undefined) {
        jsonStr = JSON.stringify({ input: step.toolInput, result: step.toolResult }, null, 2);
      } else if (typeof step.toolResult === 'string' && step.toolResult.length > 0) {
        jsonStr = step.toolResult.startsWith('{') || step.toolResult.startsWith('[')
          ? JSON.stringify(JSON.parse(step.toolResult), null, 2)
          : step.toolResult;
      } else if (step.toolInput !== undefined) {
        jsonStr = JSON.stringify(step.toolInput, null, 2);
      }
    } catch {
      jsonStr = typeof step.toolResult === 'string' ? step.toolResult : JSON.stringify(step.toolInput);
    }
  }

  const label = step.type === 'tool' ? 'Source Truth (tool input & result)' : 'Source Truth (reasoning)';

  return (
    <div className="mt-1.5 rounded-md border border-audit-green/30 bg-primary/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-audit-green/90 hover:bg-audit-green/10 transition-colors"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{label}</span>
      </button>
      {open && (
        <div className="border-t border-audit-green/20">
          {step.type === 'thought' && hasThought ? (
            <p className="p-2.5 text-xs text-primary-foreground/90 whitespace-pre-wrap leading-relaxed">
              {step.thought.trim()}
            </p>
          ) : (
            <pre className="p-2.5 text-[11px] font-mono text-primary-foreground/80 overflow-x-auto max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words">
              {jsonStr}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Single Reasoning Chip in the timeline: compact pill, pulse when active, click to show Source Truth. */
function ReasoningChip({
  step,
  index,
  isActive,
  isCompleted,
  expanded,
  onToggleExpand,
}: {
  step: ThoughtStreamStep;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const icon = getChipIcon(step);
  const label = getChipLabel(step);

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div
        className="absolute left-[11px] top-7 bottom-0 w-px bg-audit-green/30"
        aria-hidden
      />
      {/* Dot */}
      <div
        className={cn(
          'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm',
          isActive && 'border-audit-green bg-audit-green/20 text-audit-green chip-pulse',
          isCompleted && !isActive && 'border-audit-green/50 bg-audit-green/10 text-audit-green',
          !isActive && !isCompleted && 'border-primary-foreground/30 bg-primary/50 text-primary-foreground/80'
        )}
        aria-hidden
      >
        {icon}
      </div>
      {/* Chip + optional Source Truth */}
      <div className="min-w-0 flex-1 pb-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className={cn(
            'w-full text-left rounded-md border px-3 py-2 transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-audit-green focus-visible:ring-offset-2 focus-visible:ring-offset-primary',
            isActive &&
              'border-audit-green/50 bg-audit-green/10 text-audit-green shadow-[0_0_12px_hsl(var(--audit-green)/0.15)]',
            isCompleted &&
              !isActive &&
              'border-audit-green/30 bg-audit-green/5 text-audit-green hover:bg-audit-green/10',
            !isActive &&
              !isCompleted &&
              'border-primary-foreground/20 bg-primary/30 text-primary-foreground/90 hover:bg-primary/40'
          )}
          aria-expanded={expanded}
        >
          <span className="text-base leading-none mr-1.5" aria-hidden>
            {icon}
          </span>
          <span className="text-sm font-medium">{label}</span>
        </button>
        <SourceTruthBlock step={step} open={expanded} onToggle={onToggleExpand} />
      </div>
    </div>
  );
}

export interface AgentThoughtStreamProps {
  /** Use typewriter for thought chips (optional). */
  typingEffect?: boolean;
  typingSpeedMs?: number;
  className?: string;
}

/**
 * Agent Thought Stream: vertical Activity Timeline of Reasoning Chips.
 * Deep Navy background, Audit Green for completed; click a chip to see Source Truth.
 */
export function AgentThoughtStream({
  typingEffect = true,
  typingSpeedMs = 14,
  className,
}: AgentThoughtStreamProps) {
  const { state } = useAgentThoughtStream();
  const { steps, isThinking } = state;
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    setExpandedIndex(null);
  }, [steps]);

  const showStream = isThinking || steps.length > 0;
  const lastIndex = steps.length - 1;

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      style={{ backgroundColor: 'hsl(var(--primary))' }}
    >
      {/* Header: Calm, light text on Deep Navy */}
      <div className="p-4 border-b border-primary-foreground/10 shrink-0">
        <h3 className="text-sm font-semibold text-primary-foreground">Agent Thought Stream</h3>
        <p className="text-xs text-primary-foreground/70 mt-0.5">
          Reasoning and tool calls — click a chip for Source Truth
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!showStream && (
          <div className="rounded-md border border-audit-green/30 bg-audit-green/10 px-3 py-2.5">
            <p className="text-sm font-medium text-audit-green">Onboarding</p>
            <p className="text-xs text-primary-foreground/80 italic mt-0.5">
              Start by dropping a PDF below, and I&apos;ll begin the CPA extraction process.
            </p>
          </div>
        )}

        {isThinking && steps.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
            <span>Thinking…</span>
          </div>
        )}

        {steps.length > 0 && (
          <div className="space-y-0">
            {steps.map((step, index) => {
              const isActive = isThinking && index === lastIndex;
              const isCompleted = index < lastIndex;

              return (
                <ReasoningChip
                  key={`stream-${index}`}
                  step={step}
                  index={index}
                  isActive={isActive}
                  isCompleted={isCompleted}
                  expanded={expandedIndex === index}
                  onToggleExpand={() => setExpandedIndex((i) => (i === index ? null : index))}
                  isLast={index === lastIndex}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
