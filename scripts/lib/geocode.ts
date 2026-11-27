import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { provinceFromName } from './address.ts';

export interface GeocodeResult {
  suburb?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

type Cache = Record<string, GeocodeResult | null>;

const USER_AGENT =
  'branch-locator-data-build/1.0 (assessment project; one-off dataset build, cached)';
const key = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export function loadCache(path: string): Cache {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Cache) : {};
}

export function saveCache(path: string, cache: Cache) {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Nominatim reverse geocode. Max 1 request/second, descriptive User-Agent, results (including misses) cached.
 * Returns undefined when offline or the lookup failed (not cached, so a rerun retries).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  cache: Cache,
  opts: { offline: boolean },
): Promise<GeocodeResult | undefined> {
  const k = key(lat, lng);
  if (k in cache) return cache[k] ?? undefined;
  if (opts.offline) return undefined;

  await sleep(1100);
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=en&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { address?: Record<string, string> };
    const a = json.address ?? {};
    const city = a['city'] ?? a['town'] ?? a['village'] ?? a['municipality'] ?? a['county'];
    const result: GeocodeResult = {
      suburb: a['suburb'] ?? a['neighbourhood'] ?? a['city_district'] ?? a['town'] ?? a['village'],
      city,
      province: provinceFromName(a['state']),
      postalCode: a['postcode'],
    };
    cache[k] = result;
    return result;
  } catch (err) {
    console.warn(`  geocode failed for ${k}: ${(err as Error).message}`);
    return undefined;
  }
}
