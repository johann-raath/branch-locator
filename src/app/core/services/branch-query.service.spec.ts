import { assert, describe, it } from 'vitest';
import { at, makeBranch, p, week } from '../testing/fixtures';
import {
  filterBranches,
  nearestOpen,
  normaliseText,
  queryBranches,
  searchBranches,
  sortByDistance,
} from './branch-query.service';

const paarlMall = makeBranch({
  id: 'a',
  name: 'Capitec Bank Paarl Mall',
  services: ['atm', 'cash-deposit', 'wheelchair'],
});
const gordons = makeBranch({
  id: 'b',
  name: "Capitec Bank Gordon's Bay Sir Lowry",
  location: { lat: -34.16, lng: 18.87 },
  address: {
    street: "Sir Lowry's Pass Road",
    suburb: 'Admirals Park',
    city: 'Cape Town',
    province: 'Western Cape',
    postalCode: '7140',
  },
  services: ['atm', 'forex'],
});
const bellville = makeBranch({
  id: 'c',
  name: 'Capitec Bank Bellville',
  location: { lat: -33.9, lng: 18.63 },
  address: {
    street: 'x',
    suburb: 'Bellville',
    city: 'Bellville',
    province: 'Western Cape',
    postalCode: '7530',
  },
  services: ['atm', 'wheelchair'],
});
const biz = makeBranch({
  id: 'd',
  name: 'Capitec Business Centre Paarl',
  type: 'business-centre',
  services: ['business'],
});
const all = [paarlMall, gordons, bellville, biz];

describe('normaliseText', () => {
  it('folds case, accents, apostrophes and spaces', () => {
    assert.equal(normaliseText('  Gordon’s   BAY '), 'gordons bay');
    assert.equal(normaliseText('Citrusdal Café'), 'citrusdal cafe');
  });
});

describe('searchBranches', () => {
  it('empty query returns everything', () => assert.lengthOf(searchBranches(all, '   '), 4));
  it('is case-insensitive and trims', () => {
    assert.deepEqual(
      searchBranches(all, '  PAARL ').map((b) => b.id),
      ['a', 'd'],
    );
  });
  it('matches name, suburb and city', () => {
    assert.deepEqual(
      searchBranches(all, 'admirals').map((b) => b.id),
      ['b'],
    );
    assert.deepEqual(
      searchBranches(all, 'cape town').map((b) => b.id),
      ['b'],
    );
    assert.deepEqual(
      searchBranches(all, 'bellville').map((b) => b.id),
      ['c'],
    );
  });
  it('handles apostrophes either way', () => {
    assert.deepEqual(
      searchBranches(all, "gordon's").map((b) => b.id),
      ['b'],
    );
    assert.deepEqual(
      searchBranches(all, 'gordons').map((b) => b.id),
      ['b'],
    );
    assert.deepEqual(
      searchBranches(all, "gordon's bay").map((b) => b.id),
      ['b'],
    );
  });
  it('multiple terms are ANDed in any order', () => {
    assert.deepEqual(
      searchBranches(all, 'mall paarl').map((b) => b.id),
      ['a'],
    );
  });
  it('is accent-insensitive', () => {
    const b = makeBranch({
      id: 'e',
      name: 'Capitec Bank Citrusdal',
      address: { street: '', suburb: 'Citrusdal', city: 'Cité', province: 'WC', postalCode: '' },
    });
    assert.lengthOf(searchBranches([b], 'cite'), 1);
  });
  it('no match', () => assert.lengthOf(searchBranches(all, 'zzz'), 0));
});

