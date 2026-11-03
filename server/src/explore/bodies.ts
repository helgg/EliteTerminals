// EXPLORE: Spansh's records of a system's bodies and of body-search hits → our models, and the search itself.
// Pure, for tests: no I/O.
import type { ExploreBelt, ExploreBody, ExploreFindQuery, ExploreOrbit, ExploreSystemInfo, ExploreTarget } from '@et/shared';
import { fromDumpBody } from '../colony/finder.ts';
import { MATERIALS } from '../engineeringData.ts';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const SOLAR_RADIUS_KM = 695700;
const EARTH_MASSES_PER_SOLAR = 332946;
const M_PER_LS = 299792458;

/** A star's belts from the dump: radii in metres (as the game's own scan gives them) → light-seconds, nearest first. */
export function beltsOf(b: any): ExploreBelt[] {
  return (Array.isArray(b?.belts) ? b.belts : [])
    .map((x: any): ExploreBelt => ({ name: str(x?.name), type: str(x?.type), innerLs: num(x?.innerRadius) / M_PER_LS, outerLs: num(x?.outerRadius) / M_PER_LS }))
    .sort((x: ExploreBelt, y: ExploreBelt) => x.innerLs - y.innerLs);
}

/** "$Codex_Ent_Bacterial_Genus_Name;" or { name: "Bacterial" } → "Bacterial". */
export function genusName(g: unknown): string {
  const raw = typeof g === 'string' ? g : str((g as any)?.name);
  return /Ent_([A-Za-z]+)_Genus/.exec(raw)?.[1] ?? raw.replace(/^\$|;$/g, '');
}

/** Atmosphere composition arrives as { Argon: 100 } in the dump and as [{ name, share }] in a search. */
export function mixOf(v: unknown): { name: string; share: number }[] {
  const list = Array.isArray(v)
    ? v.map((x: any) => ({ name: str(x?.name), share: num(x?.share) }))
    : v && typeof v === 'object'
      ? Object.entries(v as Record<string, number>).map(([name, share]) => ({ name, share: num(share) }))
      : [];
  return list.filter((x) => x.name && x.share > 0).sort((a, b) => b.share - a.share);
}

/**
 * The barycentre a body shares with its siblings: the outermost one below its parent in the `parents` chain, or -1 when it
 * orbits its parent (or the system's centre) alone. [{Null:22},{Null:21},{Star:1},{Null:0}] → 21; [{Null:10},{Null:0}] → 10;
 * [{Null:0}] and [{Star:1},{Null:0}] → -1. The last barycentre of a chain without a parent body is the system's own centre.
 */
function baryOf(b: any): number {
  const chain: [string, unknown][] = (Array.isArray(b?.parents) ? b.parents : []).map((p: any) => Object.entries(p ?? {})[0] as [string, unknown]).filter(Boolean);
  const lead: number[] = [];
  for (const [kind, id] of chain) {
    if (kind !== 'Null') return lead.length ? lead[lead.length - 1] : -1;
    lead.push(num(id));
  }
  return lead.length > 1 ? lead[lead.length - 2] : -1;
}

/** A body of Spansh's dump (what colony.finder reads too) with the physical detail the map shows. */
export function fromDump(b: any, values?: { scan: number; map: number }): ExploreBody {
  const base = fromDumpBody(b);
  const star = base.type === 'Star';
  const stations = Array.isArray(b?.stations) ? b.stations : [];
  return {
    id: base.bodyId,
    name: base.name,
    type: base.type,
    subType: base.subType,
    ls: base.ls,
    parent: base.parent,
    bary: baryOf(b),
    depth: base.depth,
    mainStar: b?.mainStar === true,
    landable: base.landable,
    atmosphere: base.atmosphere,
    atmosphereMix: mixOf(b?.atmosphereComposition),
    terraformable: base.terraformable,
    gravity: base.gravity,
    radius: star ? num(b?.solarRadius) * SOLAR_RADIUS_KM : num(b?.radius),
    earthMasses: star ? num(b?.solarMasses) * EARTH_MASSES_PER_SOLAR : num(b?.earthMasses),
    temperature: num(b?.surfaceTemperature),
    pressure: typeof b?.surfacePressure === 'number' ? b.surfacePressure : null,
    volcanism: /^no volcanism$/i.test(str(b?.volcanismType)) ? '' : str(b?.volcanismType),
    reserve: base.reserve,
    rings: base.rings,
    belts: beltsOf(b),
    bio: base.bio,
    geo: base.geo,
    human: base.human,
    thargoid: base.thargoid,
    guardian: base.guardian,
    genuses: (Array.isArray(b?.signals?.genuses) ? b.signals.genuses : []).map(genusName).filter(Boolean),
    materials: Object.entries((b?.materials ?? {}) as Record<string, number>)
      .map(([name, pct]) => ({ name, pct: num(pct), grade: MATERIALS.Raw.get(name.toLowerCase())?.grade ?? 0 }))
      .sort((x, y) => y.pct - x.pct),
    scanValue: values?.scan ?? 0,
    mapValue: values?.map ?? 0,
    stations: stations.map((s: any) => ({ name: str(s?.name), type: str(s?.type) })),
    orbit: b?.orbitalPeriod === undefined && b?.semiMajorAxis === undefined ? null : orbitOf(b),
    rotation: num(b?.rotationalPeriod),
    tidalLock: b?.rotationalPeriodTidallyLocked === true,
    // Spansh gives the tilt in radians, like the journal
    tilt: (num(b?.axialTilt) * 180) / Math.PI,
    composition: Object.entries((b?.solidComposition ?? {}) as Record<string, number>)
      .map(([name, pct]) => ({ name, pct: num(pct) }))
      .filter((x) => x.pct > 0)
      .sort((x, y) => y.pct - x.pct),
  };
}

