// Glue between the HTTP API, the market scanner and the engine; merges the player's own Market.json.
import type { CommodityQuote, EdState, MarketSnapshot, MiningSellQuery, TradeMarket, TradeQuery, TradeResult } from '@et/shared';
import { commodityKey, commodityQuotes, computeTrade } from './engine.ts';
import type { MarketScanner } from './markets.ts';
import type { NearQuery, PriceDb } from '../prices/db.ts';

/** A Spansh scan of a region is trusted this long; EDDN keeps its prices fresh in between. */
const COVERED_MS = 24 * 3600e3;

export class TradeService {
  private markets: TradeMarket[] = [];
  /** Last result, so a reloaded or second client can show it without scanning again. */
  last: TradeResult | null = null;
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

  /**
   * Markets around the player: from the local database when a Spansh scan already covered the region
   * (EDDN keeps it fresh), otherwise from Spansh, whose results then go into the database.
   */
  /** The system to scan around: the one asked for, or the current one. */
  private reference(s: EdState, q: TradeQuery) {
    const asked = q.reference?.trim() ?? '';
    if (!asked || asked.toLowerCase() === s.location.system.toLowerCase()) {
      return { name: s.location.system, id64: s.location.address, pos: s.location.pos, remote: false };
    }
    const sys = this.db?.system(asked);
    if (!sys) throw new Error(`unknown system "${asked}": pick it from the list`);
    return { ...sys, remote: true };
  }

  private async around(ref: { name: string; pos: [number, number, number] }, q: TradeQuery, force: boolean): Promise<TradeMarket[]> {
    const near: NearQuery = { pos: ref.pos, radius: q.radius, maxAgeH: q.maxAgeH, carriers: q.carriers };
    if (this.db && !force && this.db.covered(near, Date.now() - COVERED_MS)) return this.db.near(near);
    const fetched = await this.scanner.scan(
      { reference: ref.name, radius: q.radius, maxAgeH: q.maxAgeH, carriers: q.carriers }, force,
    );
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
    // far from home, EXPORT / IMPORT mean that system; distances stay measured from the player
    const from = ref.remote ? { pos: s.location.pos, systemId64: ref.id64, marketId: 0 } : me(s);
    this.last = computeTrade(this.markets, q, from, ref.name);
    return this.last;
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
