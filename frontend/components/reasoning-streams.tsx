'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Wrench, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Friendly label and icon for each tool (ReAct toolbox). */
const TOOL_BADGES: Record<string, { label: string; short?: string }> = {
  classifyAccount: { label: 'Classify Account', short: 'Classifier' },
  buildFinancialStatements: { label: 'CPA Parser', short: 'CPA Parser' },
  computeRatios: { label: 'Compute Ratios', short: 'Ratios' },
  forensicRescan: { label: 'Forensic Rescan', short: 'Forensic' },
};

/** Heuristics: thought text suggests a plan change (agency). */
const PLAN_CHANGE_PATTERNS = [
  /\binstead\b/i,
  /\bactually\b/i,
  /\bchange (my )?plan\b/i,
  /\brevis(e|ing)\s+(my )?approach\b/i,
  /\breconsider\b/i,
  /\bswitch(ing)?\s+to\b/i,
  /\bdetected (an )?anomaly\b/i,
  /\bwill (re-?scan|rescan|re-?run)\b/i,
  /\bautonomous(ly)?\s+(decide|run)\b/i,
  /\bnot (going to|gonna) (do|proceed)\b/i,
];

function isPlanChange(text: string): boolean {
  return PLAN_CHANGE_PATTERNS.some((re) => re.test(text));
}

/** Typewriter effect: reveal `text` character-by-character. */
function useTypewriter(text: string, enabled: boolean, speedMs = 12) {
  const [displayed, setDisplayed] = React.useState('');
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text ?? '');
      setDone(true);
      return;
    }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speedMs);
    return () => clearInterval(id);
  }, [text, enabled, speedMs]);

  return { displayed, done };
}

export interface ReasoningStep {
  type: 'thought' | 'tool';
  thought?: string;
  toolName?: string;
  /** Mark this step as a plan change (highlight in UI). */
  isPlanChange?: boolean;
}

/** Build interleaved steps from thoughts[] and toolCalls[] (thought → tool → thought → …). */
export function buildReasoningSteps(
  thoughts: string[],
  toolCalls: Array<{ name: string; input?: unknown; result?: string }>
): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const max = Math.max(thoughts.length, toolCalls.length);
  for (let i = 0; i < max; i++) {
    if (i < thoughts.length) {
      const t = thoughts[i].trim();
      steps.push({
        type: 'thought',
        thought: t,
        isPlanChange: isPlanChange(t),
      });
    }
    if (i < toolCalls.length) {
      steps.push({ type: 'tool', toolName: toolCalls[i].name });
    }
  }
  return steps;
}

export interface ReasoningStreamsProps {
  /** When true, show "Supervisor is thinking..." in the monologue. */
  isThinking?: boolean;
  /** Interleaved thought/tool steps (from buildReasoningSteps). */
  steps?: ReasoningStep[];
  /** Use live-typing for thoughts. */
  typingEffect?: boolean;
  /** Speed in ms per character for typewriter. */
  typingSpeedMs?: number;
  className?: string;
}

export function ReasoningStreams({
  isThinking = false,
  steps = [],
  typingEffect = true,
  typingSpeedMs = 14,
  className,
}: ReasoningStreamsProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [currentTypingIndex, setCurrentTypingIndex] = React.useState(0);
  const thoughtSteps = steps.filter((s) => s.type === 'thought');

  const showMonologue = isThinking || steps.length > 0;

  if (!showMonologue) return null;

  return (
    <div className={cn('rounded-md border border-border bg-muted/30 overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-t-md"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span>How I got here</span>
        {isThinking && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </span>
        )}
        {steps.length > 0 && !isThinking && (
          <span className="text-xs text-muted-foreground">
            {thoughtSteps.length} thought{thoughtSteps.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 pt-0 space-y-2 max-h-[220px] overflow-y-auto">
          {isThinking && steps.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Supervisor is reasoning…</p>
          )}

          {steps.map((step, index) => {
            if (step.type === 'thought' && step.thought) {
              if (index > currentTypingIndex) return null;
              return (
                <ThoughtBlock
                  key={`thought-${index}`}
                  thought={step.thought}
                  isPlanChange={step.isPlanChange}
                  typingEffect={typingEffect}
                  typingSpeedMs={typingSpeedMs}
                  isActive={isThinking && index === steps.length - 1}
                  onTypingDone={() => setCurrentTypingIndex((i) => Math.max(i, index + 1))}
                  startTyping
                />
              );
            }
            if (step.type === 'tool' && step.toolName) {
              const badge = TOOL_BADGES[step.toolName] ?? {
                label: step.toolName,
                short: step.toolName,
              };
              return (
                <ToolBadgeStep
                  key={`tool-${index}`}
                  index={index}
                  currentTypingIndex={currentTypingIndex}
                  setCurrentTypingIndex={setCurrentTypingIndex}
                  label={badge.short ?? badge.label}
                />
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

/** Tool badge step: when this step is reached, advance typing index so next thought can start. */
function ToolBadgeStep({
  index,
  currentTypingIndex,
  setCurrentTypingIndex,
  label,
}: {
  index: number;
  currentTypingIndex: number;
  setCurrentTypingIndex: React.Dispatch<React.SetStateAction<number>>;
  label: string;
}) {
  React.useEffect(() => {
    if (index <= currentTypingIndex) {
      setCurrentTypingIndex((i) => Math.max(i, index + 1));
    }
  }, [index, currentTypingIndex, setCurrentTypingIndex]);

  if (index > currentTypingIndex) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/12 text-primary px-2 py-1 font-medium border border-primary/20">
        <Wrench className="h-3.5 w-3.5" />
        {label} Active
      </span>
    </div>
  );
}

function ThoughtBlock({
  thought,
  isPlanChange,
  typingEffect,
  typingSpeedMs,
  isActive,
  onTypingDone,
  startTyping,
}: {
  thought: string;
  isPlanChange?: boolean;
  typingEffect: boolean;
  typingSpeedMs: number;
  isActive: boolean;
  onTypingDone: () => void;
  startTyping: boolean;
}) {
  const { displayed, done } = useTypewriter(thought, typingEffect && startTyping, typingSpeedMs);
  const text = typingEffect && startTyping ? displayed : thought;
  const showCursor = typingEffect && startTyping && !done;

  React.useEffect(() => {
    if (done) onTypingDone();
  }, [done, onTypingDone]);

  return (
    <div
      className={cn(
        'rounded-md px-2.5 py-2 text-sm border',
        isPlanChange
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-100 dark:bg-amber-500/20'
          : 'bg-background/80 border-border text-foreground'
      )}
    >
      {isPlanChange && (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300 block mb-1">
          Plan change
        </span>
      )}
      <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
        {text}
        {showCursor && <span className="animate-pulse">▌</span>}
      </p>
      {isActive && (
        <span className="inline-block mt-1.5 h-0.5 w-8 bg-primary/50 animate-pulse rounded" />
      )}
    </div>
  );
}
