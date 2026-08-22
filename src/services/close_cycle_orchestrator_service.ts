import {
  createTenantScopedPool,
  getTenantPoolWithMigrations,
} from '../db/index.js';
import { log } from '../lib/logger.js';
import {
  CANADIAN_ASPE_PROFILE_ID,
  type CloseFrequency,
} from '../types/accounting_close_profile.js';
import type { CompiledCloseRunbook } from '../types/close_runbook.js';
import { getCloseCalendarConfig } from './close_calendar_config_service.js';
import { getCanadianAspeCloseProfile } from './canadian_aspe_close_profile.js';
import {
  advanceSession,
  ensureSessionForPeriod,
  periodLabelToPeriodBounds,
} from './close_session_service.js';
import { initializeChecklistTemplate } from './close_checklist_readiness_service.js';
import { getEntitySettings } from './entity_settings_service.js';
import { autoGenerateReconRequirements } from './recon_requirements_auto_generate.js';
import { syncTrialBalance } from './accounting_integration_service.js';
import { executeBridgeCommand } from '../bridge/index.js';
import { getActiveRunbook } from './close_runbook_service.js';
import { instantiateApprovedRunbookForSession } from './runbook_execution_service.js';
import {
  enqueueCloseOrchestratorReconcile,
  ensureCloseOrchestratorRun,
} from './close_orchestrator_service.js';

export interface CloseCycleKickoffPayload {
  tenantId: string;
  entityId: string;
  connectionId: string;
  periodLabel: string;
  profileId: string;
  frequency: CloseFrequency;
}

export interface AutomaticCloseRunbookCandidate {
  id: string;
  framework: 'ASPE';
  frequency: CloseFrequency;
  profileId: string;
  compiledPlan: Pick<
    CompiledCloseRunbook,
    'profileId' | 'framework' | 'frequency' | 'executable' | 'requiresHumanApproval'
  >;
}

/**
 * Pure preflight for the only execution plan an automatic close may use.
 * Keep this separate from database access so the fail-closed contract can be
 * tested without mocking the full ESM startup and ERP dependency graph.
 */
export function validateAutomaticCloseRunbook(
  runbook: AutomaticCloseRunbookCandidate | null | undefined,
  expectedProfileId: string,
  expectedFrequency: CloseFrequency
): AutomaticCloseRunbookCandidate {
  if (!runbook) {
    throw new Error(
      `No approved Canadian ASPE runbook is active for the ${expectedFrequency} close; upload and approve a runbook before automatic kickoff`
    );
  }

  const plan = runbook.compiledPlan;
  const valid =
    runbook.framework === 'ASPE' &&
    runbook.frequency === expectedFrequency &&
    runbook.profileId === expectedProfileId &&
    plan.framework === 'ASPE' &&
    plan.frequency === expectedFrequency &&
    plan.profileId === expectedProfileId &&
    plan.executable &&
    plan.requiresHumanApproval === true;

  if (!valid) {
    throw new Error(
      `Active runbook ${runbook.id} is not executable under the configured Canadian ASPE close profile`
    );
  }
  return runbook;
}

async function getScopedTenantPool(tenantId: string) {
  const pool = await getTenantPoolWithMigrations(tenantId);
  return createTenantScopedPool(pool, tenantId);
}

function validateKickoffPayload(payload: Partial<CloseCycleKickoffPayload>): asserts payload is CloseCycleKickoffPayload {
  if (
    !payload.tenantId ||
    !payload.entityId ||
    !payload.connectionId ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.periodLabel ?? '') ||
    payload.profileId !== CANADIAN_ASPE_PROFILE_ID ||
    (payload.frequency !== 'monthly' && payload.frequency !== 'quarterly')
  ) {
    throw new Error(
      'close_cycle_kickoff job requires tenantId, entityId, connectionId, YYYY-MM periodLabel, Canadian ASPE profileId, and frequency'
    );
  }
}

/**
 * Start one configured Canadian ASPE close. An approved company runbook is the
 * sole execution plan; without one, the kickoff fails closed instead of
 * silently switching to an older, non-runbook worker path.
 */
