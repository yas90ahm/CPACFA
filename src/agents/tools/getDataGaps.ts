/**
 * Tool: get_data_gaps — CPA Gap Analysis.
 * Returns a list of "Missing Information" (Missing Liabilities, Missing Assets, Missing Identity)
 * for display in the UI as an Urgent To-Do list.
 */

import { z } from 'zod';
import { runGapAnalysis, type DataGap } from '../cpa_brain.js';
import type { ToolDefinition, ToolResult } from './types.js';

const ledgerEntrySchema = z.object({
  accountName: z.string().min(1),
  debit: z.number(),
  credit: z.number(),
  accountCode: z.string().optional(),
  accountType: z.string().optional(),
});

const metadataSchema = z.object({
  taxId: z.string().optional(),
  businessNumber: z.string().optional(),
  transactions: z
    .array(
      z.object({
        payee: z.string().optional(),
        amount: z.number(),
        date: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
});

export const getDataGapsSchema = z.object({
  entries: z
    .array(ledgerEntrySchema)
    .min(1)
    .describe(
      'Trial balance or ledger entries: array of { accountName, debit, credit, accountCode?, accountType? }'
    ),
  metadata: metadataSchema
    .optional()
    .default({})
    .describe(
      'Optional metadata: { taxId?, businessNumber?, transactions? }. Used to check for Missing Identity (Tax ID / Business Number).'
    ),
});

export type GetDataGapsInput = z.infer<typeof getDataGapsSchema>;

export const getDataGapsDefinition: ToolDefinition<GetDataGapsInput> = {
  name: 'get_data_gaps',
  description:
    'Use this after parsing bank or trial balance data to run CPA Gap Analysis. Returns a list of "Missing Information" to display in the UI as an Urgent To-Do list: (1) Missing Liabilities — recurring payments to lenders without a corresponding loan account; (2) Missing Assets — large one-time payments to vendors like Tesla or Apple that should be capitalized as Fixed Assets; (3) Missing Identity — Tax ID or Business Number not present in metadata. Call with entries (ledger/trial balance rows) and optional metadata (taxId, businessNumber).',
  parameters: getDataGapsSchema as import('zod').z.ZodType<GetDataGapsInput>,
};

/**
 * Run the get_data_gaps tool. Returns list of DataGap for the UI.
 */
export function runGetDataGaps(input: GetDataGapsInput): ToolResult<{
  gaps: DataGap[];
  summary: string;
}> {
  try {
    const parsed = getDataGapsSchema.parse(input);
    const gaps = runGapAnalysis(parsed.entries, parsed.metadata ?? {});
    const summary =
      gaps.length === 0
        ? 'No gaps found. Data appears complete for liabilities, assets, and identity.'
        : `${gaps.length} gap(s) found. Review Urgent To-Do list.`;
    return {
      success: true,
      data: {
        gaps,
        summary,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
