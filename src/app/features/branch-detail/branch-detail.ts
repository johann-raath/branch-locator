import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { BranchStore } from '../../core/state/branch-store';
import { ShareService } from '../../core/state/share';
import { UiState } from '../../core/state/ui-state';
import { DayKey } from '../../core/models/branch.model';
import { SAMPLE_DATA_NOTE, SERVICE_LABELS } from '../../core/models/service-labels';
import { directionsUrl, formatDistance } from '../../core/services/geo';
import { groupHours } from '../../core/services/hours-groups';
import {
  dayKeyOf,
  formatShortDate,
  toLocalMoment,
} from '../../core/services/opening-hours.service';

const DAYS: [DayKey, string][] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];
const DISMISS_PX = 80;

/**
 * Full branch details. On mobile a drawer taking ~88% of the width that can be swiped away;
 * on desktop a floating rounded card over the map.
 */
@Component({
  selector: 'app-branch-detail',
  host: {
    '[style.transform]': 'dragX() ? "translateX(" + dragX() + "px)" : null',
    '(pointerdown)': 'dragStart($event)',
    '(pointermove)': 'dragMove($event)',
    '(pointerup)': 'dragEnd()',
    '(pointercancel)': 'dragCancel()',
  },
  template: `
    @if (b(); as branch) {
      <section class="detail" aria-label="Branch details">
        <header>
          @if (ui.listOpen()) {
            <button
              type="button"
              class="nav back"
              aria-label="Back to results"
              title="Back to results"
              (click)="store.closeDetail()"
            >
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12H4M10 6l-6 6 6 6" />
              </svg>
            </button>
            <span class="divider" aria-hidden="true"></span>
          }
          <h2 #title tabindex="-1">{{ branch.name }}</h2>
          @if (!ui.listOpen()) {
            <span class="divider" aria-hidden="true"></span>
            <button
              type="button"
              class="nav close"
              aria-label="Close"
              title="Close"
              (click)="store.closeDetail()"
            >
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          }
        </header>

        <p class="status" [class]="'tone-' + label().tone" role="status">{{ label().text }}</p>

        @if (state().status === 'relocated' && moved(); as target) {
          <p>
            <button type="button" class="link" (click)="store.showDetail(target.id)">
              Go to {{ target.name }}
            </button>
          </p>
        }
        @if (!state().isOpen && state().status !== 'relocated' && alternative(); as alt) {
          <p>
            Nearest open branch:
            <button type="button" class="link" (click)="store.showDetail(alt.branch.id)">
              {{ alt.branch.name }}
            </button>
            ({{ distance(alt.distanceKm) }})
          </p>
        }

        <div class="block">
          <p class="address">
            {{ branch.address.street }}<br />
            @if (branch.address.suburb !== branch.address.city) {
              {{ branch.address.suburb }},
            }
            {{ branch.address.city }}<br />{{ branch.address.province }}
            {{ branch.address.postalCode }}
          </p>
          <p class="links">
            <a target="_blank" rel="noopener" [href]="directionsUrl()">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              Get directions
            </a>
            <button
              type="button"
              class="link"
              (click)="sharing.shareBranch(branch.id, $any($event.currentTarget))"
            >
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1" />
              </svg>
              Share
            </button>
            @if (branch.phone) {
              <a [href]="'tel:' + branch.phone.replaceAll(' ', '')">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
                  />
                </svg>
                {{ branch.phone }}
              </a>
            }
          </p>
        </div>

        <div class="block">
          <h3>Services</h3>
          <p>{{ serviceText() }}</p>
        </div>

        <div class="block">
          <h3>Opening hours</h3>
          <table>
            @for (g of hourGroups(); track g.label) {
              <tr [class.today]="g.days.includes(today())">
                <th scope="row">{{ g.label }}</th>
                <td>
                  @for (p of g.periods; track p.open) {
                    {{ p.open }}&ndash;{{ p.close }}{{ $last ? '' : ', ' }}
                  } @empty {
                    Closed
                  }
                </td>
              </tr>
            }
          </table>
        </div>

        @if (upcoming().length) {
          <div class="block">
            <h3>Coming up</h3>
            <table>
              @for (s of upcoming(); track s.from) {
                <tr>
                  <th scope="row">
                    {{ date(s.from) }}{{ s.to !== s.from ? '&ndash;' + date(s.to) : '' }}
                  </th>
                  <td>
                    {{ s.label }}
                    @if (s.periods.length) {
                      <span class="sub"
                        >{{ s.periods[0].open }}&ndash;{{
                          s.periods[s.periods.length - 1].close
                        }}</span
                      >
                    } @else {
                      <span class="sub">closed</span>
                    }
                  </td>
                </tr>
              }
            </table>
          </div>
        }

        <p class="block sample">{{ sampleNote }}</p>
      </section>
    }
  `,
  styles: `
    :host {
      position: absolute;
      z-index: 1400;
      top: 0;
      bottom: 0;
      left: 0;
      width: min(88vw, 480px);
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 0 var(--radius) var(--radius) 0;
      box-shadow: var(--shadow);
      animation: slide-in 0.22s ease-out;
    }
    @keyframes slide-in {
      from {
        transform: translateX(-100%);
      }
    }
    @media (min-width: 768px) {
      :host {
        z-index: 1200;
        top: 72px;
        bottom: 100px;
        left: 12px;
        width: 420px;
        border-radius: var(--radius);
        animation: none;
      }
    }
    @media (min-width: 768px) and (max-width: 1199px) {
      :host {
        top: 88px;
        left: 16px;
        bottom: 120px;
        width: 480px;
      }
      .detail {
        padding: 24px 28px 32px;
        font-size: 15px;
      }
      h2 {
        font-size: 1.3rem;
      }
      h3 {
        font-size: 0.75rem;
      }
    }
    /* landscape tablet: same width as the results list it swaps with */
    @media (min-width: 900px) and (max-width: 1199px) and (min-height: 600px) and (orientation: landscape) {
      :host {
        width: 360px;
      }
    }
    .detail {
      height: 100%;
      overflow: auto;
      box-sizing: border-box;
      padding: 20px 22px 28px;
      overscroll-behavior: contain;
      /* must be on the scrolling element, or the browser takes the sideways swipe for itself */
      touch-action: pan-y;
      font-weight: 300;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 10px;
    }
    .icon {
      width: 17px;
      height: 17px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .nav {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      margin-top: -4px;
      color: var(--accent);
      border-radius: 50%;
    }
    .nav:hover {
      background: var(--hover);
    }
    .back {
      margin-left: -7px;
    }
    .close {
      margin-right: -7px;
    }
    /* keeps the button from reading as part of the branch name */
    .divider {
      flex: none;
      width: 1px;
      height: 24px;
      background: var(--line);
    }
    .nav .icon {
      width: 22px;
      height: 22px;
    }
    h2 {
      flex: 1;
      margin: 0 0 4px;
      font-size: 1.15rem;
      line-height: 1.3;
      outline: 0;
    }
    h3 {
      margin: 0 0 6px;
      font-size: 0.72rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 500;
    }
    p {
      margin: 0 0 10px;
    }
    .block {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .block p:last-child {
      margin-bottom: 0;
    }
    .link {
      color: var(--accent);
      font-weight: 400;
    }
    .link:hover,
    .links a:hover {
      text-decoration: underline;
    }
    .status {
      font-weight: 500;
    }
    .links {
      display: flex;
      gap: 10px 20px;
      flex-wrap: wrap;
    }
    .links a,
    .links button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .links a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 400;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    tr + tr {
      border-top: 1px solid var(--line);
    }
    th {
      text-align: left;
      padding: 6px 16px 6px 0;
      font-weight: 300;
      white-space: nowrap;
      vertical-align: top;
    }
    td {
      padding: 6px 0;
      text-align: right;
    }
    td:first-of-type:not(:last-child) {
      text-align: left;
    }
    .today th,
    .today td {
      font-weight: 600;
    }
    .sample {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 0;
    }
    .sub {
      color: var(--muted);
      margin-left: 4px;
    }
  `,
})
export class BranchDetail {
  protected readonly store = inject(BranchStore);
  protected readonly ui = inject(UiState);
  protected readonly sharing = inject(ShareService);
  protected readonly days = DAYS;
  protected readonly sampleNote = SAMPLE_DATA_NOTE;
  protected readonly distance = formatDistance;
  protected readonly date = formatShortDate;

