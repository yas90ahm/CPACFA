/**
 * LLM call-with-fallback: single place for try/catch + parse + fallback.
 * Use in agentic services to avoid repeated boilerplate.
 * Appends DATA_GROUNDING_RULE to every system prompt to reduce hallucination.
 */

import { generateText, type TextGenerationInput } from './provider.js';
import { DATA_GROUNDING_RULE } from './guardrails.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS ?? '15000', 10);

export interface CallLLMWithFallbackOptions<T> {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
  /** Timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
  /** Transform raw LLM output (e.g. trim, slice, parse JSON). */
  parse: (raw: string) => T;
  /** Returned when generateText throws or parse yields unusable result. */
  fallback: T;
  /** Called when LLM fails, before returning fallback. Useful for metrics/alerting. */
  onError?: (error: string, isTimeout: boolean) => void;
}

/**
 * Call LLM; on success run parse(raw); on throw return fallback.
 * Appends DATA_GROUNDING_RULE to system so responses are based only on provided data.
 * Enforces timeout to prevent indefinite hangs (consistent with callClaude behavior).
 */
export async function callLLMWithFallback<T>(options: CallLLMWithFallbackOptions<T>): Promise<T> {
  const { system, prompt, maxTokens, model, parse, fallback, timeoutMs } = options;
  const systemWithRule = `${system.trim()}\n\n${DATA_GROUNDING_RULE}`;
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const resultPromise = generateText({ system: systemWithRule, prompt, maxTokens, model } satisfies TextGenerationInput);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), timeout);
    });
    const raw = await Promise.race([resultPromise, timeoutPromise]);
    const result = parse(raw ?? '');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message === 'LLM_TIMEOUT';
    console.warn(`[callLLMWithFallback] LLM call failed${isTimeout ? ' (timeout)' : ''}: ${message}. Returning fallback.`);
    options.onError?.(message, isTimeout);
    return fallback;
  }
}
