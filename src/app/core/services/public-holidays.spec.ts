import { assert, describe, it } from 'vitest';
import { easterSunday, holidayOn, publicHolidays, publicHolidaysBetween } from './public-holidays';

const dateOf = (year: number, name: string) =>
  publicHolidays(year).find((h) => h.name === name)?.date;

describe('public holidays', () => {
  it('computes Easter 2027 (28 Mar) and 2026 (5 Apr)', () => {
    assert.deepEqual(easterSunday(2027), [3, 28]);
    assert.deepEqual(easterSunday(2026), [4, 5]);
  });

  it('Easter 2027: Good Friday 26 Mar, Family Day 29 Mar', () => {
    assert.equal(dateOf(2027, 'Good Friday'), '2027-03-26');
    assert.equal(dateOf(2027, 'Family Day'), '2027-03-29');
  });

  it('fixed dates', () => {
    assert.equal(dateOf(2026, 'Day of Reconciliation'), '2026-12-16');
    assert.equal(dateOf(2026, 'Christmas Day'), '2026-12-25');
    assert.equal(dateOf(2027, 'Youth Day'), '2027-06-16');
  });

  it('Sunday rule: Human Rights Day 21 Mar 2027 (Sunday) moves to Monday 22 Mar', () => {
    assert.equal(dateOf(2027, 'Human Rights Day'), '2027-03-22');
  });

  it('Sunday rule: Day of Goodwill 26 Dec 2027 (Sunday) moves to Monday 27 Dec', () => {
    assert.equal(dateOf(2027, 'Day of Goodwill'), '2027-12-27');
  });

  it('does not move holidays that fall on Saturday', () => {
    // 25 Dec 2027 is a Saturday
    assert.equal(dateOf(2027, 'Christmas Day'), '2027-12-25');
  });

  it('range query covers Dec 2026 to Dec 2027', () => {
    const list = publicHolidaysBetween('2026-12-01', '2027-12-31');
    assert.equal(list.length, 15); // 3 in Dec 2026 (16, 25, 26) + 12 in 2027
    assert.equal(list[0]?.date, '2026-12-16');
    assert.equal(list.at(-1)?.date, '2027-12-27');
    assert.ok(list.every((h, i) => i === 0 || list[i - 1]!.date <= h.date));
  });

  it('holidayOn', () => {
    assert.equal(holidayOn('2026-12-16')?.name, 'Day of Reconciliation');
    assert.equal(holidayOn('2026-12-17'), undefined);
  });
});
