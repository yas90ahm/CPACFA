/**
 * Tools: Semantic Memory — lookup vendor, check consistency, store user correction.
 * When a new file is uploaded, the agent can query: "Have I seen this vendor before? How did we categorize it last time?"
 * If agent logic contradicts a previous user correction, the agent must pause and ask using the returned promptForUser.
 */

import { z } from 'zod';
import {
  lookupVendor,
  checkConsistency,
  storeUserCorrection,
} from '../../memory/index.js';
import type { ToolDefinition, ToolResult } from './types.js';

const vendorSchema = z.object({
  vendor: z.string().min(1).describe('Vendor or account name to look up (e.g. "Stripe", "AWS")'),
});

const consistencySchema = z.object({
  vendor: z.string().min(1).describe('Vendor or account name (e.g. "Stripe")'),
  currentCategory: z.string().min(1).describe('Category the agent would assign (e.g. "Merchant Services", "Software")'),
  period: z.string().optional().describe('Optional period (e.g. "2024-Q1")'),
});

const storeCorrectionSchema = z.object({
  vendor: z.string().min(1),
  category: z.string().min(1),
  accountCode: z.string().optional(),
  accountName: z.string().optional(),
  period: z.string().optional(),
  citation: z.string().optional(),
  note: z.string().optional(),
});

export const lookupVendorMemoryDefinition: ToolDefinition<z.infer<typeof vendorSchema>> = {
  name: 'lookupVendorMemory',
  description:
    'Query semantic memory: "Have I seen this vendor before? How did we categorize it last time?" Use when processing a new file or line item to check prior treatment. Returns prior user corrections and decisions for this vendor.',
  parameters: vendorSchema,
};

export const checkCategoryConsistencyDefinition: ToolDefinition<z.infer<typeof consistencySchema>> = {
  name: 'checkCategoryConsistency',
  description:
    'Check if the agent\'s proposed category contradicts a previous user correction. If so, returns consistent: false and promptForUser (e.g. "Last month you categorized \'Stripe\' as \'Software\'; should I continue doing that or use the new \'Merchant Services\' category?"). The agent must pause and ask the user when consistent is false.',
  parameters: consistencySchema,
};

export const storeUserCorrectionDefinition: ToolDefinition<z.infer<typeof storeCorrectionSchema>> = {
  name: 'storeUserCorrection',
  description:
    'Store a user correction (e.g. user confirmed "Stripe" -> "Software"). Call this when the user explicitly confirms or corrects a category so future runs are consistent.',
  parameters: storeCorrectionSchema,
};

export type LookupVendorMemoryInput = z.infer<typeof vendorSchema>;
export type CheckCategoryConsistencyInput = z.infer<typeof consistencySchema>;
export type StoreUserCorrectionInput = z.infer<typeof storeCorrectionSchema>;

export async function runLookupVendorMemory(
  input: LookupVendorMemoryInput
): Promise<ToolResult<{ vendor: string; hits: Array<{ entryType: string; text: string; payload: unknown; storedAt: string; score: number }> }>> {
  try {
    const parsed = vendorSchema.parse(input);
    const hits = await lookupVendor(parsed.vendor, { topK: 5 });
    return {
      success: true,
      data: {
        vendor: parsed.vendor,
        hits: hits.map((h) => ({
          entryType: h.entry.entryType,
          text: h.entry.text,
          payload: h.entry.payload,
          storedAt: h.entry.storedAt,
          score: h.score,
        })),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export function runCheckCategoryConsistency(
  input: CheckCategoryConsistencyInput
): ToolResult<{
  consistent: boolean;
  previousCorrection?: { vendor: string; category: string; period?: string; storedAt: string };
  promptForUser?: string;
}> {
  try {
    const parsed = consistencySchema.parse(input);
    const result = checkConsistency(parsed.vendor, parsed.currentCategory, { period: parsed.period });
    return {
      success: true,
      data: {
        consistent: result.consistent,
        previousCorrection: result.previousCorrection,
        promptForUser: result.promptForUser,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function runStoreUserCorrection(
  input: StoreUserCorrectionInput
): Promise<ToolResult<{ id: string; storedAt: string }>> {
  try {
    const parsed = storeCorrectionSchema.parse(input);
    const entry = await storeUserCorrection(parsed);
    return {
      success: true,
      data: { id: entry.id, storedAt: entry.storedAt },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