export async function startConfiguredCloseCycle(
  rawPayload: Partial<CloseCycleKickoffPayload>
): Promise<void> {
  validateKickoffPayload(rawPayload);
  const { tenantId, entityId, connectionId, periodLabel, profileId, frequency } = rawPayload;
  const pool = await getScopedTenantPool(tenantId);
  const config = await getCloseCalendarConfig(tenantId, pool);
  if (!config?.autoStartEnabled) {
    log('info', 'Close-cycle kickoff skipped because automation is disabled', { tenantId, periodLabel });
    return;
  }
  if (
    config.entityId !== entityId ||
    config.connectionId !== connectionId ||
    config.profileId !== profileId
  ) {
    log('warn', 'Close-cycle kickoff skipped because its configuration was replaced', {
      tenantId,
      entityId,
      periodLabel,
    });
    return;
  }

  const entitySettings = await getEntitySettings(pool, tenantId, entityId);
  if (entitySettings.functionalCurrency.toUpperCase() !== 'CAD') {
    throw new Error(`Canadian ASPE close requires CAD functional currency for entity ${entityId}`);
  }

  // Validate the governed execution plan before creating a session, syncing the
  // ERP, or advancing the close. A missing/invalid plan must leave no partial
  // close-cycle state behind.
  const activeRunbook = await getActiveRunbook(pool, tenantId, entityId, frequency);
  const validatedRunbook = validateAutomaticCloseRunbook(activeRunbook, profileId, frequency);

  const bounds = periodLabelToPeriodBounds(periodLabel);
  if (!bounds) throw new Error(`Invalid close period: ${periodLabel}`);
  const ensured = await ensureSessionForPeriod(pool, tenantId, entityId, periodLabel, {
    basis: 'accrual',
    standard: 'ASPE',
  });
  const session = ensured.session;
  if (session.basis !== 'accrual' || session.standard.toUpperCase() !== 'ASPE') {
    throw new Error(
      `Existing close session ${session.id} is ${session.standard}/${session.basis}; Canadian kickoff requires ASPE/accrual`
    );
  }

  // The accounting source is pulled and persisted before any procedure runs.
  // Mock adapters remain fail-closed unless explicitly enabled outside prod.
  const syncResult = await syncTrialBalance(connectionId, bounds.periodEnd, pool, tenantId);
  if (!syncResult.success || syncResult.entries.length === 0) {
    throw new Error(
      `ERP trial-balance sync failed: ${syncResult.errors.join('; ') || 'source returned no entries'}`
    );
  }
  const saved = await executeBridgeCommand(
    { pool, tenantId, actor: 'system:close-cycle-scheduler', actorRole: 'approver' },
    {
      commandType: 'SaveTrialBalance',
      periodLabel,
      entries: syncResult.entries,
      source: 'synced',
      connectionId,
      syncedBy: 'system:close-cycle-scheduler',
    }
  );
  if (!saved.ok) {
    throw new Error(`ERP trial balance was rejected by the accounting bridge: ${saved.error}`);
  }

  const profile = getCanadianAspeCloseProfile(frequency);
  await initializeChecklistTemplate(pool, tenantId, session.id, {
    items: profile.requirements.map((requirement) => ({
      code: requirement.code,
      name: requirement.name,
      required: requirement.required,
    })),
  });
  await autoGenerateReconRequirements(
    pool,
    tenantId,
    entityId,
    entitySettings.varianceMaterialityDollar
  );

  if (session.status === 'open') {
    const advanced = await advanceSession(pool, {
      tenantId,
      closeSessionId: session.id,
      certifiedBy: 'system:close-cycle-scheduler',
      actorRole: 'approver',
    });
    if (!advanced.success || advanced.statusAfter !== 'in_progress') {
      throw new Error(`Automatic close kickoff could not start session ${session.id}`);
    }
  }

  const runbookExecution = await instantiateApprovedRunbookForSession(pool, {
    tenantId,
    entityId,
    closeSessionId: session.id,
    frequency,
  });
  if (!runbookExecution) {
    throw new Error(
      `Approved runbook ${validatedRunbook.id} became inactive during kickoff; retry after confirming the active runbook`
    );
  }

  await ensureCloseOrchestratorRun(pool, tenantId, session.id);
  await enqueueCloseOrchestratorReconcile({
    tenantId,
    closeSessionId: session.id,
    trigger: 'close_started',
    sourceType: 'close_session',
    sourceId: session.id,
  });

  log('info', 'Canadian ASPE close cycle started automatically', {
    tenantId,
    entityId,
    periodLabel,
    closeSessionId: session.id,
    created: ensured.created,
    orchestrationMode: 'approved_runbook',
    runbookExecutionId: runbookExecution.id,
  });
}
