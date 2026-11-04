// EXPLORE service: a system's bodies from Spansh (the dump for the detail, the system record for the scan values)
// and the search for places to go (Spansh's body search). Cached in memory; Spansh is a free service, so one at a time.
import { POI_WINDOWED, POI_WINDOW_MAX, type ExploreFindQuery, type ExploreFindResult, type ExploreSystem, type PoiQuery, type PoiResult, type Pos, type RichesQuery, type RichesResult } from '@et/shared';
import { findBody, fromDump, fromSearchHit, infoOf } from './bodies.ts';
import { isBody } from '../colony/finder.ts';
import { poiBody, pointsOf, snapWindow } from './pois.ts';
import { richesForm, richesResult } from './riches.ts';

const DUMP = 'https://spansh.co.uk/api/dump/';
const RECORD = 'https://spansh.co.uk/api/system/';
const SEARCH = 'https://spansh.co.uk/api/bodies/search';
const NAMES = 'https://spansh.co.uk/api/search?q=';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const SYSTEM_TTL_MS = 6 * 3600e3;
const FIND_TTL_MS = 30 * 60e3;
const MAX_CACHED = 60;
const POI_TTL_MS = 12 * 3600e3;
const RICHES = 'https://spansh.co.uk/api/riches/route';
const RESULTS = 'https://spansh.co.uk/api/results/';
const RICHES_TTL_MS = 30 * 60e3;
/** A route takes Spansh a few seconds; it is looked at every 2 s for this long. */
const RICHES_WAIT_MS = 60e3;
/** Sites come whole, a page of 100 at a time: more pages than the sets need (Guardian 4, Thargoid 6 on 2026-11-03). */
const SITE_PAGES = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'Spansh does not know this system yet' : `Spansh answered ${res.status}`);
  return res.json() as Promise<any>;
}

export class ExploreService {
  private systems = new Map<number, { at: number; value: ExploreSystem }>();
  private names = new Map<string, number>();
  private finds = new Map<string, { at: number; value: ExploreFindResult }>();
  private poiCache = new Map<string, { at: number; value: PoiResult }>();
  private riches_ = new Map<string, { at: number; value: RichesResult }>();
  private positions = new Map<string, Pos>();
  /** Calls to Spansh go one after the other. */
  private chain: Promise<unknown> = Promise.resolve();

