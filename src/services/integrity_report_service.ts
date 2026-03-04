/**
 * Integrity Report Service
 *
 * Builds a due diligence integrity scorecard for a single entity or across a portfolio.
 * Aggregates: certification history, restatements, close performance, audit chain,
 * immutability triggers, evidence integrity, AI transparency.
 */

import type { Pool } from 'pg';
import { getTenantPool } from '../db/index.js';
import { verifyChain } from '../db/repositories/audit_ledger_repository.js';
import type { CertificationArtifactAiMetadata } from '../types/certification_artifact.js';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface IntegrityReport {
  entity: { name: string; id: string };
  reportDate: string;
  periodsCovered: {
    earliest: string | null;
    latest: string | null;
    totalPeriods: number;
    certifiedPeriods: number;
    lockedPeriods: number;
    uncertifiedPeriods: number;
  };
  certificationCompleteness: string;
  restatements: {
    count: number;
    details: { period: string; reopenedAt: string; reason: string }[];
  };
  closePerformance: {
    averageCloseDays: number | null;
    fastestClose: number | null;
    slowestClose: number | null;
    trend: 'improving' | 'stable' | 'worsening' | 'insufficient_data';
    last6Months: (number | null)[];
  };
  auditChain: {
    totalEntries: number;
    chainIntact: boolean;
    lastVerified: string;
    firstEntry: string | null;
    lastEntry: string | null;
  };
  immutabilityEnforcement: {
    auditLedgerTrigger: boolean;
    snapshotTrigger: boolean;
  };
  evidenceIntegrity: {
    totalDocuments: number;
    totalManifests: number;
  };
  aiTransparency: {
    totalMappingSuggestions: number;
    aiAccepted: number;
    aiEdited: number;
    aiRejected: number;
    varianceExplanations: {
      aiDrafted: number;
      aiEdited: number;
      manual: number;
    };
  };
  cryptographicVerification: {
    signingAlgorithm: string;
    publicKeyEndpoint: string;
    verificationEndpoint: string;
    offlineVerifiable: boolean;
  };
  certificationTimeline: {
    period: string;
    certifiedAt: string;
    certifiedBy: string | null;
    closeDays: number | null;
    restatements: number;
    artifactId: string;
  }[];
}

export interface PortfolioIntegrityReport {
  reportDate: string;
  totalEntities: number;
  entities: {
    id: string;
    name: string;
    totalPeriods: number;
    certifiedPeriods: number;
    restatements: number;
    averageCloseDays: number | null;
    auditChainIntact: boolean;
  }[];
  aggregates: {
    totalPeriodsCertified: number;
    totalRestatements: number;
    averageCloseDaysPortfolio: number | null;
    allAuditChainsIntact: boolean;
    aiMappingSuggestionsAccepted: number;
    aiMappingSuggestionsTotal: number;
    varianceExplanationsAiDrafted: number;
    varianceExplanationsTotal: number;
  };
}

// ────────────────────────────────────────────────────────
// Entity-level report
// ────────────────────────────────────────────────────────

