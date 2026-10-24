// Glue between the HTTP API, the market scanner and the engine; merges the player's own Market.json.
import type { EdState, MarketSnapshot, TradeMarket, TradeQuery, TradeResult } from '@et/shared';
import { commodityKey, commodityQuotes, computeTrade } from './engine.ts';
import type { MarketScanner } from './markets.ts';

export class TradeService {
  private markets: TradeMarket[] = [];
  /** Last result, so a reloaded or second client can show it without scanning again. */
  last: TradeResult | null = null;
  readonly scanner: MarketScanner;
  readonly state: () => EdState;
  readonly visited: () => MarketSnapshot[];

  constructor(scanner: MarketScanner, state: () => EdState, visited: () => MarketSnapshot[] = () => []) {
    this.scanner = scanner;
    this.state = state;
    this.visited = visited;
  }

  private local(fetched: TradeMarket[]) {
    return withLocalMarkets(fetched, [this.state().market, ...this.visited()]);
  }

  async routes(q: TradeQuery, force = false): Promise<TradeResult> {
    const s = this.state();
    if (!s.location.system) throw new Error('current system unknown (start the game)');
    const fetched = await this.scanner.scan(
      { reference: s.location.system, radius: q.radius, maxAgeH: q.maxAgeH, carriers: q.carriers }, force,
    );
    this.markets = this.local(fetched);
    this.last = computeTrade(this.markets, q, me(s), s.location.system);
    return this.last;
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

/** The player's own Market.json snapshots are newer than most crowd-sourced copies of those stations: use them. */
export function withLocalMarkets(markets: TradeMarket[], snapshots: MarketSnapshot[]): TradeMarket[] {
  const byId = new Map<number, MarketSnapshot>();
  for (const m of snapshots) {
    const seen = byId.get(m.marketId);
    if (m.marketId && m.items.length && (!seen || Date.parse(m.updatedAt) > Date.parse(seen.updatedAt))) byId.set(m.marketId, m);
  }
  if (!byId.size) return markets;
  return markets.map((remote) => {
    const local = byId.get(remote.marketId);
    if (!local || Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) return remote;
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
