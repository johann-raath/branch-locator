import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Branch, BranchType, ServiceCode } from '../models/branch.model';
import { BranchRepository } from '../data/branch-repository';
import {
  filterBranches,
  nearestOpen,
  searchBranches,
  sortByDistance,
  sortByName,
  BranchWithDistance,
} from '../services/branch-query.service';
import { Clock } from '../services/clock';
import { haversineKm, LatLng } from '../services/geo';
import {
  getOpeningState,
  OpeningState,
  StateLabel,
  stateLabel,
  toLocalMoment,
  visitLabel,
} from '../services/opening-hours.service';
import { Area, buildPlaces, searchPlaces } from '../services/places';
import { buildResultList, MapView } from '../services/result-list';

export type LoadStatus = 'loading' | 'error' | 'ready';
export type LocateStatus =
  'idle' | 'locating' | 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'far';

/** Maps a geolocation failure to what we tell the user. */
function locateError(err: { code: number }): LocateStatus {
  switch (err.code) {
    case 1: // PERMISSION_DENIED
      return 'denied';
    case 3: // TIMEOUT
      return 'timeout';
    default: // POSITION_UNAVAILABLE and anything unexpected
      return 'unavailable';
  }
}

/** A day and time the user plans to visit; SAST wall clock. */
export interface Visit {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

const SUGGESTION_LIMIT = 6;
const PLACE_SUGGESTION_LIMIT = 3;

/** Distance options for searching around an area. */
export const RADII_KM = [15, 30, 50] as const;

/** Matches the desktop breakpoint in the stylesheets (tablet is 768 to 1199). */
export const isDesktop = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(min-width: 1200px)').matches;

/** Single source of UI state. Components read signals; all logic lives in the pure services. */
@Injectable({ providedIn: 'root' })
export class BranchStore {
  private readonly repo = inject(BranchRepository);
  private readonly clock = inject(Clock);

  readonly status = signal<LoadStatus>('loading');
  readonly branches = signal<Branch[]>([]);

  readonly text = signal('');
  readonly services = signal<ServiceCode[]>([]);
  readonly type = signal<BranchType | null>(null);

  /** Only show branches that are open at `asOf`. */
  readonly openOn = signal(false);
  /** Chosen visit time; null means "now". */
  readonly visit = signal<Visit | null>(null);

  /** A place (or "near me") the user is searching around; results are limited to `radiusKm` of it. */
  readonly area = signal<Area | null>(null);
  readonly radiusKm = signal<number>(RADII_KM[0]);

  readonly origin = signal<LatLng | null>(null);
  readonly locateStatus = signal<LocateStatus>('idle');
  /** When status is 'far': distance in km to the nearest branch. */
  readonly farKm = signal(0);
  /** Branch shown in the map popup. */
  readonly selectedId = signal<string | null>(null);
  /** Branch shown in the full detail panel. */
  readonly detailId = signal<string | null>(null);
  /** Bumped when the map should re-focus on the selection (e.g. "near me" pressed again). */
  readonly focus = signal(0);

  /** The app's "now"; ticks so labels and "open" stay current. */
  readonly now = signal(this.clock.now());

  /** The instant the open filter is evaluated at. */
  readonly asOf = computed(() => {
    const v = this.visit();
    return v ? new Date(`${v.date}T${v.time}:00+02:00`) : this.now();
  });

  /** The visit being planned, if the open filter is set to a chosen date and time. */
  readonly planned = computed(() => (this.openOn() ? this.visit() : null));

  /** A branch's opening state and wording: for the planned visit if there is one, else for now. */
  describe(branch: Branch, subject?: string): { state: OpeningState; label: StateLabel } {
    const visit = this.planned();
    const state = getOpeningState(branch, visit ? this.asOf() : this.now());
    const label = visit
      ? visitLabel(state, visit.time, toLocalMoment(this.now()).date, subject)
      : stateLabel(state);
    return { state, label };
  }

  constructor() {
    setInterval(() => this.now.set(this.clock.now()), 30_000);
    this.load();

    // "Near me" is a standing request for the closest match, so honour it when the filters change.
    // Only the user's own choices are tracked: the ticking clock must not move the map under them.
    effect(() => {
      this.services();
      this.type();
      this.openOn();
      this.visit();
      untracked(() => this.showNearest({ widen: true }));
    });
    effect(() => {
      this.radiusKm(); // chosen by hand, so never widen it back
      untracked(() => this.showNearest({ widen: false }));
    });
  }

  private showNearest({ widen }: { widen: boolean }): void {
    const area = this.area();
    if (area?.id !== 'me') return;
    if (widen && !this.matched().length) this.widenToMatch(area);
    const nearest = this.results()[0];
    this.detailId.set(null); // would otherwise stay on the previous branch
    if (nearest) this.pick(nearest.branch.id);
    else this.select(null);
    this.focus.update((n) => n + 1);
  }

  /** Grows the radius, if need be, until something around the area matches. */
  private widenToMatch(a: Area): void {
    const r = RADII_KM.find(
      (x) =>
        x >= this.radiusKm() &&
        this.filtered().some((b) => haversineKm(a.location, b.location) <= x),
    );
    if (r !== undefined) this.radiusKm.set(r);
  }

