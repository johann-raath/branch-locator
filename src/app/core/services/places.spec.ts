import { assert, describe, it } from 'vitest';
import { makeBranch } from '../testing/fixtures';
import { buildPlaces, searchPlaces } from './places';

const addr = (suburb: string, city: string, province = 'Western Cape') => ({
  street: 'x',
  suburb,
  city,
  province,
  postalCode: '0000',
});
const at = (lat: number, lng: number) => ({ lat, lng });

const branches = [
  makeBranch({ id: '1', address: addr('Cape Town', 'Cape Town'), location: at(-33.92, 18.42) }),
  makeBranch({ id: '2', address: addr('Claremont', 'Cape Town'), location: at(-33.98, 18.47) }),
  makeBranch({ id: '3', address: addr('Brackenfell', 'Cape Town'), location: at(-33.87, 18.69) }),
  makeBranch({ id: '4', address: addr('Paarl', 'Paarl'), location: at(-33.73, 18.96) }),
  makeBranch({ id: '5', address: addr('Paarl East', 'Paarl'), location: at(-33.72, 18.99) }),
  // a mis-tagged branch far from the rest of its "city"
  makeBranch({ id: '6', address: addr('Bellville', 'Cape Town'), location: at(-26.2, 28.0) }),
];

describe('buildPlaces', () => {
  const places = buildPlaces(branches);
  const find = (name: string) => places.find((p) => p.name === name)!;

  it('lists cities and distinct suburbs, counting branches', () => {
    assert.equal(find('Cape Town').kind, 'city');
    assert.equal(find('Cape Town').count, 4);
    assert.equal(find('Claremont').kind, 'suburb');
    assert.equal(find('Claremont').count, 1);
    assert.equal(find('Paarl').count, 2);
  });

  it('does not list a suburb that is just its city again', () => {
    assert.lengthOf(
      places.filter((p) => p.name === 'Cape Town'),
      1,
    );
  });

  it('locates a place at the median of its branches, ignoring outliers', () => {
    const ct = find('Cape Town').location;
    assert.closeTo(ct.lat, -33.9, 0.1);
    assert.closeTo(ct.lng, 18.5, 0.2);
  });

  it('keeps same-named places in different provinces apart', () => {
    const p = buildPlaces([
      makeBranch({ id: 'a', address: addr('Newton', 'Newton', 'Gauteng') }),
      makeBranch({ id: 'b', address: addr('Newton', 'Newton', 'Western Cape') }),
    ]);
    assert.lengthOf(p, 2);
  });
});

describe('searchPlaces', () => {
  const places = buildPlaces(branches);

  it('needs at least two characters', () => assert.deepEqual(searchPlaces(places, 'c'), []));

  it('matches names, accent- and case-insensitively', () => {
    assert.deepEqual(
      searchPlaces(places, 'CAPE tow').map((p) => p.name),
      ['Cape Town'],
    );
  });

  it('puts names that start with the query first, then bigger places', () => {
    const r = searchPlaces(places, 'paarl').map((p) => p.name);
    assert.deepEqual(r, ['Paarl', 'Paarl East']);
  });

  it('respects the limit', () => assert.lengthOf(searchPlaces(places, 'ar', 1), 1));
});
