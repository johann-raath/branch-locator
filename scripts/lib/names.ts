import type { BranchType } from '../../src/app/core/models/branch.model.ts';

export type RecordKind = BranchType | 'atm';

const NON_BANK =
  /\b(waste|management|insurance|motors|properties|trading|projects|construction|head office|business support)\b/i;

const PARTICLES = new Set([
  'of',
  'on',
  'en',
  'in',
  'the',
  'de',
  'du',
  'van',
  'der',
  'la',
  'le',
  'and',
]);

/** "Cape town" -> "Cape Town". Leaves particles ("of", "van") alone. */
export function tidyPlace(s: string | undefined): string | undefined {
  return s
    ?.trim()
    .split(' ')
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Is this a Capitec bank place at all? Plan §4.2 step 1, widened for real branches that are named
 * "Capitec Vredendal", "Capitec Bank-Fourways Mall - Fourways" or "De Aar Capitec Bank".
 * Typos such as "Capitac Bank" / "Capitech Bank" are deliberately dropped (and logged).
 */
export function isCapitecBankName(name: string): boolean {
  const n = name.trim();
  if (NON_BANK.test(n)) return false;
  if (/\bcapitec (bank|business)\b/i.test(n)) return true;
  if (/^capitec\b/i.test(n)) return true; // "Capitec", "Capitec Sasolburg"
  if (/\bcapitec( bank)?\.?$/i.test(n)) return true; // "De Aar Capitec Bank", "East Lynne Capitec"
  return false;
}

/** Names that carry no place information. */
export function isGenericName(name: string): boolean {
  return /^capitec( bank| business centre)?( ltd| limited)?\.?$/i.test(name.trim());
}

const STOP_TOKENS = new Set([
  'capitec',
  'bank',
  'business',
  'centre',
  'center',
  'mall',
  'shopping',
  'square',
  'plaza',
  'the',
  'city',
  'shop',
  'ltd',
  'limited',
]);

/** Distinctive lowercase words of a name ("Capitec Bank Kimberley North Cape Mall" -> kimberley, north, cape). */
export function placeTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 4 && !STOP_TOKENS.has(t)),
  );
}

/** Two names refer to the same place if they share a distinctive word. */
export function sharePlaceToken(a: string, b: string): boolean {
  const ta = placeTokens(a);
  for (const t of placeTokens(b)) if (ta.has(t)) return true;
  return false;
}

/** Place text of a branch-locator slug, e.g. "HoutBayCentre" -> "Hout Bay Centre". */
export function slugToPlace(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  let slug: string;
  try {
    slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return undefined;
  }
  if (!slug) return undefined;

  let rest: string | undefined;
  if (slug.includes('-') && slug === slug.toLowerCase()) {
    // kebab: banking-finance-southside-centre-capitec-bank-dnr-strand-southside
    const m = /capitec-(?:bank|business-centre)(?:-(?:dnr|atm))?-(.+)$/.exec(slug);
    rest = m?.[1]?.split('-').filter(Boolean).join(' ');
  } else {
    // CamelCase: BankingFinance-CapeTown-CapitecBankDNRHoutBayCentre
    const last = slug.split('-').pop() ?? '';
    const m = /^Capitec(?:Bank|BusinessCentre)(?:DNR|ATM)?(.+)$/.exec(last);
    rest = m?.[1]?.replace(/([a-z\d])(?=[A-Z])|([A-Z])(?=[A-Z][a-z])/g, '$1$2 ');
  }
  if (!rest) return undefined;
  return titleCase(rest);
}

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/** "Capitec Bank-Fourways Mall - Fourways" -> "Capitec Bank Fourways Mall - Fourways"; "CAPITEC" -> "Capitec Bank". */
export function normaliseName(raw: string): string {
  let n = raw.trim().replace(/\.+$/, '').replace(/\s+/g, ' ');
  n = n.replace(/\bcapitec bank\b/gi, 'Capitec Bank').replace(/\bcapitec\b/gi, 'Capitec');
  n = n.replace(/\bcapitec business centre\b/gi, 'Capitec Business Centre');
  n = n.replace(/^Capitec Bank-\s*/, 'Capitec Bank ');
  const suffix = /^(.+?) Capitec( Bank)?$/.exec(n); // "De Aar Capitec Bank"
  if (suffix && !/^Capitec/.test(suffix[1]!)) n = `Capitec Bank ${suffix[1]}`;
  n = n.replace(/^Capitec (?!Bank\b|Business\b)(\S.*)$/, 'Capitec Bank $1'); // "Capitec Vredendal"
  return n.replace(/\s+/g, ' ').trim();
}

export interface NameInput {
  name: string;
  website?: string | null;
  suburb?: string;
  type: BranchType;
}

/** Plan §4.2 step 5: keep real names, derive from slug for generic ones, else "Capitec Bank <suburb>". */
export function deriveName({ name, website, suburb, type }: NameInput): string {
  const prefix = type === 'business-centre' ? 'Capitec Business Centre' : 'Capitec Bank';
  if (!isGenericName(name)) return normaliseName(name);
  const place = slugToPlace(website);
  if (place) return `${prefix} ${place}`;
  if (type === 'business-centre' && suburb) return `${prefix} ${suburb}`;
  return suburb ? `${prefix} ${suburb}` : prefix;
}

/** Classification by NAME (and slug), not category (many real branches carry a bogus category). */
export function classify(
  name: string,
  website: string | null | undefined,
  category: string | null | undefined,
): RecordKind {
  if (/business centre/i.test(name)) return 'business-centre';
  if (/\batm\b/i.test(name)) return 'atm';
  if (website && /capitec-?bank-?atm/i.test(website)) return 'atm';
  if (website && /capitec-?business-?centre/i.test(website)) return 'business-centre';
  // A generic name plus category atm is an ATM; a real branch name with category atm is still a branch.
  if (category === 'atm' && isGenericName(name)) return 'atm';
  return 'branch';
}
