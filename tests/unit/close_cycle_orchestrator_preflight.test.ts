import { describe, expect, it } from '@jest/globals';
import {
  validateAutomaticCloseRunbook,
  type AutomaticCloseRunbookCandidate,
} from '../../src/services/close_cycle_orchestrator_service.js';
import {
  CANADIAN_ASPE_PROFILE_ID,
  CANADIAN_ASPE_PROFILE_VERSION,
} from '../../src/types/accounting_close_profile.js';

function runbook(overrides: Partial<AutomaticCloseRunbookCandidate> = {}): AutomaticCloseRunbookCandidate {
  return {
    id: 'runbook-1',
    framework: 'ASPE',
    frequency: 'monthly',
    profileId: CANADIAN_ASPE_PROFILE_ID,
    compiledPlan: {
      profileId: CANADIAN_ASPE_PROFILE_ID,
      profileVersion: CANADIAN_ASPE_PROFILE_VERSION,
      framework: 'ASPE',
      frequency: 'monthly',
      executable: true,
      requiresHumanApproval: true,
    },
    ...overrides,
  };
}

describe('automatic close runbook preflight', () => {
  it('rejects a missing active runbook before any close work can begin', () => {
    expect(() => validateAutomaticCloseRunbook(undefined, CANADIAN_ASPE_PROFILE_ID, 'monthly'))
      .toThrow(/No approved Canadian ASPE runbook is active/);
  });

  it('rejects a runbook compiled for a different close profile', () => {
    expect(() => validateAutomaticCloseRunbook(
      runbook({
        profileId: 'wrong-profile',
        compiledPlan: {
          ...runbook().compiledPlan,
          profileId: 'wrong-profile',
        },
      }),
      CANADIAN_ASPE_PROFILE_ID,
      'monthly'
    )).toThrow(/not executable under the configured Canadian ASPE close profile/);
  });

  it('rejects a non-executable runbook even when its profile matches', () => {
    expect(() => validateAutomaticCloseRunbook(
      runbook({
        compiledPlan: {
          ...runbook().compiledPlan,
          executable: false,
        },
      }),
      CANADIAN_ASPE_PROFILE_ID,
      'monthly'
    )).toThrow(/not executable under the configured Canadian ASPE close profile/);
  });

  it('rejects a runbook approved for a different close frequency', () => {
    expect(() => validateAutomaticCloseRunbook(
      runbook({
        frequency: 'quarterly',
        compiledPlan: {
          ...runbook().compiledPlan,
          frequency: 'quarterly',
        },
      }),
      CANADIAN_ASPE_PROFILE_ID,
      'monthly'
    )).toThrow(/not executable under the configured Canadian ASPE close profile/);
  });

  it('rejects an automatic plan that does not retain human approval', () => {
    expect(() => validateAutomaticCloseRunbook(
      runbook({
        compiledPlan: {
          ...runbook().compiledPlan,
          requiresHumanApproval: false,
        },
      }),
      CANADIAN_ASPE_PROFILE_ID,
      'monthly'
    )).toThrow(/not executable under the configured Canadian ASPE close profile/);
  });

  it('accepts a matching executable ASPE runbook that requires human approval', () => {
    expect(() => validateAutomaticCloseRunbook(
      runbook(),
      CANADIAN_ASPE_PROFILE_ID,
      'monthly'
    )).not.toThrow();
  });
});
