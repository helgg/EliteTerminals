// Glue between the HTTP API, the market scanner and the engine; merges the player's own Market.json.
import type {
  ColonyMarkets, CommodityQuote, EdState, MarketSnapshot, MiningSellQuery, StationOption, TradeMarket, TradePathQuery, TradePathResult,
  TradeQuery, TradeResult,
} from '@et/shared';
import { acceptsMarket, commodityKey, commodityQuotes, computeTrade, end } from './engine.ts';
import type { MarketScanner } from './markets.ts';
import { computePath, corridorSpheres, MAX_PATH_LY } from './path.ts';
import { nameKey, type NearQuery, type PriceDb } from '../prices/db.ts';

/** A Spansh scan of a region is trusted this long; EDDN keeps its prices fresh in between. */
const COVERED_MS = 24 * 3600e3;

export class TradeService {
  private markets: TradeMarket[] = [];
  /** Last result, so a reloaded or second client can show it without scanning again. */
  last: TradeResult | null = null;
  lastPath: TradePathResult | null = null;
  /** Systems whose station list was fetched from Spansh, and when. */
  private listed = new Map<string, number>();
  readonly scanner: MarketScanner;
  readonly state: () => EdState;
  readonly visited: () => MarketSnapshot[];
  readonly db: PriceDb | null;

  constructor(scanner: MarketScanner, state: () => EdState, visited: () => MarketSnapshot[] = () => [], db: PriceDb | null = null) {
    this.scanner = scanner;
    this.state = state;
    this.visited = visited;
    this.db = db;
  }

  /** The system to scan around: the one asked for, or the current one. */
  private reference(s: EdState, q: TradeQuery) {
    return this.place(s, q.reference ?? '');
  }

  private place(s: EdState, name: string) {
    const asked = name.trim();
    if (!asked || asked.toLowerCase() === s.location.system.toLowerCase()) {
      return { name: s.location.system, id64: s.location.address, pos: s.location.pos, remote: false };
    }
    const sys = this.db?.system(asked);
    if (!sys) throw new Error(`unknown system "${asked}": pick it from the list`);
    return { ...sys, remote: true };
  }

  /**
   * Markets around a system (or, with no name, a point): from the local database when a Spansh scan already
   * covered the region (EDDN keeps it fresh), otherwise from Spansh, whose results then go into the database.
   */
  private async around(
    ref: { name: string; pos: [number, number, number] }, q: TradeQuery, force: boolean, quiet = false,
  ): Promise<TradeMarket[]> {
    const near: NearQuery = { pos: ref.pos, radius: q.radius, maxAgeH: q.maxAgeH, carriers: q.carriers };
    if (this.db && !force && this.db.covered(near, Date.now() - COVERED_MS)) return this.db.near(near);
    const fetched = await this.scanner.scan({
      reference: ref.name, coords: ref.name ? undefined : ref.pos,
      radius: q.radius, maxAgeH: q.maxAgeH, carriers: q.carriers, quiet,
    }, force);
    if (!this.db) return fetched;
    this.db.putSpansh(fetched);
    // Spansh pages stop at a few hundred stations, nearest first: a cut-off scan covers less than asked
    const reach = fetched.length >= this.scanner.cap
      ? Math.max(0, ...fetched.map((m) => Math.hypot(m.pos[0] - near.pos[0], m.pos[1] - near.pos[1], m.pos[2] - near.pos[2])))
      : near.radius;
    this.db.markScanned({ ...near, radius: reach });
    return this.db.near(near);
  }

  private local(fetched: TradeMarket[]) {
    const s = this.state();
    return withLocalMarkets(fetched, [s.market, ...this.visited()], s.flags.docked ? s.market.marketId : 0);
  }

  async routes(q: TradeQuery, force = false): Promise<TradeResult> {
    const s = this.state();
    if (!s.location.system) throw new Error('current system unknown (start the game)');
    const ref = this.reference(s, q);
    const fetched = await this.around(ref, q, force);
    this.markets = this.local(fetched);
    // far from home, EXPORT / IMPORT mean that system (or the station picked there); distances stay measured from the player
    const from = ref.remote ? { pos: s.location.pos, systemId64: ref.id64, marketId: 0 } : me(s);
    if (q.referenceStation) from.marketId = q.referenceStation;
    this.last = computeTrade(this.markets, q, from, ref.name);
    return this.last;
  }

  /**
   * A → B: the markets of the corridor between both systems (Spansh spheres along the line, or the database where
   * it already covers them), then the best trade path for each number of stops.
   */
  async path(q: TradePathQuery, force = false): Promise<TradePathResult> {
    const s = this.state();
    if (!q.to?.system?.trim()) throw new Error('pick the destination system (TO)');
    if (!q.from?.system?.trim() && !s.location.system) throw new Error('pick the start system (FROM)');
    const a = this.place(s, q.from?.system ?? '');
    const b = this.place(s, q.to.system);
    const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
    if (d > MAX_PATH_LY) {
      throw new Error(`${a.name.toUpperCase()} → ${b.name.toUpperCase()} is ${Math.round(d)}ly: trade paths go up to ${MAX_PATH_LY}ly`);
    }
    const { centres, radius } = corridorSpheres(a.pos, b.pos, q.radius);
    const found = new Map<number, TradeMarket>();
    const progress = (loaded: number) => this.scanner.emit('progress', { loaded, total: centres.length, done: false });
    progress(0);
    for (const [i, pos] of centres.entries()) {
      for (const m of await this.around({ name: '', pos }, { ...q, radius }, force, true)) found.set(m.marketId, m);
      progress(i + 1);
    }
    // A's and B's own stations whatever the age of their prices (the engine lets them through)
    for (const p of [a, b]) {
      await this.stations(p.name);
      for (const m of this.db?.near({ pos: p.pos, radius: 0.5, maxAgeH: 0, carriers: q.carriers }) ?? []) found.set(m.marketId, m);
    }
    this.lastPath = computePath(this.local([...found.values()]), q, a, b, s.location.pos);
    return this.lastPath;
  }

