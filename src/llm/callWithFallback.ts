/**
 * LLM call-with-fallback: single place for try/catch + parse + fallback.
 * Use in agentic services to avoid repeated boilerplate.
 * Appends DATA_GROUNDING_RULE to every system prompt to reduce hallucination.
 */

import { generateText, type TextGenerationInput } from './provider.js';
import { DATA_GROUNDING_RULE } from './guardrails.js';

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
 * Appends DATA_GROUNDING_RULE to system so responses are based only on provided data.
 */
export async function callLLMWithFallback<T>(options: CallLLMWithFallbackOptions<T>): Promise<T> {
  const { system, prompt, maxTokens, model, parse, fallback } = options;
  const systemWithRule = `${system.trim()}\n\n${DATA_GROUNDING_RULE}`;
  try {
    const raw = await generateText({ system: systemWithRule, prompt, maxTokens, model } satisfies TextGenerationInput);
    const result = parse(raw ?? '');
    return result;
  } catch {
    return fallback;
  }
}
