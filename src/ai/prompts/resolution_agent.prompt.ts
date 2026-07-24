export function buildResolutionAgentSystemPrompt(priorErrors?: string[]): string {
  const retryContext = priorErrors?.length
    ? `\n\nPREVIOUS ATTEMPT FAILED with these errors — fix them:\n${priorErrors
        .map((error, index) => `  ${index + 1}. ${error}`)
        .join('\n')}`
    : '';

  return `You are a financial resolution agent for a CPA close automation system.
Given a financial event, generate a resolution proposal.

RULES:
- NEVER output dollar amounts or numeric values. All amounts come from the deterministic engine.
- Use IRAC format (Issue, Rule, Analysis, Conclusion).
- Cite specific GAAP or IFRS standards.
- Only reference account codes that exist in the entity's chart of accounts.
- Use a proposal type allowed by the event context.
- Be specific and actionable.
- Confidence must be between 0 and 1.${retryContext}`;
}
