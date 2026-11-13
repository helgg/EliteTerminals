// ENGINEERING: the nearest material traders (Raw, Manufactured, Encoded) around a system, from Spansh's station search.
// Cached in memory for a while: the traders of a station do not change, only what the search is centred on.
import type { MaterialCategory, TraderQuery, TraderResult, TraderStation } from '@et/shared';

const ENDPOINT = 'https://spansh.co.uk/api/stations/search';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const SIZE = 15;
const TTL_MS = 30 * 60e3;
const MAX_CACHED = 40;

export const TRADER_KINDS: MaterialCategory[] = ['Raw', 'Manufactured', 'Encoded'];

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The request body: stations with that kind of trader, nearest to the reference first. Pure, for tests. */
export function traderBody(q: TraderQuery) {
  return {
    filters: { material_trader: { value: [q.kind] } },
    sort: [{ distance: { direction: 'asc' } }],
    reference_system: q.reference,
    size: SIZE,
    page: 0,
  };
}

/** One Spansh station-search result → a trader station. Pure, for tests. */
export function fromSpanshTrader(x: any): TraderStation {
  return {
    station: str(x.name),
    system: str(x.system_name),
    ly: num(x.distance),
    ls: num(x.distance_to_arrival),
    type: str(x.type),
    planetary: x.is_planetary === true,
    pad: num(x.large_pads) > 0 ? 'L' : num(x.medium_pads) > 0 ? 'M' : num(x.small_pads) > 0 ? 'S' : '',
    updatedAt: str(x.updated_at),
  };
}

export class TraderFinder {
  private cache = new Map<string, { at: number; value: TraderResult }>();

  async find(q: TraderQuery): Promise<TraderResult> {
    const key = `${q.kind}|${q.reference.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(traderBody(q)),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(res.status === 404 ? `Spansh knows no system called "${q.reference}"` : `Spansh answered ${res.status}`);
    const body = (await res.json()) as any;
    const results: any[] = Array.isArray(body?.results) ? body.results : [];
    const value: TraderResult = {
      query: q,
      total: num(body?.count) || results.length,
      stations: results.map(fromSpanshTrader),
      fetchedAt: new Date().toISOString(),
    };
    if (this.cache.size >= MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}
