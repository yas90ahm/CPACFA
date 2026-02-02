/**
 * LLM call-with-fallback: single place for try/catch + parse + fallback.
 * Use in agentic services to avoid repeated boilerplate.
 */

import { generateText, type TextGenerationInput } from './provider.js';

export interface CallLLMWithFallbackOptions<T> {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
  /** Transform raw LLM output (e.g. trim, slice, parse JSON). */
  parse: (raw: string) => T;
  /** Returned when generateText throws or parse yields unusable result. */
  fallback: T;
}

/**
 * Call LLM; on success run parse(raw); on throw return fallback.
 * Same behavior as per-service try/catch, centralized for consistency and future logging/retries.
 */
export async function callLLMWithFallback<T>(options: CallLLMWithFallbackOptions<T>): Promise<T> {
  const { system, prompt, maxTokens, model, parse, fallback } = options;
  try {
    const raw = await generateText({ system, prompt, maxTokens, model } satisfies TextGenerationInput);
    const result = parse(raw ?? '');
    return result;
  } catch {
    return fallback;
  }
}
