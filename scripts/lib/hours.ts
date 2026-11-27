import type {
  Branch,
  DayKey,
  OpeningPeriod,
  ServiceCode,
  SpecialHours,
  WeeklyHours,
} from '../../src/app/core/models/branch.model.ts';
import {
  addDays,
  publicHolidaysBetween,
  weekdayIndex,
} from '../../src/app/core/services/public-holidays.ts';

export const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** Date range the invented holiday / seasonal data covers (plan §4.3). */
export const DATA_FROM = '2026-12-01';
export const DATA_TO = '2027-12-31';

/** ISO date -> DayKey. */
export function dayKeyOf(iso: string): DayKey {
  const idx = weekdayIndex(iso); // 0 = Sunday
  return DAYS[(idx + 6) % 7]!;
}

/** FNV-1a 32-bit. Deterministic, never Math.random. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 0..99 bucket for (id, salt). */
export const bucket = (id: string, salt: string) => hash(`${id}:${salt}`) % 100;

export type HoursProfile = 'mall' | 'standard' | 'small-town' | 'business';

const p = (open: string, close: string): OpeningPeriod[] => [{ open, close }];

export function weeklyHours(profile: HoursProfile): WeeklyHours {
  const week = (
    weekday: OpeningPeriod[],
    sat: OpeningPeriod[],
    sun: OpeningPeriod[],
  ): WeeklyHours => ({
    mon: weekday.map((x) => ({ ...x })),
    tue: weekday.map((x) => ({ ...x })),
    wed: weekday.map((x) => ({ ...x })),
    thu: weekday.map((x) => ({ ...x })),
    fri: weekday.map((x) => ({ ...x })),
    sat: sat.map((x) => ({ ...x })),
    sun: sun.map((x) => ({ ...x })),
  });
  switch (profile) {
    case 'mall':
      return week(p('09:00', '19:00'), p('09:00', '17:00'), p('09:00', '14:00'));
    case 'standard':
      return week(p('08:00', '17:00'), p('08:00', '13:00'), []);
    case 'small-town':
      return week(p('08:30', '16:30'), p('08:30', '12:00'), []);
    case 'business':
      return week(p('08:00', '16:30'), [], []);
  }
}

const MALL_WORDS = /\b(mall|centre|center|square|plaza|junction|crossing)\b/i;

export function isMallLike(name: string, street: string): boolean {
  return MALL_WORDS.test(name) || MALL_WORDS.test(street);
}

export function profileFor(
  b: Pick<Branch, 'id' | 'name' | 'type' | 'address'>,
  singleBranchTown: boolean,
): HoursProfile {
  if (b.type === 'business-centre') return 'business';
  if (isMallLike(b.name, b.address.street)) return 'mall';
  if (singleBranchTown && bucket(b.id, 'small-town') < 50) return 'small-town';
  return 'standard';
}

export function servicesFor(b: Pick<Branch, 'id' | 'name' | 'type' | 'address'>): ServiceCode[] {
  const s: ServiceCode[] = [];
  const mall = b.type === 'branch' && isMallLike(b.name, b.address.street);
  if (b.type === 'business-centre') {
    s.push('business');
  } else {
    s.push('atm');
    if (bucket(b.id, 'cash-deposit') < 70) s.push('cash-deposit');
  }
  if (bucket(b.id, 'card-replacement') < 90) s.push('card-replacement');
  if (mall && bucket(b.id, 'forex') < 15) s.push('forex');
  if (bucket(b.id, 'wheelchair') < 80) s.push('wheelchair');
  return s;
}

/** Clip periods so nothing is open after `closeAt`. Empty if nothing remains. */
export function clipPeriods(periods: OpeningPeriod[], closeAt: string): OpeningPeriod[] {
  return periods
    .filter((x) => x.open < closeAt)
    .map((x) => ({ open: x.open, close: x.close > closeAt ? closeAt : x.close }));
}

/**
 * Public holidays (+ Christmas Eve / New Year's Eve early closing) as special hours, Dec 2026 to Dec 2027.
 * mall: open 09:00-13:00 on holidays; everything else closed. 24 and 31 Dec: close at 12:00.
 */
export function holidayHours(profile: HoursProfile, weekly: WeeklyHours): SpecialHours[] {
  const out: SpecialHours[] = [];
  for (const h of publicHolidaysBetween(DATA_FROM, DATA_TO)) {
    out.push({
      from: h.date,
      to: h.date,
      label: h.name,
      reason: 'public-holiday',
      periods: profile === 'mall' ? p('09:00', '13:00') : [],
    });
  }
  const holidayDates = new Set(out.map((x) => x.from));
  for (const year of [2026, 2027]) {
    for (const [md, label] of [
      ['12-24', 'Christmas Eve'],
      ['12-31', "New Year's Eve"],
    ] as const) {
      const date = `${year}-${md}`;
      if (date < DATA_FROM || date > DATA_TO || holidayDates.has(date)) continue;
      const periods = clipPeriods(weekly[dayKeyOf(date)], '12:00');
      if (periods.length === 0) continue; // closed anyway that day
      out.push({ from: date, to: date, label, reason: 'other', periods });
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** Every date in [from, to] on the given weekday. */
export function datesOnWeekday(day: DayKey, from = DATA_FROM, to = DATA_TO): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayKeyOf(d) === day) out.push(d);
  return out;
}

export { WEEKDAYS };
