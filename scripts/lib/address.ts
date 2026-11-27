import type { Address } from '../../src/app/core/models/branch.model.ts';

export const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

const REGION_CODES: Record<string, string> = {
  EC: 'Eastern Cape',
  FS: 'Free State',
  GP: 'Gauteng',
  GT: 'Gauteng',
  KZN: 'KwaZulu-Natal',
  NL: 'KwaZulu-Natal',
  LP: 'Limpopo',
  MP: 'Mpumalanga',
  NC: 'Northern Cape',
  NW: 'North West',
  WC: 'Western Cape',
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

const PROVINCE_BY_SQUASHED = new Map<string, string>(PROVINCES.map((p) => [squash(p), p]));

/** Province name from free text ("Western Cape", "KwaZulu Natal"), or undefined. */
export function provinceFromName(text: string | null | undefined): string | undefined {
  return text ? PROVINCE_BY_SQUASHED.get(squash(text)) : undefined;
}

/** Province name from an ISO 3166-2 style region ("ZA-WC", "WC"), or undefined. */
export function provinceFromRegion(region: string | null | undefined): string | undefined {
  if (!region) return undefined;
  const code = region
    .trim()
    .toUpperCase()
    .replace(/^ZA[-_ ]?/, '');
  return REGION_CODES[code] ?? provinceFromName(region);
}

const STREET_WORDS =
  /\b(road|rd|street|st|drive|dr|avenue|ave|lane|crescent|cres|boulevard|blvd|way|close|highway|hwy|route|n\d|r\d+|walk|terrace|place|pl)\b\.?/i;
const BUILDING_WORDS =
  /\b(shop|unit|floor|centre|center|mall|plaza|square|sq|building|arcade|crossing|junction|complex|spar|checkers|supermarket|store|office|offices|retail|market|corner)\b/i;
const SUBURB_EXCEPTIONS = /\b(city centre|city center|cbd|town centre|town center)\b/i;

/** Heuristic: does this comma-part look like a street/building line rather than a suburb name? */
export function looksLikeStreet(part: string): boolean {
  if (SUBURB_EXCEPTIONS.test(part)) return false;
  return /\d/.test(part) || STREET_WORDS.test(part) || BUILDING_WORDS.test(part);
}

export interface ParsedAddress {
  street: string;
  suburb?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

/**
 * Parses an AllThePlaces freeform address. Parsed from the END:
 *   ..., <suburb>, <city>, <province>, <postcode>, South Africa
 * The postcode may be missing; the suburb is missing in small towns (then suburb = city).
 * If neither a province nor a postcode is found the string is treated as street-only.
 */
export function parseFreeformAddress(freeform: string | null | undefined): ParsedAddress {
  const parts = (freeform ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length && /^south africa$/i.test(parts[parts.length - 1]!)) parts.pop();

  let postalCode: string | undefined;
  if (parts.length && /^\d{4}$/.test(parts[parts.length - 1]!)) postalCode = parts.pop();

  let province: string | undefined;
  if (parts.length) {
    const p = provinceFromName(parts[parts.length - 1]);
    if (p) {
      province = p;
      parts.pop();
    }
  }

  if (!province && !postalCode) {
    return { street: parts.join(', ') };
  }

  const city = parts.length ? parts.pop() : undefined;
  let suburb: string | undefined;
  if (parts.length && !looksLikeStreet(parts[parts.length - 1]!)) suburb = parts.pop();

  return {
    street: parts.join(', '),
    suburb: suburb ?? city,
    city,
    province,
    postalCode,
  };
}

/** Structured Microsoft / meta / Foursquare address: freeform is the street line. */
export function parseStructuredAddress(a: {
  freeform?: string | null;
  locality?: string | null;
  postcode?: string | null;
  region?: string | null;
}): ParsedAddress {
  return {
    street: (a.freeform ?? '').trim(),
    suburb: a.locality?.trim() || undefined,
    city: a.locality?.trim() || undefined,
    province: provinceFromRegion(a.region),
    postalCode: a.postcode?.trim() || undefined,
  };
}

export function toAddress(p: ParsedAddress): Address {
  return {
    street: p.street,
    suburb: p.suburb ?? p.city ?? '',
    city: p.city ?? p.suburb ?? '',
    province: p.province ?? '',
    postalCode: p.postalCode ?? '',
  };
}
