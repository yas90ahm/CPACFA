/**
 * Integrated Risk Ledger (Shared Brain): session-scoped store for CPA flags and CFA liquidity warnings.
 * Unresolved conflicts persisted to DB when Integration is enabled. Product-independent: CPA/CFA write only when their module is on.
 * When pool is available, flags are read from professional_audit_flags and liquidity from risk_context_liquidity_warnings (write-through cache).
 */

import type { Pool } from 'pg';
import { ENABLE_CPA_MODULE, ENABLE_CFA_MODULE, ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import type { ConflictVariance } from '../types/orchestrator.js';
import * as conflictsRepo from '../db/repositories/risk_context_conflicts_repository.js';
import * as flagsRepo from '../db/repositories/professional_audit_flags_repository.js';
import * as liquidityRepo from '../db/repositories/risk_context_liquidity_repository.js';
import * as qualitativeEvidenceRepo from '../db/repositories/risk_context_qualitative_evidence_repository.js';
import { recordOverride } from './audit_ledger_service.js';
import type { AuditLedgerEventType } from '../types/audit_ledger.js';

export interface RiskFlag {
  category: string;
  severity: string;
  message: string;
  recommendation: string;
  citationStandard: string;
  sourceDocumentId?: string;
}

export interface LiquidityWarning {
  source: string;
  riskLevel?: string;
  currentRatio?: number;
  runwayMonths?: number;
  message: string;
}

interface SessionEntry {
  flags: RiskFlag[];
  liquidityWarnings: LiquidityWarning[];
}

const sessionStore = new Map<string, SessionEntry>();

function sessionKey(tenantId: string, sessionIdOrPeriod?: string): string {
  return `${tenantId}:${sessionIdOrPeriod ?? 'default'}`;
}

function getOrCreate(tenantId: string, sessionIdOrPeriod?: string): SessionEntry {
  const key = sessionKey(tenantId, sessionIdOrPeriod);
  let entry = sessionStore.get(key);
  if (!entry) {
    entry = { flags: [], liquidityWarnings: [] };
    sessionStore.set(key, entry);
  }
  return entry;
}

/** Append CPA skepticism flags (only when ENABLE_CPA_MODULE). */
export function appendFlags(
  tenantId: string,
  sessionIdOrPeriod: string | undefined,
  flags: RiskFlag[]
): void {
  if (!ENABLE_CPA_MODULE || !flags.length) return;
  const entry = getOrCreate(tenantId, sessionIdOrPeriod);
  entry.flags.push(...flags);
}

/** Append CFA liquidity warnings (only when ENABLE_CFA_MODULE). When pool is provided, also persists to DB. */
export async function appendLiquidityWarnings(
  tenantId: string,
  sessionIdOrPeriod: string | undefined,
  warnings: LiquidityWarning[],
  pool?: Pool
): Promise<void> {
  if (!ENABLE_CFA_MODULE || !warnings.length) return;
  const entry = getOrCreate(tenantId, sessionIdOrPeriod);
  entry.liquidityWarnings.push(...warnings);
  if (pool) {
    for (const w of warnings) {
      await liquidityRepo.create(pool, {
        tenantId,
        periodLabel: sessionIdOrPeriod ?? undefined,
        sessionId: sessionIdOrPeriod ?? undefined,
        source: w.source,
        riskLevel: w.riskLevel,
        currentRatio: w.currentRatio,
        runwayMonths: w.runwayMonths,
        message: w.message,
      });
    }
  }
}

/** Get CPA flags for session (in-memory only). */
export function getFlags(tenantId: string, sessionIdOrPeriod?: string): RiskFlag[] {
  const entry = sessionStore.get(sessionKey(tenantId, sessionIdOrPeriod));
  return entry?.flags ?? [];
}

/** Get CPA flags from DB (professional_audit_flags, status = open). */
export async function getFlagsFromDb(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<RiskFlag[]> {
  const rows = await flagsRepo.list(pool, tenantId, {
    periodLabel: periodLabel ?? undefined,
    status: 'open',
  });
  return rows.map((r) => ({
    category: r.category,
    severity: r.severity,
    message: r.message,
    recommendation: r.recommendation,
    citationStandard: r.citationStandard,
    sourceDocumentId: r.sourceDocumentId,
  }));
}

/** Get liquidity warnings from DB. */
export async function getLiquidityWarningsFromDb(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<LiquidityWarning[]> {
  const rows = await liquidityRepo.listByTenantPeriod(pool, tenantId, periodLabel);
  return rows.map((r) => ({
    source: r.source,
    riskLevel: r.riskLevel ?? undefined,
    currentRatio: r.currentRatio ?? undefined,
    runwayMonths: r.runwayMonths ?? undefined,
    message: r.message,
  }));
}

/** Get flags for context: DB when pool present (merged with in-memory for same-request consistency), else in-memory only. */
export async function getFlagsForContext(
  pool: Pool | null,
  tenantId: string,
  periodLabel?: string
): Promise<RiskFlag[]> {
  const fromMem = getFlags(tenantId, periodLabel ?? undefined);
  if (!pool) return fromMem;
  const fromDb = await getFlagsFromDb(pool, tenantId, periodLabel);
  const combined = [...fromDb];
  for (const f of fromMem) {
    if (!combined.some((x) => x.category === f.category && x.message === f.message)) {
      combined.push(f);
    }
  }
  return combined;
}

/** Set unresolved conflicts and persist to DB when Integration enabled. */
export async function setUnresolvedConflicts(
  pool: Pool,
  tenantId: string,
  sessionIdOrPeriod: string | undefined,
  conflicts: ConflictVariance[],
  periodLabel?: string,
  createdBy?: string
): Promise<void> {
  if (!ENABLE_INTEGRATED_SUPERVISOR || !conflicts.length) return;
  for (const c of conflicts) {
    await conflictsRepo.create(pool, {
      tenantId,
      periodLabel: periodLabel ?? (sessionIdOrPeriod ?? undefined),
      sessionId: sessionIdOrPeriod,
      conflictReason: c.reason,
      conflictSnapshot: { cpa_summary: c.cpa_summary, cfa_summary: c.cfa_summary, recommendation: c.recommendation },
      createdBy,
    });
  }
}

/** Get unresolved conflicts (from DB when Integration enabled). */
export async function getUnresolvedConflicts(
  pool: Pool,
  tenantId: string,
  periodLabel?: string
): Promise<ConflictVariance[]> {
  if (!ENABLE_INTEGRATED_SUPERVISOR) return [];
  const rows = await conflictsRepo.listUnresolved(pool, tenantId, periodLabel);
  return rows.map((r) => {
    const snap = r.conflictSnapshot as { cpa_summary?: string; cfa_summary?: string; recommendation?: string; citationStandard?: string };
    return {
      reason: r.conflictReason,
      cpa_summary: snap.cpa_summary,
      cfa_summary: snap.cfa_summary,
      recommendation: snap.recommendation ?? '',
      ...(snap.citationStandard && { citationStandard: snap.citationStandard }),
    };
  });
}

/** Resolve a conflict with memo; record to audit ledger and mark resolved in DB. */
export async function resolveConflictWithMemo(
  pool: Pool,
  tenantId: string,
  conflictId: string,
  resolutionMemo: string,
  createdBy?: string
): Promise<boolean> {
  if (!ENABLE_INTEGRATED_SUPERVISOR) return false;
  const conflict = await conflictsRepo.getById(pool, conflictId);
  if (!conflict || conflict.resolvedAt) return false;
  const eventType: AuditLedgerEventType = 'user_induced_variance';
  await recordOverride(pool, {
    tenantId,
    periodLabel: conflict.periodLabel ?? undefined,
    eventType,
    deterministicFlagSnapshot: {
      conflictId,
      conflictReason: conflict.conflictReason,
      conflictSnapshot: conflict.conflictSnapshot,
    },
    agentDissentSnapshot: undefined,
    userPromptRationale: resolutionMemo,
    createdBy,
  });
  return conflictsRepo.resolve(pool, conflictId, resolutionMemo, createdBy);
}

function buildPromptsFromFlagsAndWarnings(flags: RiskFlag[], liquidityWarnings: LiquidityWarning[]): string[] {
  const prompts: string[] = [];
  if (ENABLE_CPA_MODULE && flags.length) {
    const embeddedLease = flags.some((f) => f.category === 'substance_over_form');
    const revenueTiming = flags.some((f) => f.category === 'revenue_recognition');
    if (embeddedLease) prompts.push('Adjust Net Debt for embedded lease (see Judgment / substance-over-form flags).');
    if (revenueTiming) prompts.push('Review Revenue Forecasts for timing or recognition anomaly (see Judgment / revenue flags).');
  }
  if (ENABLE_CFA_MODULE && liquidityWarnings.length) {
    const msg = liquidityWarnings.map((w) => w.message).join('; ');
    if (msg) prompts.push(`Liquidity: ${msg}`);
  }
  return prompts;
}

/** Set QUALITATIVE_EVIDENCE_MISSING for tenant/period (Integration only). Called when professional review runs with zero narrative. */
export async function setQualitativeEvidenceMissing(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  missing: boolean
): Promise<void> {
  if (!ENABLE_INTEGRATED_SUPERVISOR) return;
  await qualitativeEvidenceRepo.upsertQualitativeEvidenceMissing(pool, tenantId, periodLabel, missing);
}

/** Get QUALITATIVE_EVIDENCE_MISSING for tenant/period (Integration only). Used by export gate and CFA disclaimer. */
export async function getQualitativeEvidenceMissing(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<boolean> {
  if (!ENABLE_INTEGRATED_SUPERVISOR) return false;
  return qualitativeEvidenceRepo.getQualitativeEvidenceMissing(pool, tenantId, periodLabel);
}

/** Prompts for valuation (DCF/LBO): embedded lease, revenue timing when CPA on; liquidity when CFA on. When pool provided, reads from DB. */
export async function getPromptsForValuation(
  tenantId: string,
  periodLabel?: string,
  pool?: Pool
): Promise<string[]> {
  if (pool) {
    const [flags, liquidityWarnings] = await Promise.all([
      getFlagsFromDb(pool, tenantId, periodLabel),
      getLiquidityWarningsFromDb(pool, tenantId, periodLabel),
    ]);
    return buildPromptsFromFlagsAndWarnings(flags, liquidityWarnings);
  }
  const entry = sessionStore.get(sessionKey(tenantId, periodLabel));
  return buildPromptsFromFlagsAndWarnings(entry?.flags ?? [], entry?.liquidityWarnings ?? []);
}
