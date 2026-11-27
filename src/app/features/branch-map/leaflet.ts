import * as Leaflet from 'leaflet';
import 'leaflet.markercluster';

/**
 * Leaflet at runtime, with the marker-cluster plugin attached.
 *
 * leaflet.markercluster adds `markerClusterGroup` to Leaflet's real module object. In the optimised
 * production bundle, `import * as L` is a snapshot of that object taken *before* the plugin ran, so it
 * lacks the plugin (it works in `ng serve`, which is why this is easy to miss). Leaflet also exposes
 * its real module as `window.L`, which does have the plugin.
 */
export const leaflet: typeof Leaflet =
  (globalThis as unknown as { L?: typeof Leaflet }).L ?? Leaflet;
