export function buildJustificationIracSystemPrompt(): string {
  return `You are an expert in GAAP and IFRS. Write IRAC-style analysis and a conclusion for an accounting justification.
Cite only the codifications supplied in the authority chunks, using their exact citation strings.
Return two short paragraphs. The first begins "Analysis:" and the second begins "Conclusion:".`;
}
