import type { Branch, DayKey, OpeningPeriod } from '../../src/app/core/models/branch.model.ts';
import type { Notice } from '../../src/app/core/models/notice.model.ts';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function checkPeriods(where: string, periods: OpeningPeriod[], errors: string[]) {
  let prevClose = '';
  for (const per of periods) {
    if (!HHMM.test(per.open) || !HHMM.test(per.close)) {
      errors.push(`${where}: bad time "${per.open}"-"${per.close}"`);
      continue;
    }
    if (per.close <= per.open)
      errors.push(`${where}: close ${per.close} is not after open ${per.open}`);
    if (prevClose && per.open < prevClose) errors.push(`${where}: periods overlap or are unsorted`);
    prevClose = per.close;
  }
}

export function validateBranches(branches: Branch[], notices: Notice[] = []): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const byId = new Map(branches.map((b) => [b.id, b]));

  for (const b of branches) {
    const w = `${b.name || '(no name)'} [${b.id}]`;
    if (ids.has(b.id)) errors.push(`${w}: duplicate id`);
    ids.add(b.id);

    if (!b.name?.trim()) errors.push(`${w}: empty name`);
    if (!b.address.city?.trim()) errors.push(`${w}: empty city`);
    if (!b.address.province?.trim()) errors.push(`${w}: empty province`);

    const { lat, lng } = b.location;
    if (!(lat >= -35 && lat <= -22)) errors.push(`${w}: lat ${lat} outside -35..-22`);
    if (!(lng >= 16 && lng <= 33)) errors.push(`${w}: lng ${lng} outside 16..33`);

    for (const day of DAY_KEYS) {
      const periods = b.hours[day];
      if (!Array.isArray(periods)) errors.push(`${w}: hours.${day} missing`);
      else checkPeriods(`${w} hours.${day}`, periods, errors);
    }

    for (const sh of b.specialHours) {
      const sw = `${w} specialHours "${sh.label}"`;
      if (!ISO_DATE.test(sh.from) || !ISO_DATE.test(sh.to)) errors.push(`${sw}: bad date`);
      else if (sh.from > sh.to) errors.push(`${sw}: from ${sh.from} is after to ${sh.to}`);
      checkPeriods(sw, sh.periods, errors);
    }

    const s = b.status;
    if (s.kind === 'relocated') {
      if (!byId.has(s.movedToId)) errors.push(`${w}: relocated to unknown id ${s.movedToId}`);
      if (s.movedToId === b.id) errors.push(`${w}: relocated to itself`);
    }
    if (s.kind === 'temporarily-closed' && !ISO_DATE.test(s.until)) errors.push(`${w}: bad until`);
    if (s.kind === 'opening-soon' && !ISO_DATE.test(s.opensOn)) errors.push(`${w}: bad opensOn`);
  }

  for (const n of notices) {
    if (!byId.has(n.branchId)) errors.push(`notice ${n.kind}: unknown branch ${n.branchId}`);
    if (n.toOffsetDays < n.fromOffsetDays)
      errors.push(`notice ${n.kind} ${n.branchId}: to before from`);
    if (n.kind === 'close-early' && !HHMM.test(n.closeAt))
      errors.push(`notice ${n.branchId}: bad closeAt`);
  }

  return errors;
}