  private queue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.then(() => sleep(300), () => sleep(300));
    return run;
  }

  /** A system's id64 from its name (Spansh's search): 0 when Spansh has no system by that name. */
  resolve(name: string): Promise<number> {
    const q = name.trim();
    const hit = this.names.get(q.toLowerCase());
    if (hit) return Promise.resolve(hit);
    return this.queue(async () => {
      const res = await request(NAMES + encodeURIComponent(q));
      const found = (Array.isArray(res?.results) ? res.results : []).find(
        (r: any) => r?.type === 'system' && String(r?.record?.name ?? '').toLowerCase() === q.toLowerCase(),
      );
      const id64 = Number(found?.record?.id64) || 0;
      if (id64) this.names.set(q.toLowerCase(), id64);
      return id64;
    });
  }

  /** The system's bodies; `fresh` skips the cache (a rescan since). */
  system(id64: number, fresh = false): Promise<ExploreSystem> {
    const hit = this.systems.get(id64);
    if (hit && !fresh && Date.now() - hit.at < SYSTEM_TTL_MS) return Promise.resolve(hit.value);
    return this.queue(async () => {
      const dump = await request(DUMP + id64);
      // the dump has no scan values; the system record does, by body name (a failure only leaves them at 0)
      const record = await request(RECORD + id64).catch(() => null);
      const values = new Map<string, { scan: number; map: number }>(
        (record?.record?.bodies ?? []).map((b: any) => [String(b.name), { scan: Number(b.estimated_scan_value) || 0, map: Number(b.estimated_mapping_value) || 0 }]),
      );
      const sys = dump?.system;
      const bodies = (sys?.bodies ?? []).filter(isBody).map((b: any) => fromDump(b, values.get(String(b.name))));
      const value: ExploreSystem = {
        id64,
        name: String(sys?.name ?? ''),
        pos: [Number(sys?.coords?.x) || 0, Number(sys?.coords?.y) || 0, Number(sys?.coords?.z) || 0],
        info: infoOf(record?.record),
        bodies,
        bodyCount: Number(sys?.bodyCount) || bodies.length,
        fetchedAt: new Date().toISOString(),
      };
      this.systems.set(id64, { at: Date.now(), value });
      if (this.systems.size > MAX_CACHED) this.systems.delete(this.systems.keys().next().value!);
      return value;
    });
  }

  find(q: ExploreFindQuery): Promise<ExploreFindResult> {
    const key = JSON.stringify(q);
    const hit = this.finds.get(key);
    if (hit && Date.now() - hit.at < FIND_TTL_MS) return Promise.resolve(hit.value);
    return this.queue(async () => {
      const res = await request(SEARCH, findBody(q));
      const value: ExploreFindResult = {
        query: q,
        total: Number(res?.count) || 0,
        targets: (Array.isArray(res?.results) ? res.results : []).map(fromSearchHit),
        fetchedAt: new Date().toISOString(),
      };
      this.finds.set(key, { at: Date.now(), value });
      if (this.finds.size > MAX_CACHED) this.finds.delete(this.finds.keys().next().value!);
      return value;
    });
  }

  /** Stars (a window around a point) or sites (the whole set) for the galaxy map. Kept in memory for 12 hours. */
  pois(q: PoiQuery): Promise<PoiResult> {
    const windowed = POI_WINDOWED.includes(q.kind);
    const window = windowed ? snapWindow(q.center ?? [0, 0, 0], q.radius ?? 200) : null;
    const key = windowed ? `${q.kind}|${window!.center.join(',')}|${window!.radius}` : q.kind;
    const hit = this.poiCache.get(key);
    if (hit && Date.now() - hit.at < POI_TTL_MS) return Promise.resolve(hit.value);
    return this.queue(async () => {
      let total = 0;
      let rows: unknown[] = [];
      for (let page = 0; page < (windowed ? 1 : SITE_PAGES); page++) {
        const res = await request(SEARCH, poiBody(q, page));
        const got = Array.isArray(res?.results) ? res.results : [];
        total = Number(res?.count) || total;
        rows = rows.concat(got);
        if (got.length < (windowed ? POI_WINDOW_MAX : 100)) break;
        if (!windowed) await sleep(300);
      }
      const points = pointsOf(q.kind, rows);
      const value: PoiResult = {
        kind: q.kind,
        points,
        total: windowed ? total : points.length,
        more: windowed && rows.length >= POI_WINDOW_MAX,
        window,
        fetchedAt: new Date().toISOString(),
      };
      this.poiCache.set(key, { at: Date.now(), value });
      if (this.poiCache.size > MAX_CACHED) this.poiCache.delete(this.poiCache.keys().next().value!);
      return value;
    });
  }

  /** A system's coordinates from its name (Spansh's search record); null when Spansh knows no such system. */
  position(name: string): Promise<Pos | null> {
    const q = name.trim();
    const hit = this.positions.get(q.toLowerCase());
    if (hit) return Promise.resolve(hit);
    return this.queue(async () => {
      const res = await request(NAMES + encodeURIComponent(q));
      const r = (Array.isArray(res?.results) ? res.results : []).find(
        (x: any) => x?.type === 'system' && String(x?.record?.name ?? '').toLowerCase() === q.toLowerCase(),
      )?.record;
      if (!r || ![r.x, r.y, r.z].every((v) => Number.isFinite(Number(v)))) return null;
      const pos: Pos = [Number(r.x), Number(r.y), Number(r.z)];
      this.positions.set(q.toLowerCase(), pos);
      return pos;
    });
  }

  /** A road to riches (a loop from the system): Spansh plans it as a job, so the answer is waited for. */
  riches(q: RichesQuery): Promise<RichesResult> {
    const key = JSON.stringify(q);
    const hit = this.riches_.get(key);
    if (hit && Date.now() - hit.at < RICHES_TTL_MS) return Promise.resolve(hit.value);
    return this.queue(async () => {
      const res = await fetch(RICHES, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: richesForm(q).toString(),
        signal: AbortSignal.timeout(30000),
      });
      const job = res.ok ? ((await res.json()) as any)?.job : '';
      if (!job) throw new Error(res.status === 400 || res.status === 422 ? 'Spansh does not know this system' : `Spansh answered ${res.status}`);
      const until = Date.now() + RICHES_WAIT_MS;
      while (Date.now() < until) {
        await sleep(2000);
        const out = await request(RESULTS + job);
        if (out?.error) throw new Error(String(out.error));
        if (Array.isArray(out?.result)) {
          const value = richesResult(q, out.result);
          if (value.stops.length < 2) throw new Error('Spansh found no road to riches from there');
          this.riches_.set(key, { at: Date.now(), value });
          if (this.riches_.size > MAX_CACHED) this.riches_.delete(this.riches_.keys().next().value!);
          return value;
        }
      }
      throw new Error('Spansh is taking too long to plan the route');
    });
  }
}
