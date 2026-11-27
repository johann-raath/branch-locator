import { Branch } from '../models/branch.model';
import { Bounds, haversineKm, isWithinBounds, LatLng } from './geo';
import { Area } from './places';

/** The part of the map the user can see (not covered by the side panel). */
export interface MapView {
  bounds: Bounds;
  center: LatLng;
  zoom: number;
}

/** Zoomed out further than this, a list of "what's on screen" is too long to be useful. */
export const LIST_MIN_ZOOM = 9;
export const LIST_LIMIT = 50;

export interface ResultRow {
  branch: Branch;
  /** From the chosen area or the user's location; absent when we know neither. */
  distanceKm?: number;
}

export type ResultList =
  { kind: 'prompt' } | { kind: 'list'; title: string; rows: ResultRow[]; hidden: number };

export interface ResultListInput {
  /** Branches already matching search, filters and radius. */
  matched: Branch[];
  area: Area | null;
  radiusKm: number;
  text: string;
  origin: LatLng | null;
  view: MapView | null;
}

/**
 * What the side panel lists, most specific first: around a chosen area (nearest first), else name
 * matches for the typed text, else the branches in view once zoomed in, else a prompt.
 */
export function buildResultList(input: ResultListInput): ResultList {
  const { matched, area, radiusKm, origin, view } = input;
  const text = input.text.trim();
  const from = area?.location ?? origin;
  const row = (branch: Branch): ResultRow =>
    from ? { branch, distanceKm: haversineKm(from, branch.location) } : { branch };
  const nearest = (to: LatLng) => (a: Branch, b: Branch) =>
    haversineKm(to, a.location) - haversineKm(to, b.location);
  const byName = (a: Branch, b: Branch) => a.name.localeCompare(b.name);
  const list = (title: (n: number) => string, branches: Branch[]): ResultList => ({
    kind: 'list',
    title: title(branches.length),
    rows: branches.slice(0, LIST_LIMIT).map(row),
    hidden: Math.max(0, branches.length - LIST_LIMIT),
  });
  const count = (n: number) => `${n} ${n === 1 ? 'branch' : 'branches'}`;

  if (area) {
    const of = area.id === 'me' ? 'you' : area.name;
    return list(
      (n) => `${count(n)} within ${radiusKm} km of ${of}`,
      [...matched].sort(nearest(area.location)),
    );
  }
  if (text) {
    return list(
      (n) => `${count(n)} matching “${text}”`,
      [...matched].sort(origin ? nearest(origin) : byName),
    );
  }
  if (!view || view.zoom < LIST_MIN_ZOOM) return { kind: 'prompt' };
  return list(
    (n) => `${count(n)} in this area`,
    matched.filter((b) => isWithinBounds(b.location, view.bounds)).sort(nearest(view.center)),
  );
}
