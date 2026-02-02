/**
 * Auditor Agent — The Skeptic: reviews the Supervisor's final report before the user sees it.
 *
 * 1. The Duel: Before the report is shown, the Skeptic tries to find errors in math or accounting logic.
 * 2. Instruction: "Assume the Supervisor is wrong. Find one discrepancy in the P&L or a misapplied FASB rule."
 * 3. Resolution: If a mistake is found, the agents 'Discuss' internally. The user only sees the final, verified consensus.
 */

import { generateText } from '../llm/provider.js';
import type { SupervisorOutput } from './Supervisor.js';

const MODEL = 'claude-sonnet-4-5-20250929';

const SCEPTIC_SYSTEM = `You are the Skeptic agent. Your job is to review a financial Supervisor's report before it is shown to the user.

Instruction: Assume the Supervisor is wrong. Find one discrepancy in the P&L or a misapplied FASB rule.

You must output exactly one of the following:

1. If you find a real error (math or accounting/FASB):
   Write: "FINDING: [your finding]"
   Then optionally: "SUGGESTED_CORRECTION: [how to fix it]"
   Be specific: cite the numbers or the rule (e.g. "Assets do not equal Liabilities + Equity: 1000 vs 950"; "Revenue recognition under ASC 606 was misapplied for X").

2. If you find no error after careful check:
   Write: "NO_ISSUE"
   You may add one line: "NOTE: [brief note]" if you want to qualify (e.g. "NOTE: Assumed trial balance is correct.").

Do not invent errors. Only report a finding if there is a clear mathematical inconsistency or a clear misapplication of FASB/GAAP.`;

const DISCUSSION_SYSTEM = `You are mediating an internal discussion between the Supervisor and the Skeptic.

The Supervisor produced a report. The Skeptic found a potential error. You must produce the final, verified consensus that the user will see.

Inputs you will receive:
- The Supervisor's original report (or summary).
- The Skeptic's finding.
- The Supervisor's response to the finding (if any).

Output format (you must include both lines):
CONSENSUS: [no_error | correction_accepted]
FINAL_REPORT: [The final report text the user should see. If correction_accepted, incorporate the correction or add a short note that the issue was corrected. If no_error, use the original report plus an optional one-line note that the Skeptic reviewed and found no issue.]

Keep FINAL_REPORT concise and user-ready. Do not expose internal debate.`;

export interface SupervisorReport {
  /** Supervisor's final response text. */
  response: string;
  /** Tool calls (name + result) so Skeptic can check P&L/BS math and logic. */
  toolCalls: Array<{ name: string; input?: unknown; result: string }>;
  /** Optional: thoughts for context. */
  thoughts?: string[];
}

export interface SkepticReviewResult {
  /** True if Skeptic found no issue. */
  noIssue: boolean;
  /** If noIssue is false: the Skeptic's finding. */
  finding?: string;
  /** If noIssue is false: optional suggested correction. */
  suggestedCorrection?: string;
  /** Raw response from Skeptic (for logging). */
  rawResponse?: string;
}

export interface DiscussionResult {
  /** no_error = Skeptic agrees there is no error; correction_accepted = Supervisor accepted the correction. */
  consensus: 'no_error' | 'correction_accepted';
  /** The final report to show the user (verified consensus). */
  finalReport: string;
}

function ensureLLMAvailable(): void {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.MISTRAL_API_KEY) {
    throw new Error('No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or MISTRAL_API_KEY.');
  }
}

/** Build report text for the Skeptic (response + tool results so they can check math and rules). */
function buildReportText(report: SupervisorReport): string {
  const parts: string[] = [report.response];
  if (report.toolCalls.length > 0) {
    parts.push('\n\n--- Data and tool results the Supervisor used ---');
    for (const t of report.toolCalls) {
      parts.push(`\n[${t.name}]\n${typeof t.result === 'string' ? t.result : JSON.stringify(t.result, null, 2)}`);
    }
  }
  return parts.join('\n');
}

/**
 * Run the Skeptic: review the Supervisor's report. Assume the Supervisor is wrong; find one discrepancy in P&L or a misapplied FASB rule.
 */
