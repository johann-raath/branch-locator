import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { sastDate } from '../services/clock';
import { readShare, ShareState, writeShare } from '../services/share-url';
import { BranchStore, RADII_KM } from './branch-store';

const NOTE_MS = 4_000;
const MANUAL_COPY_MS = 20_000;

export interface ShareNote {
  text: string;
  /** Viewport point beside the button that was pressed. */
  x: number;
  y: number;
}

/** Just under the button, or above it near the bottom edge; never off the side of the screen. */
function beside(button: Element): { x: number; y: number } {
  const r = button.getBoundingClientRect();
  const half = 70;
  return {
    x: Math.min(Math.max(r.left + r.width / 2, half), innerWidth - half),
    y: r.bottom + 60 > innerHeight ? r.top - 48 : r.bottom + 8,
  };
}

/**
 * Keeps the address bar in step with what is on screen, restores it when a link is opened, and
 * shares links.
 */
@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly store = inject(BranchStore);
  private readonly initial = readShare(location.search);
  private readonly restored = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  /** Feedback after pressing Share. */
  readonly note = signal<ShareNote | null>(null);

  /** The current search, without the selected branch. The user's own location stays private. */
  private readonly search = computed<ShareState>(() => {
    const area = this.store.area();
    const place = area && area.id !== 'me' ? area.id : undefined;
    const radius = this.store.radiusKm();
    const visit = this.store.visit();
    return {
      place,
      radius: place && radius !== RADII_KM[0] ? radius : undefined,
      q: this.store.text().trim() || undefined,
      services: this.store.services(),
      open: this.store.openOn() ? (visit ?? 'now') : undefined,
    };
  });

  /** A place or name search is worth sharing; "near me" would mean nothing to someone else. */
  readonly canShareSearch = computed(() => !!(this.search().place || this.search().q));

  constructor() {
    effect(() => {
      if (this.restored() || this.store.status() !== 'ready') return;
      untracked(() => this.restore(this.initial));
      this.restored.set(true);
    });

    effect(() => {
      if (!this.restored()) return;
      const branch = this.store.detailId() ?? this.store.selectedId() ?? undefined;
      const query = writeShare({ ...this.search(), branch }, location.search);
      history.replaceState(history.state, '', location.pathname + query + location.hash);
    });
  }

  shareSearch(button: Element): Promise<void> {
    return this.send(this.link(this.search()), 'Capitec branches', beside(button));
  }

  shareBranch(id: string, button: Element): Promise<void> {
    const name = this.store.byId(id)?.name ?? 'Capitec branch';
    return this.send(this.link({ branch: id }), name, beside(button));
  }

  private link(state: ShareState): string {
    return location.origin + location.pathname + writeShare(state);
  }

  private restore(state: ShareState): void {
    const store = this.store;
    if (state.services) store.services.set(state.services);
    if (state.open === 'now') store.openOn.set(true);
    else if (state.open && state.open.date >= sastDate(store.now())) {
      store.visit.set(state.open);
      store.openOn.set(true);
    }
    if (state.radius && (RADII_KM as readonly number[]).includes(state.radius))
      store.radiusKm.set(state.radius);

    const place = state.place && store.places().find((p) => p.id === state.place);
    if (place) store.setArea(place);
    else if (state.q) store.setText(state.q);

    const branch = state.branch ? store.byId(state.branch) : undefined;
    if (!branch) return;
    // business centres are hidden unless asked for; the shared one still needs its pin
    if (branch.type === 'business-centre' && !store.services().includes('business'))
      store.toggleService('business');
    // like tapping the pin: the popup, and details straight away only on desktop
    store.pick(branch.id);
  }

  /** The system share sheet on touch devices; elsewhere copy the link. */
  private async send(url: string, title: string, at: { x: number; y: number }): Promise<void> {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // the user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.say({ text: 'Link copied', ...at }, NOTE_MS);
    } catch {
      // no clipboard on plain http (other than localhost)
      this.say({ text: `Copy this link: ${url}`, ...at }, MANUAL_COPY_MS);
    }
  }

  private say(note: ShareNote, ms: number): void {
    clearTimeout(this.timer);
    this.note.set(note);
    this.timer = setTimeout(() => this.note.set(null), ms);
  }
}
