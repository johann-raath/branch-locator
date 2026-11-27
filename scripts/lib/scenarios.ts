import type { Branch, OpeningPeriod } from '../../src/app/core/models/branch.model.ts';
import type { Notice } from '../../src/app/core/models/notice.model.ts';
import { clipPeriods, DAYS, datesOnWeekday, dayKeyOf } from './hours.ts';
import type { DayKey } from '../../src/app/core/models/branch.model.ts';

export interface Match {
  /** Regex source tested against the branch name (case-insensitive). */
  name?: string;
  /** Regex source tested against address.city. */
  city?: string;
  /** Regex source tested against address.suburb. */
  suburb?: string;
  type?: Branch['type'];
}

interface Base {
  id: string;
  description: string;
  match: Match;
}
export type Scenario =
  | (Base & { kind: 'lunch-closure'; from: string; to: string })
  | (Base & { kind: 'weekday-start'; day: DayKey; opensAt: string; label: string })
  | (Base & { kind: 'late-trading'; day: DayKey; closeAt: string })
  | (Base & {
      kind: 'temporarily-closed';
      fromOffsetDays: number;
      toOffsetDays: number;
      reason: string;
    })
  | (Base & {
      kind: 'close-early';
      fromOffsetDays: number;
      toOffsetDays: number;
      closeAt: string;
      label: string;
    })
  | (Base & { kind: 'relocated'; movedTo: Match; since: string })
  | (Base & { kind: 'opening-soon'; fromOffsetDays: number });

export function findOne(branches: Branch[], m: Match, what: string): Branch {
  const re = (s?: string) => (s ? new RegExp(s, 'i') : undefined);
  const [n, c, s] = [re(m.name), re(m.city), re(m.suburb)];
  const hits = branches.filter(
    (b) =>
      (!m.type || b.type === m.type) &&
      (!n || n.test(b.name)) &&
      (!c || c.test(b.address.city)) &&
      (!s || s.test(b.address.suburb)),
  );
  if (hits.length !== 1) {
    throw new Error(
      `Scenario ${what}: pattern ${JSON.stringify(m)} matched ${hits.length} branches (need exactly 1)` +
        (hits.length ? `: ${hits.map((h) => h.name).join(' | ')}` : ''),
    );
  }
  return hits[0]!;
}

/** Weekly-hours scenarios must run BEFORE holidays are generated (Christmas Eve clips weekly hours). */
export function applyWeeklyScenarios(
  branches: Branch[],
  scenarios: Scenario[],
): Map<string, Branch> {
  const placed = new Map<string, Branch>();
  for (const sc of scenarios) {
    if (sc.kind === 'lunch-closure') {
      const b = findOne(branches, sc.match, sc.id);
      for (const day of DAYS.slice(0, 5)) {
        const periods = b.hours[day];
        if (!periods.length) continue;
        const open = periods[0]!.open;
        const close = periods[periods.length - 1]!.close;
        b.hours[day] = [
          { open, close: sc.from },
          { open: sc.to, close },
        ];
      }
      placed.set(sc.id, b);
    } else if (sc.kind === 'late-trading') {
      const b = findOne(branches, sc.match, sc.id);
      const periods = b.hours[sc.day];
      if (periods.length) periods[periods.length - 1]!.close = sc.closeAt;
      placed.set(sc.id, b);
    }
  }
  return placed;
}

/** Everything else. Run after holidays so recurring entries can skip holiday dates. */
export function applyOtherScenarios(
  branches: Branch[],
  scenarios: Scenario[],
): { placed: Map<string, Branch>; notices: Notice[] } {
  const placed = new Map<string, Branch>();
  const notices: Notice[] = [];

  for (const sc of scenarios) {
    switch (sc.kind) {
      case 'weekday-start': {
        const b = findOne(branches, sc.match, sc.id);
        const taken = new Set(b.specialHours.map((s) => s.from));
        const weekly = b.hours[sc.day];
        if (!weekly.length) throw new Error(`Scenario ${sc.id}: ${b.name} is closed on ${sc.day}`);
        const periods: OpeningPeriod[] = weekly.map((x, i) =>
          i === 0 ? { ...x, open: sc.opensAt } : { ...x },
        );
        for (const date of datesOnWeekday(sc.day)) {
          if (taken.has(date)) continue;
          b.specialHours.push({
            from: date,
            to: date,
            label: sc.label,
            reason: 'staff-training',
            periods,
          });
        }
        placed.set(sc.id, b);
        break;
      }
      case 'temporarily-closed': {
        const b = findOne(branches, sc.match, sc.id);
        notices.push({
          kind: 'temporarily-closed',
          branchId: b.id,
          fromOffsetDays: sc.fromOffsetDays,
          toOffsetDays: sc.toOffsetDays,
          reason: sc.reason,
        });
        placed.set(sc.id, b);
        break;
      }
      case 'close-early': {
        const b = findOne(branches, sc.match, sc.id);
        notices.push({
          kind: 'close-early',
          branchId: b.id,
          fromOffsetDays: sc.fromOffsetDays,
          toOffsetDays: sc.toOffsetDays,
          label: sc.label,
          reason: 'community-event',
          closeAt: sc.closeAt,
        });
        placed.set(sc.id, b);
        break;
      }
      case 'opening-soon': {
        const b = findOne(branches, sc.match, sc.id);
        notices.push({
          kind: 'opening-soon',
          branchId: b.id,
          fromOffsetDays: sc.fromOffsetDays,
          toOffsetDays: sc.fromOffsetDays,
        });
        placed.set(sc.id, b);
        break;
      }
      case 'relocated': {
        const b = findOne(branches, sc.match, sc.id);
        const target = findOne(branches, sc.movedTo, `${sc.id} (target)`);
        b.status = { kind: 'relocated', movedToId: target.id, since: sc.since };
        placed.set(sc.id, b);
        break;
      }
      default:
        break;
    }
  }

  for (const b of branches) b.specialHours.sort((a, c) => a.from.localeCompare(c.from));
  return { placed, notices };
}

export { clipPeriods, dayKeyOf };
