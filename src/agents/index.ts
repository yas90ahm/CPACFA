/**
 * Agents — Supervisor (ReAct + Claude 3.5 Sonnet), Skeptic (Auditor), and Toolbox.
 * ReAct logic is consolidated in Supervisor.ts; unified_orchestrator.ts is the single entry point.
 */

export { runSupervisor, type SupervisorInput, type SupervisorOutput } from './Supervisor.js';
export {
  runSkepticReview,
  runDiscussion,
  runSupervisorWithSkeptic,
  type SupervisorReport,
  type SkepticReviewResult,
  type DiscussionResult,
  type SupervisorWithSkepticInput,
  type SupervisorWithSkepticOutput,
} from './auditor_agent.js';
export { executeTool, toolDefinitions } from './tools/index.js';
export type { ToolDefinition, ToolResult } from './tools/types.js';
export { runGapAnalysis, type DataGap, type DataGapType, type LedgerEntry, type BankOrLedgerMetadata } from './cpa_brain.js';
