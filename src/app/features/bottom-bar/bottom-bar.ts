import { Component, computed, inject } from '@angular/core';
import { FILTER_SERVICES, SERVICE_LABELS } from '../../core/models/service-labels';
import { BranchStore } from '../../core/state/branch-store';
import { UiState } from '../../core/state/ui-state';
import { sastDate } from '../../core/services/clock';
import { formatDistance } from '../../core/services/geo';
import {
  formatShortDate,
  toLocalMoment,
  weekdayName,
} from '../../core/services/opening-hours.service';

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-bottom-bar',
  template: `
    <nav class="bar surface" aria-label="Map controls">
      <button
        type="button"
        class="seg"
        [class.on]="store.openOn()"
        [attr.aria-label]="'Opening hours filter: ' + openLabel()"
        [attr.aria-expanded]="ui.menu() === 'open'"
        (click)="ui.toggle('open')"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="6.5" />
          <path d="M12 9v3l2 1.2M9.2 5.4 9.8 2h4.4l.6 3.4M9.2 18.6 9.8 22h4.4l.6-3.4" />
        </svg>
        @if (store.openOn()) {
          <span class="dot-on"></span>
        }
      </button>
      <button
        type="button"
        class="locate"
        aria-label="Find the nearest branch"
        [attr.aria-busy]="store.locateStatus() === 'locating'"
        [class.busy]="store.locateStatus() === 'locating'"
        (click)="locate()"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path
            d="M12 2v4M12 18v4M2 12h4M18 12h4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        class="seg"
        [class.on]="filterActive()"
        aria-label="Service filters"
        [attr.aria-expanded]="ui.menu() === 'filter'"
        (click)="ui.toggle('filter')"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
        @if (filterActive()) {
          <span class="dot-on"></span>
        }
      </button>
    </nav>
    @if (locateMessage(); as msg) {
      <p class="toast surface" role="status" [class.note]="store.locateStatus() === 'far'">
        {{ msg }}
      </p>
    }

    @if (ui.menu() === 'open') {
      <div class="menu open">
        <label
          ><input
            type="checkbox"
            [checked]="store.openOn()"
            (change)="onToggle($any($event.target).checked)"
          />
          Only show open branches</label
        >
        <label class="field"
          >Day
          <select [value]="visitDate()" (change)="setDay($any($event.target).value)">
            @for (d of days(); track d.iso) {
              <option [value]="d.iso" [selected]="d.iso === visitDate()">{{ d.label }}</option>
            }
          </select>
        </label>
        <label class="field"
          >Time
          <input type="time" [value]="visitTime()" (change)="setTime($any($event.target).value)" />
        </label>
        <div class="actions">
          <button type="button" class="reset" (click)="store.clearOpenFilter()">Reset</button>
        </div>
      </div>
    }

    @if (ui.menu() === 'filter') {
      <div class="menu filter">
        @for (s of services; track s) {
          <label
            ><input
              type="checkbox"
              [checked]="store.services().includes(s)"
              (change)="store.toggleService(s)"
            />
            {{ labels[s] }}</label
          >
        }
        <button type="button" class="reset" (click)="store.clearServices(services)">Reset</button>
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: calc(28px + env(safe-area-inset-bottom));
      z-index: 1300;
      max-width: 420px;
      margin: 0 auto;
    }
    @media (min-width: 768px) {
      :host {
        left: 0;
        right: 0;
      }
    }
    .bar {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
      padding: 0 12px;
      border-radius: 28px;
    }
    .seg {
      position: relative;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: var(--muted);
    }
    .seg:hover {
      color: var(--ink);
      background: var(--hover);
    }
    .seg.on {
      color: var(--accent);
    }
    .dot-on {
      position: absolute;
      top: 7px;
      right: 7px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }
    .locate {
      flex: none;
      width: 60px;
      height: 60px;
      margin-top: -18px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--on-accent);
      display: grid;
      place-items: center;
      box-shadow: var(--shadow);
    }
    .locate:active {
      transform: scale(0.93);
    }
    .locate.busy svg {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .menu {
      position: absolute;
      bottom: 68px;
      width: min(240px, 58%);
    }
    .menu.open {
      left: 0;
      width: min(280px, 72%);
    }
    .menu.filter {
      right: 0;
    }
    .field {
      justify-content: space-between;
    }
    select,
    input[type='time'] {
      font: inherit;
      font-weight: 300;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: none;
      padding: 2px 0;
    }
    select option {
      background: var(--bg);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
    @media (min-width: 768px) and (max-width: 1199px) {
      :host {
        max-width: 560px;
        bottom: calc(32px + env(safe-area-inset-bottom));
        font-size: 16px;
      }
      .bar {
        height: 64px;
        padding: 0 16px;
        border-radius: 32px;
      }
      .seg {
        width: 52px;
        height: 52px;
      }
      .seg svg {
        width: 28px;
        height: 28px;
      }
      .dot-on {
        top: 9px;
        right: 9px;
      }
      .locate {
        width: 72px;
        height: 72px;
        margin-top: -22px;
      }
      .locate svg {
        width: 32px;
        height: 32px;
      }
      .menu {
        bottom: 80px;
        width: min(300px, 48%);
      }
      .menu.open {
        width: min(340px, 60%);
      }
      .toast {
        bottom: 92px;
      }
    }
    .toast {
      position: absolute;
      bottom: 80px;
      left: 0;
      right: 0;
      margin: 0;
      padding: 10px 14px;
      text-align: center;
      color: var(--alert);
    }
    .toast.note {
      color: var(--ink);
    }
  `,
})
export class BottomBar {
  protected readonly store = inject(BranchStore);
  protected readonly ui = inject(UiState);
  protected readonly labels = SERVICE_LABELS;
  protected readonly services = FILTER_SERVICES;
  protected readonly filterActive = computed(() =>
    this.store.services().some((s) => FILTER_SERVICES.includes(s)),
  );

