import { Component, computed, inject, signal } from '@angular/core';
import { Branch } from '../../core/models/branch.model';
import { moveIndex } from '../../core/services/list-nav';
import { Place } from '../../core/services/places';
import { BranchStore } from '../../core/state/branch-store';
import { THEME_OPTIONS, ThemeService } from '../../core/state/theme';
import { UiState } from '../../core/state/ui-state';

type Option =
  { id: string; kind: 'place'; place: Place } | { id: string; kind: 'branch'; branch: Branch };

@Component({
  selector: 'app-search-bar',
  template: `
    <div class="row">
      <div class="bar surface">
        <input
          type="search"
          placeholder="Search"
          aria-label="Search branches by name, suburb or town"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="suggestions"
          [attr.aria-expanded]="showSuggestions()"
          [attr.aria-activedescendant]="activeId()"
          autocomplete="off"
          [value]="store.area()?.name ?? store.text()"
          (input)="onInput($any($event.target).value)"
          (focus)="ui.suggestionsOpen.set(true)"
          (keydown.arrowdown)="move($event, 1)"
          (keydown.arrowup)="move($event, -1)"
          (keydown.enter)="onEnter($event)"
        />
        <button
          type="button"
          class="burger"
          [class.on]="wheelchairOn()"
          aria-label="Wheelchair accessible branches only"
          title="Wheelchair access"
          [attr.aria-pressed]="wheelchairOn()"
          (click)="store.toggleService('wheelchair')"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="4" r="1.7" />
            <path d="M11 7.6v6.4h5.2l2.3 5M11 10.6h4.2M7.6 11.6a5.2 5.2 0 1 0 7.2 6.6" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        class="theme surface"
        aria-label="Appearance"
        aria-haspopup="true"
        [attr.aria-expanded]="ui.menu() === 'theme'"
        (click)="ui.toggle('theme')"
      >
        @if (theme.theme() === 'dark') {
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4.5" />
            <path
              d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            />
          </svg>
        } @else {
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />
          </svg>
        }
      </button>
    </div>

    @if (showSuggestions()) {
      <ul id="suggestions" class="surface list" role="listbox" aria-label="Matching branches">
        @for (o of options(); track o.id; let i = $index) {
          <li
            role="option"
            [id]="'suggestion-' + i"
            [attr.aria-selected]="i === active()"
            [class.active]="i === active()"
          >
            <button type="button" tabindex="-1" (click)="choose(o)">
              @if (o.kind === 'place') {
                <span class="name">{{ o.place.name }}</span>
                <span class="where"
                  >{{ o.place.kind === 'city' ? 'City' : 'Suburb' }} &middot;
                  {{ o.place.province }} &middot; {{ o.place.count }}
                  {{ o.place.count === 1 ? 'branch' : 'branches' }}</span
                >
              } @else {
                <span class="name">{{ o.branch.name }}</span>
                <span class="where"
                  >{{ o.branch.address.suburb }}, {{ o.branch.address.city }}</span
                >
              }
            </button>
          </li>
        } @empty {
          <li class="none">No matches</li>
        }
      </ul>
    }

    @if (ui.menu() === 'theme') {
      <div class="menu themes" role="radiogroup" aria-label="Appearance">
        @for (o of themeOptions; track o.value) {
          <label>
            <input
              type="radio"
              name="theme"
              [value]="o.value"
              [checked]="theme.preference() === o.value"
              (change)="theme.set(o.value)"
            />
            <span
              >{{ o.label }}
              @if (o.hint) {
                <small>{{ o.hint }}</small>
              }
            </span>
          </label>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      z-index: 1300;
      max-width: 420px;
    }
    .row {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .bar {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      height: 48px;
      padding: 0 6px 0 18px;
      gap: 4px;
      border-radius: 24px;
    }
    .bar input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      background: none;
      font: inherit;
      font-size: 16px;
      font-weight: 300;
      height: 100%;
    }
    .bar input::placeholder {
      color: var(--muted);
    }
    .bar input:focus-visible {
      outline: 0;
    }
    .bar:focus-within {
      border-color: var(--accent);
    }
    .burger {
      position: relative;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: var(--muted);
    }
    .burger:hover {
      color: var(--ink);
      background: var(--hover);
    }
    .burger.on {
      color: var(--on-accent);
      background: var(--accent);
    }
    .theme {
      flex: none;
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: var(--ink);
    }
    .theme:hover {
      background: var(--hover);
    }
    .list {
      list-style: none;
      margin: 8px 0 0;
      padding: 4px 0;
      max-height: 50vh;
      overflow: auto;
    }
    .list li + li {
      border-top: 1px solid var(--line);
    }
    .list li button {
      display: grid;
      width: 100%;
      text-align: left;
      padding: 10px 18px;
      gap: 0;
    }
    .list li button:hover,
    .list li.active button {
      background: var(--hover);
    }
    .list li.active {
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .name {
      font-weight: 400;
    }
    .where {
      color: var(--muted);
      font-size: 12px;
      font-weight: 300;
    }
    .none {
      padding: 12px 18px;
      color: var(--muted);
    }
    .themes {
      position: absolute;
      top: 56px;
      right: 0;
      width: 230px;
    }
    .themes input[type='radio'] {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
      margin: 0;
    }
    .themes span {
      display: grid;
      line-height: 1.3;
    }
    /* desktop: open to the right of the toggle so it doesn't cover the details card */
    @media (min-width: 1200px) {
      .themes {
        top: 0;
        right: auto;
        left: calc(100% + 12px);
      }
    }
    .themes small {
      color: var(--muted);
      font-size: 12px;
      font-weight: 300;
    }

    /* tablet: the search bar spans the whole top edge, controls scale up */
    @media (min-width: 768px) and (max-width: 1199px) {
      :host {
        top: 16px;
        left: 16px;
        right: 16px;
        max-width: none;
      }
      .row {
        gap: 12px;
      }
      .bar {
        height: 56px;
        padding: 0 8px 0 24px;
        border-radius: 28px;
      }
      .bar input {
        font-size: 18px;
      }
      .burger {
        width: 44px;
        height: 44px;
      }
      .burger svg,
      .theme svg {
        width: 24px;
        height: 24px;
      }
      .theme {
        width: 56px;
        height: 56px;
      }
      .list li button {
        padding: 12px 24px;
        font-size: 16px;
      }
      .where {
        font-size: 13px;
      }
      .themes {
        top: 68px;
        width: 260px;
        font-size: 16px;
      }
    }
  `,
})
export class SearchBar {
  protected readonly store = inject(BranchStore);
  protected readonly ui = inject(UiState);
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;

