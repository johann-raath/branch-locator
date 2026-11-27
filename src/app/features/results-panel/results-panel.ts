import { afterNextRender, Component, computed, ElementRef, inject } from '@angular/core';
import { SAMPLE_DATA_NOTE } from '../../core/models/service-labels';
import { formatDistance } from '../../core/services/geo';
import { BranchStore, RADII_KM } from '../../core/state/branch-store';
import { ShareService } from '../../core/state/share';
import { UiState } from '../../core/state/ui-state';

/**
 * The branches that are relevant right now (see buildResultList). A side list on desktop and
 * landscape tablets, a bottom sheet elsewhere. In the side list a row opens the details, and
 * closing them returns to the list; in the sheet a row shows the branch on the map.
 */
@Component({
  selector: 'app-results-panel',
  host: {
    '[class.collapsed]': '!ui.listOpen()',
    '[class.sheet]': '!ui.wide()',
    '[class.lifted]': 'toastShown()',
  },
  template: `
    @if (!ui.listOpen()) {
      @if (ui.wide() || total()) {
        <button type="button" class="surface show" (click)="ui.setListOpen(true)">
          {{ ui.wide() ? 'Show list' : 'Show list · ' + total() }}
        </button>
      }
    } @else {
      <section class="surface panel" aria-label="Branch list">
        <header>
          <h2 aria-live="polite">{{ title() }}</h2>
          <div class="actions">
            @if (sharing.canShareSearch()) {
              <button
                type="button"
                class="share"
                aria-label="Share this search"
                title="Share"
                (click)="sharing.shareSearch($any($event.currentTarget))"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1" />
                </svg>
              </button>
            }
            <button type="button" (click)="ui.setListOpen(false)">Hide</button>
          </div>
        </header>

        @if (store.radiusActive()) {
          <div class="radius" role="group" aria-label="Distance from the chosen area">
            <span>Within</span>
            @for (r of radii; track r) {
              <button
                type="button"
                [class.on]="store.radiusKm() === r"
                [attr.aria-pressed]="store.radiusKm() === r"
                (click)="store.radiusKm.set(r)"
              >
                {{ r }} km
              </button>
            }
          </div>
        }

        @if (list().kind === 'prompt') {
          <p class="hint">
            Search for a place, use Near me, or zoom in to see a list of branches here.
          </p>
        } @else {
          <ul>
            @for (r of rows(); track r.id) {
              <li>
                <button
                  type="button"
                  [attr.data-id]="r.id"
                  [attr.aria-current]="r.id === store.selectedId() ? 'true' : null"
                  (click)="choose(r.id)"
                >
                  <span class="name">{{ r.name }}</span>
                  @if (r.distance) {
                    <span class="distance">{{ r.distance }}</span>
                  }
                  <span class="status" [class]="'status tone-' + r.tone">{{ r.status }}</span>
                </button>
              </li>
            } @empty {
              <li class="hint">
                {{
                  store.radiusActive()
                    ? 'No branches in range. Try a wider distance or change the filters.'
                    : 'No branches here. Move the map or change the filters.'
                }}
              </li>
            }
          </ul>
          @if (hidden()) {
            <p class="hint">{{ hidden() }} more not shown. Zoom in or search to narrow it down.</p>
          }
        }
        <p class="sample">{{ sampleNote }}</p>
      </section>
    }
  `,
  styles: `
    :host {
      position: absolute;
      z-index: 1150;
      top: 72px;
      bottom: 100px;
      left: 12px;
      width: 420px;
    }
    :host.collapsed {
      bottom: auto;
      width: auto;
    }
    /* the card hugs its rows; the empty part of the host must not block the map */
    :host {
      pointer-events: none;
    }
    .panel,
    .show {
      pointer-events: auto;
    }
    .panel {
      max-height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 12px;
      border-bottom: 1px solid var(--line);
    }
    h2 {
      margin: 0;
      font-size: 0.95rem;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .share {
      display: grid;
      place-items: center;
    }
    .actions button,
    .show {
      color: var(--accent);
    }
    .show {
      padding: 10px 18px;
      font-weight: 500;
    }
    .radius {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 20px;
      border-bottom: 1px solid var(--line);
    }
    .radius span {
      margin-right: auto;
      color: var(--muted);
      font-weight: 300;
    }
    .radius button {
      padding: 4px 10px;
      border-radius: 14px;
      color: var(--muted);
    }
    .radius button:hover {
      background: var(--hover);
    }
    .radius button.on {
      color: var(--accent);
      background: var(--hover);
      font-weight: 500;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow: auto;
      overscroll-behavior: contain;
      flex: 1;
    }
    li + li {
      border-top: 1px solid var(--line);
    }
    li > button {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: 12px;
      width: 100%;
      text-align: left;
      padding: 10px 20px;
    }
    li > button:hover,
    li > button[aria-current='true'] {
      background: var(--hover);
    }
    li > button:focus-visible {
      outline-offset: -2px;
    }
    .distance {
      color: var(--muted);
      font-weight: 300;
      white-space: nowrap;
    }
    .status {
      grid-column: 1 / -1;
      font-size: 12.5px;
      font-weight: 300;
      color: var(--muted);
    }
    .status.tone-warn {
      color: var(--warn);
    }
    .status.tone-planned {
      color: var(--accent);
      font-weight: 500;
    }
    .status.tone-closed {
      color: var(--alert);
    }
    .sample {
      margin: 0;
      padding: 8px 20px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 300;
    }
    .hint {
      margin: 0;
      padding: 14px 20px;
      color: var(--muted);
      font-weight: 300;
    }
    /* landscape tablet side list */
    @media (max-width: 1199px) {
      :host {
        top: 88px;
        bottom: 120px;
        left: 16px;
        width: 360px;
      }
    }
    /* bottom sheet: sits just above the control bar, which stays usable */
    :host.sheet {
      top: auto;
      bottom: calc(112px + env(safe-area-inset-bottom));
      left: 12px;
      right: 12px;
      width: auto;
      max-width: 420px;
      margin: 0 auto;
    }
    :host.sheet .panel {
      max-height: 50dvh;
    }
    /* phones: three rows, then scroll, leaving more of the map in view */
    @media (max-width: 767px) {
      :host.sheet ul {
        max-height: 181px;
      }
    }
    :host.sheet.collapsed {
      display: flex;
      justify-content: center;
    }
    /* make room for the location message above the bar */
    :host.sheet.collapsed.lifted {
      bottom: calc(180px + env(safe-area-inset-bottom));
    }
    @media (min-width: 768px) {
      :host.sheet {
        bottom: calc(128px + env(safe-area-inset-bottom));
        max-width: 560px;
      }
    }
  `,
})
export class ResultsPanel {
  protected readonly store = inject(BranchStore);
  protected readonly ui = inject(UiState);
  protected readonly sharing = inject(ShareService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly radii = RADII_KM;
  protected readonly sampleNote = SAMPLE_DATA_NOTE;
  protected readonly list = this.store.resultList;

  protected readonly title = computed(() => {
    const l = this.list();
    return l.kind === 'list' ? l.title : 'Branches';
  });

  protected readonly rows = computed(() => {
    const l = this.list();
    if (l.kind !== 'list') return [];
    return l.rows.map(({ branch, distanceKm }) => {
      const { label } = this.store.describe(branch, 'Will be');
      return {
        id: branch.id,
        name: branch.name,
        distance: distanceKm === undefined ? null : formatDistance(distanceKm),
        status: label.text,
        tone: label.tone,
      };
    });
  });

  protected readonly hidden = computed(() => {
    const l = this.list();
    return l.kind === 'list' ? l.hidden : 0;
  });

  protected readonly total = computed(() => this.rows().length + this.hidden());

  protected readonly toastShown = computed(
    () => !['idle', 'locating'].includes(this.store.locateStatus()),
  );

  protected choose(id: string): void {
    if (this.ui.wide()) {
      this.store.showDetail(id);
      return;
    }
    // like tapping the pin, with the sheet out of the popup's way
    this.ui.sheetOpen.set(false);
    this.store.pick(id);
    this.store.focus.update((n) => n + 1); // centre it again even if it was already selected
  }

  constructor() {
    // coming back from the details: put keyboard focus on the row that was open
    afterNextRender(() => {
      const id = this.store.selectedId();
      if (!id || document.activeElement !== document.body) return;
      this.el.nativeElement
        .querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: false });
    });
  }
}
