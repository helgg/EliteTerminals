// Glue between the HTTP API, the market scanner and the engine; merges the player's own Market.json.
import type { EdState, TradeMarket, TradeQuery, TradeResult } from '@et/shared';
import { commodityKey, commodityQuotes, computeTrade } from './engine.ts';
import type { MarketScanner } from './markets.ts';

export class TradeService {
  private markets: TradeMarket[] = [];
  /** Last result, so a reloaded or second client can show it without scanning again. */
  last: TradeResult | null = null;
  readonly scanner: MarketScanner;
  readonly state: () => EdState;

  constructor(scanner: MarketScanner, state: () => EdState) {
    this.scanner = scanner;
    this.state = state;
  }

  async routes(q: TradeQuery, force = false): Promise<TradeResult> {
    const s = this.state();
    if (!s.location.system) throw new Error('sistema atual desconhecido (abra o jogo)');
    const fetched = await this.scanner.scan(
      { reference: s.location.system, radius: q.radius, maxAgeH: q.maxAgeH, carriers: q.carriers }, force,
    );
    this.markets = withLocalMarket(fetched, s);
    this.last = computeTrade(this.markets, q, me(s), s.location.system);
    return this.last;
  }

  quotes(name: string, q: TradeQuery) {
    if (!this.markets.length) this.markets = withLocalMarket(this.scanner.cached(), this.state());
    return commodityQuotes(this.markets, name, q, this.state().location.pos);
  }
}

const me = (s: EdState) => ({
  pos: s.location.pos,
  systemId64: s.location.address,
  marketId: s.flags.docked ? s.market.marketId : 0,
});

/** The player's last Market.json is newer than any crowd-sourced copy of that station: use it. */
export function withLocalMarket(markets: TradeMarket[], s: EdState): TradeMarket[] {
  const local = s.market;
  if (!local.marketId || !local.items.length) return markets;
  const remote = markets.find((m) => m.marketId === local.marketId);
  if (!remote || Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) return markets;
  // Keep Spansh's English names where the commodity matches; journal names are localised.
  const names = new Map(remote.items.map((i) => [commodityKey(i.name), i.name]));
  const merged: TradeMarket = {
    ...remote,
    updatedAt: local.updatedAt,
    source: 'local',
    items: local.items.map((i) => ({
      name: names.get(commodityKey(i.name)) ?? i.label,
      buy: i.buy, sell: i.sell, supply: i.stock, demand: i.demand,
    })),
  };
  return markets.map((m) => (m === remote ? merged : m));
}
