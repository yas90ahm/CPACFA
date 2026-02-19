/**
 * AJE template service: CRUD, propose for period, apply, skip.
 * Template amounts are defaults; user can override when applying.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  AjeTemplate,
  AjeTemplateLine,
  AjeTemplateApplication,
  CreateAjeTemplateInput,
} from '../types/aje_template.js';
import * as repo from '../db/repositories/aje_template_repository.js';
import { createDraftJE } from './journal_entry_service.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';

export interface ProposeTemplateInput {
  tenantId: string;
  closeSessionId: string;
  periodLabel: string;
  entityId?: string;
}

export interface ProposeResult {
  proposed: AjeTemplateApplication[];
  alreadyHandled: string[];
}

export interface TemplateStatusForPeriod {
  closeSessionId: string;
  periodLabel: string;
  applications: Array<AjeTemplateApplication & { template?: AjeTemplate }>;
  pendingCount: number;
}

/** Propose applicable templates for a close session. Skips templates already applied/skipped. */
export async function proposeTemplatesForPeriod(
  pool: Pool,
  input: ProposeTemplateInput
): Promise<ProposeResult> {
  const templates = await repo.listTemplates(pool, input.tenantId, {
    entityId: input.entityId,
    isActive: true,
  });
  const existing = await repo.getApplicationsForSession(
    pool,
    input.tenantId,
    input.closeSessionId
  );
  const existingTemplateIds = new Set(existing.map((a) => a.templateId));
  const proposed: AjeTemplateApplication[] = [];
  const alreadyHandled: string[] = [];
  for (const t of templates) {
    if (existingTemplateIds.has(t.id)) {
      alreadyHandled.push(t.id);
      continue;
    }
    const app = await repo.insertApplication(pool, randomUUID(), {
      tenantId: input.tenantId,
      templateId: t.id,
      closeSessionId: input.closeSessionId,
      periodLabel: input.periodLabel,
      status: 'proposed',
    });
    proposed.push(app);
    existingTemplateIds.add(t.id);
  }
  return { proposed, alreadyHandled };
}

export interface ApplyTemplateInput {
  tenantId: string;
  applicationId: string;
  closeSessionId: string;
  createdBy?: string;
  /** Override template line amounts (keyed by accountRef or line index). */
  lineOverrides?: Array<{ accountRef: string; debit?: number; credit?: number }>;
}

/** Apply a proposed template: create draft JE from template, then mark application as applied. */
export async function applyTemplate(
  pool: Pool,
  input: ApplyTemplateInput
): Promise<{ jeId: string; application: AjeTemplateApplication }> {
  const apps = await repo.getApplicationsForSession(pool, input.tenantId, input.closeSessionId);
  const app = apps.find((a) => a.id === input.applicationId);
  if (!app) throw new Error('Template application not found');
  if (app.status !== 'proposed') throw new Error(`Application status is ${app.status}, expected proposed`);
  const template = await repo.getTemplateById(pool, input.tenantId, app.templateId);
  if (!template) throw new Error('Template not found');
  const overrideMap = new Map(
    (input.lineOverrides ?? []).map((o) => [o.accountRef, o])
  );
  const lines = template.lines.map((l) => {
    const ov = overrideMap.get(l.accountRef);
    const debit = ov?.debit ?? l.debit ?? 0;
    const credit = ov?.credit ?? l.credit ?? 0;
    return {
      accountRef: l.accountRef,
      debit,
      credit,
      description: l.description,
      amountProvenance:
        debit !== 0 || credit !== 0
          ? { kind: 'engine_calculation' as const, ruleId: template.id, ruleVersion: '1', inputs: { template: true } }
          : undefined,
    };
  });
  const je = await createDraftJE(pool, {
    closeSessionId: input.closeSessionId,
    tenantId: input.tenantId,
    memo: template.memo,
    source: 'accrual',
    createdBy: input.createdBy,
    lines,
  });
  await repo.updateApplicationStatus(pool, input.tenantId, input.applicationId, 'applied', je.id);
  const updated = await repo.getApplicationsForSession(pool, input.tenantId, input.closeSessionId);
  const updatedApp = updated.find((a) => a.id === input.applicationId)!;
  return { jeId: je.id, application: updatedApp };
}

export interface SkipTemplateInput {
  tenantId: string;
  applicationId: string;
  closeSessionId: string;
}

/** Skip a proposed template. */
export async function skipTemplate(
  pool: Pool,
  input: SkipTemplateInput
): Promise<AjeTemplateApplication> {
  const apps = await repo.getApplicationsForSession(pool, input.tenantId, input.closeSessionId);
  const app = apps.find((a) => a.id === input.applicationId);
  if (!app) throw new Error('Template application not found');
  if (app.status !== 'proposed') throw new Error(`Application status is ${app.status}, expected proposed`);
  const updated = await repo.updateApplicationStatus(
    pool,
    input.tenantId,
    input.applicationId,
    'skipped'
  );
  if (!updated) throw new Error('Failed to update application');
  return updated;
}

/** Get template status for a close session. */
export async function getTemplateStatusForPeriod(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  loadTemplates?: boolean
): Promise<TemplateStatusForPeriod> {
  const session = await getCloseSessionById(pool, tenantId, closeSessionId);
  if (!session) throw new Error('Close session not found');
  const periodLabel = session.periodEnd.slice(0, 7);
  const applications = await repo.getApplicationsForSession(pool, tenantId, closeSessionId);
  const withTemplates = loadTemplates
    ? await Promise.all(
        applications.map(async (a) => {
          const t = await repo.getTemplateById(pool, tenantId, a.templateId);
          return { ...a, template: t ?? undefined };
        })
      )
    : applications.map((a) => ({ ...a, template: undefined }));
  const pendingCount = withTemplates.filter((a) => a.status === 'proposed').length;
  return {
    closeSessionId,
    periodLabel,
    applications: withTemplates,
    pendingCount,
  };
}
