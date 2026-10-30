// EXPLORE service: a system's bodies from Spansh (the dump for the detail, the system record for the scan values)
// and the search for places to go (Spansh's body search). Cached in memory; Spansh is a free service, so one at a time.
import type { ExploreFindQuery, ExploreFindResult, ExploreSystem } from '@et/shared';
import { findBody, fromDump, fromSearchHit } from './bodies.ts';
import { isBody } from '../colony/finder.ts';

const DUMP = 'https://spansh.co.uk/api/dump/';
const RECORD = 'https://spansh.co.uk/api/system/';
const SEARCH = 'https://spansh.co.uk/api/bodies/search';
const NAMES = 'https://spansh.co.uk/api/search?q=';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const SYSTEM_TTL_MS = 6 * 3600e3;
const FIND_TTL_MS = 30 * 60e3;
const MAX_CACHED = 60;

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
}