  protected readonly wheelchairOn = computed(() => this.store.services().includes('wheelchair'));
  protected readonly showSuggestions = computed(
    () => this.ui.suggestionsOpen() && this.store.text().trim().length > 0,
  );

  /** Places first, then branches: the order the user sees and arrows through. */
  protected readonly options = computed<Option[]>(() => [
    ...this.store
      .placeSuggestions()
      .map((place): Option => ({ id: `place:${place.id}`, kind: 'place', place })),
    ...this.store
      .suggestions()
      .map((branch): Option => ({ id: `branch:${branch.id}`, kind: 'branch', branch })),
  ]);

  /** Row highlighted with the arrow keys; -1 = none. DOM focus stays in the input (aria-activedescendant). */
  protected readonly active = signal(-1);
  protected readonly activeId = computed(() =>
    this.showSuggestions() && this.active() >= 0 ? `suggestion-${this.active()}` : null,
  );

  protected onInput(v: string): void {
    this.store.setText(v);
    this.ui.menu.set(null);
    this.ui.suggestionsOpen.set(true);
    this.active.set(-1);
  }

  protected move(e: Event, delta: 1 | -1): void {
    if (this.store.text().trim().length === 0) return;
    e.preventDefault(); // keep the caret where it is
    if (!this.ui.suggestionsOpen()) {
      this.ui.suggestionsOpen.set(true);
      return;
    }
    this.active.update((cur) => moveIndex(cur, delta, this.options().length));
    document.getElementById(`suggestion-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
  }

  /** Enter picks the highlighted row, or the first one if the user hasn't arrowed to anything. */
  protected onEnter(e: Event): void {
    const o = this.options()[this.active() >= 0 ? this.active() : 0];
    if (!o) return;
    e.preventDefault();
    this.choose(o);
  }

  protected choose(o: Option): void {
    if (o.kind === 'place') this.pickPlace(o.place);
    else this.pick(o.branch);
  }

  protected pickPlace(p: Place): void {
    this.store.setArea(p);
    this.ui.closeAll();
    (document.activeElement as HTMLElement | null)?.blur();
  }

  protected pick(b: Branch): void {
    this.store.pick(b.id);
    this.ui.closeAll();
    (document.activeElement as HTMLElement | null)?.blur();
  }
}
