/**
 * Thin AI client: Claude adapter + Zod validation + always log to ai_call_log.
 */

import type { Pool } from 'pg';
import type { z } from 'zod';
import { callClaude } from './adapters/claude_adapter.js';
import { insertCallLog } from './ai_call_log_repository.js';
import { enterAdvisoryContext, exitAdvisoryContext } from '../lib/ai_boundary.js';
import { getAIModel, getAITimeoutMs } from './ai_config.js';

export interface CallAIWithSchemaParams<T> {
  pool: Pool;
  tenantId: string;
  pillar: string;
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  /** Sanitized for logging (no secrets). */
  requestJson: Record<string, unknown>;
}

export interface CallAIWithSchemaResult<T> {
  ok: boolean;
  parsed?: T;
  rawText?: string;
  error?: string;
  callLogId?: string;
}

export async function callAIWithSchema<T>(params: CallAIWithSchemaParams<T>): Promise<CallAIWithSchemaResult<T>> {
  enterAdvisoryContext();
  try {
    return await _callAIWithSchemaImpl(params);
  } finally {
    exitAdvisoryContext();
  }
}

async function _callAIWithSchemaImpl<T>(params: CallAIWithSchemaParams<T>): Promise<CallAIWithSchemaResult<T>> {
  const {
    pool,
    tenantId,
    pillar,
    promptVersion,
    systemPrompt,
    userPrompt,
    schema,
    requestJson,
  } = params;

  const model = getAIModel();
  const timeoutMs = getAITimeoutMs();

  const adapterOut = await callClaude({
    model,
    systemPrompt,
    userPrompt,
    timeoutMs,
    pillar,
  });

  let responseJson: Record<string, unknown> | null = null;
  let parsed: T | undefined;
  let parseError: string | null = null;

  if (adapterOut.ok && adapterOut.rawText) {
    try {
      // Strip markdown code fences if present (```json ... ```)
      let rawText = adapterOut.rawText.trim();
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      const json = JSON.parse(rawText) as unknown;
      parsed = schema.parse(json) as T;
      responseJson = json as Record<string, unknown>;
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  const ok = adapterOut.ok && !!parsed && !parseError;
  const error = adapterOut.error ?? parseError ?? null;

  let callLogId: string | undefined;
  try {
    const logResult = await insertCallLog(pool, {
      tenantId,
      pillar,
      promptVersion,
      model,
      requestJson,
      responseRaw: adapterOut.rawText ?? null,
      responseJson,
      ok,
      error,
      latencyMs: adapterOut.latencyMs ?? null,
      inputTokens: adapterOut.inputTokens ?? null,
      outputTokens: adapterOut.outputTokens ?? null,
      estimatedCostUsd: adapterOut.estimatedCostUsd ?? null,
    });
    callLogId = logResult.id;
  } catch (logErr) {
    console.warn('[ai-client] Failed to insert call log (non-fatal):', (logErr as Error).message);
  }

  return {
    ok,
    parsed,
    rawText: adapterOut.rawText,
    error: error ?? undefined,
    callLogId,
  };
}
