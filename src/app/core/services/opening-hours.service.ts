import { inject, Injectable } from '@angular/core';
import { Branch, DayKey, OpeningPeriod, SpecialHours } from '../models/branch.model';
import { Clock, TIME_ZONE } from './clock';
import { addDays } from './public-holidays';

/**
 * Pure opening-hours logic. Time only ever comes in as an argument (a Date from the injected Clock).
 * Precedence: branch status -> special hours covering the date -> weekly hours for that weekday.
 * All calculations use Africa/Johannesburg, never the browser's time zone.
 */

export const CLOSING_SOON_MINUTES = 30;
export const OPENING_SOON_MINUTES = 60;
const SEARCH_DAYS = 21;

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sastFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface LocalMoment {
  date: string; // ISO date in SAST
  minutes: number; // minutes since local midnight
}

export function toLocalMoment(instant: Date): LocalMoment {
  const p = Object.fromEntries(sastFormat.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p['year']}-${p['month']}-${p['day']}`,
    minutes: Number(p['hour']) * 60 + Number(p['minute']),
  };
}

export const toMinutes = (hhmm: string): number =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function dayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const dayKeyOf = (iso: string): DayKey => DAY_KEYS[dayIndex(iso)]!;
export const weekdayName = (iso: string): string => DAY_NAMES[dayIndex(iso)]!;
export function formatShortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

// ------------------------------------------------------------------ periods for a date

export interface DayHours {
  periods: OpeningPeriod[];
  special?: SpecialHours;
}

/** Special hours covering `date` (the latest-starting one wins) else the weekly hours. */
export function hoursOn(branch: Branch, date: string): DayHours {
  let special: SpecialHours | undefined;
  for (const s of branch.specialHours) {
    if (s.from <= date && date <= s.to && (!special || s.from >= special.from)) special = s;
  }
  return special
    ? { periods: special.periods, special }
    : { periods: branch.hours[dayKeyOf(date)] };
}

/** Is the whole branch unavailable on this date regardless of hours (status override)? */
function statusBlocks(branch: Branch, date: string): boolean {
  const s = branch.status;
  switch (s.kind) {
    case 'relocated':
      return true;
    case 'temporarily-closed':
      return date <= s.until;
    case 'opening-soon':
      return date < s.opensOn;
    default:
      return false;
  }
}

// ------------------------------------------------------------------ next opening

export interface NextOpening {
  date: string;
  time: string; // "HH:mm"
  dayName: string;
  daysAhead: number; // 0 = later today, 1 = tomorrow
  special?: SpecialHours;
}

/** First opening strictly after (fromDate, afterMinutes), skipping blocked and closed days. */
export function findNextOpening(
  branch: Branch,
  fromDate: string,
  afterMinutes: number,
  today = fromDate,
): NextOpening | undefined {
  if (branch.status.kind === 'relocated') return undefined;
  for (let i = 0; i <= SEARCH_DAYS; i++) {
    const date = addDays(fromDate, i);
    if (statusBlocks(branch, date)) continue;
    const { periods, special } = hoursOn(branch, date);
    const p = periods.find((x) => i > 0 || toMinutes(x.open) > afterMinutes);
    if (p) {
      return {
        date,
        time: p.open,
        dayName: weekdayName(date),
        daysAhead: daysBetween(today, date),
        special,
      };
    }
  }
  return undefined;
}

function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
  return Math.round((t(b) - t(a)) / 86_400_000);
}

// ------------------------------------------------------------------ state

export type BranchAvailability =
  'open' | 'closed' | 'temporarily-closed' | 'relocated' | 'opening-soon';

export interface OpeningState {
  status: BranchAvailability;
  /** True only for an operational branch inside a period right now. */
  isOpen: boolean;
  today: string;
  /** Open now: when the current period ends, and minutes until then. */
  closesAt?: string;
  closesInMinutes?: number;
  closingSoon?: boolean;
  /** Closed now but opens later today. */
  opensAt?: string;
  opensInMinutes?: number;
  opensSoon?: boolean;
  /** Closed in the gap of a split day (lunch). */
  onBreak?: boolean;
  /** Special hours applying today (holiday, training, event...). */
  special?: SpecialHours;
  /** Open today for less time than the weekly pattern says. */
  closesEarly?: boolean;
  /** Open later than every other weekday (late trading night). */
  lateTrading?: boolean;
  /** Today's opening time differs from the weekly pattern because of special hours. */
  opensLate?: boolean;
  next?: NextOpening;
  // status details
  reason?: string;
  reopensOn?: string;
  movedToId?: string;
  opensOn?: string;
}

export function getOpeningState(branch: Branch, instant: Date): OpeningState {
  const { date: today, minutes } = toLocalMoment(instant);
  const base = { today, isOpen: false };
  const st = branch.status;

  if (st.kind === 'relocated') return { ...base, status: 'relocated', movedToId: st.movedToId };

  if (st.kind === 'temporarily-closed' && today <= st.until) {
    const reopensOn = addDays(st.until, 1);
    return {
      ...base,
      status: 'temporarily-closed',
      reason: st.reason,
      reopensOn,
      next: findNextOpening(branch, today, minutes, today),
    };
  }

  if (st.kind === 'opening-soon' && today < st.opensOn) {
    return {
      ...base,
      status: 'opening-soon',
      opensOn: st.opensOn,
      next: findNextOpening(branch, today, minutes, today),
    };
  }

  const { periods, special } = hoursOn(branch, today);
  const weekly = branch.hours[dayKeyOf(today)];
  const current = periods.find((p) => toMinutes(p.open) <= minutes && minutes < toMinutes(p.close));
  const common = { ...base, special };
  const lastClose = (ps: OpeningPeriod[]) => (ps.length ? ps[ps.length - 1]!.close : '');

  if (current) {
    const closesInMinutes = toMinutes(current.close) - minutes;
    const otherDays = (Object.keys(branch.hours) as DayKey[]).filter((d) => d !== dayKeyOf(today));
    const maxOther = otherDays.reduce(
      (m, d) => (lastClose(branch.hours[d]) > m ? lastClose(branch.hours[d]) : m),
      '',
    );
    return {
      ...common,
      status: 'open',
      isOpen: true,
      closesAt: current.close,
      closesInMinutes,
      closingSoon: closesInMinutes <= CLOSING_SOON_MINUTES,
      closesEarly: !!special && lastClose(periods) < lastClose(weekly),
      lateTrading: !special && lastClose(periods) > maxOther && maxOther !== '',
      next: undefined,
    };
  }

  const later = periods.find((p) => toMinutes(p.open) > minutes);
  const next = findNextOpening(branch, today, minutes, today);
  if (later) {
    const opensInMinutes = toMinutes(later.open) - minutes;
    return {
      ...common,
      status: 'closed',
      opensAt: later.open,
      opensInMinutes,
      opensSoon: opensInMinutes < OPENING_SOON_MINUTES,
      onBreak: periods[0] !== later,
      opensLate:
        !!special && !!weekly.length && later.open > weekly[0]!.open && periods[0] === later,
      next,
    };
  }
  return { ...common, status: 'closed', next };
}

// ------------------------------------------------------------------ labels

export type StateTone = 'open' | 'warn' | 'closed' | 'info' | 'planned';
export interface StateLabel {
  text: string;
  tone: StateTone;
}

function untilText(n: NextOpening): string {
  const when = n.daysAhead === 0 ? 'today' : n.daysAhead === 1 ? 'tomorrow' : n.dayName;
  return `${when} ${n.time}`;
}

/** Every label the UI shows, computed from structured data. */
export function stateLabel(s: OpeningState): StateLabel {
  switch (s.status) {
    case 'relocated':
      return { text: 'This branch has moved', tone: 'info' };
    case 'opening-soon':
      return { text: `Opening ${formatShortDate(s.opensOn!)}`, tone: 'info' };
    case 'temporarily-closed':
      return {
        text: `Temporarily closed: ${s.reason}. Reopens ${weekdayName(s.reopensOn!)}`,
        tone: 'closed',
      };
    case 'open': {
      if (s.closingSoon) return { text: `Closes in ${s.closesInMinutes} min`, tone: 'warn' };
      if (s.special?.reason === 'public-holiday') {
        return { text: `Open today with holiday hours ${rangeText(s.special)}`, tone: 'open' };
      }
      if (s.closesEarly) {
        const text =
          s.special?.reason === 'community-event'
            ? `Closing early today at ${s.closesAt}`
            : `Closing early: ${s.special?.label}`;
        return { text, tone: 'warn' };
      }
      if (s.lateTrading) return { text: `Open late tonight until ${s.closesAt}`, tone: 'open' };
      return { text: `Open · closes ${s.closesAt}`, tone: 'open' };
    }
    case 'closed': {
      if (s.opensAt !== undefined) {
        if (s.onBreak) return { text: `Closed for lunch, back at ${s.opensAt}`, tone: 'warn' };
        if (s.opensSoon) return { text: `Opens in ${s.opensInMinutes} min`, tone: 'warn' };
        if (s.opensLate && s.special) {
          return {
            text: `Opens at ${s.opensAt} today (${s.special.label.toLowerCase()})`,
            tone: 'warn',
          };
        }
        return { text: `Closed · opens ${s.opensAt}`, tone: 'closed' };
      }
      if (s.special && s.special.periods.length === 0 && s.special.reason === 'public-holiday') {
        return { text: `Closed today: ${s.special.label}`, tone: 'closed' };
      }
      return s.next
        ? { text: `Closed until ${untilText(s.next)}`, tone: 'closed' }
        : { text: 'Closed', tone: 'closed' };
    }
  }
}

/**
 * Wording for a planned visit, where `s` is the state at the chosen date and time. "Open now" phrases
 * such as "closed until tomorrow" would read as if they were about the present.
 */
export function visitLabel(
  s: OpeningState,
  time: string,
  today: string,
  subject = 'This branch will be',
): StateLabel {
  if (s.status === 'relocated') return stateLabel(s);
  const ahead = daysBetween(today, s.today);
  const day =
    ahead === 0
      ? 'today'
      : ahead === 1
        ? 'tomorrow'
        : `on ${weekdayName(s.today)} ${formatShortDate(s.today)}`;
  return {
    text: `${subject} ${s.isOpen ? 'open' : 'closed'} ${day} at ${time}`,
    tone: s.isOpen ? 'planned' : 'closed',
  };
}

function rangeText(s: SpecialHours): string {
  return s.periods.length ? `${s.periods[0]!.open}–${s.periods[s.periods.length - 1]!.close}` : '';
}

/** Open now? Opening-soon, relocated and temporarily-closed branches are never "open now". */
export const isOpenNow = (branch: Branch, instant: Date): boolean =>
  getOpeningState(branch, instant).isOpen;

@Injectable({ providedIn: 'root' })
export class OpeningHoursService {
  private readonly clock = inject(Clock);
  state(branch: Branch): OpeningState {
    return getOpeningState(branch, this.clock.now());
  }
  label(branch: Branch): StateLabel {
    return stateLabel(this.state(branch));
  }
  isOpenNow(branch: Branch): boolean {
    return this.state(branch).isOpen;
  }
}
