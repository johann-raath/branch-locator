import { assert, describe, it } from 'vitest';
import { WeeklyHours } from '../models/branch.model';
import { groupHours } from './hours-groups';

const p = (open: string, close: string) => [{ open, close }];
const week = (o: Partial<WeeklyHours>): WeeklyHours => ({
  mon: p('09:00', '19:00'),
  tue: p('09:00', '19:00'),
  wed: p('09:00', '19:00'),
  thu: p('09:00', '19:00'),
  fri: p('09:00', '19:00'),
  sat: p('09:00', '17:00'),
  sun: [],
  ...o,
});

describe('groupHours', () => {
  it('merges consecutive days with the same hours', () => {
    const g = groupHours(week({}));
    assert.deepEqual(
      g.map((x) => x.label),
      ['Monday – Friday', 'Saturday', 'Sunday'],
    );
    assert.deepEqual(g[0]!.days, ['mon', 'tue', 'wed', 'thu', 'fri']);
    assert.deepEqual(g[2]!.periods, []);
  });

  it('keeps a different middle day separate', () => {
    const g = groupHours(week({ wed: p('09:00', '21:00') }));
    assert.deepEqual(
      g.map((x) => x.label),
      ['Monday – Tuesday', 'Wednesday', 'Thursday – Friday', 'Saturday', 'Sunday'],
    );
  });

  it('treats split days as different from single periods', () => {
    const g = groupHours(
      week({
        tue: [
          { open: '09:00', close: '13:00' },
          { open: '14:00', close: '19:00' },
        ],
      }),
    );
    assert.equal(g[0]!.label, 'Monday');
  });

  it('merges Saturday and Sunday when equal', () => {
    const g = groupHours(week({ sun: p('09:00', '17:00') }));
    assert.equal(g[g.length - 1]!.label, 'Saturday – Sunday');
  });
});
