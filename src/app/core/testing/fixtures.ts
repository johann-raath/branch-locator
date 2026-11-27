import { Branch, OpeningPeriod, WeeklyHours } from '../models/branch.model';
import { parseNowOverride } from '../services/clock';

export const p = (open: string, close: string): OpeningPeriod => ({ open, close });

export const week = (
  weekday: OpeningPeriod[],
  sat: OpeningPeriod[] = [],
  sun: OpeningPeriod[] = [],
): WeeklyHours => ({
  mon: weekday,
  tue: weekday,
  wed: weekday,
  thu: weekday,
  fri: weekday,
  sat,
  sun,
});

/** Standard profile: Mon-Fri 08:00-17:00, Sat 08:00-13:00, Sun closed. */
export const standardHours = (): WeeklyHours => week([p('08:00', '17:00')], [p('08:00', '13:00')]);

export function makeBranch(over: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    name: 'Capitec Bank Test',
    type: 'branch',
    location: { lat: -33.7342, lng: 18.9621 },
    address: {
      street: '1 Main Road',
      suburb: 'Paarl',
      city: 'Paarl',
      province: 'Western Cape',
      postalCode: '7646',
    },
    services: ['atm'],
    hours: standardHours(),
    specialHours: [],
    status: { kind: 'operational' },
    sources: [],
    ...over,
  };
}

/** SAST wall-clock "YYYY-MM-DDTHH:mm" -> instant. */
export function at(sast: string): Date {
  const d = parseNowOverride(sast);
  if (!d) throw new Error(`bad test time ${sast}`);
  return d;
}