export async function buildEntityIntegrityReport(
  pool: Pool,
  tenantId: string,
  entityName: string
): Promise<IntegrityReport> {
  const now = new Date().toISOString();

  // All close sessions for this tenant
  const sessionsRow = await pool.query<{
    id: string; status: string; period_end: string; period_start: string;
    created_at: string; certified_at: string | null;
  }>(
    `SELECT id, status, period_end, period_start, created_at, certified_at
     FROM close_sessions
     WHERE tenant_id = $1
     ORDER BY period_end ASC`,
    [tenantId]
  );
  const sessions = sessionsRow.rows;

  const certifiedSessions = sessions.filter((s) => s.status === 'certified' || s.status === 'locked');
  const lockedSessions = sessions.filter((s) => s.status === 'locked');

  // Periods covered
  const earliest = sessions[0]?.period_start ?? null;
  const latest = sessions[sessions.length - 1]?.period_end ?? null;
  const totalPeriods = sessions.length;
  const certifiedPeriods = certifiedSessions.length;
  const lockedPeriods = lockedSessions.length;
  const uncertifiedPeriods = totalPeriods - certifiedPeriods;
  const completeness = totalPeriods > 0
    ? `${Math.round((certifiedPeriods / totalPeriods) * 100)}%`
    : '0%';

  // Restatements: sessions with > 1 certification artifact
  const artifactCountRow = await pool.query<{ close_session_id: string; cnt: string }>(
    `SELECT close_session_id, COUNT(*)::text AS cnt
     FROM certification_artifacts
     WHERE tenant_id = $1
     GROUP BY close_session_id
     HAVING COUNT(*) > 1`,
    [tenantId]
  );
  const restatementSessions = new Set(artifactCountRow.rows.map((r) => r.close_session_id));

  // Get reopen events from audit ledger
  const reopenRow = await pool.query<{
    deterministic_flag_snapshot: Record<string, unknown> | null;
    user_prompt_rationale: string | null;
    created_at: string;
    period_label: string;
  }>(
    `SELECT deterministic_flag_snapshot, user_prompt_rationale, created_at, period_label
     FROM audit_ledger
     WHERE tenant_id = $1 AND event_type = 'session_reopened'
     ORDER BY created_at ASC`,
    [tenantId]
  );
  const restatementDetails = reopenRow.rows.map((r) => ({
    period: r.period_label ?? 'unknown',
    reopenedAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    reason: r.user_prompt_rationale ?? (r.deterministic_flag_snapshot as Record<string, unknown>)?.reason as string ?? 'No reason provided',
  }));

  // Close performance
  const closeDays: number[] = [];
  for (const s of certifiedSessions) {
    if (s.certified_at) {
      const d = (new Date(s.certified_at).getTime() - new Date(s.created_at).getTime()) / 86_400_000;
      closeDays.push(Math.round(d * 10) / 10);
    }
  }
  const avgClose = closeDays.length > 0 ? Math.round(closeDays.reduce((a, b) => a + b, 0) / closeDays.length * 10) / 10 : null;
  const fastest = closeDays.length > 0 ? Math.min(...closeDays) : null;
  const slowest = closeDays.length > 0 ? Math.max(...closeDays) : null;
  const last6 = closeDays.slice(-6);
  let trend: IntegrityReport['closePerformance']['trend'] = 'insufficient_data';
  if (last6.length >= 3) {
    const first3Avg = last6.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last3Avg = last6.slice(-3).reduce((a, b) => a + b, 0) / 3;
    if (last3Avg < first3Avg * 0.9) trend = 'improving';
    else if (last3Avg > first3Avg * 1.1) trend = 'worsening';
    else trend = 'stable';
  }
  // Pad last6 to always return up to 6 entries
  const last6Padded: (number | null)[] = [...last6];
  while (last6Padded.length < 6) last6Padded.unshift(null);

  // Audit chain verification
  let auditChain: IntegrityReport['auditChain'];
  try {
    const chainResult = await verifyChain(pool, tenantId);
    const firstEntryRow = await pool.query<{ created_at: string }>(
      'SELECT created_at FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1',
      [tenantId]
    );
    const lastEntryRow = await pool.query<{ created_at: string }>(
      'SELECT created_at FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );
    auditChain = {
      totalEntries: chainResult.entryCount,
      chainIntact: chainResult.valid,
      lastVerified: now,
      firstEntry: firstEntryRow.rows[0]?.created_at
        ? (typeof firstEntryRow.rows[0].created_at === 'string'
          ? firstEntryRow.rows[0].created_at
          : new Date(firstEntryRow.rows[0].created_at).toISOString())
        : null,
      lastEntry: lastEntryRow.rows[0]?.created_at
        ? (typeof lastEntryRow.rows[0].created_at === 'string'
          ? lastEntryRow.rows[0].created_at
          : new Date(lastEntryRow.rows[0].created_at).toISOString())
        : null,
    };
  } catch {
    auditChain = { totalEntries: 0, chainIntact: false, lastVerified: now, firstEntry: null, lastEntry: null };
  }

  // Immutability triggers
  let auditLedgerTrigger = false;
  let snapshotTrigger = false;
  try {
    const triggerRow = await pool.query<{ tgname: string }>(
      `SELECT t.tgname FROM pg_trigger t
       JOIN pg_class c ON t.tgrelid = c.oid
       WHERE c.relname IN ('audit_ledger', 'ledger_snapshots')
         AND NOT t.tgisinternal
         AND t.tgname IN ('audit_ledger_no_update', 'audit_ledger_no_delete',
                          'ledger_snapshots_no_update', 'ledger_snapshots_no_delete')`
    );
    const names = new Set(triggerRow.rows.map((r) => r.tgname));
    auditLedgerTrigger = names.has('audit_ledger_no_update') && names.has('audit_ledger_no_delete');
    snapshotTrigger = names.has('ledger_snapshots_no_update') && names.has('ledger_snapshots_no_delete');
  } catch { /* triggers query may fail */ }

  // Evidence count
  let totalDocuments = 0;
  let totalManifests = 0;
  try {
    const evRow = await pool.query<{ count: string }>('SELECT COUNT(*)::text FROM evidence_records WHERE tenant_id = $1', [tenantId]);
    totalDocuments = parseInt(evRow.rows[0]?.count ?? '0', 10);
    const mfRow = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM ledger_snapshots WHERE tenant_id = $1 AND snapshot_payload_json->'evidenceManifest' IS NOT NULL`,
      [tenantId]
    );
    totalManifests = parseInt(mfRow.rows[0]?.count ?? '0', 10);
  } catch { /* evidence tables may not exist */ }

  // AI transparency — aggregate from certification artifacts' aiMetadata
  let aiAccepted = 0;
  let aiEdited = 0;
  let aiRejected = 0;
  let varAiDrafted = 0;
  let varAiEdited = 0;
  let varManual = 0;
  try {
    const aiRow = await pool.query<{ artifact_json: unknown }>(
      `SELECT artifact_json FROM certification_artifacts WHERE tenant_id = $1`,
      [tenantId]
    );
    for (const row of aiRow.rows) {
      const artifact = row.artifact_json as { aiMetadata?: CertificationArtifactAiMetadata };
      const meta = artifact?.aiMetadata;
      if (meta) {
        aiAccepted += meta.coaMappingSuggestionsAccepted ?? 0;
        aiEdited += meta.coaMappingSuggestionsEdited ?? 0;
        aiRejected += meta.coaMappingSuggestionsRejected ?? 0;
        varAiDrafted += meta.varianceExplanationsAiDraft ?? 0;
        varAiEdited += meta.varianceExplanationsAiEdited ?? 0;
        varManual += meta.varianceExplanationsManual ?? 0;
      }
    }
  } catch { /* artifacts may not exist */ }

  // Certification timeline
  const timelineRow = await pool.query<{
    id: string; close_session_id: string; period_label: string; artifact_json: unknown; created_at: string;
  }>(
    `SELECT id, close_session_id, period_label, artifact_json, created_at
     FROM certification_artifacts
     WHERE tenant_id = $1
     ORDER BY period_label ASC, created_at ASC`,
    [tenantId]
  );

  const timelineByPeriod = new Map<string, typeof timelineRow.rows>();
  for (const row of timelineRow.rows) {
    const period = row.period_label;
    if (!timelineByPeriod.has(period)) timelineByPeriod.set(period, []);
    timelineByPeriod.get(period)!.push(row);
  }

  const certificationTimeline: IntegrityReport['certificationTimeline'] = [];
  for (const [period, artifacts] of timelineByPeriod) {
    // Use the latest artifact per period for the timeline entry
    const latest = artifacts[artifacts.length - 1];
    const art = latest.artifact_json as { certifiedAt?: string; certifiedBy?: string };
    const session = sessions.find((s) => s.id === latest.close_session_id);
    let days: number | null = null;
    if (session?.certified_at) {
      days = Math.round((new Date(session.certified_at).getTime() - new Date(session.created_at).getTime()) / 86_400_000);
    }
    certificationTimeline.push({
      period,
      certifiedAt: art.certifiedAt ?? (typeof latest.created_at === 'string' ? latest.created_at : new Date(latest.created_at).toISOString()),
      certifiedBy: art.certifiedBy ?? null,
      closeDays: days,
      restatements: artifacts.length - 1,
      artifactId: latest.id,
    });
  }

  return {
    entity: { name: entityName, id: tenantId },
    reportDate: now,
    periodsCovered: {
      earliest, latest, totalPeriods, certifiedPeriods, lockedPeriods, uncertifiedPeriods,
    },
    certificationCompleteness: completeness,
    restatements: {
      count: restatementSessions.size,
      details: restatementDetails,
    },
    closePerformance: {
      averageCloseDays: avgClose,
      fastestClose: fastest,
      slowestClose: slowest,
      trend,
      last6Months: last6Padded,
    },
    auditChain,
    immutabilityEnforcement: { auditLedgerTrigger, snapshotTrigger },
    evidenceIntegrity: { totalDocuments, totalManifests },
    aiTransparency: {
      totalMappingSuggestions: aiAccepted + aiEdited + aiRejected,
      aiAccepted, aiEdited, aiRejected,
      varianceExplanations: { aiDrafted: varAiDrafted, aiEdited: varAiEdited, manual: varManual },
    },
    cryptographicVerification: {
      signingAlgorithm: 'Ed25519',
      publicKeyEndpoint: '/api/verification/certification/public-key',
      verificationEndpoint: '/api/verification/certification/verify',
      offlineVerifiable: true,
    },
    certificationTimeline,
  };
}

// ────────────────────────────────────────────────────────
// Portfolio-level report
// ────────────────────────────────────────────────────────

export async function buildPortfolioIntegrityReport(
  controlPool: Pool,
  userId: string
): Promise<PortfolioIntegrityReport> {
  const now = new Date().toISOString();
  const entityRows = await controlPool.query<{ tenant_id: string; name: string }>(
    `SELECT pa.tenant_id, t.name FROM portfolio_access pa
     JOIN tenants t ON t.id = pa.tenant_id
     WHERE pa.user_id = $1 ORDER BY t.name`,
    [userId]
  );

  const entities: PortfolioIntegrityReport['entities'] = [];
  let totalCert = 0;
  let totalRestatements = 0;
  let closeDaysSum = 0;
  let closeDaysCount = 0;
  let allChainsIntact = true;
  let aiAccepted = 0;
  let aiTotal = 0;
  let varAiDrafted = 0;
  let varTotal = 0;

  for (const entity of entityRows.rows) {
    let pool: Pool;
    try {
      pool = await getTenantPool(entity.tenant_id);
    } catch { continue; }

    try {
      const report = await buildEntityIntegrityReport(pool, entity.tenant_id, entity.name);

      entities.push({
        id: entity.tenant_id,
        name: entity.name,
        totalPeriods: report.periodsCovered.totalPeriods,
        certifiedPeriods: report.periodsCovered.certifiedPeriods,
        restatements: report.restatements.count,
        averageCloseDays: report.closePerformance.averageCloseDays,
        auditChainIntact: report.auditChain.chainIntact,
      });

      totalCert += report.periodsCovered.certifiedPeriods;
      totalRestatements += report.restatements.count;
      if (report.closePerformance.averageCloseDays != null) {
        closeDaysSum += report.closePerformance.averageCloseDays;
        closeDaysCount++;
      }
      if (!report.auditChain.chainIntact) allChainsIntact = false;
      aiAccepted += report.aiTransparency.aiAccepted;
      aiTotal += report.aiTransparency.totalMappingSuggestions;
      varAiDrafted += report.aiTransparency.varianceExplanations.aiDrafted;
      varTotal += report.aiTransparency.varianceExplanations.aiDrafted
        + report.aiTransparency.varianceExplanations.aiEdited
        + report.aiTransparency.varianceExplanations.manual;
    } catch {
      entities.push({
        id: entity.tenant_id,
        name: entity.name,
        totalPeriods: 0,
        certifiedPeriods: 0,
        restatements: 0,
        averageCloseDays: null,
        auditChainIntact: false,
      });
    }
  }

  return {
    reportDate: now,
    totalEntities: entities.length,
    entities,
    aggregates: {
      totalPeriodsCertified: totalCert,
      totalRestatements,
      averageCloseDaysPortfolio: closeDaysCount > 0 ? Math.round(closeDaysSum / closeDaysCount * 10) / 10 : null,
      allAuditChainsIntact: allChainsIntact,
      aiMappingSuggestionsAccepted: aiAccepted,
      aiMappingSuggestionsTotal: aiTotal,
      varianceExplanationsAiDrafted: varAiDrafted,
      varianceExplanationsTotal: varTotal,
    },
  };
}
