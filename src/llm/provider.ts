/**
 * LLM Provider Abstraction (Option A — external model first)
 * Supports Anthropic by default; OpenAI/Mistral are optional and loaded dynamically.
 */

export type LLMProvider = 'anthropic' | 'openai' | 'mistral';

export interface TextGenerationInput {
  prompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
}

export function getProviderFromEnv(): LLMProvider {
  const explicit = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'mistral') {
    return explicit;
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.MISTRAL_API_KEY) return 'mistral';
  return 'anthropic';
}

function getApiKey(provider: LLMProvider): string {
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
    return key;
  }
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set.');
    return key;
  }
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY is not set.');
  return key;
}

/** Deterministic mock response when AI_MOCK=true (e.g. in tests) to avoid live LLM calls. */
const AI_MOCK_RESPONSE =
  'Analysis: Mock analysis for testing. The treatment is consistent with the authoritative literature cited.\n\nConclusion: Therefore, the accounting treatment is supported by FASB ASC (General).';

/**
 * Generate plain text from the selected provider.
 * Tool-calling is not handled here (use provider-specific flows for tool use).
 * When AI_MOCK=true, returns immediately with a deterministic string (no network call).
 */
export async function generateText(input: TextGenerationInput): Promise<string> {
  if (process.env.AI_MOCK === 'true') {
    return AI_MOCK_RESPONSE;
  }
  const provider = getProviderFromEnv();
  const maxTokens = input.maxTokens ?? 1024;
  const prompt = input.prompt;
  const system = input.system ?? '';

  if (provider === 'anthropic') {
    const apiKey = getApiKey('anthropic');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: input.model ?? 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      system: system || undefined,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  if (provider === 'openai') {
    const apiKey = getApiKey('openai');
    const mod = await import('openai').catch(() => null);
    if (!mod?.default) {
      throw new Error('OpenAI SDK not installed. Add "openai" to dependencies.');
    }
    const client = new mod.default({ apiKey });
    const response = await client.chat.completions.create({
      model: input.model ?? 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });
    const content = response.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  }

  // Mistral
  const apiKey = getApiKey('mistral');
  const mod = await import('@mistralai/mistralai').catch(() => null);
  if (!mod) {
    throw new Error('Mistral SDK not installed. Add "@mistralai/mistralai" to dependencies.');
  }
  const client = new mod.Mistral({ apiKey });
  const response = await client.chat.complete({
    model: input.model ?? 'mistral-large-latest',
    maxTokens,
    messages: [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      { role: 'user' as const, content: prompt },
    ],
  });
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : (c as { text?: string }).text ?? '')).join('').trim();
  return '';
}

