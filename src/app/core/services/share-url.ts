import { ServiceCode } from '../models/branch.model';

/** What a link can carry. The user's own location is deliberately never part of it. */
export interface ShareState {
  /** Id of a city or suburb to search around. */
  place?: string;
  radius?: number;
  /** Name search. */
  q?: string;
  services?: ServiceCode[];
  /** Only open branches: now, or at a planned visit. */
  open?: 'now' | { date: string; time: string };
  /** Branch to show. */
  branch?: string;
}

const KEYS = ['place', 'r', 'q', 's', 'open', 'branch'];
const SERVICES: ServiceCode[] = [
  'atm',
  'cash-deposit',
  'card-replacement',
  'business',
  'forex',
  'wheelchair',
];

/** Reads a query string. Links get edited and go stale, so anything unrecognised is dropped. */
export function readShare(search: string): ShareState {
  const p = new URLSearchParams(search);
  const state: ShareState = {};

  const place = p.get('place');
  if (place) state.place = place.replace('~', '|');
  const radius = Number(p.get('r'));
  if (radius > 0) state.radius = radius;
  const q = p.get('q')?.trim();
  if (q) state.q = q.slice(0, 80);
  const services = (p.get('s') ?? '').split(',').filter((s) => SERVICES.includes(s as ServiceCode));
  if (services.length) state.services = services as ServiceCode[];

  const open = p.get('open') ?? '';
  const visit = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(open);
  if (open === 'now') state.open = 'now';
  else if (visit) state.open = { date: visit[1]!, time: visit[2]! };

  const branch = p.get('branch');
  if (branch) state.branch = branch;
  return state;
}

/** Builds the query string for a state, keeping unrelated parameters of `current` (such as `now`). */
export function writeShare(state: ShareState, current = ''): string {
  const p = new URLSearchParams(current);
  KEYS.forEach((k) => p.delete(k));

  if (state.place) p.set('place', state.place.replace('|', '~'));
  if (state.place && state.radius) p.set('r', String(state.radius));
  if (state.q) p.set('q', state.q);
  if (state.services?.length) p.set('s', state.services.join(','));
  if (state.open)
    p.set('open', state.open === 'now' ? 'now' : `${state.open.date}T${state.open.time}`);
  if (state.branch) p.set('branch', state.branch);

  // commas, colons and tildes are legal in a query and much easier to read
  const query = p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%7E/g, '~');
  return query ? `?${query}` : '';
}
