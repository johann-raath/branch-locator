import { Branch, OpeningPeriod, DayKey } from '../models/branch.model';
import { Notice } from '../models/notice.model';
import { addDays, weekdayIndex } from '../services/public-holidays';

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayKeyOf = (iso: string): DayKey => DAYS[(weekdayIndex(iso) + 6) % 7]!;

function clip(periods: OpeningPeriod[], closeAt: string): OpeningPeriod[] {
  return periods
    .filter((p) => p.open < closeAt)
    .map((p) => ({ open: p.open, close: p.close > closeAt ? closeAt : p.close }));
}

/**
 * Pure. Turns offset-based notices into absolute dates relative to `today` (ISO, Africa/Johannesburg) and
 * merges them into the branches' `status` / `specialHours`. Returns new objects; inputs are not mutated.
 * Domain logic downstream only ever sees absolute dates.
 */
export function resolveNotices(branches: Branch[], notices: Notice[], today: string): Branch[] {
  if (notices.length === 0) return branches;
  const byBranch = new Map<string, Notice[]>();
  for (const n of notices) byBranch.set(n.branchId, [...(byBranch.get(n.branchId) ?? []), n]);

  return branches.map((b) => {
    const mine = byBranch.get(b.id);
    if (!mine) return b;
    let status = b.status;
    let specialHours = b.specialHours;

    for (const n of mine) {
      const from = addDays(today, n.fromOffsetDays);
      const to = addDays(today, n.toOffsetDays);
      switch (n.kind) {
        case 'temporarily-closed':
          status = { kind: 'temporarily-closed', reason: n.reason, until: to };
          break;
        case 'opening-soon':
          status = { kind: 'opening-soon', opensOn: from };
          break;
        case 'close-early': {
          const added = [];
          for (let d = from; d <= to; d = addDays(d, 1)) {
            const periods = clip(b.hours[dayKeyOf(d)], n.closeAt);
            if (periods.length === 0) continue; // closed or already shut by then
            added.push({ from: d, to: d, label: n.label, reason: n.reason, periods });
          }
          // a notice replaces any standing special hours on the same dates
          const dates = new Set(added.map((a) => a.from));
          specialHours = [
            ...specialHours.filter((s) => !(s.from === s.to && dates.has(s.from))),
            ...added,
          ].sort((x, y) => x.from.localeCompare(y.from));
          break;
        }
      }
    }
    return { ...b, status, specialHours };
  });
}
