/**
 * Onboarding state per tenant — DB when pool/tenantId present.
 */

import type { Pool } from 'pg';
import type { OnboardingState, OnboardingStepId, CoAImportResult } from '../../types/onboarding.js';

export async function getOnboarding(pool: Pool, tenantId: string): Promise<OnboardingState | null> {
  const r = await pool.query<{
    tenant_id: string;
    current_step: string;
    completed_steps: unknown;
    entity_info: unknown;
    coa_imported: boolean | null;
    coa_account_count: number | null;
    first_tb_uploaded: boolean | null;
    first_close_completed: boolean | null;
    updated_at: string;
  }>(
    'SELECT tenant_id, current_step, completed_steps, entity_info, coa_imported, coa_account_count, first_tb_uploaded, first_close_completed, updated_at FROM onboarding_state WHERE tenant_id = $1',
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToState(row);
}

export async function upsertOnboarding(
  pool: Pool,
  tenantId: string,
  state: Partial<OnboardingState> & { currentStep: OnboardingStepId; completedSteps: OnboardingStepId[] }
): Promise<OnboardingState> {
  const now = new Date().toISOString();
  const completedSteps = state.completedSteps ?? [];
  const entityInfo = state.entityInfo ?? null;
  await pool.query(
    `INSERT INTO onboarding_state (tenant_id, current_step, completed_steps, entity_info, coa_imported, coa_account_count, first_tb_uploaded, first_close_completed, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id) DO UPDATE SET
       current_step = EXCLUDED.current_step,
       completed_steps = EXCLUDED.completed_steps,
       entity_info = COALESCE(EXCLUDED.entity_info, onboarding_state.entity_info),
       coa_imported = COALESCE(EXCLUDED.coa_imported, onboarding_state.coa_imported),
       coa_account_count = COALESCE(EXCLUDED.coa_account_count, onboarding_state.coa_account_count),
       first_tb_uploaded = COALESCE(EXCLUDED.first_tb_uploaded, onboarding_state.first_tb_uploaded),
       first_close_completed = COALESCE(EXCLUDED.first_close_completed, onboarding_state.first_close_completed),
       updated_at = EXCLUDED.updated_at`,
    [
      tenantId,
      state.currentStep ?? 'welcome',
      JSON.stringify(completedSteps),
      entityInfo ? JSON.stringify(entityInfo) : null,
      state.coaImported ?? false,
      state.coaAccountCount ?? null,
      state.firstTbUploaded ?? false,
      state.firstCloseCompleted ?? false,
      now,
    ]
  );
  const got = await getOnboarding(pool, tenantId);
  if (!got) throw new Error('Upsert onboarding failed');
  return got;
}

export async function updateOnboardingStep(
  pool: Pool,
  tenantId: string,
  completedSteps: OnboardingStepId[],
  currentStep: OnboardingStepId
): Promise<OnboardingState | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE onboarding_state SET completed_steps = $2, current_step = $3, updated_at = $4 WHERE tenant_id = $1',
    [tenantId, JSON.stringify(completedSteps), currentStep, now]
  );
  return getOnboarding(pool, tenantId);
}

export async function setOnboardingEntityInfo(
  pool: Pool,
  tenantId: string,
  entityInfo: { entityName?: string; fiscalYearEnd?: string; currency?: string }
): Promise<OnboardingState | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE onboarding_state SET entity_info = $2, updated_at = $3 WHERE tenant_id = $1',
    [tenantId, JSON.stringify(entityInfo), now]
  );
  return getOnboarding(pool, tenantId);
}

export async function completeOnboardingCoA(
  pool: Pool,
  tenantId: string,
  result: CoAImportResult
): Promise<OnboardingState | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE onboarding_state SET coa_imported = $2, coa_account_count = $3, updated_at = $4 WHERE tenant_id = $1',
    [tenantId, result.success, result.accountCount, now]
  );
  return getOnboarding(pool, tenantId);
}

export async function setOnboardingFirstTbUploaded(pool: Pool, tenantId: string): Promise<OnboardingState | null> {
  const now = new Date().toISOString();
  await pool.query('UPDATE onboarding_state SET first_tb_uploaded = TRUE, updated_at = $2 WHERE tenant_id = $1', [
    tenantId,
    now,
  ]);
  return getOnboarding(pool, tenantId);
}

export async function setOnboardingFirstCloseCompleted(pool: Pool, tenantId: string): Promise<OnboardingState | null> {
  const now = new Date().toISOString();
  await pool.query('UPDATE onboarding_state SET first_close_completed = TRUE, updated_at = $2 WHERE tenant_id = $1', [
    tenantId,
    now,
  ]);
  return getOnboarding(pool, tenantId);
}

function rowToState(row: {
  tenant_id: string;
  current_step: string;
  completed_steps: unknown;
  entity_info: unknown;
  coa_imported: boolean | null;
  coa_account_count: number | null;
  first_tb_uploaded: boolean | null;
  first_close_completed: boolean | null;
  updated_at: string;
}): OnboardingState {
  return {
    tenantId: row.tenant_id,
    currentStep: row.current_step as OnboardingStepId,
    completedSteps: Array.isArray(row.completed_steps) ? (row.completed_steps as OnboardingStepId[]) : [],
    entityInfo:
      row.entity_info && typeof row.entity_info === 'object'
        ? (row.entity_info as { entityName?: string; fiscalYearEnd?: string; currency?: string })
        : undefined,
    coaImported: row.coa_imported ?? undefined,
    coaAccountCount: row.coa_account_count ?? undefined,
    firstTbUploaded: row.first_tb_uploaded ?? undefined,
    firstCloseCompleted: row.first_close_completed ?? undefined,
    updatedAt: row.updated_at,
  };
}
