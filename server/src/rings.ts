// Planetary rings and their hotspots, from Spansh's public body search: the current system's rings, and the
// nearest rings with hotspots of a commodity (hotspot finder).
import { EventEmitter } from 'node:events';
import type { HotspotMatch, RingInfo, RingSignal } from '@et/shared';

const ENDPOINT = 'https://spansh.co.uk/api/bodies/search';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const PAGE_SIZE = 50;
/** Systems seldom have more than 150 bodies; stop there. */
const MAX_PAGES = 3;
const TTL_MS = 6 * 3600e3;
const RETRY_FAILED_MS = 60e3;

/** Commodities rings have hotspots of, with Spansh's names. */
export const HOTSPOT_COMMODITIES = [
  'Alexandrite', 'Benitoite', 'Bromellite', 'Grandidierite', 'Low Temperature Diamonds', 'Monazite', 'Musgravite',
  'Painite', 'Platinum', 'Rhodplumsite', 'Serendibite', 'Tritium', 'Void Opal',
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** One Spansh body → its rings. Pure, for tests. */
export function ringsOf(b: any): RingInfo[] {
  if (!Array.isArray(b?.rings)) return [];
  return b.rings.map((r: any) => ({
    name: str(r.name),
    body: str(b.name),
    type: str(r.type),
    reserve: str(b.reserve_level),
    ls: num(b.distance_to_arrival),
    signals: (Array.isArray(r.signals) ? r.signals : [])
      .map((x: any) => ({ name: str(x.name), count: num(x.count) }))
      .filter((x: RingSignal) => x.name && x.count > 0)
      .sort((x: RingSignal, y: RingSignal) => y.count - x.count),
    own: false,
  }));
}

export interface HotspotQuery {
  commodity: string;
  reference: string;
  radius: number;
  /** Hotspots of the commodity in one ring; 2+ means overlapping hotspots. */
  minCount: number;
  pristine: boolean;
}

export function hotspotBody(q: HotspotQuery, page: number) {
  const filters: Record<string, unknown> = {
    ring_signals: [{ name: q.commodity, value: [1, 99], comparison: '<=>' }],
    distance: { min: 0, max: q.radius },
  };
  if (q.pristine) filters.reserve_level = { value: ['Pristine'] };
  return { filters, reference_system: q.reference, sort: [{ distance: { direction: 'asc' } }], size: PAGE_SIZE, page };
}

/** Spansh results → one row per ring holding the commodity, nearest first. Pure, for tests. */
export function hotspotMatches(results: any[], q: Pick<HotspotQuery, 'commodity' | 'minCount'>): HotspotMatch[] {
  const out: HotspotMatch[] = [];
  for (const b of results) {
    for (const r of ringsOf(b)) {
      const count = r.signals.find((x) => x.name === q.commodity)?.count ?? 0;
      if (count < Math.max(1, q.minCount)) continue;
      out.push({
        system: str(b.system_name), body: r.body, ring: r.name, type: r.type, reserve: r.reserve,
        distance: num(b.distance), ls: r.ls, count, signals: r.signals,
      });
    }
  }
  return out;
}

async function search(body: unknown): Promise<{ count: number; results: any[] }> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Spansh body search: HTTP ${res.status}`);
  const json = (await res.json()) as any;
  return { count: num(json?.count), results: Array.isArray(json?.results) ? json.results : [] };
}

export class Rings extends EventEmitter {
  private cache = new Map<string, { rings: RingInfo[] | null; fetchedAt: number }>();

  /** The rings of a system, or null while unknown; asks Spansh once per TTL. */
  of(system: string): RingInfo[] | null {
    if (!system) return null;
    const key = system.toLowerCase();
    const e = this.cache.get(key);
    const age = e ? Date.now() - e.fetchedAt : Infinity;
    if (!e || age > (e.rings ? TTL_MS : RETRY_FAILED_MS)) void this.fetch(system, key);
    return e?.rings ?? null;
  }

  private async fetch(system: string, key: string) {
    const old = this.cache.get(key);
    this.cache.set(key, { rings: old?.rings ?? null, fetchedAt: Date.now() });
    try {
      const rings: RingInfo[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const { count, results } = await search({
          filters: { system_name: { value: system } },
          sort: [{ distance_to_arrival: { direction: 'asc' } }], size: PAGE_SIZE, page,
        });
        // the name filter matches loosely: keep this system's bodies only
        for (const b of results) if (str(b.system_name).toLowerCase() === key) rings.push(...ringsOf(b));
        if ((page + 1) * PAGE_SIZE >= count) break;
      }
      this.cache.set(key, { rings, fetchedAt: Date.now() });
      this.emit('change');
    } catch {
      // stays as it was; retried after RETRY_FAILED_MS
    }
  }

  async hotspots(q: HotspotQuery): Promise<HotspotMatch[]> {
    if (!HOTSPOT_COMMODITIES.includes(q.commodity)) throw new Error(`no hotspots of "${q.commodity}"`);
    const out: HotspotMatch[] = [];
    for (let page = 0; page < MAX_PAGES && out.length < 25; page++) {
      const { count, results } = await search(hotspotBody(q, page));
      out.push(...hotspotMatches(results, q));
      if ((page + 1) * PAGE_SIZE >= count) break;
    }
    return out.slice(0, 25);
  }
}
