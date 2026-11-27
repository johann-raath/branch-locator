import { assert, describe, it } from 'vitest';
import type { Branch } from '../../src/app/core/models/branch.model.ts';
import { weeklyHours } from './hours.ts';
import { validateBranches } from './validate.ts';

const good = (over: Partial<Branch> = {}): Branch => ({
  id: 'a',
  name: 'Capitec Bank Paarl Mall',
  type: 'branch',
  location: { lat: -33.73, lng: 18.96 },
  address: {
    street: 'x',
    suburb: 'Paarl',
    city: 'Paarl',
    province: 'Western Cape',
    postalCode: '7646',
  },
  services: ['atm'],
  hours: weeklyHours('mall'),
  specialHours: [],
  status: { kind: 'operational' },
  sources: [],
  ...over,
});

describe('validateBranches', () => {
  it('accepts a good record', () => {
    assert.deepEqual(validateBranches([good()]), []);
  });
  it('rejects coordinates outside South Africa', () => {
    assert.equal(validateBranches([good({ location: { lat: 33.7, lng: 18.9 } })]).length, 1);
    assert.equal(validateBranches([good({ location: { lat: -33.7, lng: 5 } })]).length, 1);
  });
  it('rejects bad hours', () => {
    const h = weeklyHours('mall');
    h.mon = [{ open: '9:00', close: '17:00' }];
    h.tue = [{ open: '17:00', close: '09:00' }];
    h.wed = [
      { open: '08:00', close: '13:00' },
      { open: '12:00', close: '17:00' },
    ];
    assert.equal(validateBranches([good({ hours: h })]).length, 3);
  });
  it('rejects special hours with from after to', () => {
    const sh = [
      { from: '2026-12-17', to: '2026-12-16', label: 'x', reason: 'other' as const, periods: [] },
    ];
    assert.equal(validateBranches([good({ specialHours: sh })]).length, 1);
  });
  it('rejects dangling relocation, duplicate ids and empty required fields', () => {
    const errors = validateBranches([
      good({ status: { kind: 'relocated', movedToId: 'nope', since: '2026-10-01' } }),
      good({
        name: '',
        address: { street: '', suburb: '', city: '', province: '', postalCode: '' },
      }),
    ]);
    assert.ok(errors.some((e) => e.includes('unknown id')));
    assert.ok(errors.some((e) => e.includes('duplicate id')));
    assert.ok(errors.some((e) => e.includes('empty name')));
    assert.ok(errors.some((e) => e.includes('empty city')));
    assert.ok(errors.some((e) => e.includes('empty province')));
  });
});
