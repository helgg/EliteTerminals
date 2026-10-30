// Markets near a reference system, from Spansh's station search, cached in memory and on disk.
// Spansh returns each station with its outfitting too (tens of KB each), so pages are fetched one
// at a time with progress, only markets are kept, and a scan is reused for a while.
import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TradeMarket } from '@et/shared';

const ENDPOINT = 'https://spansh.co.uk/api/stations/search';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const PAGE_SIZE = 50;
const MAX_PAGES = 12;
const REUSE_MS = 30 * 60e3;
const SPACING_MS = 500;

const STATION_TYPES = [
  'Coriolis Starport', 'Orbis Starport', 'Ocellus Starport', 'Asteroid base', 'Outpost',
  'Planetary Port', 'Planetary Outpost', 'Mega ship', 'Dodec Starport', 'Settlement',
];
const CARRIER_TYPES = ['Drake-Class Carrier'];

export interface ScanParams {
  reference: string;
  /** Around these coordinates instead of a system (the spheres of an A → B corridor). */
  coords?: [number, number, number];
  radius: number;
  maxAgeH: number;
  carriers: boolean;
  /** No page-by-page progress: the caller reports its own. */
  quiet?: boolean;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Maps one Spansh station-search result. Pure, for tests. */
export function fromSpanshStation(x: any): TradeMarket {
  return {
    marketId: num(x.market_id),
    station: str(x.name),
    system: str(x.system_name),
    systemId64: num(x.system_id64),
    pos: [num(x.system_x), num(x.system_y), num(x.system_z)],
    ls: num(x.distance_to_arrival),
    type: str(x.type),
    planetary: x.is_planetary === true,
    pads: { s: num(x.small_pads), m: num(x.medium_pads), l: num(x.large_pads) },
    state: str(x.controlling_minor_faction_state),
    updatedAt: str(x.market_updated_at),
    source: 'spansh',
    // Spansh lists every commodity (~350); keep only what can be bought or sold here.
    items: (x.market ?? [])
      .map((i: any) => ({
        name: str(i.commodity), buy: num(i.buy_price), sell: num(i.sell_price), supply: num(i.supply), demand: num(i.demand),
      }))
      .filter((i: TradeMarket['items'][number]) => (i.buy > 0 && i.supply > 0) || (i.sell > 0 && i.demand > 0)),
  };
}

export function searchBody(p: ScanParams, page: number, now = Date.now()) {
  const filters: Record<string, unknown> = {
    has_market: { value: true },
    distance: { min: 0, max: p.radius },
    type: { value: p.carriers ? [...STATION_TYPES, ...CARRIER_TYPES] : STATION_TYPES },
  };
  if (p.maxAgeH) {
    filters.market_updated_at = {
      comparison: '<=>',
      value: [new Date(now - p.maxAgeH * 3.6e6).toISOString(), new Date(now + 60e3).toISOString()],
    };
  }
  const around = p.coords
    ? { reference_coords: { x: p.coords[0], y: p.coords[1], z: p.coords[2] } }
    : { reference_system: p.reference };
  return { filters, sort: [{ distance: { direction: 'asc' } }], ...around, size: PAGE_SIZE, page };
}

type Scan = { key: string; at: number; markets: TradeMarket[] };

export class MarketScanner extends EventEmitter {
  private last: Scan | null = null;
  private inFlight: Promise<TradeMarket[]> | null = null;
  readonly cacheFile: string;
  /** Most stations one scan returns. */
  readonly cap = PAGE_SIZE * MAX_PAGES;

  constructor(cacheDir: string) {
    super();
    this.cacheFile = join(cacheDir, 'trade-markets.json');
  }

  async load() {
    try {
      this.last = JSON.parse(await readFile(this.cacheFile, 'utf8'));
    } catch {
      // nothing cached yet
    }
  }

  /** Markets from the last scan (also after a restart, from the disk cache). */
  cached(): TradeMarket[] {
    return this.last?.markets ?? [];
  }

  /** Same reference and a radius/age at least as wide as asked → reuse; otherwise fetch again. */
  async scan(p: ScanParams, force = false): Promise<TradeMarket[]> {
    const key = `v2|${p.coords?.map((v) => v.toFixed(2)).join(',') ?? p.reference}|${p.radius}|${p.maxAgeH}|${p.carriers}`;
    if (!force && this.last && this.last.key === key && Date.now() - this.last.at < REUSE_MS) return this.last.markets;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchAll(p)
      .then(async (markets) => {
        this.last = { key, at: Date.now(), markets };
        await mkdir(join(this.cacheFile, '..'), { recursive: true });
        await writeFile(this.cacheFile, JSON.stringify(this.last));
        return markets;
      })
      .finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async fetchAll(p: ScanParams): Promise<TradeMarket[]> {
    const out: TradeMarket[] = [];
    let total = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(searchBody(p, page)),
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`Spansh answered ${res.status}`);
      const body = (await res.json()) as any;
      total = Math.min(body.count ?? 0, PAGE_SIZE * MAX_PAGES);
      const results = body.results ?? [];
      out.push(...results.map(fromSpanshStation));
      if (!p.quiet) this.emit('progress', { loaded: out.length, total, done: false });
      if (results.length < PAGE_SIZE || out.length >= total) break;
      await new Promise((r) => setTimeout(r, SPACING_MS));
    }
    return out;
  }
}