describe('filterBranches', () => {
  it('services are AND-combined', () => {
    assert.deepEqual(
      filterBranches(all, { services: ['atm', 'wheelchair'] }).map((b) => b.id),
      ['a', 'c'],
    );
    assert.deepEqual(filterBranches(all, { services: ['atm', 'wheelchair', 'forex'] }), []);
  });
  it('business centres are hidden by default', () => {
    assert.deepEqual(
      filterBranches(all, {}).map((b) => b.id),
      ['a', 'b', 'c'],
    );
  });
  it('ticking business shows business centres only', () => {
    assert.deepEqual(
      filterBranches(all, { services: ['business'] }).map((b) => b.id),
      ['d'],
    );
  });
  it('type', () =>
    assert.deepEqual(
      filterBranches(all, { type: 'business-centre' }).map((b) => b.id),
      ['d'],
    ));
  it('open now excludes closed, temporarily closed, relocated and opening soon branches', () => {
    const closedToday = makeBranch({ id: 'x1', hours: week([]) });
    const temp = makeBranch({
      id: 'x2',
      status: { kind: 'temporarily-closed', reason: 'r', until: '2026-11-25' },
    });
    const moved = makeBranch({
      id: 'x3',
      status: { kind: 'relocated', movedToId: 'a', since: '2026-10-01' },
    });
    const soon = makeBranch({ id: 'x4', status: { kind: 'opening-soon', opensOn: '2026-12-03' } });
    const open = makeBranch({ id: 'x5' });
    const res = filterBranches([closedToday, temp, moved, soon, open], {
      openAt: at('2026-11-25T10:00'),
    });
    assert.deepEqual(
      res.map((b) => b.id),
      ['x5'],
    );
  });
  it('combines open now with services', () => {
    const open = makeBranch({ id: 'o', services: ['atm'] });
    assert.lengthOf(
      filterBranches([open], { openAt: at('2026-11-25T10:00'), services: ['forex'] }),
      0,
    );
  });
});

describe('sortByDistance', () => {
  const origin = { lat: -33.7342, lng: 18.9621 };
  it('nearest first', () => {
    const r = sortByDistance([gordons, bellville, paarlMall], origin);
    assert.deepEqual(
      r.map((x) => x.branch.id),
      ['a', 'c', 'b'],
    );
    assert.equal(r[0]!.distanceKm, 0);
  });
  it('ties keep input order', () => {
    const t1 = makeBranch({ id: 't1' });
    const t2 = makeBranch({ id: 't2' });
    const t3 = makeBranch({ id: 't3' });
    assert.deepEqual(
      sortByDistance([t2, t3, t1], origin).map((x) => x.branch.id),
      ['t2', 't3', 't1'],
    );
  });
});

describe('queryBranches', () => {
  it('without an origin sorts by name', () => {
    assert.deepEqual(
      queryBranches(all, {}).items.map((x) => x.branch.id),
      ['c', 'b', 'a'].sort((x, y) => {
        const n = (id: string) => all.find((b) => b.id === id)!.name;
        return n(x).localeCompare(n(y));
      }),
    );
  });
  it('text + origin + radius + limit', () => {
    const origin = { lat: -33.7342, lng: 18.9621 };
    const r = queryBranches(all, { origin, radiusKm: 45, limit: 1 });
    assert.equal(r.total, 2); // a (0 km) and bellville (~36 km); gordons is ~49 km; business centre d is opt-in
    assert.lengthOf(r.items, 1);
  });
});

describe('nearestOpen', () => {
  it('skips the excluded and closed branches', () => {
    const shut = makeBranch({ id: 'near', hours: week([]) });
    const open = makeBranch({ id: 'far', location: { lat: -33.9, lng: 18.63 } });
    const self = makeBranch({ id: 'self' });
    const r = nearestOpen([shut, open, self], self.location, at('2026-11-25T10:00'), 'self');
    assert.equal(r?.branch.id, 'far');
  });
  it('undefined when nothing is open', () => {
    assert.isUndefined(
      nearestOpen(
        [makeBranch({ hours: week([p('01:00', '02:00')]) })],
        { lat: -33, lng: 18 },
        at('2026-11-25T10:00'),
      ),
    );
  });
});
