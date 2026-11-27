import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as L from 'leaflet'; // types only: Leaflet itself is loaded on demand (see ./leaflet.ts)
import { Branch } from '../../core/models/branch.model';
import { BranchStore } from '../../core/state/branch-store';
import { ShareService } from '../../core/state/share';
import { UiState } from '../../core/state/ui-state';
import { sastDate } from '../../core/services/clock';
import { boundsOf, directionsUrl } from '../../core/services/geo';
import { getOpeningState, hoursOn } from '../../core/services/opening-hours.service';

/** Leaflet and its cluster plugin, loaded lazily so they stay out of the initial bundle. */
type Leaflet = (typeof import('./leaflet'))['leaflet'];

const SA_CENTER: L.LatLngExpression = [-29, 24.5];
const DAY_MS = 86_400_000;

@Component({
  selector: 'app-branch-map',
  template: `<div #host class="map" role="application" aria-label="Map of branches"></div>`,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .map {
      height: 100%;
      width: 100%;
    }
  `,
})
export class BranchMap implements OnDestroy {
  private readonly store = inject(BranchStore);
  private readonly ui = inject(UiState);
  private readonly sharing = inject(ShareService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly ready = signal(false);

  private lf!: Leaflet;
  private map!: L.Map;
  private cluster!: L.MarkerClusterGroup;
  private popup!: L.Popup;
  private readonly markers = new Map<string, L.Marker>();
  /** Branches whose pin is grey: not open at the time being looked at. */
  private readonly closed = new Set<string>();
  private me?: L.Marker;
  private lastSelected: string | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(async () => {
      const { leaflet } = await import('./leaflet');
      if (this.destroyed) return; // left the page while the chunk was loading
      this.lf = leaflet;
      this.popup = leaflet.popup({
        closeButton: false,
        offset: [0, -6],
        maxWidth: 260,
        autoPan: false, // centerOn() places the pin and popup instead
      });
      this.map = leaflet.map(this.host().nativeElement, {
        center: SA_CENTER,
        zoom: 5,
        zoomControl: false,
      });
      leaflet.control.zoom({ position: 'topright' }).addTo(this.map);
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
        .addTo(this.map);
      // No chunkedLoading: it adds markers in timed batches that clearLayers() does not cancel, so a
      // place search or "near me" landing during the first second left the map in the wrong state.
      // ~900 markers are cheap to add in one go.
      this.cluster = leaflet.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
      });
      this.map.addLayer(this.cluster);
      this.map.on('moveend', () => this.publishView());
      this.map.on('click', () => {
        this.ui.closeAll();
        this.ui.sheetOpen.set(false);
        this.store.select(null);
      });
      this.publishView();
      this.ready.set(true);
    });

    // the visible part of the map changes when the side panel is shown or hidden
    effect(() => {
      if (!this.ready()) return;
      this.ui.wide();
      this.ui.listCollapsed();
      untracked(() => this.publishView());
    });

    // markers follow the matched set; refit when it changes
    effect(() => {
      if (!this.ready()) return;
      const matched = this.store.matched();
      const wanted = matched.map((b) => {
        let m = this.markers.get(b.id);
        if (!m) {
          m = this.lf.marker([b.location.lat, b.location.lng], {
            title: b.name,
            icon: this.icon(b.id, false),
            keyboard: true,
          });
          m.on('click', () => {
            this.ui.sheetOpen.set(false); // the popup would be behind it
            this.store.pick(b.id);
          });
          this.markers.set(b.id, m);
        }
        return m;
      });
      this.cluster.clearLayers();
      this.cluster.addLayers(wanted);
      untracked(() => this.fit(matched));
    });

    // grey out pins that are closed now (or at the chosen visit time); follows the clock
    effect(() => {
      if (!this.ready()) return;
      const at = this.store.asOf();
      const matched = this.store.matched();
      untracked(() => this.shadePins(matched, at));
    });

    // opening the bottom sheet covers the lower map: move search results up out of its way
    effect(() => {
      if (!this.ready() || !this.ui.sheetOpen()) return;
      untracked(() => {
        if (this.store.area() || this.store.text().trim()) this.fit(this.store.matched());
      });
    });

    // selection: highlight, reveal inside its cluster, then show the popup
    effect(() => {
      if (!this.ready()) return;
      const id = this.store.selectedId();
      this.store.focus(); // re-run when "near me" is pressed again
      untracked(() => this.focusOn(id));
    });

    // keep popup text current as the clock ticks or the visit time changes
    effect(() => {
      if (!this.ready()) return;
      this.store.now();
      this.store.asOf();
      this.store.planned();
      const b = this.store.selected();
      if (b && this.map.hasLayer(this.popup)) this.popup.setContent(this.popupContent(b));
    });

    // user location; centre on it only when no branch was focused
    effect(() => {
      if (!this.ready()) return;
      const o = this.store.origin();
      this.me?.remove();
      this.me = undefined;
      if (!o) return;
      this.me = this.lf
        .marker([o.lat, o.lng], {
          icon: this.lf.divIcon({
            className: '',
            html: '<div class="dot me"></div>',
            iconSize: [14, 14],
          }),
          title: 'You are here',
        })
        .addTo(this.map);
      if (!untracked(() => this.store.selectedId())) this.map.setView([o.lat, o.lng], 12);
    });
  }

  /** Zoom to the given branches, keeping the pins out from under the list. */
  private fit(branches: Branch[]): void {
    const bounds = boundsOf(branches.map((b) => b.location));
    if (!bounds) return;
    this.map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      // Not animated: a selection made in the same update starts its own zoom right after, and
      // Leaflet drops a zoom requested while another is still animating (map stuck, no popup).
      {
        paddingTopLeft: [30 + this.coveredLeft(), this.sheetShown() ? 80 : 30],
        paddingBottomRight: [30, this.coveredBottom() || 30],
        maxZoom: 14,
        animate: false,
      },
    );
  }

  private sheetShown(): boolean {
    return !this.ui.wide() && this.ui.sheetOpen();
  }

  /** Height of the map's bottom edge hidden behind the open sheet and the control bar. */
  private coveredBottom(): number {
    if (!this.sheetShown()) return 0;
    const { x: width, y: height } = this.map.getSize();
    // half the screen at most; on phones the sheet stops after three rows
    const sheet = width < 768 ? Math.min(height / 2, 340) : height / 2;
    return Math.min(112 + sheet, height - 150);
  }

  private focusOn(id: string | null): void {
    const last = this.lastSelected;
    if (last) this.markers.get(last)?.setIcon(this.icon(last, false));
    this.lastSelected = id;
    const m = id ? this.markers.get(id) : undefined;
    const b = id ? this.store.byId(id) : undefined;
    if (!m || !b) {
      this.map.closePopup(this.popup);
      return;
    }
    m.setIcon(this.icon(b.id, true));
    const show = () => {
      this.popup.setLatLng(m.getLatLng()).setContent(this.popupContent(b)).openOn(this.map);
      this.centerOn(m.getLatLng());
    };
    if (this.cluster.hasLayer(m)) {
      this.cluster.zoomToShowLayer(m, show);
    } else {
      this.map.setView(m.getLatLng(), Math.max(this.map.getZoom(), 14));
      show();
    }
  }

  /**
   * Pans so the pin and its popup sit together in the middle of the uncovered part of the map. If
   * there isn't room for both, the popup stays clear of the search bar.
   */
  private centerOn(at: L.LatLng): void {
    const size = this.map.getSize();
    const popup = this.popup.getElement()?.offsetHeight ?? 0;
    const top = 80; // search bar
    const bottom = size.y - (this.coveredBottom() || (this.ui.wide() ? 100 : 160));
    const x = (Math.min(this.coveredLeft(), size.x / 2) + size.x) / 2;
    const y = Math.max(top + popup, Math.min(bottom, (top + bottom + popup) / 2));
    this.map.panBy(this.map.latLngToContainerPoint(at).subtract([x, y]));
  }

  /** Width of the map's left edge hidden behind the side panel or details card. */
  private coveredLeft(): number {
    const shown = this.ui.wide() && (this.store.detailId() !== null || !this.ui.listCollapsed());
    return shown ? this.ui.panelWidth() : 0;
  }

  /** Tells the store what the user can actually see, for the side list. */
  private publishView(): void {
    const size = this.map.getSize();
    const left = Math.min(this.coveredLeft(), size.x / 2);
    const nw = this.map.containerPointToLatLng([left, 0]);
    const se = this.map.containerPointToLatLng([size.x, size.y]);
    const c = this.map.containerPointToLatLng([(left + size.x) / 2, size.y / 2]);
    this.store.mapView.set({
      bounds: { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng },
      center: { lat: c.lat, lng: c.lng },
      zoom: this.map.getZoom(),
    });
  }

  /** Minimum info: name, address, today's closing and tomorrow's hours, and a More button. */
  private popupContent(b: Branch): HTMLElement {
    const now = this.store.now();
    const visit = this.store.planned();
    const { state, label } = this.store.describe(b);
    const range = (date: string) => {
      const periods = hoursOn(b, date).periods;
      return periods.length
        ? `${periods[0]!.open}–${periods[periods.length - 1]!.close}`
        : 'Closed';
    };
    const root = document.createElement('div');
    const add = (text: string, cls = '') => {
      const p = document.createElement('p');
      p.textContent = text;
      if (cls) p.className = cls;
      root.appendChild(p);
    };
    const a = b.address;
    add(b.name, 'pop-name');
    add(
      [a.street, a.suburb !== a.city ? a.suburb : '', `${a.city} ${a.postalCode}`]
        .filter(Boolean)
        .join(', '),
    );
    add(label.text, `tone-${label.tone}`);
    if (state.status === 'open' || state.status === 'closed') {
      add(
        visit
          ? `Hours that day: ${range(visit.date)}`
          : `Tomorrow: ${range(sastDate(new Date(now.getTime() + DAY_MS)))}`,
      );
    }
    add('Sample hours, not Capitec information', 'pop-sample');
    const actions = document.createElement('div');
    actions.className = 'pop-actions';
    const directions = document.createElement('a');
    directions.href = directionsUrl(b.location);
    directions.target = '_blank';
    directions.rel = 'noopener';
    directions.textContent = 'Get directions';
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'pop-more'; // hidden on desktop, where details open on click
    more.textContent = 'More';
    more.addEventListener('click', () => {
      this.ui.closeAll();
      this.store.showDetail(b.id);
    });
    const share = document.createElement('button');
    share.type = 'button';
    share.textContent = 'Share';
    share.addEventListener('click', () => void this.sharing.shareBranch(b.id, share));
    actions.append(directions, share, more);
    root.appendChild(actions);
    return root;
  }

  private shadePins(branches: Branch[], at: Date): void {
    for (const b of branches) {
      const closed = !getOpeningState(b, at).isOpen;
      const m = this.markers.get(b.id);
      if (!m || closed === this.closed.has(b.id)) continue;
      if (closed) this.closed.add(b.id);
      else this.closed.delete(b.id);
      // colour alone says nothing to a screen reader
      m.options.title = closed ? `${b.name} (closed)` : b.name;
      m.setIcon(this.icon(b.id, b.id === this.lastSelected));
    }
  }

  private icon(id: string, selected: boolean): L.DivIcon {
    const classes = ['dot', this.closed.has(id) ? 'closed' : '', selected ? 'selected' : ''];
    return this.lf.divIcon({
      className: '',
      html: `<div class="${classes.filter(Boolean).join(' ')}"></div>`,
      iconSize: [14, 14],
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.map?.remove();
  }
}
