// Trade engine: from a set of markets near the player, every profitable A→B pair and per-commodity quotes.
// Pure: no I/O, so the maths can be tested on small hand-made markets.
import type {
  CommodityQuote, LegItem, TradeEnd, TradeLeg, TradeMarket, TradeQuery, TradeResult, TradeRoute,
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

// Per-market index, built once: what can be bought (with a numeric commodity id) and what is wanted, by id.
// The pair loop runs n² times, so it must not normalise names or allocate maps per pair.
type Item = TradeMarket['items'][number];
type Indexed = { buys: { id: number; i: Item }[]; sells: (Item | undefined)[] };
const IDS = new Map<string, number>();
const INDEX = new WeakMap<TradeMarket, Indexed>();
function indexed(m: TradeMarket): Indexed {
  let x = INDEX.get(m);
  if (!x) {
    x = { buys: [], sells: [] };
    for (const i of m.items) {
      const key = commodityKey(i.name);
      let id = IDS.get(key);
      if (id === undefined) IDS.set(key, (id = IDS.size));
      if (i.buy > 0 && i.supply > 0) x.buys.push({ id, i });
      if (i.sell > 0 && i.demand > 0) x.sells[id] = i;
    }
    INDEX.set(m, x);
  }
  return x;
}

/**
 * The most profitable load from `a` to `b`: the hold filled with a mix of commodities, each limited by
 * stock at `a`, demand at `b` and the money available (like Spansh: 2 t of gold + 1 182 t of silver).
 *
 * With only the hold as a limit, taking commodities by profit per ton is optimal. When money runs out
 * first, both limits bind; then the load is improved by swaps (cheap tons traded for dearer, more
 * profitable ones while the money lasts), starting from both greedy orders.
 */
export function bestLeg(a: TradeMarket, b: TradeMarket, q: TradeQuery): TradeLeg | null {
  const sells = indexed(b).sells;
  const minSupply = q.minSupply ?? 0;
  const minDemand = q.minDemand ?? 0;
  const options: LegItem[] = [];
  for (const { id, i } of indexed(a).buys) {
    const o = sells[id];
    if (!o || o.sell <= i.buy || i.supply < minSupply || o.demand < minDemand) continue;
    options.push({
      commodity: i.name, buy: i.buy, sell: o.sell, profit: o.sell - i.buy,
      amount: Math.min(i.supply, o.demand), supply: i.supply, demand: o.demand,
    });
  }
  if (!options.length) return null;

  const capital = q.capital > 0 ? q.capital : Infinity;
  const byTon = greedy(options, (x) => x.profit, q.cargo, capital);
  const spent = options.reduce((t, o, k) => t + o.buy * byTon[k], 0);
  if (capital - spent >= Math.max(...options.map((o) => o.buy))) return toLeg(options, byTon);

  // Money binds: refine both greedy loads and keep the better one.
  const a1 = improve(options, byTon, q.cargo, capital);
  const a2 = improve(options, greedy(options, (x) => x.profit / x.buy, q.cargo, capital), q.cargo, capital);
  return toLeg(options, profitOf(options, a1) >= profitOf(options, a2) ? a1 : a2);
}

/** Tons of each option, taken in `score` order until the hold or the money runs out. */
function greedy(options: LegItem[], score: (x: LegItem) => number, cargo: number, capital: number): number[] {
  const amounts = options.map(() => 0);
  let tons = cargo;
  let money = capital;
  for (const k of options.map((_, k) => k).sort((x, y) => score(options[y]) - score(options[x]))) {
    const n = Math.max(0, Math.min(options[k].amount, tons, Math.floor(money / options[k].buy)));
    amounts[k] = n;
    tons -= n;
    money -= n * options[k].buy;
  }
  return amounts;
}

/** Best single move each round: fill free tons, or swap tons of one commodity for a more profitable one. */
function improve(options: LegItem[], start: number[], cargo: number, capital: number): number[] {
  const amounts = [...start];
  for (let round = 0; round < 100; round++) {
    const tons = cargo - amounts.reduce((t, n) => t + n, 0);
    const money = capital - options.reduce((t, o, k) => t + o.buy * amounts[k], 0);
    let gain = 0;
    let move: [number, number, number] | null = null; // [to, from (-1 = free space), tons]
    options.forEach((h, k) => {
      const room = h.amount - amounts[k];
      if (room <= 0) return;
      const n = Math.min(room, tons, Math.floor(money / h.buy));
      if (n > 0 && n * h.profit > gain) {
        gain = n * h.profit;
        move = [k, -1, n];
      }
      options.forEach((l, j) => {
        if (j === k || !amounts[j] || l.profit >= h.profit) return;
        const dc = h.buy - l.buy;
        const m = Math.min(room, amounts[j], dc > 0 ? Math.floor(money / dc) : Infinity);
        if (m > 0 && m * (h.profit - l.profit) > gain) {
          gain = m * (h.profit - l.profit);
          move = [k, j, m];
        }
      });
    });
    if (!move) break;
    const [to, from, n] = move as [number, number, number];
    amounts[to] += n;
    if (from >= 0) amounts[from] -= n;
  }
  return amounts;
}

const profitOf = (options: LegItem[], amounts: number[]) => options.reduce((t, o, k) => t + o.profit * amounts[k], 0);

function toLeg(options: LegItem[], amounts: number[]): TradeLeg | null {
  const items = options.map((o, k) => ({ ...o, amount: amounts[k] })).filter((i) => i.amount > 0);
  if (!items.length) return null;
  items.sort((x, y) => y.profit * y.amount - x.profit * x.amount);
  const amount = items.reduce((t, i) => t + i.amount, 0);
  const total = items.reduce((t, i) => t + i.profit * i.amount, 0);
  const cost = items.reduce((t, i) => t + i.buy * i.amount, 0);
  const main = items[0];
  return { commodity: main.commodity, items, amount, cost, total, profit: total / amount, supply: main.supply, demand: main.demand };
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
        pct: (leg.total / leg.cost) * 100,
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
    if (i.buy > 0 && i.supply > 0 && i.supply >= (q.minSupply ?? 0)) buy.push({ commodity: i.name, price: i.buy, volume: i.supply, end: e });
    if (i.sell > 0 && i.demand > 0 && i.demand >= (q.minDemand ?? 0)) sell.push({ commodity: i.name, price: i.sell, volume: i.demand, end: e });
  }
  buy.sort((x, y) => x.price - y.price || x.end.fromMe - y.end.fromMe);
  sell.sort((x, y) => y.price - x.price || x.end.fromMe - y.end.fromMe);
  return { buy: buy.slice(0, QUOTES_PER_SIDE), sell: sell.slice(0, QUOTES_PER_SIDE) };
}
