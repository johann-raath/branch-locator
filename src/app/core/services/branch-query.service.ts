import { inject, Injectable } from '@angular/core';
import { Branch, BranchType, ServiceCode } from '../models/branch.model';
import { Clock } from './clock';
import { haversineKm, LatLng } from './geo';
import { getOpeningState } from './opening-hours.service';

/** Pure filter / search / sort logic. */

/** Lowercase, accent-insensitive, apostrophe-insensitive, whitespace-collapsed. */
export function normaliseText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** All whitespace-separated terms must appear in name, suburb or city. Empty query matches everything. */
export function searchBranches(branches: Branch[], query: string): Branch[] {
  const terms = normaliseText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return branches;
  return branches.filter((b) => {
    const hay = normaliseText(`${b.name} ${b.address.suburb} ${b.address.city}`);
    return terms.every((t) => hay.includes(t));
  });
}

export interface BranchFilters {
  /** Branch must offer ALL of these. */
  services?: ServiceCode[];
  type?: BranchType;
  /** Keep only branches open at this instant. */
  openAt?: Date;
}

/**
 * Business centres are opt-in: hidden unless the "business" service is ticked (or a type is asked for
 * explicitly). Every other filter only narrows, so the default is standard branches.
 */
export function filterBranches(branches: Branch[], f: BranchFilters): Branch[] {
  const services = f.services ?? [];
  const wantsBusiness = services.includes('business');
  return branches.filter(
    (b) =>
      (f.type ? b.type === f.type : wantsBusiness || b.type !== 'business-centre') &&
      services.every((s) => b.services.includes(s)) &&
      (!f.openAt || getOpeningState(b, f.openAt).isOpen),
  );
}

export interface BranchWithDistance {
  branch: Branch;
  distanceKm: number;
}

/** Nearest first. Ties keep their input order (stable). */
export function sortByDistance(branches: Branch[], origin: LatLng): BranchWithDistance[] {
  return branches
    .map((branch, i) => ({ branch, distanceKm: haversineKm(origin, branch.location), i }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.i - b.i)
    .map(({ branch, distanceKm }) => ({ branch, distanceKm }));
}

/** Alphabetical by name, for when there is no origin. */
export function sortByName(branches: Branch[]): Branch[] {
  return [...branches].sort(
    (a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id),
  );
}

export interface BranchQuery extends BranchFilters {
  text?: string;
  origin?: LatLng;
  /** Only keep branches within this many km of `origin`. */
  radiusKm?: number;
  limit?: number;
}

export interface QueryResult {
  items: BranchWithDistance[];
  total: number;
}

export function queryBranches(all: Branch[], q: BranchQuery): QueryResult {
  const matched = filterBranches(searchBranches(all, q.text ?? ''), q);
  let items: BranchWithDistance[] = q.origin
    ? sortByDistance(matched, q.origin)
    : sortByName(matched).map((branch) => ({ branch, distanceKm: NaN }));
  if (q.origin && q.radiusKm !== undefined)
    items = items.filter((x) => x.distanceKm <= q.radiusKm!);
  const total = items.length;
  return { items: q.limit !== undefined ? items.slice(0, q.limit) : items, total };
}

/** Nearest branch that is open at `instant`, excluding one (e.g. the closed branch being viewed). */
export function nearestOpen(
  all: Branch[],
  from: LatLng,
  instant: Date,
  excludeId?: string,
): BranchWithDistance | undefined {
  return sortByDistance(
    all.filter((b) => b.id !== excludeId && getOpeningState(b, instant).isOpen),
    from,
  )[0];
}

@Injectable({ providedIn: 'root' })
export class BranchQueryService {
  private readonly clock = inject(Clock);

  query(all: Branch[], q: BranchQuery & { openNow?: boolean }): QueryResult {
    return queryBranches(all, { ...q, openAt: q.openNow ? this.clock.now() : q.openAt });
  }
  nearestOpen(all: Branch[], from: LatLng, excludeId?: string) {
    return nearestOpen(all, from, this.clock.now(), excludeId);
  }
}