  protected readonly b = this.store.detail;
  private readonly described = computed(() => this.store.describe(this.b()!));
  protected readonly state = computed(() => this.described().state);
  protected readonly label = computed(() => this.described().label);
  protected readonly hourGroups = computed(() => groupHours(this.b()!.hours));
  protected readonly today = computed(() => dayKeyOf(this.state().today));
  protected readonly moved = computed(() => {
    const s = this.b()?.status;
    return s?.kind === 'relocated' ? this.store.byId(s.movedToId) : undefined;
  });
  protected readonly alternative = computed(() =>
    this.b() ? this.store.alternativeTo(this.b()!) : undefined,
  );
  protected readonly serviceText = computed(() =>
    this.b()!
      .services.map((s) => SERVICE_LABELS[s])
      .join(', '),
  );
  protected readonly upcoming = computed(() => {
    const today = toLocalMoment(this.store.now()).date; // not the planned visit date
    return (this.b()?.specialHours ?? []).filter((s) => s.to >= today).slice(0, 6);
  });
  protected readonly directionsUrl = computed(() => directionsUrl(this.b()!.location));

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  constructor() {
    // move focus into the panel when it opens
    afterNextRender(() => this.title()?.nativeElement.focus());
  }

  // swipe left to dismiss (touch and pen only)
  protected readonly dragX = signal(0);
  private start: { x: number; y: number } | null = null;

  protected dragStart(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    this.start = { x: e.clientX, y: e.clientY };
  }

  protected dragMove(e: PointerEvent): void {
    if (!this.start) return;
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    if (this.dragX() === 0 && Math.abs(dy) > Math.abs(dx)) {
      this.start = null; // vertical scroll, not a swipe
      return;
    }
    this.dragX.set(Math.min(0, dx));
  }

  protected dragEnd(): void {
    const dismiss = this.dragX() < -DISMISS_PX;
    this.dragCancel();
    if (dismiss) this.store.closeDetail();
  }

  protected dragCancel(): void {
    this.start = null;
    this.dragX.set(0);
  }
}
