import { assert, describe, it } from 'vitest';
import { leaflet } from './leaflet';

describe('leaflet runtime', () => {
  it('has the marker-cluster plugin attached', () => {
    assert.isFunction(leaflet.markerClusterGroup);
  });

  it('is the object Leaflet exposes as window.L, which the plugin extends', () => {
    assert.strictEqual(leaflet, (globalThis as unknown as { L: unknown }).L);
  });
});