  load(): void {
    this.status.set('loading');
    this.repo.getAll().subscribe({
      next: (b) => {
        this.branches.set(b);
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  /** Cities and suburbs from the branch data, searchable offline. */
  readonly places = computed(() => buildPlaces(this.branches()));

  /** Branches matching the text, services, type and open filters, anywhere in the country. */
  private readonly filtered = computed(() =>
    filterBranches(searchBranches(this.branches(), this.text()), {
      services: this.services(),
      type: this.type() ?? undefined,
      openAt: this.openOn() ? this.asOf() : undefined,
    }),
  );

  /** What the radius is measured from: the chosen area, else the user's location (for sorting only). */
  readonly center = computed(() => this.area()?.location ?? this.origin());

  /** True while an area (a place or "near me") limits results to the radius. */
  readonly radiusActive = computed(() => this.area() !== null);

  /** Branches matching search and filters, and within the radius of the area if there is one (unsorted). */
  readonly matched = computed(() => {
    const a = this.area();
    const all = this.filtered();
    if (!a) return all;
    const r = this.radiusKm();
    return all.filter((b) => haversineKm(a.location, b.location) <= r);
  });

  /** Nearest first when we know where the user is or what area they chose, else A to Z. */
  readonly results = computed<BranchWithDistance[]>(() => {
    const c = this.center();
    return c
      ? sortByDistance(this.matched(), c)
      : sortByName(this.matched()).map((branch) => ({ branch, distanceKm: NaN }));
  });

  /** Autocomplete: matching branches A to Z, only while the user has typed something. */
  readonly suggestions = computed(() =>
    this.text().trim() ? sortByName(this.filtered()).slice(0, SUGGESTION_LIMIT) : [],
  );

  /** What the user can currently see of the map; set by the map, used by the side panel. */
  readonly mapView = signal<MapView | null>(null);

  /** Rows for the side panel on wide screens. */
  readonly resultList = computed(() =>
    buildResultList({
      matched: this.matched(),
      area: this.area(),
      radiusKm: this.radiusKm(),
      text: this.text(),
      origin: this.origin(),
      view: this.mapView(),
    }),
  );

  /** Autocomplete: matching places (cities, suburbs). */
  readonly placeSuggestions = computed(() =>
    searchPlaces(this.places(), this.text(), PLACE_SUGGESTION_LIMIT),
  );

  /** The next radius up, if there is one. */
  readonly nextRadius = computed(() => RADII_KM.find((r) => r > this.radiusKm()) ?? null);

  readonly selected = computed(
    () => this.branches().find((b) => b.id === this.selectedId()) ?? null,
  );
  readonly detail = computed(() => this.branches().find((b) => b.id === this.detailId()) ?? null);

  byId(id: string): Branch | undefined {
    return this.branches().find((b) => b.id === id);
  }

  alternativeTo(branch: Branch): BranchWithDistance | undefined {
    const sameType = this.branches().filter((b) => b.type === branch.type);
    const at = this.planned() ? this.asOf() : this.now();
    return nearestOpen(sameType, branch.location, at, branch.id);
  }

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  /**
   * The user chose a branch (map pin, search result, near me). Shows the popup; on desktop the full
   * details open straight away on the left, on smaller screens they wait for the popup's "More".
   */
  pick(id: string): void {
    this.selectedId.set(id);
    if (isDesktop()) this.detailId.set(id);
  }

  /** Select a branch and open its full details. */
  showDetail(id: string): void {
    this.selectedId.set(id);
    this.detailId.set(id);
  }

  closeDetail(): void {
    this.detailId.set(null);
  }

  /** The user typed in the search box: that's a name search, which replaces any chosen area. */
  setText(v: string): void {
    this.text.set(v);
    this.area.set(null);
    this.clearLocateNote();
  }

  /**
   * Search around a place or "near me". Clears the text, drops any selection, and widens the radius
   * if nothing is in range, so the user lands on something rather than an empty map.
   */
  setArea(a: Area): void {
    this.clearLocateNote();
    this.text.set('');
    this.area.set(a);
    this.selectedId.set(null);
    this.detailId.set(null);
    this.widenToMatch(a);
  }

  widen(): void {
    const next = this.nextRadius();
    if (next) this.radiusKm.set(next);
  }

  toggleService(s: ServiceCode): void {
    this.services.update((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  clearServices(codes: ServiceCode[]): void {
    this.services.update((cur) => cur.filter((x) => !codes.includes(x)));
  }

  setVisit(patch: Partial<Visit>, fallback: Visit): void {
    this.visit.set({ ...(this.visit() ?? fallback), ...patch });
    this.openOn.set(true);
  }

  clearOpenFilter(): void {
    this.openOn.set(false);
    this.visit.set(null);
  }

  resetFilters(): void {
    this.text.set('');
    this.services.set([]);
    this.type.set(null);
    this.area.set(null);
    this.radiusKm.set(RADII_KM[0]);
    this.clearLocateNote();
    this.clearOpenFilter();
  }

  /** Find the user, then focus the nearest branch that matches the current filters. */
  locate(): void {
    // browsers only offer geolocation on https or localhost
    if (globalThis.isSecureContext === false) {
      this.locateStatus.set('insecure');
      return;
    }
    if (!('geolocation' in navigator)) {
      this.locateStatus.set('unavailable');
      return;
    }
    this.locateStatus.set('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => this.located({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => this.locateStatus.set(locateError(err)),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  private located(here: LatLng): void {
    this.origin.set(here);
    this.setArea({ id: 'me', name: 'Near me', location: here });
    this.locateStatus.set('idle');
    let nearest = this.results()[0];
    if (!nearest) {
      // nothing within 50 km (or the user is abroad): show the closest branch rather than an empty map
      nearest = sortByDistance(this.filtered(), here)[0];
      if (nearest) {
        this.area.set(null);
        this.farKm.set(nearest.distanceKm);
        this.locateStatus.set('far');
      }
    }
    if (nearest) this.pick(nearest.branch.id);
    else this.select(null);
    this.focus.update((n) => n + 1);
  }

  /** Dismiss a "near me" message once the user does something else. */
  private clearLocateNote(): void {
    if (this.locateStatus() !== 'locating') this.locateStatus.set('idle');
  }

  clearOrigin(): void {
    this.origin.set(null);
  }
}
