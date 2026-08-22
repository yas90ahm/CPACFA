import type { Pool } from 'pg';
import { callAIWithSchema } from '../ai/ai_client.js';
import {
  buildRunbookWorkpaperSystemPrompt,
  buildRunbookWorkpaperUserPrompt,
  RUNBOOK_WORKPAPER_PROMPT_VERSION,
} from '../ai/prompts/runbook_workpaper.prompt.js';
import {
  RunbookWorkpaperOutputSchema,
  type RunbookWorkpaperOutput,
} from '../ai/schemas/runbook_workpaper.schema.js';
import type { CompiledRunbookTask } from '../types/close_runbook.js';
import {
  buildSafeMemoryContext,
  getApprovedMemoryContextForTask,
  recordMemoryApplication,
} from './accounting_memory_service.js';
import { getSession } from './close_session_service.js';

const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const WITHHELD_NUMBER = '[deterministic numeric result withheld from model]';

function redactNumericText(value: string): string {
  if (/^\s*[-+]?[$€£]?\s*\d[\d,]*(?:\.\d+)?%?\s*$/.test(value)) return WITHHELD_NUMBER;
  return value
    .replace(/[$€£]\s*[-+]?\d[\d,]*(?:\.\d+)?/g, WITHHELD_NUMBER)
    .replace(/(?<![A-Za-z0-9_-])[-+]?\d[\d,]*\.\d+(?:%|\b)/g, WITHHELD_NUMBER)
    .replace(/(?<![A-Za-z0-9_-])[-+]?\d+(?:\.\d+)?%(?![A-Za-z0-9_-])/g, WITHHELD_NUMBER);
}

/** Remove numeric values and bound nested data before it crosses the AI boundary. */
export function buildRunbookAgentFactSnapshot(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[nested data omitted]';
  if (typeof value === 'number' || typeof value === 'bigint') return WITHHELD_NUMBER;
  if (typeof value === 'boolean' || value == null) return value;
  if (typeof value === 'string') return redactNumericText(value.slice(0, 300));
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => buildRunbookAgentFactSnapshot(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, nested]) => [key.slice(0, 120), buildRunbookAgentFactSnapshot(nested, depth + 1)])
    );
  }
  return String(value).slice(0, 300);
}

export interface RunbookAgentDraftResult {
  ok: boolean;
  workpaper?: RunbookWorkpaperOutput;
  error?: string;
  callLogId?: string;
}

export async function draftRunbookAgentWorkpaper(input: {
  pool: Pool;
  tenantId: string;
  closeSessionId: string;
  taskExecutionId: string;
  periodLabel: string;
  task: CompiledRunbookTask;
  deterministicResult: Record<string, unknown>;
}): Promise<RunbookAgentDraftResult> {
  const factSnapshot = buildRunbookAgentFactSnapshot(input.deterministicResult) as Record<string, unknown>;
  const session = await getSession(input.pool, input.tenantId, input.closeSessionId);
  const memories = session
    ? await getApprovedMemoryContextForTask(input.pool, {
        tenantId: input.tenantId,
        entityId: session.entityId,
        periodLabel: input.periodLabel,
        task: input.task,
      })
    : [];
  const approvedCorrectionMemories = memories.map((memory) =>
    buildRunbookAgentFactSnapshot(buildSafeMemoryContext(memory)) as Record<string, unknown>
  );
  if (session) {
    for (const memory of memories) {
      await recordMemoryApplication(input.pool, {
        tenantId: input.tenantId,
        entityId: session.entityId,
        closeSessionId: input.closeSessionId,
        memoryId: memory.id,
        targetType: 'runbook_task',
        targetId: input.taskExecutionId,
        taskExecutionId: input.taskExecutionId,
        outcome: 'context_supplied',
        similarity: 1,
        detail: {
          taskCode: input.task.code,
          capability: input.task.capability,
          reusableAmountsSupplied: false,
        },
        appliedBy: 'system:runbook-workpaper-agent',
      });
    }
  }
  const result = await callAIWithSchema({
    pool: input.pool,
    tenantId: input.tenantId,
    closeSessionId: input.closeSessionId,
    pillar: 'runbook_workpaper',
    promptVersion: RUNBOOK_WORKPAPER_PROMPT_VERSION,
    systemPrompt: buildRunbookWorkpaperSystemPrompt(),
    userPrompt: buildRunbookWorkpaperUserPrompt({
      periodLabel: input.periodLabel,
      controlCode: input.task.controlCode,
      capability: input.task.capability,
      factSnapshot,
      approvedCorrectionMemories,
    }),
    schema: RunbookWorkpaperOutputSchema,
    requestJson: {
      pillar: 'runbook_workpaper',
      promptVersion: RUNBOOK_WORKPAPER_PROMPT_VERSION,
      closeTaskCode: input.task.code,
      controlCode: input.task.controlCode,
      capability: input.task.capability,
      factKeys: Object.keys(factSnapshot),
      approvedCorrectionMemoryIds: memories.map((memory) => memory.id),
      reusableAmountsSupplied: false,
    },
  });
  return result.ok && result.parsed
    ? { ok: true, workpaper: result.parsed, callLogId: result.callLogId }
    : {
        ok: false,
        error: result.error === 'API_KEY_MISSING' ? 'MODEL_NOT_CONFIGURED' : 'MODEL_DRAFT_UNAVAILABLE',
        callLogId: result.callLogId,
      };
}
