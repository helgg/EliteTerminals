// Trade engine: from a set of markets near the player, every profitable A→B pair and per-commodity quotes.
// Pure: no I/O, so the maths can be tested on small hand-made markets.
import type {
  CommodityQuote, TradeEnd, TradeLeg, TradeMarket, TradeQuery, TradeResult, TradeRoute,
} from '@et/shared';

/** Seconds per hyperspace jump, including charge, jump tunnel and re-aligning. */
export const JUMP_SECONDS = 50;
/** Approach, docking request, landing, buying/selling and launching. */
export const DOCK_SECONDS = 120;
const MAX_ROUTES = 400;
const QUOTES_PER_SIDE = 20;
const LOOP_CANDIDATES = 150;

/**
 * Rough supercruise time to a station `ls` light-seconds from the arrival star.
 * Fitted to ~1.5 min at 1 000 ls, ~3.5 min at 10 000 ls, ~8 min at 100 000 ls.
 */
export function supercruiseSeconds(ls: number): number {
  return ls > 0 ? 20 + 4.5 * ls ** 0.4 : 0;
}

/** Commodity key shared by Spansh names ("Basic Medicines") and journal names ("$basicmedicines_name;"). */
export function commodityKey(name: string): string {
  const k = name.toLowerCase().replace(/^\$/, '').replace(/_name;$/, '').replace(/[^a-z0-9]/g, '');
  return ALIASES[k] ?? k;
}
// Journal internal names that differ from the display name once normalised.
const ALIASES: Record<string, string> = {
  lowtemperaturediamond: 'lowtemperaturediamonds',
  comercialsamples: 'commercialsamples',
  drones: 'limpet',
  agriculturalmedicines: 'agrimedicines',
  hazardousenvironmentsuits: 'hesuits',
  usscargoblackbox: 'blackbox',
};

const dist = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const padOf = (m: TradeMarket) => (m.pads.l ? 'L' : m.pads.m ? 'M' : m.pads.s ? 'S' : '-');
const PAD_RANK: Record<string, number> = { S: 1, M: 2, L: 3, '-': 0 };

export function acceptsMarket(m: TradeMarket, q: TradeQuery, now: number): boolean {
  if (PAD_RANK[padOf(m)] < PAD_RANK[q.pad]) return false;
  if (!q.planetary && m.planetary) return false;
  if (!q.carriers && /carrier/i.test(m.type)) return false;
  if (q.maxLs && m.ls > q.maxLs) return false;
  if (q.maxAgeH && ageHours(m, now) > q.maxAgeH) return false;
  return m.items.length > 0;
}

const ageHours = (m: TradeMarket, now: number) => Math.max(0, (now - Date.parse(m.updatedAt)) / 3.6e6);

function end(m: TradeMarket, me: [number, number, number], now: number): TradeEnd {
  return {
    marketId: m.marketId, station: m.station, system: m.system, ls: m.ls, type: m.type, pad: padOf(m),
    planetary: m.planetary, fromMe: dist(me, m.pos), ageH: ageHours(m, now),
  };
}

/** Best single commodity to carry from `a` to `b` with the hold and money available. */
export function bestLeg(a: TradeMarket, b: TradeMarket, q: TradeQuery): TradeLeg | null {
  const sells = new Map(b.items.filter((i) => i.sell > 0 && i.demand > 0).map((i) => [commodityKey(i.name), i]));
  let best: TradeLeg | null = null;
  for (const i of a.items) {
    if (i.buy <= 0 || i.supply <= 0) continue;
    const o = sells.get(commodityKey(i.name));
    if (!o || o.sell <= i.buy) continue;
    const affordable = q.capital > 0 ? Math.floor(q.capital / i.buy) : q.cargo;
    const amount = Math.min(q.cargo, i.supply, o.demand, affordable);
    if (amount <= 0) continue;
    const profit = o.sell - i.buy;
    const total = profit * amount;
    if (!best || total > best.total) {
      best = { commodity: i.name, buy: i.buy, sell: o.sell, profit, amount, total, supply: i.supply, demand: o.demand };
    }
  }
  return best;
}

