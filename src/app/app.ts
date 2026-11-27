import { Component, inject } from '@angular/core';
import { AppStatus } from './core/state/app-status';
import { BranchStore } from './core/state/branch-store';
import { ShareService } from './core/state/share';
import { UiState } from './core/state/ui-state';
import { BottomBar } from './features/bottom-bar/bottom-bar';
import { BranchDetail } from './features/branch-detail/branch-detail';
import { BranchMap } from './features/branch-map/branch-map';
import { ResultsPanel } from './features/results-panel/results-panel';
import { SearchBar } from './features/search-bar/search-bar';

@Component({
  imports: [SearchBar, BottomBar, BranchMap, BranchDetail, ResultsPanel],
  selector: 'app-root',
  host: { '(document:keydown.escape)': 'escape()' },
  template: `
    <h1 class="sr-only">Capitec branch locator</h1>
    <!-- Controls come before the map in the DOM so Tab reaches search first; z-index does the layering.
         Otherwise a keyboard user lands on the map and tabs through every pin. -->
    <app-search-bar />

    @if (ui.menu()) {
      <div class="scrim" role="presentation" (click)="ui.closeAll()"></div>
    }

    <!-- side list on wide screens, bottom sheet on the rest; the details take its place -->
    @if (!store.detail() && store.status() === 'ready') {
      <app-results-panel />
    }

    <div class="notices">
      @if (store.status() === 'loading') {
        <p class="notice surface" role="status">Loading branches&hellip;</p>
      } @else if (store.status() === 'error') {
        <p class="notice surface" role="alert">
          Couldn't load the branches. <button type="button" (click)="store.load()">Retry</button>
        </p>
      } @else if (store.matched().length === 0) {
        @if (store.radiusActive() && store.nextRadius(); as next) {
          <p class="notice surface" role="status">
            No branches within {{ store.radiusKm() }} km.
            <button type="button" (click)="store.widen()">Widen to {{ next }} km</button>
          </p>
        } @else {
          <p class="notice surface" role="status">
            No branches match. <button type="button" (click)="store.resetFilters()">Reset</button>
          </p>
        }
      }

      @if (status.updateReady()) {
        <p class="notice surface" role="status">
          A new version is ready. <button type="button" (click)="status.reload()">Reload</button>
        </p>
      }
      @if (status.offline()) {
        <p class="notice surface" role="status">
          You're offline. Search still works; parts of the map may be missing.
        </p>
      }
    </div>

    <app-bottom-bar />

    @if (sharing.note(); as note) {
      <p class="share-note" role="status" [style.left.px]="note.x" [style.top.px]="note.y">
        {{ note.text }}
      </p>
    }

    @if (store.detail()) {
      <div class="detail-scrim" role="presentation" (click)="store.closeDetail()"></div>
      <app-branch-detail />
    }

    <app-branch-map />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
    }
    app-branch-map {
      position: absolute;
      inset: 0;
    }
    .scrim {
      position: absolute;
      inset: 0;
      z-index: 1250;
    }
    .detail-scrim {
      position: absolute;
      inset: 0;
      z-index: 1350;
      background: rgba(0, 0, 0, 0.2);
    }
    @media (min-width: 768px) {
      .detail-scrim {
        display: none;
      }
    }
    /* stacked messages under the search bar; the gaps must not block the map */
    .notices {
      position: absolute;
      top: 72px;
      left: 12px;
      right: 12px;
      max-width: 420px;
      z-index: 1100;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }
    .notice {
      pointer-events: auto;
      margin: 0;
      padding: 10px 16px;
      overflow-wrap: anywhere;
    }
    @media (min-width: 768px) and (max-width: 1199px) {
      .notices {
        top: 88px;
        left: 16px;
        right: 16px;
        max-width: 560px;
      }
      .notice {
        font-size: 16px;
        padding: 12px 20px;
      }
    }
    /* wide screens: clear of the side panel */
    @media (min-width: 1200px) {
      .notices {
        left: 448px;
      }
    }
    @media (min-width: 900px) and (max-width: 1199px) and (min-height: 600px) and (orientation: landscape) {
      .notices {
        left: 392px;
      }
    }
    /* next to the button that was pressed, in the accent colour so it is not missed */
    .share-note {
      position: fixed;
      z-index: 1450;
      transform: translateX(-50%);
      width: max-content;
      max-width: min(360px, calc(100% - 24px));
      box-sizing: border-box;
      margin: 0;
      padding: 8px 14px;
      border-radius: var(--radius);
      background: var(--accent);
      color: var(--on-accent);
      box-shadow: var(--shadow);
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .notice button {
      text-decoration: underline;
      margin-left: 6px;
    }
  `,
})
export class App {
  protected readonly store = inject(BranchStore);
  protected readonly ui = inject(UiState);
  protected readonly sharing = inject(ShareService);
  protected readonly status = inject(AppStatus);

  /** Escape peels back one layer at a time: menus, details, the bottom sheet, then the popup. */
  protected escape(): void {
    if (this.ui.menu() || this.ui.suggestionsOpen()) this.ui.closeAll();
    else if (this.store.detailId()) this.store.closeDetail();
    else if (this.ui.sheetOpen() && !this.ui.wide()) this.ui.sheetOpen.set(false);
    else this.store.select(null);
  }
}