function orbitOf(b: any): ExploreOrbit {
  return { period: num(b?.orbitalPeriod), semiMajorAu: num(b?.semiMajorAxis), eccentricity: num(b?.orbitalEccentricity), inclination: num(b?.orbitalInclination) };
}

/** A system record of Spansh → what we show of the system as a whole. A missing record gives empty values. */
export function infoOf(r: any): ExploreSystemInfo {
  return {
    population: num(r?.population),
    allegiance: str(r?.allegiance),
    government: /^none$/i.test(str(r?.government)) ? '' : str(r?.government),
    security: str(r?.security),
    economy: /^none$/i.test(str(r?.primary_economy)) ? '' : str(r?.primary_economy),
    secondaryEconomy: /^none$/i.test(str(r?.secondary_economy)) ? '' : str(r?.secondary_economy),
    permit: r?.needs_permit === true,
    updatedAt: str(r?.updated_at),
  };
}

/** Spansh's body-search request for a preset. */
export function findBody(q: ExploreFindQuery, page = 0) {
  const filters: Record<string, unknown> = { distance: { min: 0, max: q.radius } };
  let sort: unknown = [{ distance: { direction: 'asc' } }];
  switch (q.preset) {
    case 'bio':
      filters.signals = [{ name: 'Biological', value: [Math.max(1, q.minBio ?? 3), 99] }];
      filters.is_landable = { value: true };
      break;
    case 'geo':
      filters.signals = [{ name: 'Geological', value: [Math.max(1, q.minBio ?? 3), 99] }];
      if (q.landableOnly) filters.is_landable = { value: true };
      break;
    case 'elw':
      filters.subtype = { value: ['Earth-like world'] };
      break;
    case 'ww':
      filters.subtype = { value: ['Water world'] };
      break;
    case 'aw':
      filters.subtype = { value: ['Ammonia world'] };
      break;
    case 'terra':
      filters.terraforming_state = { value: ['Terraformable'] };
      sort = [{ estimated_scan_value: { direction: 'desc' } }];
      break;
    case 'value':
      sort = [{ estimated_scan_value: { direction: 'desc' } }];
      break;
  }
  return { filters, reference_system: q.reference, sort, size: 40, page };
}

/** Genera of Odyssey biology: the other landmarks (settlements, geysers…) are not species. */
const BIOLOGY = /^(Aleoida|Bacterium|Cactoida|Clypeus|Concha|Electricae|Fonticulua|Fumerola|Fungoida|Osseus|Recepta|Stratum|Tubus|Tussock|Frutexa|Amphora|Bark|Brain|Anemone|Sinuous|Crystalline|Shrub|Barnacle)/i;

/** A body-search hit → a target. The species list comes from the landmarks other commanders logged. */
export function fromSearchHit(r: any): ExploreTarget {
  const species = new Map<string, { count: number; value: number }>();
  for (const l of Array.isArray(r?.landmarks) ? r.landmarks : []) {
    const name = str(l?.subtype);
    if (!name || !BIOLOGY.test(str(l?.type))) continue;
    const cur = species.get(name) ?? { count: 0, value: num(l?.value) };
    cur.count++;
    species.set(name, cur);
  }
  const signals: { name: string; count: number }[] = Array.isArray(r?.signals) ? r.signals : [];
  const count = (n: string) => num(signals.find((x) => x?.name === n)?.count);
  const rings = (Array.isArray(r?.rings) ? r.rings : []).map((x: any) => str(x?.type)).filter(Boolean);
  const list = [...species].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  return {
    system: str(r?.system_name),
    id64: num(r?.system_id64),
    body: str(r?.name),
    subType: str(r?.subtype),
    ly: num(r?.distance),
    ls: num(r?.distance_to_arrival),
    landable: r?.is_landable === true,
    atmosphere: /^no atmosphere$/i.test(str(r?.atmosphere)) ? '' : str(r?.atmosphere),
    gravity: typeof r?.gravity === 'number' ? r.gravity : null,
    scanValue: num(r?.estimated_scan_value),
    mapValue: num(r?.estimated_mapping_value),
    bio: count('Biological'),
    geo: count('Geological'),
    genuses: (Array.isArray(r?.genuses) ? r.genuses : []).map(genusName).filter(Boolean),
    species: list,
    // each species pays once on a body; `count` is only how many sightings others logged
    bioValue: list.reduce((t, x) => t + x.value, 0),
    terraformable: str(r?.terraforming_state) === 'Terraformable',
    rings,
  };
}
