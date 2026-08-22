import { describe, expect, it } from '@jest/globals';
import {
  CanadianAspeProfileError,
  evaluateCanadianAspeCloseProfile,
  getCanadianAspeCloseProfile,
  parseCloseFrequency,
} from '../../src/services/canadian_aspe_close_profile.js';
import type {
  CloseRequirementDisposition,
  ProhibitedCloseAgentAction,
} from '../../src/types/accounting_close_profile.js';

describe('Canadian ASPE close profile', () => {
  it('keeps the monthly profile inside the one-ERP, one-entity, CAD MVP boundary', () => {
    const profile = getCanadianAspeCloseProfile('monthly');

    expect(profile.jurisdiction).toBe('CA');
    expect(profile.framework).toBe('ASPE');
    expect(profile.erpConnectionCount).toBe(1);
    expect(profile.entityCount).toBe(1);
    expect(profile.functionalCurrency).toBe('CAD');
    expect(profile.requirements).toHaveLength(26);
    expect(new Set(profile.requirements.map((item) => item.code)).size).toBe(profile.requirements.length);
    expect(profile.requirements.some((item) => item.code === 'INCOME_TAX_PROVISION_REVIEW')).toBe(false);
    expect(profile.requirements.some((item) => item.code === 'CASH_FLOW_RECONCILIATION')).toBe(true);
    expect(profile.requirements.some((item) => item.code === 'FOREIGN_CURRENCY_REMEASUREMENT')).toBe(true);
  });

  it('adds quarterly tax, judgment, disclosure, and reporting controls without dropping monthly controls', () => {
    const monthly = getCanadianAspeCloseProfile('monthly');
    const quarterly = getCanadianAspeCloseProfile('quarterly');
    const quarterlyCodes = new Set(quarterly.requirements.map((item) => item.code));

    expect(quarterly.requirements).toHaveLength(34);
    expect(monthly.requirements.every((item) => quarterlyCodes.has(item.code))).toBe(true);
    const quarterlyOnlyCodes = [
      'INCOME_TAX_PROVISION_REVIEW',
      'IMPAIRMENT_INDICATOR_REVIEW',
      'COMMITMENTS_CONTINGENCIES_REVIEW',
      'RELATED_PARTY_REVIEW',
      'SUBSEQUENT_EVENTS_REVIEW',
      'ASPE_DISCLOSURE_REVIEW',
      'QUARTERLY_REPORT_PACKAGE',
    ] as const;
    expect(quarterlyOnlyCodes.every((code) => quarterlyCodes.has(code))).toBe(true);
  });

  it('permits only approved gateway posting and keeps approval and certification human-only', () => {
    const profile = getCanadianAspeCloseProfile('quarterly');
    const prohibited = new Set<string>(profile.agentBoundary.prohibited);
    const expectedProhibited: ProhibitedCloseAgentAction[] = [
      'post_unapproved_journal_entry',
      'bypass_erp_posting_gateway',
      'approve_journal_entry',
      'complete_control',
      'certify_close',
      'lock_period',
      'change_erp_master_data',
    ];

    expect(expectedProhibited.every((action) => prohibited.has(action))).toBe(true);
    expect(profile.agentBoundary.permitted).toContain('post_approved_journal_entry_via_gateway');
    for (const requirement of profile.requirements) {
      expect(requirement.allowedAgentActions.every((action) => !prohibited.has(action))).toBe(true);
    }
    expect(profile.agentBoundary.journalEntryAuthority).toBe('approved_gateway_only');
    expect(profile.agentBoundary.certificationAuthority).toBe('human_approver_only');
  });

  it('blocks a skipped core control', () => {
    const profile = getCanadianAspeCloseProfile('monthly');
    const dispositions: CloseRequirementDisposition[] = profile.requirements.map((item) => ({
      code: item.code,
      status: item.code === 'CASH_FLOW_RECONCILIATION' ? 'skipped' : 'completed',
      notes: item.code === 'CASH_FLOW_RECONCILIATION' ? 'Not done' : undefined,
    }));

    const result = evaluateCanadianAspeCloseProfile(profile, dispositions);

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: 'CASH_FLOW_RECONCILIATION',
      reason: 'skip_not_permitted',
    }));
  });

  it('allows a conditional area to be not applicable only with a documented reason', () => {
    const profile = getCanadianAspeCloseProfile('monthly');
    const base = profile.requirements.map((item): CloseRequirementDisposition => ({
      code: item.code,
      status: item.code === 'INVENTORY_RECONCILIATION' ? 'skipped' : 'completed',
    }));

    const missingReason = evaluateCanadianAspeCloseProfile(profile, base);
    expect(missingReason.ready).toBe(false);
    expect(missingReason.blockers).toContainEqual(expect.objectContaining({
      code: 'INVENTORY_RECONCILIATION',
      reason: 'skip_reason_required',
    }));

    const documented = base.map((item) => item.code === 'INVENTORY_RECONCILIATION'
      ? { ...item, notes: 'Service company; no inventory is held or sold.' }
      : item);
    const complete = evaluateCanadianAspeCloseProfile(profile, documented);
    expect(complete.ready).toBe(true);
    expect(complete.notApplicable).toContain('INVENTORY_RECONCILIATION');
  });

  it('rejects unsupported close frequencies rather than guessing', () => {
    expect(() => parseCloseFrequency('annual')).toThrow(CanadianAspeProfileError);
    expect(parseCloseFrequency(undefined)).toBe('monthly');
  });

  it('fails closed when a control has duplicate dispositions', () => {
    const profile = getCanadianAspeCloseProfile('monthly');
    const dispositions: CloseRequirementDisposition[] = profile.requirements.map((item) => ({
      code: item.code,
      status: 'completed',
    }));
    dispositions.push({ code: 'CASH_REC', status: 'completed' });

    const result = evaluateCanadianAspeCloseProfile(profile, dispositions);

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: 'CASH_REC',
      reason: 'duplicate',
    }));
  });
});
