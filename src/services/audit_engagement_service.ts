/**
 * Audit engagements — create/list/get engagements, add/remove periods, close status and audit file for engagement.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/audit_engagement_repository.js';
import type { AuditEngagementRow, AuditEngagementPeriodRow } from '../db/repositories/audit_engagement_repository.js';
import { buildCloseStatus, type CloseStatus } from './close_status_service.js';
import { buildAuditFile, type AuditFile } from './audit_file_service.js';

export type AuditEngagement = AuditEngagementRow;
export type AuditEngagementPeriod = AuditEngagementPeriodRow;

export interface EngagementCloseStatus {
  engagementId: string;
  engagementName: string;
  periodStatuses: { periodLabel: string; closeStatus: CloseStatus }[];
}

export interface EngagementAuditFile {
  engagementId: string;
  engagementName: string;
  periodFiles: { periodLabel: string; auditFile: AuditFile }[];
}

export async function createEngagement(
  tenantId: string,
  pool: Pool,
  name: string,
  status: string = 'draft'
): Promise<AuditEngagement> {
  return repo.createEngagement(pool, tenantId, name, status);
}

export async function listEngagements(tenantId: string, pool: Pool): Promise<AuditEngagement[]> {
  return repo.listEngagements(pool, tenantId);
}

export async function getEngagement(
  tenantId: string,
  pool: Pool,
  id: string
): Promise<AuditEngagement | null> {
  return repo.getEngagement(pool, tenantId, id);
}

export async function updateEngagement(
  tenantId: string,
  pool: Pool,
  id: string,
  patch: { name?: string; status?: string }
): Promise<AuditEngagement | null> {
  return repo.updateEngagement(pool, tenantId, id, patch);
}

export async function deleteEngagement(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteEngagement(pool, tenantId, id);
}

export async function addPeriodToEngagement(
  tenantId: string,
  pool: Pool,
  engagementId: string,
  periodLabel: string,
  sortOrder: number = 0
): Promise<AuditEngagementPeriod | null> {
  const eng = await repo.getEngagement(pool, tenantId, engagementId);
  if (!eng) return null;
  return repo.addPeriodToEngagement(pool, engagementId, periodLabel, sortOrder);
}

export async function removePeriodFromEngagement(
  tenantId: string,
  pool: Pool,
  engagementId: string,
  periodLabel: string
): Promise<boolean> {
  const eng = await repo.getEngagement(pool, tenantId, engagementId);
  if (!eng) return false;
  return repo.removePeriodFromEngagement(pool, engagementId, periodLabel);
}

export async function listPeriodsForEngagement(
  tenantId: string,
  pool: Pool,
  engagementId: string
): Promise<AuditEngagementPeriod[]> {
  const eng = await repo.getEngagement(pool, tenantId, engagementId);
  if (!eng) return [];
  return repo.listPeriodsForEngagement(pool, engagementId);
}

/**
 * Close status for each period in the engagement.
 */
export async function getCloseStatusForEngagement(
  tenantId: string,
  pool: Pool,
  engagementId: string
): Promise<EngagementCloseStatus | null> {
  const eng = await repo.getEngagement(pool, tenantId, engagementId);
  if (!eng) return null;
  const periods = await repo.listPeriodsForEngagement(pool, engagementId);
  const periodStatuses = await Promise.all(
    periods.map(async (p) => {
      const closeStatus = await buildCloseStatus(tenantId, p.periodLabel, pool);
      return { periodLabel: p.periodLabel, closeStatus };
    })
  );
  return {
    engagementId: eng.id,
    engagementName: eng.name,
    periodStatuses,
  };
}

/**
 * Audit file for each period in the engagement (list of period-level files).
 */
export async function getAuditFileForEngagement(
  tenantId: string,
  pool: Pool,
  engagementId: string
): Promise<EngagementAuditFile | null> {
  const eng = await repo.getEngagement(pool, tenantId, engagementId);
  if (!eng) return null;
  const periods = await repo.listPeriodsForEngagement(pool, engagementId);
  const periodFiles = await Promise.all(
    periods.map(async (p) => {
      const auditFile = await buildAuditFile(tenantId, p.periodLabel, pool);
      return { periodLabel: p.periodLabel, auditFile };
    })
  );
  return {
    engagementId: eng.id,
    engagementName: eng.name,
    periodFiles,
  };
}
