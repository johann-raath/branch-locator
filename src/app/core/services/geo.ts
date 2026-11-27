/** Pure geo helpers. Shared with scripts/build-branches.ts. */

const EARTH_RADIUS_KM = 6371.0088;

export interface LatLng {
  lat: number;
  lng: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Smallest box containing all points, or null for none. */
export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  const b: Bounds = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
  for (const p of points) {
    b.south = Math.min(b.south, p.lat);
    b.north = Math.max(b.north, p.lat);
    b.west = Math.min(b.west, p.lng);
    b.east = Math.max(b.east, p.lng);
  }
  return b;
}

export function isWithinBounds(p: LatLng, b: Bounds): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

/** Google Maps directions link to a point. */
export function directionsUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

/** Human distance: "450 m", "3.2 km", "58 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 10) * 100} m`.replace(/^0 m$/, '< 100 m');
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
