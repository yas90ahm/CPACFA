import { describe, expect, it } from '@jest/globals';
import {
  CloseCycleScheduleError,
  getCloseCycleStartAt,
  isCloseCycleDue,
  nextClosePeriodLabel,
  validateCloseCycleSchedule,
} from '../../src/services/close_cycle_schedule.js';

describe('Close-cycle schedule', () => {
  it('preserves the configured Toronto wall-clock time across standard and daylight time', () => {
    const base = {
      frequency: 'monthly' as const,
      nextPeriodLabel: '2026-01',
      startOffsetDays: 1,
      startTimeLocal: '06:00',
      timezone: 'America/Toronto',
    };

    expect(getCloseCycleStartAt(base).toISOString()).toBe('2026-02-01T11:00:00.000Z');
    expect(getCloseCycleStartAt({ ...base, nextPeriodLabel: '2026-06' }).toISOString())
      .toBe('2026-07-01T10:00:00.000Z');
  });

  it('advances monthly and quarterly reporting periods over year end', () => {
    expect(nextClosePeriodLabel('2026-12', 'monthly')).toBe('2027-01');
    expect(nextClosePeriodLabel('2026-12', 'quarterly')).toBe('2027-03');
    expect(nextClosePeriodLabel('2026-09', 'quarterly')).toBe('2026-12');
  });

  it('rejects a non-quarter-end period for a quarterly cycle', () => {
    expect(() => validateCloseCycleSchedule({
      frequency: 'quarterly',
      nextPeriodLabel: '2026-02',
      startOffsetDays: 1,
      startTimeLocal: '06:00',
      timezone: 'America/Toronto',
    })).toThrow(CloseCycleScheduleError);
  });

  it('becomes due at the exact configured instant', () => {
    const schedule = {
      frequency: 'monthly' as const,
      nextPeriodLabel: '2026-01',
      startOffsetDays: 1,
      startTimeLocal: '06:00',
      timezone: 'America/Toronto',
    };
    expect(isCloseCycleDue(schedule, new Date('2026-02-01T10:59:59.999Z'))).toBe(false);
    expect(isCloseCycleDue(schedule, new Date('2026-02-01T11:00:00.000Z'))).toBe(true);
  });
});
