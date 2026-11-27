/**
 * Builds public/api/branches.json and public/api/notices.json from an Overture Maps Places export.
 * See "Data" in README.md for sources and cleaning rules.
 *
 *   npm run data:build                    (wraps: tsx scripts/build-branches.ts scripts/data/overture-capitec.json)
 *   npm run data:build -- --offline       (never call Nominatim; cached lookups only)
 *
 * Deterministic: no Math.random, no wall-clock in the output. Same input = byte-identical output.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  Address,
  Branch,
  BranchType,
  DataSource,
} from '../src/app/core/models/branch.model.ts';
import type { Notice } from '../src/app/core/models/notice.model.ts';
import { haversineKm } from '../src/app/core/services/geo.ts';
import {
  type ParsedAddress,
  parseFreeformAddress,
  parseStructuredAddress,
  toAddress,
} from './lib/address.ts';
import { loadCache, reverseGeocode, saveCache } from './lib/geocode.ts';
import {
  holidayHours,
  type HoursProfile,
  profileFor,
  servicesFor,
  weeklyHours,
} from './lib/hours.ts';
import {
  classify,
  deriveName,
  isCapitecBankName,
  isGenericName,
  normaliseName,
  sharePlaceToken,
  slugToPlace,
  tidyPlace,
} from './lib/names.ts';
import { applyOtherScenarios, applyWeeklyScenarios, type Scenario } from './lib/scenarios.ts';
import { validateBranches } from './lib/validate.ts';

// ---------------------------------------------------------------- types & config

interface RawSource {
  dataset: string;
  record_id: string | null;
  update_time: string | null;
}
interface RawRecord {
  id: string;
  lat: number;
  lng: number;
  names: { primary: string | null };
  addresses:
    | {
        freeform?: string | null;
        locality?: string | null;
        postcode?: string | null;
        region?: string | null;
        country?: string | null;
      }[]
    | null;
  websites: string[] | null;
  basic_category?: string | null;
  sources: RawSource[];
}

type Dataset = DataSource['dataset'];
const DATASETS: Dataset[] = ['AllThePlaces', 'Microsoft', 'meta', 'Foursquare'];
const NAME_PRIORITY: Dataset[] = ['Microsoft', 'meta', 'AllThePlaces', 'Foursquare'];
const ADDRESS_PRIORITY: Dataset[] = ['AllThePlaces', 'Microsoft', 'meta', 'Foursquare'];
const LOCATION_PRIORITY: Dataset[] = ['AllThePlaces', 'Microsoft', 'meta', 'Foursquare'];
const MERGE_RADIUS_M = 60;
const WIDE_MERGE_RADIUS_M = 200;
const CALL_CENTRE = '+27 860 10 20 43';

interface Cand {
  id: string;
  type: BranchType;
  dataset: Dataset;
  name: string;
  website?: string;
  lat: number;
  lng: number;
  addr: ParsedAddress;
  sources: DataSource[];
}

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const inputPath = resolve(
  args.find((a) => !a.startsWith('--')) ?? join(root, 'scripts/data/overture-capitec.json'),
);
const dataDir = join(root, 'scripts/data');
const outDir = join(root, 'public/api');

const log: string[] = [];
const say = (s = '') => {
  log.push(s);
  console.log(s);
};
const note = (s: string) => log.push(s); // log file only

// ---------------------------------------------------------------- 1-3. load, filter, classify

function toCand(r: RawRecord, kind: BranchType): Cand | undefined {
  const src = r.sources.find((s) => s.dataset !== 'Overture');
  if (!src || !DATASETS.includes(src.dataset as Dataset)) return undefined;
  const dataset = src.dataset as Dataset;
  const a = r.addresses?.[0] ?? {};
  const website = r.websites?.[0] ?? undefined;

  let addr: ParsedAddress =
    dataset === 'AllThePlaces' ? parseFreeformAddress(a.freeform) : parseStructuredAddress(a);
  if (dataset === 'AllThePlaces' && !addr.city) {
    // AllThePlaces rows sometimes only fill the structured fields
    addr = { ...parseStructuredAddress(a), street: addr.street || (a.freeform ?? '') };
  }

  const sources: DataSource[] = r.sources
    .filter((s) => DATASETS.includes(s.dataset as Dataset))
    .map((s) => ({
      dataset: s.dataset as Dataset,
      overtureId: r.id,
      ...(s.record_id ? { recordId: s.record_id } : {}),
      updated: (s.update_time ?? '').slice(0, 10),
    }));

  return {
    id: r.id,
    type: kind,
    dataset,
    name: r.names.primary ?? '',
    website,
    lat: r.lat,
    lng: r.lng,
    addr,
    sources,
  };
}

function load(): Cand[] {
  const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as RawRecord[];
  say(`Loaded ${raw.length} records from ${inputPath}`);

  const kept: Cand[] = [];
  let outsideZA = 0;
  let atms = 0;
  const droppedNames: string[] = [];
  let noSource = 0;

  for (const r of raw) {
    if (r.addresses?.[0]?.country !== 'ZA') {
      outsideZA++;
      note(`DROP (country ${r.addresses?.[0]?.country}): ${r.names.primary} [${r.id}]`);
      continue;
    }
    const name = r.names.primary ?? '';
    if (!isCapitecBankName(name)) {
      droppedNames.push(name);
      note(`DROP (name): "${name}" [${r.id}]`);
      continue;
    }
    const kind = classify(name, r.websites?.[0], r.basic_category);
    if (kind === 'atm') {
      atms++;
      continue;
    }
    const c = toCand(r, kind);
    if (!c) {
      noSource++;
      note(`DROP (no usable source): "${name}" [${r.id}]`);
      continue;
    }
    kept.push(c);
  }

  say(
    `Dropped: ${outsideZA} outside ZA, ${droppedNames.length} non-Capitec-bank names, ${noSource} no usable source`,
  );
  if (droppedNames.length) say(`  names: ${[...new Set(droppedNames)].join(' | ')}`);
  say(`Excluded ATMs (see plan §4.5): ${atms}`);
  say(`Kept for processing: ${kept.length}`);
  return kept;
}

// ---------------------------------------------------------------- 6. dedupe

function cluster(cands: Cand[]): Cand[][] {
  const parent = cands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i]!;
      const b = cands[j]!;
      if (a.type !== b.type) continue;
      const m = haversineKm(a, b) * 1000;
      if (m <= MERGE_RADIUS_M) parent[find(j)] = find(i);
      // Deviation from the plan's flat 60 m: the same branch from two sources is often placed 60-200 m apart.
      // Merge those when the sources differ and the names share a distinctive word (e.g. "Kimberley", "Bizana").
      else if (
        m <= WIDE_MERGE_RADIUS_M &&
        a.dataset !== b.dataset &&
        sharePlaceToken(a.name, b.name)
      ) {
        parent[find(j)] = find(i);
        note(`WIDE MATCH ${m.toFixed(0)} m: ${a.dataset}:"${a.name}" ~ ${b.dataset}:"${b.name}"`);
      }
    }
  }
  const groups = new Map<number, Cand[]>();
  cands.forEach((c, i) => {
    const k = find(i);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  });
  return [...groups.values()];
}

const byPriority = (group: Cand[], order: Dataset[]) =>
  [...group].sort(
    (a, b) => order.indexOf(a.dataset) - order.indexOf(b.dataset) || a.id.localeCompare(b.id),
  );

interface Merged {
  id: string;
  name: string;
  type: BranchType;
  lat: number;
  lng: number;
  addr: ParsedAddress;
  sources: DataSource[];
  mergedFrom: number;
}

function merge(group: Cand[]): Merged {
  const type = group[0]!.type;

  // address: field by field, best source first
  const addr: ParsedAddress = { street: '' };
  for (const c of byPriority(group, ADDRESS_PRIORITY)) {
    addr.street ||= c.addr.street;
    addr.suburb ||= c.addr.suburb;
    addr.city ||= c.addr.city;
    addr.province ||= c.addr.province;
    addr.postalCode ||= c.addr.postalCode;
  }

  // name: first real name by priority; else derive from a slug in the group; else suburb
  const named = byPriority(group, NAME_PRIORITY);
  const real = named.find((c) => !isGenericName(c.name));
  let nameRec: Cand;
  let name: string;
  if (real) {
    nameRec = real;
    name = normaliseName(real.name);
  } else {
    const withSlug = named.find((c) => slugToPlace(c.website));
    nameRec = withSlug ?? named[0]!;
    name = deriveName({
      name: nameRec.name,
      website: withSlug?.website,
      suburb: addr.suburb,
      type,
    });
  }

  const loc = byPriority(group, LOCATION_PRIORITY)[0]!;

  const seen = new Set<string>();
  const sources = group
    .flatMap((c) => c.sources)
    .filter((s) => {
      const k = `${s.dataset}|${s.recordId ?? s.overtureId}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort(
      (a, b) =>
        DATASETS.indexOf(a.dataset) - DATASETS.indexOf(b.dataset) ||
        a.overtureId.localeCompare(b.overtureId),
    );

  if (group.length > 1) {
    note(
      `MERGE ${type}: ${group.map((c) => `${c.dataset}:"${c.name}"`).join(' + ')} -> "${name}" (id from ${nameRec.dataset})`,
    );
  }
  addr.city = tidyPlace(addr.city);
  addr.suburb = tidyPlace(addr.suburb);
  name = name.replace(/\bCape town\b/, 'Cape Town');
  return {
    id: nameRec.id,
    name,
    type,
    lat: loc.lat,
    lng: loc.lng,
    addr,
    sources,
    mergedFrom: group.length,
  };
}

// ---------------------------------------------------------------- 7. fill gaps

async function fillGaps(
  merged: Merged[],
): Promise<{ geocoded: number; neighbour: number; failed: string[] }> {
  const cachePath = join(dataDir, 'geocode-cache.json');
  const cache = loadCache(cachePath);
  let geocoded = 0;
  let neighbour = 0;
  const failed: string[] = [];

  const gap = (m: Merged) => !m.addr.city || !m.addr.suburb || !m.addr.province;
  const todo = merged.filter(gap);
  say(`Records with address gaps: ${todo.length}${offline ? ' (offline: cache only)' : ''}`);

  for (const m of todo) {
    const g = await reverseGeocode(m.lat, m.lng, cache, { offline });
    if (g) {
      const before = JSON.stringify([m.addr.suburb, m.addr.city, m.addr.province]);
      m.addr.city ||= g.city ?? g.suburb;
      m.addr.suburb ||= g.suburb ?? g.city;
      m.addr.province ||= g.province;
      m.addr.postalCode ||= g.postalCode;
      geocoded++;
      note(
        `GEOCODE "${m.name}": ${before} -> ${JSON.stringify([m.addr.suburb, m.addr.city, m.addr.province])}`,
      );
    }
  }
  saveCache(cachePath, cache);

  // Still no province: take it from the nearest record that has one (offline, deterministic).
  for (const m of merged.filter((x) => !x.addr.province)) {
    const nearest = merged
      .filter((o) => o.addr.province)
      .map((o) => ({ o, d: haversineKm(m, o) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d < 40) {
      m.addr.province = nearest.o.addr.province;
      neighbour++;
      note(
        `PROVINCE from neighbour "${m.name}" <- "${nearest.o.name}" (${nearest.d.toFixed(1)} km)`,
      );
    }
  }
  // Bare "Capitec Bank" names (no slug, no real name) get their suburb once geocoding has supplied one.
  for (const m of merged) {
    if (/^Capitec (Bank|Business Centre)$/.test(m.name) && m.addr.suburb) {
      note(`NAME "${m.name}" -> "${m.name} ${m.addr.suburb}" (from geocoded suburb)`);
      m.name = `${m.name} ${m.addr.suburb}`;
    }
  }
  for (const m of merged) if (!m.addr.city || !m.addr.province) failed.push(m.name);
  return { geocoded, neighbour, failed };
}

// ---------------------------------------------------------------- main

async function main() {
  const cands = load();

  // 6. dedupe
  const groups = cluster(cands);
  const merged = groups.map(merge).sort((a, b) => a.id.localeCompare(b.id));
  const mergeCount = merged.reduce((n, m) => n + (m.mergedFrom - 1), 0);
  say(
    `Deduplicated (<= ${MERGE_RADIUS_M} m, same type): ${cands.length} -> ${merged.length} (${mergeCount} merged away)`,
  );

  // 7. gaps
  const gaps = await fillGaps(merged);
  say(
    `Geocoded via Nominatim/cache: ${gaps.geocoded}; province from nearest neighbour: ${gaps.neighbour}`,
  );

  // 8. build branches
  const cityCount = new Map<string, number>();
  for (const m of merged)
    if (m.type === 'branch')
      cityCount.set(m.addr.city ?? '', (cityCount.get(m.addr.city ?? '') ?? 0) + 1);

  const profiles = new Map<string, HoursProfile>();
  const branches: Branch[] = merged.map((m) => {
    const address: Address = toAddress(m.addr);
    const stub = { id: m.id, name: m.name, type: m.type, address };
    const profile = profileFor(stub, m.type === 'branch' && cityCount.get(address.city) === 1);
    const hours = weeklyHours(profile);
    profiles.set(m.id, profile);
    return {
      id: m.id,
      name: m.name,
      type: m.type,
      location: { lat: +m.lat.toFixed(6), lng: +m.lng.toFixed(6) },
      address,
      phone: CALL_CENTRE,
      services: servicesFor(stub),
      hours,
      specialHours: [],
      status: { kind: 'operational' },
      sources: m.sources,
    };
  });

  // scenarios (weekly) -> holidays -> scenarios (other)
  const scenarios = JSON.parse(
    readFileSync(join(dataDir, 'scenarios.json'), 'utf8').replace(/^\uFEFF/, ''),
  ) as Scenario[];
  const placedWeekly = applyWeeklyScenarios(branches, scenarios);
  for (const b of branches) b.specialHours = holidayHours(profiles.get(b.id)!, b.hours);
  const { placed: placedOther, notices } = applyOtherScenarios(branches, scenarios);
  const placed = new Map([...placedWeekly, ...placedOther]);

  // 9. validate
  const sortedNotices: Notice[] = [...notices].sort(
    (a, b) => a.branchId.localeCompare(b.branchId) || a.kind.localeCompare(b.kind),
  );
  const errors = validateBranches(branches, sortedNotices);
  if (gaps.failed.length)
    errors.push(
      ...gaps.failed.map((n) => `${n}: could not determine city/province (rerun online)`),
    );
  if (errors.length) {
    console.error(`\nValidation failed with ${errors.length} error(s):`);
    for (const e of errors.slice(0, 50)) console.error('  ' + e);
    if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
    process.exit(1);
  }

  // 10. write
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'branches.json'), JSON.stringify(branches, null, 2) + '\n');
  writeFileSync(join(outDir, 'notices.json'), JSON.stringify(sortedNotices, null, 2) + '\n');

  summary(branches, placed, scenarios, sortedNotices);
  writeFileSync(join(dataDir, 'build-log.txt'), log.join('\n') + '\n');
}

// ---------------------------------------------------------------- summary & edge cases (§4.6)

function summary(
  branches: Branch[],
  placed: Map<string, Branch>,
  scenarios: Scenario[],
  notices: Notice[],
) {
  const count = <T>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  say('\n=== Summary ===');
  say(
    `Written: ${branches.length} records to public/api/branches.json, ${notices.length} notices to public/api/notices.json`,
  );
  say(
    'By type: ' +
      count(branches, (b) => b.type)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  );
  say(
    'By province: ' +
      count(branches, (b) => b.address.province)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  );

  say('\n=== Edge cases (§4.6) ===');
  let close = 0;
  let closest: [Branch, Branch, number] | undefined;
  for (let i = 0; i < branches.length; i++)
    for (let j = i + 1; j < branches.length; j++) {
      const d = haversineKm(branches[i]!.location, branches[j]!.location) * 1000;
      if (d < 200) {
        close++;
        if (!closest || d < closest[2]) closest = [branches[i]!, branches[j]!, d];
      }
    }
  say(
    `[${close ? 'x' : ' '}] pairs < 200 m apart: ${close}${closest ? ` (closest: "${closest[0].name}" / "${closest[1].name}", ${closest[2].toFixed(0)} m)` : ''}`,
  );
  const longest = [...branches].sort(
    (a, b) => b.name.length + b.address.street.length - (a.name.length + a.address.street.length),
  )[0]!;
  say(`[x] longest name+street: "${longest.name}" / "${longest.address.street}"`);
  const apos = branches.filter((b) =>
    /['’]/.test(`${b.name} ${b.address.street} ${b.address.suburb} ${b.address.city}`),
  );
  say(
    `[${apos.length ? 'x' : ' '}] apostrophes: ${apos.length} (e.g. ${apos
      .slice(0, 3)
      .map((b) => b.name)
      .join('; ')})`,
  );
  for (const place of ['Paarl', 'Bellville', 'Mbekweni']) {
    const hit = branches.filter((b) =>
      new RegExp(place, 'i').test(`${b.name} ${b.address.suburb} ${b.address.city}`),
    );
    say(`[${hit.length ? 'x' : ' '}] place "${place}": ${hit.length} records`);
  }
  const typos = branches.filter((b) => /sqaure/i.test(`${b.name} ${b.address.street}`));
  say(
    `[${typos.length ? 'x' : ' '}] known source typo "Sqaure": ${typos.map((b) => b.name).join('; ') || 'none'}`,
  );

  say('\n=== Scenarios ===');
  for (const sc of scenarios) {
    const b = placed.get(sc.id);
    say(
      `[${b ? 'x' : ' '}] ${sc.id} ${sc.description}: ${b ? `${b.name} (${b.address.suburb}, ${b.address.city})` : '(no data change)'}`,
    );
  }
  const mallHoliday = branches.find(
    (b) =>
      b.type === 'branch' &&
      b.specialHours.some((s) => s.reason === 'public-holiday' && s.periods.length),
  );
  say(`[x] S8 mall holiday hours (automatic), e.g.: ${mallHoliday?.name}`);
  const biz = branches.find((b) => b.type === 'business-centre');
  say(`[x] S9 business centre closed all weekend (automatic), e.g.: ${biz?.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
