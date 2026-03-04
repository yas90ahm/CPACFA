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
  // Auto-apply eligible templates if enabled
  try {
    const { getEntitySettings } = await import('./entity_settings_service.js');
    const settings = await getEntitySettings(pool, input.tenantId, input.entityId ?? 'default');
    if (settings.templateAutoApplyEnabled) {
      const eligible = await repo.getAutoApplyEligibleTemplates(
        pool, input.tenantId, input.entityId, settings.autoApplyAfterNPeriods
      );
      const autoAppliedNames: string[] = [];
      for (const t of eligible) {
        if (existingTemplateIds.has(t.id)) continue;
        try {
          // Create application as auto_applied
          const appId = randomUUID();
          const app = await repo.insertApplication(pool, appId, {
            tenantId: input.tenantId,
            templateId: t.id,
            closeSessionId: input.closeSessionId,
            periodLabel: input.periodLabel,
            status: 'auto_applied',
          });
          // Create the draft JE
          const lines = t.lines.map((l) => ({
            accountRef: l.accountRef,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            description: l.description,
            amountProvenance:
              (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0
                ? { kind: 'engine_calculation' as const, ruleId: t.id, ruleVersion: '1', inputs: { template: true, autoApplied: true } }
                : undefined,
          }));
          const je = await createDraftJE(pool, {
            closeSessionId: input.closeSessionId,
            tenantId: input.tenantId,
            memo: `[Auto-applied] ${t.memo}`,
            source: 'accrual',
            createdBy: 'auto_apply',
            lines,
          });
          await repo.updateApplicationStatus(pool, input.tenantId, appId, 'applied', { appliedJeId: je.id });
          existingTemplateIds.add(t.id);
          autoAppliedNames.push(t.name);
        } catch {
          /* non-fatal: skip individual auto-apply failures */
        }
      }
      if (autoAppliedNames.length > 0) {
        try {
          const { appendEntry } = await import('../db/repositories/audit_ledger_repository.js');
          await appendEntry(pool, {
            tenantId: input.tenantId,
            eventType: 'template_auto_applied',
            deterministicFlagSnapshot: {
              closeSessionId: input.closeSessionId,
              templates: autoAppliedNames,
              count: autoAppliedNames.length,
            },
            userPromptRationale: `Auto-applied ${autoAppliedNames.length} templates: ${autoAppliedNames.join(', ')}`,
          });
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    /* non-fatal: auto-apply feature failed gracefully */
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
  await repo.updateApplicationStatus(pool, input.tenantId, input.applicationId, 'applied', { appliedJeId: je.id });

  // Increment consecutive unchanged counter for this template
  try {
    const { getEntitySettings } = await import('./entity_settings_service.js');
    const settings = await getEntitySettings(pool, input.tenantId, template.entityId ?? 'default');
    await repo.incrementConsecutiveUnchanged(pool, input.tenantId, template.id, settings.autoApplyAfterNPeriods);
  } catch {
    /* non-fatal */
  }

  const updated = await repo.getApplicationsForSession(pool, input.tenantId, input.closeSessionId);
  const updatedApp = updated.find((a) => a.id === input.applicationId)!;
  return { jeId: je.id, application: updatedApp };
}

export interface SkipTemplateInput {
  tenantId: string;
  applicationId: string;
  closeSessionId: string;
  /** Reason for skipping (required, min 5 chars). */
  reason: string;
}

/** Skip a proposed template. Reason is required (min 5 chars). */
export async function skipTemplate(
  pool: Pool,
  input: SkipTemplateInput
): Promise<AjeTemplateApplication> {
  const reasonTrimmed = input.reason?.trim() ?? '';
  if (reasonTrimmed.length < 5) {
    throw new Error('Skip reason is required (minimum 5 characters)');
  }
  const apps = await repo.getApplicationsForSession(pool, input.tenantId, input.closeSessionId);
  const app = apps.find((a) => a.id === input.applicationId);
  if (!app) throw new Error('Template application not found');
  if (app.status !== 'proposed') throw new Error(`Application status is ${app.status}, expected proposed`);
  const updated = await repo.updateApplicationStatus(
    pool,
    input.tenantId,
    input.applicationId,
    'skipped',
    { skipReason: reasonTrimmed }
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
