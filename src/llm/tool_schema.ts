/**
 * Unified Tool Schema for LLM tool calling (provider-agnostic).
 * Convert to provider-specific shapes (Anthropic now; others later).
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

export interface LLMTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; items?: unknown }>;
    required?: string[];
  };
}

export function toAnthropicTools(tools: LLMTool[]): Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: t.inputSchema.properties,
      required: t.inputSchema.required,
    },
  }));
}

export function toOpenAITools(tools: LLMTool[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.inputSchema.properties,
        required: t.inputSchema.required ?? [],
      },
    },
  }));
}

export function toMistralTools(tools: LLMTool[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.inputSchema.properties,
        required: t.inputSchema.required ?? [],
      },
    },
  }));
}

