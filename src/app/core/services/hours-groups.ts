import { DayKey, OpeningPeriod, WeeklyHours } from '../models/branch.model';

const DAYS: [DayKey, string][] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

export interface HoursGroup {
  /** "Monday – Friday" or "Saturday". */
  label: string;
  days: DayKey[];
  periods: OpeningPeriod[];
}

const same = (a: OpeningPeriod[], b: OpeningPeriod[]) =>
  a.length === b.length && a.every((p, i) => p.open === b[i]!.open && p.close === b[i]!.close);

/** Weekly hours with consecutive days of identical hours merged (Mon to Sun order). */
export function groupHours(hours: WeeklyHours): HoursGroup[] {
  const groups: { first: string; last: string; days: DayKey[]; periods: OpeningPeriod[] }[] = [];
  for (const [key, name] of DAYS) {
    const periods = hours[key];
    const prev = groups[groups.length - 1];
    if (prev && same(prev.periods, periods)) {
      prev.last = name;
      prev.days.push(key);
    } else {
      groups.push({ first: name, last: name, days: [key], periods });
    }
  }
  return groups.map((g) => ({
    label: g.first === g.last ? g.first : `${g.first} – ${g.last}`,
    days: g.days,
    periods: g.periods,
  }));
}