  /**
   * COLONY: markets around a construction site with what it still needs in stock, the ones carrying most of the
   * list first (a full hold from one stop beats a short trip for one commodity).
   */
  async colonyMarkets(marketId: number, pos: [number, number, number], needs: { name: string; tons: number }[], q: TradeQuery): Promise<ColonyMarkets> {
    const markets = this.local(await this.around({ name: '', pos }, q, false, true));
    const keys = new Map(needs.map((n) => [commodityKey(n.name), n.name]));
    const found = new Set<string>();
    const rows: ColonyMarkets['markets'] = [];
    const now = Date.now();
    for (const m of markets) {
      if (!acceptsMarket(m, q, now)) continue;
      const items = m.items
        .filter((i) => i.buy > 0 && i.supply > 0 && keys.has(commodityKey(i.name)))
        .map((i) => ({ name: keys.get(commodityKey(i.name))!, price: i.buy, stock: i.supply }));
      if (!items.length) continue;
      items.forEach((i) => found.add(i.name));
      rows.push({ end: end(m, pos, now), items });
    }
    rows.sort((a, b) => b.items.length - a.items.length || a.end.fromMe - b.end.fromMe);
    return {
      marketId, markets: rows.slice(0, 40), missing: needs.map((n) => n.name).filter((n) => !found.has(n)),
      fetchedAt: new Date(now).toISOString(),
    };
  }

  /** Stations with a market in a system, for the station pickers: Spansh once a day, the database otherwise. */
  async stations(system: string): Promise<StationOption[]> {
    const k = nameKey(system);
    if (!k || !this.db) return [];
    const at = this.listed.get(k) ?? 0;
    if (Date.now() - at > COVERED_MS) {
      try {
        const fetched = await this.scanner.scan({ reference: system, radius: 0.5, maxAgeH: 0, carriers: false, quiet: true });
        this.db.putSpansh(fetched.filter((m) => nameKey(m.system) === k));
        this.listed.set(k, Date.now());
      } catch {
        // offline: the stations the database already knows
      }
    }
    // carriers move: not a place to start or end at
    return this.db.stationsIn(system).filter((x) => !/carrier/i.test(x.type));
  }

  /** Best places to sell each commodity mined, around the current system (the same markets as a scan). */
  async sells(m: MiningSellQuery): Promise<Record<string, CommodityQuote[]>> {
    const s = this.state();
    if (!s.location.system) throw new Error('current system unknown (start the game)');
    const q: TradeQuery = {
      radius: m.radius, maxAgeH: m.maxAgeH, pad: m.pad, planetary: m.planetary, carriers: m.carriers,
      exportHere: false, importHere: false, states: [], hops: 1, maxLs: 0, minSupply: 0, minDemand: 0,
      cargo: 0, capital: 0, jumpRange: 0,
    };
    const markets = this.local(await this.around({ name: s.location.system, pos: s.location.pos }, q, false));
    return Object.fromEntries(m.names.map((name) => [name, commodityQuotes(markets, name, q, s.location.pos).sell]));
  }

  quotes(name: string, q: TradeQuery) {
    if (!this.markets.length) this.markets = this.local(this.scanner.cached());
    return commodityQuotes(this.markets, name, q, this.state().location.pos);
  }
}

const me = (s: EdState) => ({
  pos: s.location.pos,
  systemId64: s.location.address,
  marketId: s.flags.docked ? s.market.marketId : 0,
});

/**
 * The player's own Market.json snapshots are newer than most crowd-sourced copies of those stations: use them.
 * The station the player is docked at always uses its Market.json: it is what the game shows right now.
 */
export function withLocalMarkets(markets: TradeMarket[], snapshots: MarketSnapshot[], dockedAt = 0): TradeMarket[] {
  const byId = new Map<number, MarketSnapshot>();
  for (const m of snapshots) {
    const seen = byId.get(m.marketId);
    if (m.marketId && m.items.length && (!seen || Date.parse(m.updatedAt) > Date.parse(seen.updatedAt))) byId.set(m.marketId, m);
  }
  if (!byId.size) return markets;
  return markets.map((remote) => {
    const local = byId.get(remote.marketId);
    if (!local || (local.marketId !== dockedAt && Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt))) return remote;
    // Keep Spansh's English names where the commodity matches; journal names are localised.
    const names = new Map(remote.items.map((i) => [commodityKey(i.name), i.name]));
    return {
      ...remote,
      updatedAt: local.updatedAt,
      source: 'local' as const,
      items: local.items.map((i) => ({
        name: names.get(commodityKey(i.name)) ?? i.label,
        buy: i.buy, sell: i.sell, supply: i.stock, demand: i.demand,
        supplyBracket: i.stockBracket ?? 0, demandBracket: i.demandBracket ?? 0,
      })),
    };
  });
}

/** One snapshot: the current Market.json. */
export const withLocalMarket = (markets: TradeMarket[], s: EdState) => withLocalMarkets(markets, [s.market]);
