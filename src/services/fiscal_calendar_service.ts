/**
 * Fiscal calendar utilities: quarter/YTD determination based on entity fiscal year end.
 * No DB access — pure date logic. Callers supply fiscalYearEndMonth + fiscalYearEndDay.
 */

export interface FiscalYearEnd {
  month: number;  // 1–12
  day: number;    // 1–31
}

export interface QuarterInfo {
  quarter: number;            // 1–4
  quarterStart: string;       // YYYY-MM-DD
  quarterEnd: string;         // YYYY-MM-DD
  fiscalYear: number;         // The fiscal year this quarter belongs to
}

export interface YTDRange {
  ytdStart: string;           // YYYY-MM-DD
  ytdEnd: string;             // YYYY-MM-DD
  fiscalYear: number;
}

/** Get the fiscal year start date for a given fiscal year label. */
export function getFiscalYearStart(fiscalYear: number, fye: FiscalYearEnd): string {
  // Fiscal year ending Dec 31 of FY 2026 → starts Jan 1 2026
  // Fiscal year ending Jun 30 of FY 2026 → starts Jul 1 2025
  if (fye.month === 12 && fye.day === 31) {
    return `${fiscalYear}-01-01`;
  }
  // Fiscal year start = day after prior FY end
  const priorFYEndDate = new Date(fiscalYear - 1, fye.month - 1, fye.day);
  const fyStart = new Date(priorFYEndDate);
  fyStart.setDate(fyStart.getDate() + 1);
  return formatDate(fyStart);
}

/** Determine which fiscal year a date falls into. */
export function getFiscalYear(date: string, fye: FiscalYearEnd): number {
  const d = parseDate(date);
  const year = d.getFullYear();
  // FY end date for the same calendar year
  const fyEndThisYear = new Date(year, fye.month - 1, fye.day);
  // If date is on or before the FY end in this calendar year, it's this FY
  // Otherwise it's next FY (for non-calendar FY)
  if (fye.month === 12 && fye.day === 31) return year;
  return d <= fyEndThisYear ? year : year + 1;
}

/** Determine the fiscal quarter for a given date. */
export function getQuarterForDate(date: string, fye: FiscalYearEnd): QuarterInfo {
  const fiscalYear = getFiscalYear(date, fye);
  const fyStart = getFiscalYearStart(fiscalYear, fye);
  const fyStartDate = parseDate(fyStart);

  // Divide the fiscal year into 4 quarters of ~3 months each
  const quarters = buildQuarterBoundaries(fiscalYear, fye);

  for (const q of quarters) {
    const qStart = parseDate(q.quarterStart);
    const qEnd = parseDate(q.quarterEnd);
    const d = parseDate(date);
    if (d >= qStart && d <= qEnd) {
      return q;
    }
  }

  // Fallback: last quarter
  return quarters[3];
}

/** Get the YTD range: from fiscal year start through the given date. */
export function getYTDRange(date: string, fye: FiscalYearEnd): YTDRange {
  const fiscalYear = getFiscalYear(date, fye);
  const ytdStart = getFiscalYearStart(fiscalYear, fye);
  return { ytdStart, ytdEnd: date, fiscalYear };
}

/** Build all 4 quarter boundaries for a fiscal year. */
export function buildQuarterBoundaries(fiscalYear: number, fye: FiscalYearEnd): QuarterInfo[] {
  const fyStart = parseDate(getFiscalYearStart(fiscalYear, fye));
  const quarters: QuarterInfo[] = [];

  for (let q = 1; q <= 4; q++) {
    // End-of-month-aware month addition (avoids JS Date overflow)
    const qStartMonths = (q - 1) * 3;
    const qStartYear = fyStart.getFullYear() + Math.floor((fyStart.getMonth() + qStartMonths) / 12);
    const qStartMonth = (fyStart.getMonth() + qStartMonths) % 12;
    const qStartMaxDay = new Date(qStartYear, qStartMonth + 1, 0).getDate();
    const qStart = new Date(qStartYear, qStartMonth, Math.min(fyStart.getDate(), qStartMaxDay));

    const qEndMonths = q * 3;
    const qEndYear = fyStart.getFullYear() + Math.floor((fyStart.getMonth() + qEndMonths) / 12);
    const qEndMonth = (fyStart.getMonth() + qEndMonths) % 12;
    const qEndMaxDay = new Date(qEndYear, qEndMonth + 1, 0).getDate();
    const qEndBase = new Date(qEndYear, qEndMonth, Math.min(fyStart.getDate(), qEndMaxDay));
    const qEnd = new Date(qEndBase);
    qEnd.setDate(qEnd.getDate() - 1);

    quarters.push({
      quarter: q,
      quarterStart: formatDate(qStart),
      quarterEnd: formatDate(qEnd),
      fiscalYear,
    });
  }

  return quarters;
}

/** Format a human-readable period label like "Q1 2026" or "FY 2026". */
export function formatQuarterLabel(quarter: number, fiscalYear: number): string {
  return `Q${quarter} ${fiscalYear}`;
}

export function formatYTDLabel(fiscalYear: number): string {
  return `YTD ${fiscalYear}`;
}

/** Format a month name from a date string. */
export function formatMonthLabel(periodEnd: string): string {
  const d = parseDate(periodEnd);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Check if a period (by its end date) falls within a quarter. */
export function periodFallsInQuarter(periodEnd: string, quarter: QuarterInfo): boolean {
  const end = parseDate(periodEnd);
  const qStart = parseDate(quarter.quarterStart);
  const qEnd = parseDate(quarter.quarterEnd);
  return end >= qStart && end <= qEnd;
}

/** Check if a period falls within a YTD range. */
export function periodFallsInYTD(periodEnd: string, ytd: YTDRange): boolean {
  const end = parseDate(periodEnd);
  const start = parseDate(ytd.ytdStart);
  const ytdEnd = parseDate(ytd.ytdEnd);
  return end >= start && end <= ytdEnd;
}

// ---- date helpers ----

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
