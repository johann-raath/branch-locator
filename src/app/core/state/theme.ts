import { computed, effect, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system' | 'auto';

export const THEME_OPTIONS: { value: ThemePreference; label: string; hint?: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System default' },
  { value: 'auto', label: 'Day/night based', hint: 'Light 6am to 6pm' },
];

const KEY = 'theme';
const DAY_START = 6;
const DAY_END = 18;

function stored(): ThemePreference | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' || v === 'auto' ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Light from 6am to 6pm (device local time), dark otherwise. */
export const isDaytime = (now: Date): boolean =>
  now.getHours() >= DAY_START && now.getHours() < DAY_END;

export function resolveTheme(pref: ThemePreference, systemDark: boolean, now: Date): Theme {
  switch (pref) {
    case 'light':
    case 'dark':
      return pref;
    case 'system':
      return systemDark ? 'dark' : 'light';
    case 'auto':
      return isDaytime(now) ? 'light' : 'dark';
  }
}

/** The user's choice (light, dark, follow the OS, or by time of day) and the theme it resolves to. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(stored() ?? 'system');
  private readonly systemDark = signal(systemPrefersDark());
  private readonly clock = signal(new Date());

  readonly theme = computed(() => resolveTheme(this.preference(), this.systemDark(), this.clock()));

  constructor() {
    effect(() => {
      document.documentElement.dataset['theme'] = this.theme();
    });
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) =>
        this.systemDark.set(e.matches),
      );
    }
    setInterval(() => this.clock.set(new Date()), 60_000); // pick up 6am / 6pm
  }

  set(pref: ThemePreference): void {
    this.preference.set(pref);
    this.clock.set(new Date());
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
  }
}