export async function runSkepticReview(report: SupervisorReport): Promise<SkepticReviewResult> {
  ensureLLMAvailable();
  const reportText = buildReportText(report);

  const prompt = `Review this Supervisor report. Assume the Supervisor is wrong. Find one discrepancy in the P&L or a misapplied FASB rule, or output NO_ISSUE if you find none.\n\n${reportText}`;
  const text = await generateText({
    model: MODEL,
    maxTokens: 2048,
    system: SCEPTIC_SYSTEM,
    prompt,
  });

  const noIssue = /NO_ISSUE/i.test(text);
  const findingMatch = text.match(/FINDING:\s*([\s\S]*?)(?=SUGGESTED_CORRECTION:|$)/i);
  const correctionMatch = text.match(/SUGGESTED_CORRECTION:\s*([\s\S]*?)$/im);

  return {
    noIssue,
    finding: findingMatch ? findingMatch[1].trim() : undefined,
    suggestedCorrection: correctionMatch ? correctionMatch[1].trim() : undefined,
    rawResponse: text,
  };
}

/**
 * Run the internal Discussion: given the Supervisor's report and the Skeptic's finding, produce the final consensus and user-facing report.
 */
export async function runDiscussion(
  report: SupervisorReport,
  skepticFinding: string,
  suggestedCorrection?: string
): Promise<DiscussionResult> {
  ensureLLMAvailable();
  const reportSummary = report.response.slice(0, 4000);
  const prompt = `Supervisor's report (excerpt):\n${reportSummary}\n\nSkeptic's finding: ${skepticFinding}${suggestedCorrection ? `\nSkeptic's suggested correction: ${suggestedCorrection}` : ''}\n\nProduce the consensus and final report the user should see. Output CONSENSUS: and FINAL_REPORT: as specified.`;

  const text = await generateText({
    model: MODEL,
    maxTokens: 4096,
    system: DISCUSSION_SYSTEM,
    prompt,
  });

  const consensusMatch = text.match(/CONSENSUS:\s*(no_error|correction_accepted)/i);
  const reportMatch = text.match(/FINAL_REPORT:\s*([\s\S]*?)$/im);
  const consensus = consensusMatch ? (consensusMatch[1].toLowerCase() as 'no_error' | 'correction_accepted') : 'no_error';
  const finalReport = reportMatch ? reportMatch[1].trim() : report.response;

  return { consensus, finalReport };
}

export interface SupervisorWithSkepticInput {
  message: string;
  entries?: Array<{ accountName: string; debit: number; credit: number; accountCode?: string }>;
}

export interface SupervisorWithSkepticOutput {
  /** Final, verified report to show the user (consensus after Skeptic review and optional discussion). */
  finalReport: string;
  /** True if Skeptic found an issue and discussion was run. */
  skepticReviewed: boolean;
  /** If skeptic found an issue: the finding (for audit trail; user sees only finalReport). */
  skepticFinding?: string;
  /** Consensus after discussion (if discussion ran). */
  consensus?: 'no_error' | 'correction_accepted';
  /** Original Supervisor response (before Skeptic). */
  supervisorResponse: string;
}

/**
 * Run the Supervisor, then the Skeptic. If the Skeptic finds an issue, run the internal Discussion.
 * The user only sees the final, verified consensus (finalReport).
 */
export async function runSupervisorWithSkeptic(
  input: SupervisorWithSkepticInput,
  runSupervisor: (input: SupervisorWithSkepticInput) => Promise<SupervisorOutput>
): Promise<SupervisorWithSkepticOutput> {
  const supervisorOutput = await runSupervisor({
    message: input.message,
    entries: input.entries,
  });

  const report: SupervisorReport = {
    response: supervisorOutput.response,
    toolCalls: supervisorOutput.toolCalls,
    thoughts: supervisorOutput.thoughts,
  };

  const review = await runSkepticReview(report);

  if (review.noIssue) {
    return {
      finalReport: supervisorOutput.response,
      skepticReviewed: true,
      supervisorResponse: supervisorOutput.response,
    };
  }

  const discussion = await runDiscussion(
    report,
    review.finding ?? 'Skeptic flagged an issue.',
    review.suggestedCorrection
  );

  return {
    finalReport: discussion.finalReport,
    skepticReviewed: true,
    skepticFinding: review.finding,
    consensus: discussion.consensus,
    supervisorResponse: supervisorOutput.response,
  };
}