  private readonly nowLocal = computed(() => toLocalMoment(this.store.now()));
  protected readonly visitDate = computed(() => this.store.visit()?.date ?? this.nowLocal().date);
  protected readonly visitTime = computed(
    () => this.store.visit()?.time ?? this.hhmm(this.nowLocal().minutes),
  );

  /** Today plus the next six days. */
  protected readonly days = computed(() => {
    const now = this.store.now().getTime();
    return Array.from({ length: 7 }, (_, i) => {
      const iso = sastDate(new Date(now + i * DAY_MS));
      const label =
        i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${weekdayName(iso)} ${formatShortDate(iso)}`;
      return { iso, label };
    });
  });

  /** Why "near me" didn't just work, in plain words. */
  protected readonly locateMessage = computed(() => {
    switch (this.store.locateStatus()) {
      case 'insecure':
        return 'Near me needs a secure (https) connection. Search by name instead.';
      case 'denied':
        return "Location access is blocked. Allow it in your browser's site settings, or search by name.";
      case 'timeout':
        return 'Finding your location took too long. Try again.';
      case 'unavailable':
        return "Couldn't get your location. Search by name instead.";
      case 'far':
        return `The nearest branch is ${formatDistance(this.store.farKm())} away.`;
      default:
        return null;
    }
  });

  protected readonly openLabel = computed(() => {
    if (!this.store.openOn()) return 'Open';
    const v = this.store.visit();
    return v ? `Open ${weekdayName(v.date).slice(0, 3)} ${v.time}` : 'Open now';
  });

  private hhmm(minutes: number): string {
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }

  private fallback() {
    return { date: this.nowLocal().date, time: this.hhmm(this.nowLocal().minutes) };
  }

  protected onToggle(on: boolean): void {
    if (on) this.store.openOn.set(true);
    else this.store.clearOpenFilter();
  }

  protected setDay(date: string): void {
    this.store.setVisit({ date }, this.fallback());
  }

  protected setTime(time: string): void {
    if (/^\d{2}:\d{2}$/.test(time)) this.store.setVisit({ time }, this.fallback());
  }

  protected locate(): void {
    this.ui.closeAll();
    this.ui.sheetOpen.set(false); // show where we found them
    this.store.locate();
  }
}
