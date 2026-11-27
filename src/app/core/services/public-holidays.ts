/**
 * South African public holidays. Pure functions, no Date-of-today access, no framework imports,
 * so it is shared by the Angular app and scripts/build-branches.ts.
 *
 * Sunday rule (Public Holidays Act): a holiday that falls on a Sunday moves to the Monday.
 */

export interface PublicHoliday {
  date: string; // ISO "YYYY-MM-DD" (the day it is observed)
  name: string;
}

/** Anonymous Gregorian algorithm. Returns [month (1-12), day]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return toIsoDate(utc(y, m, d + days));
}

/** 0 = Sunday ... 6 = Saturday, for an ISO date. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return utc(y, m, d).getUTCDay();
}

const FIXED: readonly (readonly [number, number, string])[] = [
  [1, 1, "New Year's Day"],
  [3, 21, 'Human Rights Day'],
  [4, 27, 'Freedom Day'],
  [5, 1, "Workers' Day"],
  [6, 16, 'Youth Day'],
  [8, 9, "National Women's Day"],
  [9, 24, 'Heritage Day'],
  [12, 16, 'Day of Reconciliation'],
  [12, 25, 'Christmas Day'],
  [12, 26, 'Day of Goodwill'],
];

/** Holidays observed in a calendar year, sorted by date. Includes Sunday-to-Monday shifts. */
export function publicHolidays(year: number): PublicHoliday[] {
  const out: PublicHoliday[] = [];

  for (const [month, day, name] of FIXED) {
    const iso = toIsoDate(utc(year, month, day));
    out.push({ date: weekdayIndex(iso) === 0 ? addDays(iso, 1) : iso, name });
  }

  const [em, ed] = easterSunday(year);
  const easter = toIsoDate(utc(year, em, ed));
  out.push({ date: addDays(easter, -2), name: 'Good Friday' });
  out.push({ date: addDays(easter, 1), name: 'Family Day' });

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Holidays whose observed date lies in [from, to] (inclusive ISO dates). */
export function publicHolidaysBetween(from: string, to: string): PublicHoliday[] {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const all: PublicHoliday[] = [];
  for (let y = y1; y <= y2; y++) all.push(...publicHolidays(y));
  return all.filter((h) => h.date >= from && h.date <= to);
}

export function holidayOn(iso: string): PublicHoliday | undefined {
  return publicHolidays(Number(iso.slice(0, 4))).find((h) => h.date === iso);
}
