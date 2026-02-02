/**
 * FW3: Store sampling results by run id so we can record test results (pass/fail, exception) per item.
 * When pool and tenantId are provided, uses tenant DB; else in-memory (dev fallback).
 */

import type { Pool } from 'pg';
import type { SamplingResult } from '../types/audit_evidence.js';
import * as samplingResultRepo from '../db/repositories/sampling_result_repository.js';

export interface SamplingResultWithId extends SamplingResult {
  runId: string;
  createdAt: string;
}

const store = new Map<string, SamplingResultWithId>();

function nextId(): string {
  return `sampling-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function storeSamplingResult(
  result: SamplingResult,
  pool?: Pool | null,
  tenantId?: string
): Promise<SamplingResultWithId> {
  const runId = nextId();
  const now = new Date().toISOString();
  if (pool && tenantId) {
    const row = await samplingResultRepo.store(pool, tenantId, { ...result, runId });
    return row;
  }
  const entry: SamplingResultWithId = { ...result, runId, createdAt: now };
  store.set(runId, entry);
  return { ...entry };
}

export async function getSamplingResult(
  runId: string,
  pool?: Pool | null,
  tenantId?: string
): Promise<SamplingResultWithId | undefined> {
  if (pool && tenantId) {
    const row = await samplingResultRepo.get(pool, runId, tenantId);
    return row ?? undefined;
  }
  const r = store.get(runId);
  return r ? { ...r } : undefined;
}

export async function updateSamplingTestResults(
  runId: string,
  testResults: { id: string; result: 'pass' | 'fail' | 'exception'; note?: string }[],
  pool?: Pool | null,
  tenantId?: string
): Promise<SamplingResultWithId | undefined> {
  if (pool && tenantId) {
    const row = await samplingResultRepo.updateTestResults(pool, runId, tenantId, testResults);
    return row ?? undefined;
  }
  const entry = store.get(runId);
  if (!entry) return undefined;
  entry.testResults = testResults;
  return { ...entry };
}

export async function listSamplingRuns(
  pool?: Pool | null,
  tenantId?: string,
  limit = 50
): Promise<SamplingResultWithId[]> {
  if (pool && tenantId) {
    return samplingResultRepo.listByTenant(pool, tenantId, limit);
  }
  return Array.from(store.values())
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, limit);
}
