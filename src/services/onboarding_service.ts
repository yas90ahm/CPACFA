/**
 * Onboarding: guided setup, CoA import, first close wizard.
 * When pool and tenantId are provided, uses tenant DB; in production no in-memory fallback.
 */

import type { Pool } from 'pg';
import { disallowMemoryStoreInProduction } from '../lib/env.js';
import { createInMemoryStore } from '../lib/inMemoryStore.js';
import * as onboardingRepo from '../db/repositories/onboarding_repository.js';
import type { OnboardingState, OnboardingStepId, CoAImportResult } from '../types/onboarding.js';

interface OnboardingRecord extends OnboardingState {
  id: string;
  updatedAt: string;
}
const store = createInMemoryStore<OnboardingRecord>({ idPrefix: 'onb', timestamps: false });

const STEP_ORDER: OnboardingStepId[] = [
  'welcome',
  'entity_info',
  'coa_import',
  'first_tb',
  'first_close_checklist',
  'first_statements',
  'complete',
];

function toState(record: OnboardingRecord): OnboardingState {
  return {
    tenantId: record.tenantId,
    currentStep: record.currentStep,
    completedSteps: record.completedSteps,
    entityInfo: record.entityInfo,
    coaImported: record.coaImported,
    coaAccountCount: record.coaAccountCount,
    firstTbUploaded: record.firstTbUploaded,
    firstCloseCompleted: record.firstCloseCompleted,
    updatedAt: record.updatedAt,
  };
}

export async function getOrCreateOnboarding(
  tenantId: string,
  pool?: Pool | null
): Promise<OnboardingState> {
  if (pool) {
    const existing = await onboardingRepo.getOnboarding(pool, tenantId);
    if (existing) return existing;
    return onboardingRepo.upsertOnboarding(pool, tenantId, {
      currentStep: 'welcome',
      completedSteps: [],
    });
  }
  const list = store.list().filter((s) => s.tenantId === tenantId);
  if (list.length > 0) return toState(list[0]);
  const created = store.create({
    tenantId,
    currentStep: 'welcome',
    completedSteps: [],
  });
  const now = new Date().toISOString();
  store.update(created.id, { updatedAt: now });
  const rec = store.get(created.id) ?? { ...created, updatedAt: now };
  return toState(rec);
}

export async function getOnboarding(
  tenantId: string,
  pool?: Pool | null
): Promise<OnboardingState | undefined> {
  if (pool) {
    const row = await onboardingRepo.getOnboarding(pool, tenantId);
    return row ?? undefined;
  }
  disallowMemoryStoreInProduction({ storeName: 'onboarding', hasDurableContext: false });
  const list = store.list().filter((s) => s.tenantId === tenantId);
  return list[0] ? toState(list[0]) : undefined;
}

export async function advanceStep(
  tenantId: string,
  stepId: OnboardingStepId,
  pool?: Pool | null
): Promise<OnboardingState | undefined> {
  if (pool) {
    const current = await onboardingRepo.getOnboarding(pool, tenantId);
    if (!current) return undefined;
    const completed = current.completedSteps.includes(stepId)
      ? current.completedSteps
      : [...current.completedSteps, stepId];
    const idx = STEP_ORDER.indexOf(stepId);
    const nextStep = idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : stepId;
    return (await onboardingRepo.updateOnboardingStep(pool, tenantId, completed, nextStep)) ?? undefined;
  }
  disallowMemoryStoreInProduction({ storeName: 'onboarding', hasDurableContext: false });
  const list = store.list().filter((s) => s.tenantId === tenantId);
  const record = list[0];
  if (!record) return undefined;
  const completed = record.completedSteps.includes(stepId) ? record.completedSteps : [...record.completedSteps, stepId];
  const idx = STEP_ORDER.indexOf(stepId);
  const nextStep = idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : stepId;
  const updated = store.update(record.id, {
    completedSteps: completed,
    currentStep: nextStep,
    updatedAt: new Date().toISOString(),
  });
  return updated ? toState(updated) : undefined;
}

export async function setEntityInfo(
  tenantId: string,
  entityInfo: { entityName?: string; fiscalYearEnd?: string; currency?: string },
  pool?: Pool | null
): Promise<OnboardingState | undefined> {
  if (pool) return (await onboardingRepo.setOnboardingEntityInfo(pool, tenantId, entityInfo)) ?? undefined;
  const list = store.list().filter((s) => s.tenantId === tenantId);
  const record = list[0];
  if (!record) return undefined;
  const updated = store.update(record.id, { entityInfo, updatedAt: new Date().toISOString() });
  return updated ? toState(updated) : undefined;
}

export async function completeCoAImport(
  tenantId: string,
  result: CoAImportResult,
  pool?: Pool | null
): Promise<OnboardingState | undefined> {
  if (pool) return (await onboardingRepo.completeOnboardingCoA(pool, tenantId, result)) ?? undefined;
  disallowMemoryStoreInProduction({ storeName: 'onboarding', hasDurableContext: false });
  const list = store.list().filter((s) => s.tenantId === tenantId);
  const record = list[0];
  if (!record) return undefined;
  const updated = store.update(record.id, {
    coaImported: result.success,
    coaAccountCount: result.accountCount,
    updatedAt: new Date().toISOString(),
  });
  return updated ? toState(updated) : undefined;
}

export async function setFirstTbUploaded(
  tenantId: string,
  pool?: Pool | null
): Promise<OnboardingState | undefined> {
  if (pool) return (await onboardingRepo.setOnboardingFirstTbUploaded(pool, tenantId)) ?? undefined;
  const list = store.list().filter((s) => s.tenantId === tenantId);
  const record = list[0];
  if (!record) return undefined;
  const updated = store.update(record.id, { firstTbUploaded: true, updatedAt: new Date().toISOString() });
  return updated ? toState(updated) : undefined;
}

export async function setFirstCloseCompleted(
  tenantId: string,
  pool?: Pool | null
): Promise<OnboardingState | undefined> {
  if (pool) return (await onboardingRepo.setOnboardingFirstCloseCompleted(pool, tenantId)) ?? undefined;
  disallowMemoryStoreInProduction({ storeName: 'onboarding', hasDurableContext: false });
  const list = store.list().filter((s) => s.tenantId === tenantId);
  const record = list[0];
  if (!record) return undefined;
  const updated = store.update(record.id, { firstCloseCompleted: true, updatedAt: new Date().toISOString() });
  return updated ? toState(updated) : undefined;
}

/** Import CoA from array of { code, name } */
export function importCoA(accounts: { code: string; name: string }[]): CoAImportResult {
  const errors: string[] = [];
  const sample = accounts.slice(0, 5);
  return { success: true, accountCount: accounts.length, errors, sampleAccounts: sample };
}

export function getSteps(): { id: OnboardingStepId; label: string }[] {
  return [
    { id: 'welcome', label: 'Welcome' },
    { id: 'entity_info', label: 'Entity info' },
    { id: 'coa_import', label: 'Chart of accounts' },
    { id: 'first_tb', label: 'First trial balance' },
    { id: 'first_close_checklist', label: 'First close checklist' },
    { id: 'first_statements', label: 'First statements' },
    { id: 'complete', label: 'Complete' },
  ];
}
