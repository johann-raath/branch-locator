import { assert, describe, it } from 'vitest';
import { boundsOf, directionsUrl, formatDistance, haversineKm, isWithinBounds } from './geo';

describe('directionsUrl', () => {
  it('points Google Maps at the coordinates', () =>
    assert.equal(
      directionsUrl({ lat: -33.7, lng: 18.9 }),
      'https://www.google.com/maps/dir/?api=1&destination=-33.7,18.9',
    ));
});

const paarl = { lat: -33.7342, lng: 18.9621 };
const capeTownCbd = { lat: -33.9249, lng: 18.4241 };

describe('haversineKm', () => {
  it('same point is 0', () => assert.equal(haversineKm(paarl, paarl), 0));
  it('Paarl to Cape Town CBD is about 50-55 km', () => {
    const d = haversineKm(paarl, capeTownCbd);
    assert.isAbove(d, 50);
    assert.isBelow(d, 60);
  });
  it('is symmetric', () =>
    assert.closeTo(haversineKm(paarl, capeTownCbd), haversineKm(capeTownCbd, paarl), 1e-9));
  it('one degree of latitude is about 111 km', () => {
    assert.closeTo(haversineKm({ lat: -30, lng: 20 }, { lat: -31, lng: 20 }), 111.2, 0.2);
  });
});

describe('bounds', () => {
  it('empty is null', () => assert.isNull(boundsOf([])));
  it('contains its points', () => {
    const b = boundsOf([paarl, capeTownCbd])!;
    assert.deepEqual(b, { south: -33.9249, north: -33.7342, west: 18.4241, east: 18.9621 });
    assert.isTrue(isWithinBounds(paarl, b));
    assert.isFalse(isWithinBounds({ lat: -26, lng: 28 }, b));
  });
});

describe('formatDistance', () => {
  it('formats metres and km', () => {
    assert.equal(formatDistance(0.04), '< 100 m');
    assert.equal(formatDistance(0.45), '500 m');
    assert.equal(formatDistance(3.24), '3.2 km');
    assert.equal(formatDistance(57.6), '58 km');
  });
});
