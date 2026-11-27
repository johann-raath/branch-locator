import { assert, describe, it } from 'vitest';
import { Branch } from '../models/branch.model';
import { resolveNotices } from './resolve-notices';

const day = [{ open: '08:00', close: '17:00' }];
const branch = (): Branch => ({
  id: 'b1',
  name: 'Capitec Bank Test',
  type: 'branch',
  location: { lat: -33.7, lng: 18.9 },
  address: { street: '', suburb: 'Paarl', city: 'Paarl', province: 'Western Cape', postalCode: '' },
  services: [],
  hours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: [], sun: [] },
  specialHours: [],
  status: { kind: 'operational' },
  sources: [],
});

describe('resolveNotices', () => {
  it('temporarily-closed resolves "until" against today', () => {
    const [b] = resolveNotices(
      [branch()],
      [
        {
          kind: 'temporarily-closed',
          branchId: 'b1',
          fromOffsetDays: 0,
          toOffsetDays: 1,
          reason: 'Upgrade',
        },
      ],
      '2026-11-30',
    );
    assert.deepEqual(b!.status, {
      kind: 'temporarily-closed',
      reason: 'Upgrade',
      until: '2026-12-01',
    });
  });

  it('opening-soon resolves opensOn', () => {
    const [b] = resolveNotices(
      [branch()],
      [{ kind: 'opening-soon', branchId: 'b1', fromOffsetDays: 10, toOffsetDays: 10 }],
      '2026-11-23',
    );
    assert.deepEqual(b!.status, { kind: 'opening-soon', opensOn: '2026-12-03' });
  });

  it('close-early clips open days and skips closed days', () => {
    // 2026-11-27 is Friday, 28 Saturday (closed)
    const [b] = resolveNotices(
      [branch()],
      [
        {
          kind: 'close-early',
          branchId: 'b1',
          fromOffsetDays: 0,
          toOffsetDays: 1,
          label: 'Event',
          reason: 'community-event',
          closeAt: '14:00',
        },
      ],
      '2026-11-27',
    );
    assert.equal(b!.specialHours.length, 1);
    assert.deepEqual(b!.specialHours[0]!.periods, [{ open: '08:00', close: '14:00' }]);
  });

  it('does not mutate inputs and leaves other branches alone', () => {
    const input = branch();
    const out = resolveNotices(
      [input],
      [{ kind: 'opening-soon', branchId: 'other', fromOffsetDays: 1, toOffsetDays: 1 }],
      '2026-11-23',
    );
    assert.strictEqual(out[0], input);
  });
});
