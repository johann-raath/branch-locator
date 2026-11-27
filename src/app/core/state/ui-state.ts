import { computed, effect, Injectable, signal, untracked } from '@angular/core';

export type MenuId = 'open' | 'filter' | 'theme';

/**
 * Wide enough for the side panel: desktop, or a tablet held sideways (the height limit keeps
 * phones in landscape out). The stylesheets use the same breakpoints.
 */
export const WIDE_QUERY =
  '(min-width: 1200px), (min-width: 900px) and (min-height: 600px) and (orientation: landscape)';

/** Which dropdown is open (only one at a time), and the results list layout. */
@Injectable({ providedIn: 'root' })
export class UiState {
  readonly menu = signal<MenuId | null>(null);
  readonly suggestionsOpen = signal(false);

  /** True when there is room for the side panel. */
  readonly wide = signal(false);
  /** The side list starts open; the bottom sheet used on narrower screens starts closed. */
  readonly listCollapsed = signal(false);
  readonly sheetOpen = signal(false);
  readonly listOpen = computed(() => (this.wide() ? !this.listCollapsed() : this.sheetOpen()));
  private readonly desktop = signal(false);

  /**
   * Width of the map's left edge covered by the side panel (or the details card), in px, so the map
   * can keep pins and popups clear of it.
   */
  readonly panelWidth = computed(() => (this.desktop() ? 444 : 388));

  constructor() {
    this.watch(WIDE_QUERY, this.wide);
    this.watch('(min-width: 1200px)', this.desktop);
    // searching replaces what the sheet was showing, and the picked result should not be under it
    effect(() => {
      if (this.suggestionsOpen()) untracked(() => this.sheetOpen.set(false));
    });
  }

  setListOpen(open: boolean): void {
    if (this.wide()) this.listCollapsed.set(!open);
    else this.sheetOpen.set(open);
  }

  private watch(query: string, target: { set(v: boolean): void }): void {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia(query);
    target.set(media.matches);
    media.addEventListener?.('change', (e) => target.set(e.matches));
  }

  toggle(id: MenuId): void {
    this.suggestionsOpen.set(false);
    this.menu.update((cur) => (cur === id ? null : id));
  }

  closeAll(): void {
    this.menu.set(null);
    this.suggestionsOpen.set(false);
  }
}
