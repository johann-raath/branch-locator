import { Branch } from '../models/branch.model';
import { normaliseText } from './branch-query.service';
import { LatLng } from './geo';

/** An area the user can search around: a city or suburb known from the branch data, or "near me". */
export interface Area {
  id: string;
  name: string;
  location: LatLng;
}

export interface Place extends Area {
  kind: 'city' | 'suburb';
  province: string;
  /** Branches in this place. */
  count: number;
  /** Normalised name, for matching. */
  search: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * Cities and suburbs from the branch addresses, each located at the median of its branches
 * (robust against the odd mis-tagged branch). Works offline; no geocoding.
 */
export function buildPlaces(branches: Branch[]): Place[] {
  interface Acc {
    name: string;
    province: string;
    city: number;
    lats: number[];
    lngs: number[];
  }
  const acc = new Map<string, Acc>();

  const add = (name: string, province: string, isCity: boolean, b: Branch) => {
    const search = normaliseText(name);
    if (!search) return;
    const key = `${search}|${normaliseText(province)}`;
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { name: name.trim(), province, city: 0, lats: [], lngs: [] }));
    if (isCity) a.city++;
    a.lats.push(b.location.lat);
    a.lngs.push(b.location.lng);
  };

  for (const b of branches) {
    add(b.address.city, b.address.province, true, b);
    if (normaliseText(b.address.suburb) !== normaliseText(b.address.city))
      add(b.address.suburb, b.address.province, false, b);
  }

  return [...acc.entries()].map(([key, a]) => ({
    id: key,
    name: a.name,
    kind: a.city > 0 ? 'city' : 'suburb',
    province: a.province,
    location: { lat: median(a.lats), lng: median(a.lngs) },
    count: a.lats.length,
    search: key.split('|')[0]!,
  }));
}

/** Places whose name contains every typed term; names starting with the query first, then bigger places. */
export function searchPlaces(places: Place[], query: string, limit = 3): Place[] {
  const q = normaliseText(query);
  if (q.length < 2) return [];
  const terms = q.split(' ');
  return places
    .filter((p) => terms.every((t) => p.search.includes(t)))
    .sort((a, b) => {
      const sa = a.search.startsWith(q) ? 0 : 1;
      const sb = b.search.startsWith(q) ? 0 : 1;
      return sa - sb || b.count - a.count || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
