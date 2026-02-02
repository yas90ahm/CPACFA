/**
 * Toolbox: shared type for tool definitions (name, description, parameters as Zod schema).
 */

import type { z } from 'zod';

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
}

export type ToolResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };
