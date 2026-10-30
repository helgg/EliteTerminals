// Colony finder service: candidates from Spansh's system search, each one's bodies from its dump (cached on disk
// for a week: bodies don't move), scored for the profile asked.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ColonyBody, ColonyClaimStation, ColonyHidden, ColonyQuery, ColonyResult, ColonySystem } from '@et/shared';
import { countsOf, fromDumpBody, isBody, scoopable, scoreOf, treeOrder } from './finder.ts';

const SEARCH = 'https://spansh.co.uk/api/systems/search';
const STATIONS = 'https://spansh.co.uk/api/stations/search';
/** Docks where the System Colonisation contact can be (carriers move, megaships rarely have it). */
const CLAIM_TYPES = [
  'Coriolis Starport', 'Orbis Starport', 'Ocellus Starport', 'Dodec Starport', 'Asteroid base', 'Outpost',
  'Planetary Port', 'Planetary Outpost',
];
const CLAIMS_KEEP_MS = 3600e3;
const DUMP = 'https://spansh.co.uk/api/dump/';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const PAGE_SIZE = 100;
/** The 200 candidates with the most bodies: each needs its bodies fetched (cached afterwards). */
const MAX_PAGES = 2;
const BODIES_KEEP_MS = 7 * 24 * 3600e3;
const SPACING_MS = 300;

type Place = { name: string; pos: [number, number, number] };
type Cached = { at: number; bodies: ColonyBody[] };

/** Stations with the System Colonisation contact within `ly` of a system, nearest first. Pure, for tests. */
export function claimBody(system: string, ly: number) {
  return {
    filters: { distance: { min: 0, max: ly }, services: { value: ['System Colonisation'] }, type: { value: CLAIM_TYPES } },
    sort: [{ distance: { direction: 'asc' } }],
    reference_system: system,
    size: 8,
    page: 0,
  };
}

/** Spansh station result → a claim station. Pure, for tests. */
export function fromClaimStation(r: any): ColonyClaimStation {
  return {
    system: String(r?.system_name ?? ''), station: String(r?.name ?? ''), type: String(r?.type ?? ''),
    ls: Number(r?.distance_to_arrival) || 0, ly: Number(r?.distance) || 0,
    pad: r?.large_pads ? 'L' : r?.medium_pads ? 'M' : r?.small_pads ? 'S' : '-',
  };
}

/**
 * Why a candidate cannot be claimed, or ''. Spansh's is_colonised / is_being_colonised are only set on systems it has
 * station data for (null on free ones), so a fixed station (megaship, prison ship, outpost, construction site), a
 * controlling faction or a permit marks a system that is taken or off limits (OBSERVED 2026-10-29: 21 Eridani,
 * megaship + Torval Mining Ltd, refused in game). Fleet carriers come and go and don't count. Pure, for tests.
 */
export function blockedBy(s: any): string {
  if (s?.needs_permit === true) return 'permit';
  if (s?.is_colonised === true || s?.is_being_colonised === true || (s?.population ?? 0) > 0) return 'colonised';
  if ((s?.stations ?? []).some((x: any) => !/carrier/i.test(String(x?.type ?? '')))) return 'station';
  if (s?.controlling_minor_faction) return 'faction';
  // Thargoid (or any) allegiance on an unpopulated system: HIP 16572, refused in game (OBSERVED 2026-10-29)
  if (s?.allegiance && s.allegiance !== 'None') return 'allegiance';
  return '';
}

/** Search body for unpopulated systems in reach of populated space, most bodies first. Pure, for tests. */
export function candidatesBody(q: ColonyQuery, reference: string, page: number) {
  return {
    filters: {
      distance: { min: 0, max: q.radius },
      population: { comparison: '<=>', value: [0, 0] },
      nearest_populated_distance: { comparison: '<=>', value: [0, q.maxPopulatedLy] },
      body_count: { comparison: '<=>', value: [Math.max(1, q.minBodies), 9999] },
    },
    sort: [{ body_count: { direction: 'desc' } }],
    reference_system: reference,
    size: PAGE_SIZE,
    page,
  };
}

export class ColonyService {
  last: ColonyResult | null = null;
  private bodies = new Map<number, Cached>();
  private claims = new Map<string, { at: number; list: ColonyClaimStation[] }>();
  /** Marked by the player as refused or claimed in game. */
  hidden: ColonyHidden[] = [];
  private readonly file: string;
  private readonly hiddenFile: string;
  private readonly place: (name: string) => Place;
  private readonly progress: (loaded: number, total: number) => void;

  constructor(cacheDir: string, place: (name: string) => Place, progress: (loaded: number, total: number) => void) {
    // v3: Thargoid / Guardian / human signals per body
    this.file = join(cacheDir, 'colony-bodies-v3.json');
    this.hiddenFile = join(cacheDir, 'colony-hidden.json');
    this.place = place;
    this.progress = progress;
  }

  async load() {
    try {
      this.bodies = new Map(Object.entries(JSON.parse(await readFile(this.file, 'utf8'))).map(([k, v]) => [Number(k), v as Cached]));
    } catch {
      // nothing cached yet
    }
    try {
      this.hidden = JSON.parse(await readFile(this.hiddenFile, 'utf8'));
    } catch {
      // none marked yet
    }
  }

  /** Marks a system refused or claimed (it leaves the list), or clears the mark when `reason` is null. */
  async hide(id64: number, name: string, reason: ColonyHidden['reason'] | null) {
    this.hidden = this.hidden.filter((h) => h.id64 !== id64);
    if (reason) this.hidden.unshift({ id64, name, reason, at: new Date().toISOString() });
    await mkdir(join(this.hiddenFile, '..'), { recursive: true });
    await writeFile(this.hiddenFile, JSON.stringify(this.hidden, null, 1));
    if (this.last) {
      const out = new Set(this.hidden.map((h) => h.id64));
      this.last = { ...this.last, hidden: this.hidden, systems: this.last.systems.filter((x) => !out.has(x.id64)) };
    }
    return this.last;
  }

  private async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(this.file, JSON.stringify(Object.fromEntries(this.bodies)));
  }

  async search(q: ColonyQuery): Promise<ColonyResult> {
    const ref = this.place(q.reference ?? '');
    const found: any[] = [];
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await post(SEARCH, candidatesBody(q, ref.name, page));
      const results = Array.isArray(body?.results) ? body.results : [];
      total = Number(body?.count) || found.length + results.length;
      found.push(...results);
      if (results.length < PAGE_SIZE) break;
    }
    const out = new Set(this.hidden.map((h) => h.id64));
    const open = found.filter((s) => !blockedBy(s));
    const wanted = open.filter((s) => !out.has(Number(s.id64)));

    const systems: ColonySystem[] = [];
    let fetched = false;
    let failed = 0;
    let sites = 0;
    for (const [i, s] of wanted.entries()) {
      this.progress(i, wanted.length);
      const id64 = Number(s.id64);
      let cached = this.bodies.get(id64);
      if (!cached || Date.now() - cached.at > BODIES_KEEP_MS) {
        try {
          // Spansh may turn a burst away: one more try after a pause
          const dump = await get(DUMP + id64).catch(async () => (await sleep(2000), get(DUMP + id64)));
          cached = { at: Date.now(), bodies: (dump?.system?.bodies ?? []).filter(isBody).map(fromDumpBody) };
          this.bodies.set(id64, cached);
          fetched = true;
          await sleep(SPACING_MS);
        } catch {
          if (!cached) {
            failed++;
            continue;
          }
        }
      }
      const sys = this.system(s, cached.bodies, q);
      // a Thargoid or Guardian site keeps the system off limits: HR 1358, refused in game (OBSERVED 2026-10-29)
      if (sys.counts.thargoid || sys.counts.guardian) sites++;
      else systems.push(sys);
    }
    this.progress(wanted.length, wanted.length);
    if (fetched) await this.save();

    systems.sort((a, b) => b.score - a.score || a.distance - b.distance);
    this.last = {
      query: q, reference: ref.name, fetchedAt: new Date().toISOString(),
      candidates: total, checked: found.length, failed, locked: found.length - open.length + sites, hidden: this.hidden, systems,
    };
    return this.last;
  }

  /** Where to buy the claim: stations with the System Colonisation contact near the system, nearest first. */
  async claimAt(system: string, ly: number): Promise<ColonyClaimStation[]> {
    const key = `${system.toLowerCase()}|${ly}`;
    const seen = this.claims.get(key);
    if (seen && Date.now() - seen.at < CLAIMS_KEEP_MS) return seen.list;
    const body = await post(STATIONS, claimBody(system, ly));
    const list = (Array.isArray(body?.results) ? body.results : []).map(fromClaimStation);
    this.claims.set(key, { at: Date.now(), list });
    return list;
  }

  /** Scores again for another profile without fetching anything (the bodies are kept in the last result). */
  rescore(q: ColonyQuery): ColonyResult | null {
    if (!this.last) return null;
    const systems = this.last.systems.map((s) => ({ ...s, ...scoreOf(s.counts, s.bodiesKnown, s.scoopable, q.profile) }))
      .sort((a, b) => b.score - a.score || a.distance - b.distance);
    this.last = { ...this.last, query: { ...this.last.query, profile: q.profile }, systems };
    return this.last;
  }

  private system(s: any, all: ColonyBody[], q: ColonyQuery): ColonySystem {
    const raw = all.filter(isBody); // caches from before barycentres were left out
    const bodies = treeOrder(raw);
    const main = raw.find((b) => b.type === 'Star' && b.ls === 0) ?? raw.find((b) => b.type === 'Star');
    const counts = countsOf(bodies);
    const isScoopable = !!main && scoopable(main.subType);
    return {
      id64: Number(s.id64), name: String(s.name), pos: [s.x, s.y, s.z],
      distance: Number(s.distance) || 0, nearestPopulated: Number(s.nearest_populated_distance) || 0,
      bodyCount: Number(s.body_count) || bodies.length, bodiesKnown: bodies.length, seenAt: String(s.updated_at ?? ''),
      mainStar: main?.subType ?? '', scoopable: isScoopable, counts,
      ...scoreOf(counts, bodies.length, isScoopable, q.profile),
      bodies,
    };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Spansh answered ${res.status}`);
  return res.json() as Promise<any>;
}

async function get(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Spansh answered ${res.status}`);
  return res.json() as Promise<any>;
}
