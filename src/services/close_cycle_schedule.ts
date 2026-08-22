import type { CloseFrequency } from '../types/accounting_close_profile.js';

export class CloseCycleScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloseCycleScheduleError';
  }
}

export interface CloseCycleSchedule {
  frequency: CloseFrequency;
  nextPeriodLabel: string;
  startOffsetDays: number;
  startTimeLocal: string;
  timezone: string;
}

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parsePeriodLabel(periodLabel: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodLabel);
  if (!match) {
    throw new CloseCycleScheduleError('nextPeriodLabel must be YYYY-MM');
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parseLocalTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new CloseCycleScheduleError('startTimeLocal must be HH:mm in 24-hour time');
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new CloseCycleScheduleError(`Invalid IANA timezone: ${timezone}`);
  }
}

function formatParts(formatter: Intl.DateTimeFormat, epochMs: number): CalendarParts {
  const parts = formatter.formatToParts(new Date(epochMs));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
}

function asUtcEpoch(parts: CalendarParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** Convert an IANA-zone wall-clock value to a deterministic UTC instant. */
function zonedDateTimeToUtc(parts: CalendarParts, timezone: string): Date {
  const formatter = formatterFor(timezone);
  const desired = asUtcEpoch(parts);
  let candidate = desired;

  // Iterate because the first estimate may cross a daylight-saving boundary.
  for (let i = 0; i < 3; i += 1) {
    const represented = formatParts(formatter, candidate);
    const adjustment = desired - asUtcEpoch(represented);
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const finalParts = formatParts(formatter, candidate);
  if (
    finalParts.year !== parts.year ||
    finalParts.month !== parts.month ||
    finalParts.day !== parts.day ||
    finalParts.hour !== parts.hour ||
    finalParts.minute !== parts.minute
  ) {
    throw new CloseCycleScheduleError(
      `The configured local kickoff time does not exist in timezone ${timezone}`
    );
  }
  return new Date(candidate);
}

export function validateCloseCycleSchedule(schedule: CloseCycleSchedule): void {
  const { month } = parsePeriodLabel(schedule.nextPeriodLabel);
  parseLocalTime(schedule.startTimeLocal);
  formatterFor(schedule.timezone);
  if (!Number.isInteger(schedule.startOffsetDays) || schedule.startOffsetDays < 0 || schedule.startOffsetDays > 31) {
    throw new CloseCycleScheduleError('startOffsetDays must be an integer from 0 to 31');
  }
  if (schedule.frequency === 'quarterly' && ![3, 6, 9, 12].includes(month)) {
    throw new CloseCycleScheduleError('A quarterly close must use a quarter-end nextPeriodLabel (03, 06, 09, or 12)');
  }
}

/** Scheduled UTC instant: reporting-period end + offset, at the configured local time. */
export function getCloseCycleStartAt(
  schedule: CloseCycleSchedule,
  periodLabel: string = schedule.nextPeriodLabel
): Date {
  validateCloseCycleSchedule({ ...schedule, nextPeriodLabel: periodLabel });
  const { year, month } = parsePeriodLabel(periodLabel);
  const { hour, minute } = parseLocalTime(schedule.startTimeLocal);
  const periodEndPlusOffset = new Date(Date.UTC(year, month, schedule.startOffsetDays));
  return zonedDateTimeToUtc(
    {
      year: periodEndPlusOffset.getUTCFullYear(),
      month: periodEndPlusOffset.getUTCMonth() + 1,
      day: periodEndPlusOffset.getUTCDate(),
      hour,
      minute,
      second: 0,
    },
    schedule.timezone
  );
}

export function nextClosePeriodLabel(periodLabel: string, frequency: CloseFrequency): string {
  const { year, month } = parsePeriodLabel(periodLabel);
  const increment = frequency === 'quarterly' ? 3 : 1;
  const next = new Date(Date.UTC(year, month - 1 + increment, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isCloseCycleDue(schedule: CloseCycleSchedule, now: Date): boolean {
  return getCloseCycleStartAt(schedule).getTime() <= now.getTime();
}
