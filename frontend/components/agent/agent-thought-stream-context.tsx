'use client';

import * as React from 'react';
import { buildReasoningSteps } from '@/components/reasoning-streams';
import type { ReasoningStep } from '@/components/reasoning-streams';

/** Step for the sidebar stream; includes tool input/result and optional confidence for Verify CTA. */
export interface ThoughtStreamStep extends ReasoningStep {
  toolInput?: unknown;
  toolResult?: string;
  /** 0–100; when < 80 show Verify button in stream. */
  confidence?: number;
}

export interface AgentThoughtStreamState {
  /** Interleaved thought + tool steps (with tool input/result when available). */
  steps: ThoughtStreamStep[];
  /** Agent is currently processing (ReAct loop in progress). */
  isThinking: boolean;
}

const defaultState: AgentThoughtStreamState = {
  steps: [],
  isThinking: false,
};

export type SetAgentThoughtStream = (update: Partial<AgentThoughtStreamState>) => void;

const AgentThoughtStreamContext = React.createContext<{
  state: AgentThoughtStreamState;
  setStream: SetAgentThoughtStream;
} | null>(null);

export function useAgentThoughtStream() {
  const ctx = React.useContext(AgentThoughtStreamContext);
  if (!ctx) return { state: defaultState, setStream: () => {} };
  return ctx;
}

/** Build ThoughtStreamStep[] from thoughts + toolCalls (attach input/result to tool steps). */
export function buildThoughtStreamSteps(
  thoughts: string[],
  toolCalls: Array<{ name: string; input?: unknown; result?: string }>
): ThoughtStreamStep[] {
  const base = buildReasoningSteps(thoughts, toolCalls);
  let toolIndex = 0;
  return base.map((step) => {
    if (step.type === 'tool' && toolCalls[toolIndex]) {
      const tc = toolCalls[toolIndex++];
      return {
        ...step,
        toolInput: tc.input,
        toolResult: tc.result,
      };
    }
    return step as ThoughtStreamStep;
  });
}

export function AgentThoughtStreamProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AgentThoughtStreamState>(defaultState);
  const setStream = React.useCallback((update: Partial<AgentThoughtStreamState>) => {
    setState((prev) => ({ ...prev, ...update }));
  }, []);
  const value = React.useMemo(() => ({ state, setStream }), [state, setStream]);
  return (
    <AgentThoughtStreamContext.Provider value={value}>
      {children}
    </AgentThoughtStreamContext.Provider>
  );
}