export function legSeconds(hopLy: number, jumpRange: number, dstLs: number): { jumps: number; seconds: number } {
  const jumps = hopLy < 0.01 ? 0 : Math.max(1, Math.ceil(hopLy / Math.max(jumpRange, 1)));
  return { jumps, seconds: jumps * JUMP_SECONDS + supercruiseSeconds(dstLs) + DOCK_SECONDS };
}

export function computeTrade(
  markets: TradeMarket[],
  q: TradeQuery,
  me: { pos: [number, number, number]; systemId64: number; marketId: number },
  reference: string,
  now = Date.now(),
): TradeResult {
  const usable = markets.filter((m) => acceptsMarket(m, q, now));
  const sources = q.fromHere
    ? usable.filter((m) => (me.marketId ? m.marketId === me.marketId : m.systemId64 === me.systemId64))
    : usable;

  const routes: TradeRoute[] = [];
  for (const a of sources) {
    for (const b of usable) {
      if (a.marketId === b.marketId) continue;
      const leg = bestLeg(a, b, q);
      if (!leg) continue;
      const hopLy = dist(a.pos, b.pos);
      const { jumps, seconds } = legSeconds(hopLy, q.jumpRange, b.ls);
      routes.push({
        id: `${a.marketId}-${b.marketId}`,
        src: end(a, me.pos, now),
        dst: end(b, me.pos, now),
        hopLy, jumps, leg, back: null,
        pct: (leg.profit / leg.buy) * 100,
        legSeconds: seconds,
        perHour: (leg.total / seconds) * 3600,
        loopPerHour: 0,
      });
    }
  }

  routes.sort((x, y) => y.perHour - x.perHour);
  const kept = routes.slice(0, MAX_ROUTES);

  // Loops: for the strongest pairs, what can be carried back.
  const byId = new Map(usable.map((m) => [m.marketId, m]));
  for (const r of kept.slice(0, LOOP_CANDIDATES)) {
    const back = bestLeg(byId.get(r.dst.marketId)!, byId.get(r.src.marketId)!, q);
    r.back = back;
    const backSeconds = legSeconds(r.hopLy, q.jumpRange, r.src.ls).seconds;
    r.loopPerHour = ((r.leg.total + (back?.total ?? 0)) / (r.legSeconds + backSeconds)) * 3600;
  }

  return {
    query: q,
    reference,
    stations: usable.length,
    fetchedAt: new Date(now).toISOString(),
    routes: kept,
    commodities: commodityNames(usable),
  };
}

/** Display names of every commodity traded in these markets (English names from Spansh win). */
export function commodityNames(markets: TradeMarket[]): string[] {
  const names = new Map<string, string>();
  for (const m of markets) {
    for (const i of m.items) {
      const key = commodityKey(i.name);
      if (!names.has(key) || m.source === 'spansh') names.set(key, i.name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/** Where to buy a commodity cheapest and sell it dearest, among the markets that pass the filters. */
export function commodityQuotes(
  markets: TradeMarket[], name: string, q: TradeQuery, me: [number, number, number], now = Date.now(),
): { buy: CommodityQuote[]; sell: CommodityQuote[] } {
  const key = commodityKey(name);
  const buy: CommodityQuote[] = [];
  const sell: CommodityQuote[] = [];
  for (const m of markets) {
    if (!acceptsMarket(m, q, now)) continue;
    const i = m.items.find((x) => commodityKey(x.name) === key);
    if (!i) continue;
    const e = end(m, me, now);
    if (i.buy > 0 && i.supply > 0) buy.push({ commodity: i.name, price: i.buy, volume: i.supply, end: e });
    if (i.sell > 0 && i.demand > 0) sell.push({ commodity: i.name, price: i.sell, volume: i.demand, end: e });
  }
  buy.sort((x, y) => x.price - y.price || x.end.fromMe - y.end.fromMe);
  sell.sort((x, y) => y.price - x.price || x.end.fromMe - y.end.fromMe);
  return { buy: buy.slice(0, QUOTES_PER_SIDE), sell: sell.slice(0, QUOTES_PER_SIDE) };
}
