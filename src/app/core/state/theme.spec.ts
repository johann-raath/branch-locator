import { TestBed } from '@angular/core/testing';
import { assert, beforeEach, describe, it } from 'vitest';
import { isDaytime, resolveTheme, ThemeService } from './theme';

const at = (h: number, m = 0) => new Date(2026, 10, 25, h, m);

describe('resolveTheme', () => {
  it('light and dark ignore the system and the time', () => {
    assert.equal(resolveTheme('light', true, at(23)), 'light');
    assert.equal(resolveTheme('dark', false, at(12)), 'dark');
  });
  it('system follows the OS', () => {
    assert.equal(resolveTheme('system', true, at(12)), 'dark');
    assert.equal(resolveTheme('system', false, at(23)), 'light');
  });
  it('day/night is light from 6am to 6pm and dark otherwise', () => {
    assert.isFalse(isDaytime(at(5, 59)));
    assert.isTrue(isDaytime(at(6)));
    assert.isTrue(isDaytime(at(17, 59)));
    assert.isFalse(isDaytime(at(18)));
    assert.equal(resolveTheme('auto', true, at(9)), 'light');
    assert.equal(resolveTheme('auto', false, at(21)), 'dark');
  });
});

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('applies and remembers the chosen preference', () => {
    const theme = TestBed.inject(ThemeService);
    theme.set('dark');
    TestBed.tick();
    assert.equal(theme.theme(), 'dark');
    assert.equal(document.documentElement.dataset['theme'], 'dark');
    assert.equal(localStorage.getItem('theme'), 'dark');
    theme.set('light');
    assert.equal(theme.theme(), 'light');
  });

  it('defaults to system and starts from a stored preference', () => {
    assert.equal(TestBed.inject(ThemeService).preference(), 'system');
    TestBed.resetTestingModule();
    localStorage.setItem('theme', 'auto');
    assert.equal(TestBed.inject(ThemeService).preference(), 'auto');
  });
});
