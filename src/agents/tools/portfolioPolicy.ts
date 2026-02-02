/**
 * Tool: getPortfolioFinalizationPolicy — read-only policy text for portfolio finalization and corrections.
 * Use when the user asks about changing past performance, back-dating, or correcting finalized periods.
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResult } from './types.js';

export const getPortfolioFinalizationPolicySchema = z.object({
  topic: z
    .enum(['finalization', 'correction'])
    .optional()
    .describe('Optional: "finalization" for policy on closing periods; "correction" for how to restate. Omit for full policy.'),
});

export type GetPortfolioFinalizationPolicyInput = z.infer<typeof getPortfolioFinalizationPolicySchema>;

const POLICY_FULL =
  'Once a portfolio period is finalized, performance cannot be back-dated or overwritten. Any change must be recorded as a restatement via the performance correction endpoint (hash-chained, GIPS-aligned).';
const POLICY_FINALIZATION =
  'Once a portfolio period is finalized, performance cannot be back-dated or overwritten. Use the finalize endpoint only when the period is complete and auditable.';
const POLICY_CORRECTION =
  'Any change to a finalized period must be recorded as a restatement via the performance correction endpoint (hash-chained, GIPS-aligned). Do not overwrite; use the correction API.';

export const getPortfolioFinalizationPolicyDefinition: ToolDefinition<GetPortfolioFinalizationPolicyInput> = {
  name: 'getPortfolioFinalizationPolicy',
  description:
    'Returns the policy on portfolio period finalization and corrections. Call when the user asks about changing past performance, back-dating, correcting finalized periods, or why historical data cannot be overwritten. Cite the returned policy in your answer.',
  parameters: getPortfolioFinalizationPolicySchema,
};

/**
 * Run the getPortfolioFinalizationPolicy tool. Returns policy text for the Supervisor to cite.
 */
export function runGetPortfolioFinalizationPolicy(
  input: GetPortfolioFinalizationPolicyInput
): ToolResult<{ policy: string; topic?: string }> {
  try {
    const parsed = getPortfolioFinalizationPolicySchema.parse(input ?? {});
    const topic = parsed.topic;
    const policy =
      topic === 'finalization'
        ? POLICY_FINALIZATION
        : topic === 'correction'
          ? POLICY_CORRECTION
          : POLICY_FULL;
    return {
      success: true,
      data: { policy, ...(topic ? { topic } : {}) },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
