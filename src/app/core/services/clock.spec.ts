import { assert, describe, it } from 'vitest';
import { createClock, FixedClock, parseNowOverride, sastDate } from './clock';

describe('parseNowOverride', () => {
  it('reads SAST wall-clock time (UTC+2)', () => {
    assert.equal(parseNowOverride('2026-12-16T10:30')!.toISOString(), '2026-12-16T08:30:00.000Z');
    assert.equal(
      parseNowOverride('2026-12-16T10:30:15')!.toISOString(),
      '2026-12-16T08:30:15.000Z',
    );
  });
  it('rejects invalid values', () => {
    for (const v of [
      '',
      'tomorrow',
      '2026-12-16',
      '2026-13-01T10:00',
      '2026-02-31T10:00',
      '2026-12-16T25:00',
      null,
      undefined,
    ]) {
      assert.isNull(parseNowOverride(v as string), String(v));
    }
  });
});

describe('createClock', () => {
  it('honours ?now= when allowed', () => {
    const c = createClock('?x=1&now=2026-12-16T10:30', true);
    assert.equal(c.today(), '2026-12-16');
    assert.instanceOf(c, FixedClock);
  });
  it('ignores ?now= when the override is off', () => {
    const c = createClock('?now=2026-12-16T10:30', false);
    assert.notInstanceOf(c, FixedClock);
  });
  it('falls back to the system clock for an invalid value', () => {
    assert.notInstanceOf(createClock('?now=nonsense', true), FixedClock);
  });
});

describe('sastDate', () => {
  it('rolls the date at SAST midnight, not UTC midnight', () => {
    assert.equal(sastDate(new Date('2026-12-15T22:30:00Z')), '2026-12-16');
    assert.equal(sastDate(new Date('2026-12-15T21:59:00Z')), '2026-12-15');
  });
});
