/**
 * Optional agentic suggestion of assertions for a control (audit risk mapping).
 * Given control name/description, returns suggested assertion labels. Fallback = empty array.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { CloseControl } from '../types/close_and_controls.js';

const SYSTEM = [
  'You are an audit specialist. Given a control (name, description), suggest 2-5 audit assertions that this control addresses',
  '(e.g. completeness, accuracy, existence, cutoff, presentation). Return a JSON array of strings only, e.g. ["Completeness", "Accuracy"].',
].join(' ');

/**
 * Suggest assertion labels for a control. Returns empty array on failure or when no API key.
 */
export async function suggestAssertionsAgentic(control: CloseControl): Promise<string[]> {
  const summary = `Control: ${control.name}. ${control.description ?? ''}`.trim();
  const prompt = `Control:\n${summary}\n\nReturn a JSON array of assertion labels (strings only).`;
  const fallback = '[]';
  const raw = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 256,
    parse: (r) => r?.trim() ?? fallback,
    fallback,
  });
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string').slice(0, 10);
    }
  } catch {
    // ignore
  }
  return [];
}
