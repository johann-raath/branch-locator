import { Injectable } from '@angular/core';

export const TIME_ZONE = 'Africa/Johannesburg';

/**
 * Parses a ?now= value ("2026-12-16T10:30" or with seconds) as Johannesburg wall-clock time (UTC+2, no DST).
 * Returns null if invalid.
 */
export function parseNowOverride(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const s = m[6] === undefined ? 0 : Number(m[6]);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - 2 * 3600_000);
  // reject overflow such as 2026-02-31 or 25:00
  const back = new Date(date.getTime() + 2 * 3600_000);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h)
    return null;
  return date;
}

/** Today's ISO date in Africa/Johannesburg for an instant. */
export function sastDate(instant: Date): string {
  return new Date(instant.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

/** The only place "now" comes from. */
export abstract class Clock {
  abstract now(): Date;
  today(): string {
    return sastDate(this.now());
  }
}

@Injectable()
export class SystemClock extends Clock {
  override now(): Date {
    return new Date();
  }
}

/** Fixed instant, with an optional offset that keeps ticking from the moment of creation. */
export class FixedClock extends Clock {
  private readonly startedAt = Date.now();
  constructor(
    private readonly base: Date,
    private readonly ticking = true,
  ) {
    super();
  }
  override now(): Date {
    return this.ticking ? new Date(this.base.getTime() + (Date.now() - this.startedAt)) : this.base;
  }
}

/** Builds the app clock: honours ?now= only when allowed. */
export function createClock(search: string, allowOverride: boolean): Clock {
  if (allowOverride) {
    const parsed = parseNowOverride(new URLSearchParams(search).get('now'));
    if (parsed) return new FixedClock(parsed);
  }
  return new SystemClock();
}
