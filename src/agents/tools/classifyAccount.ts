/**
 * Tool: classifyAccount — map a single GL account name to Asset/Liability/Equity/Revenue/Expense.
 * Wraps CPA account classifier (ASC 210, IAS 1).
 */

import { z } from 'zod';
import { classifyAccount as classifyAccountService, codificationRefForType } from '../../services/accountClassifier.js';
import { classifyAccountsAgentic } from '../../services/agentic_account_classifier.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const classifyAccountSchema = z.object({
  accountName: z.string().min(1).describe('The GL account name or label to classify (e.g. "Cash", "Accounts Payable", "Revenue")'),
});

export type ClassifyAccountInput = z.infer<typeof classifyAccountSchema>;

export const classifyAccountDefinition: ToolDefinition<ClassifyAccountInput> = {
  name: 'classifyAccount',
  description:
    'Use this when you need to map a single general-ledger account name to its financial statement category (Asset, Liability, Equity, Revenue, or Expense). Use it to determine where an account belongs on the Balance Sheet or P&L, or when the user asks how to classify an account. Returns the account type and FASB/IASB codification reference.',
  parameters: classifyAccountSchema,
};

/**
 * Run the classifyAccount tool. Returns structured JSON for LLM parsing.
 */
export async function runClassifyAccount(input: ClassifyAccountInput): Promise<ToolResult<{
  accountName: string;
  accountType: string;
  codificationRef: { framework: string; citation: string; description?: string };
}>> {
  try {
    const parsed = classifyAccountSchema.parse(input);
    const agentic = await classifyAccountsAgentic([parsed.accountName]);
    const fallback = classifyAccountService(parsed.accountName);
    const accountType = agentic?.[0] ?? fallback.accountType;
    const codificationRef = codificationRefForType(accountType);
    return {
      success: true,
      data: {
        accountName: parsed.accountName,
        accountType,
        codificationRef: {
          framework: codificationRef.framework,
          citation: codificationRef.citation,
          description: codificationRef.description,
        },
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
