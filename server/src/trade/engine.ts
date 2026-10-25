// Trade engine: from a set of markets near the player, every profitable A→B pair and per-commodity quotes.
// Pure: no I/O, so the maths can be tested on small hand-made markets.
import type {
  CommodityQuote, LegItem, TradeChain, TradeEnd, TradeLeg, TradeMarket, TradeQuery, TradeResult, TradeRoute,
} from '@et/shared';

/** Seconds per hyperspace jump, including charge, jump tunnel and re-aligning. */
export const JUMP_SECONDS = 50;
/** Approach, docking request, landing, buying/selling and launching. */
export const DOCK_SECONDS = 120;
const MAX_ROUTES = 400;
const QUOTES_PER_SIDE = 20;
const MAX_CHAINS = 60;
/** At most 5 stops (4 legs) on a linear route. */
const MAX_LEGS = 4;
/** Partial chains kept per step, and legs tried out of each stop. */
const CHAIN_BEAM = 60;
const CHAIN_BRANCH = 6;

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
    planetary: m.planetary, state: m.state ?? '', fromMe: dist(me, m.pos), ageH: ageHours(m, now),
    live: m.source === 'local',
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
      supplyLevel: i.supplyBracket ?? 0, demandLevel: o.demandBracket ?? 0,
      supplyExact: !!i.supplyBracket, demandExact: !!o.demandBracket,
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
  const systemOf = new Map(usable.map((m) => [m.marketId, m.systemId64]));
  const here = (e: TradeEnd) => (me.marketId ? e.marketId === me.marketId : systemOf.get(e.marketId) === me.systemId64);
    const states = new Set(q.states ?? []);
  const inState = (e: TradeEnd) => !states.size || states.has(e.state);

  // Each pair is priced both ways at once, so a loop's way back is known without keeping every pair.
  // Only bounded "best of" lists survive the loop: the machine running this may be short on memory.
  const ends = new Map(usable.map((m) => [m.marketId, end(m, me.pos, now)]));
  const wanted = (r: TradeRoute) =>
    (!(q.exportHere || q.importHere) || (q.exportHere && here(r.src)) || (q.importHere && here(r.dst))) &&
    (inState(r.src) || inState(r.dst));
  const chainStart = (r: TradeRoute) => !q.exportHere || q.importHere || here(r.src);
  const loops = new Best<TradeRoute>(MAX_ROUTES, (r) => r.loopPerHour);
  const starts = new Best<TradeRoute>(CHAIN_BEAM, (r) => r.perHour);
  const outgoing = new Map(usable.map((m) => [m.marketId, new Best<TradeRoute>(CHAIN_BRANCH, (r: TradeRoute) => r.perHour)]));

  const price = (a: TradeMarket, b: TradeMarket): TradeRoute | null => {
    const leg = bestLeg(a, b, q);
    if (!leg) return null;
    const hopLy = dist(a.pos, b.pos);
    const { jumps, seconds } = legSeconds(hopLy, q.jumpRange, b.ls);
    return {
      id: `${a.marketId}-${b.marketId}`,
      src: ends.get(a.marketId)!,
      dst: ends.get(b.marketId)!,
      hopLy, jumps, leg, back: null,
      pct: (leg.total / leg.cost) * 100,
      legSeconds: seconds,
      perHour: (leg.total / seconds) * 3600,
      loopPerHour: 0,
    };
  };
  const keep = (r: TradeRoute | null, back: TradeRoute | null, other: TradeRoute | null) => {
    if (!r) return;
    outgoing.get(r.src.marketId)!.add(r);
    if (chainStart(r)) starts.add(r);
    // A→B→A and B→A→B are the same loop: list it once, starting from the end nearer the player.
    const twin = other && wanted(other) && (other.src.fromMe < r.src.fromMe || (other.src.fromMe === r.src.fromMe && other.id < r.id));
    if (wanted(r) && !twin) {
      const backSeconds = back?.legSeconds ?? legSeconds(r.hopLy, q.jumpRange, r.src.ls).seconds;
      const loopPerHour = ((r.leg.total + (back?.leg.total ?? 0)) / (r.legSeconds + backSeconds)) * 3600;
      loops.add({ ...r, back: back?.leg ?? null, loopPerHour });
    }
  };
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const ab = price(usable[i], usable[j]);
      const ba = price(usable[j], usable[i]);
      keep(ab, ba, ba && ab ? ba : null);
      keep(ba, ab, ab && ba ? ab : null);
    }
  }
  const out = new Map([...outgoing].map(([id, best]) => [id, best.list()]));
  const routes = loops.list();
  const chains = linearChains(starts.list(), out, q, here, inState);
  const level = levelEstimator(usable);
  for (const leg of [...routes.flatMap((r) => [r.leg, r.back]), ...chains.flatMap((c) => c.legs.map((l) => l.leg))]) {
    for (const i of leg?.items ?? []) {
      if (!i.supplyExact) i.supplyLevel = level('supply', i.commodity, i.supply);
      if (!i.demandExact) i.demandLevel = level('demand', i.commodity, i.demand);
    }
  }

  return {
    query: q,
    reference,
    stations: usable.length,
    fetchedAt: new Date(now).toISOString(),
    routes,
    chains,
    states: [...new Set(usable.map((m) => m.state).filter(Boolean))].sort(),
    commodities: commodityNames(usable),
  };
}

/**
 * Linear routes of `q.hops` legs, without returning to a station already visited. Beam search: keep the
 * best partial chains by Cr/h, extend each with the best few legs out of its last stop.
 */
function linearChains(
  starts: TradeRoute[],
  outgoing: Map<number, TradeRoute[]>,
  q: TradeQuery,
  here: (e: TradeEnd) => boolean,
  inState: (e: TradeEnd) => boolean,
): TradeChain[] {
  const hops = Math.max(2, Math.min(q.hops || 3, MAX_LEGS));
  const rate = (legs: TradeRoute[]) => {
    const total = legs.reduce((t, l) => t + l.leg.total, 0);
    const seconds = legs.reduce((t, l) => t + l.legSeconds, 0);
    return { total, seconds, perHour: (total / seconds) * 3600 };
  };
  let beam = starts.map((r) => [r]);
  for (let depth = 1; depth < hops; depth++) {
    const next: { legs: TradeRoute[]; perHour: number }[] = [];
    for (const legs of beam) {
      const visited = new Set(legs.map((l) => l.src.marketId));
      for (const r of outgoing.get(legs[legs.length - 1].dst.marketId) ?? []) {
        if (visited.has(r.dst.marketId)) continue;
        const grown = [...legs, r];
        next.push({ legs: grown, perHour: rate(grown).perHour });
      }
    }
    beam = next.sort((x, y) => y.perHour - x.perHour).slice(0, CHAIN_BEAM * 4).map((c) => c.legs);
  }
  const stops = (legs: TradeRoute[]) => [legs[0].src, ...legs.map((l) => l.dst)];
  return beam
    .filter((legs) => legs.length === hops)
    .filter((legs) => !q.importHere || q.exportHere || here(legs[legs.length - 1].dst))
    .filter((legs) => !(q.exportHere && q.importHere) || here(legs[0].src) || here(legs[legs.length - 1].dst))
    .filter((legs) => stops(legs).some(inState))
    .slice(0, MAX_CHAINS)
    .map((legs) => ({ id: stops(legs).map((e) => e.marketId).join('-'), legs, ...rate(legs) }));
}

/**
 * Low / medium / high (1…3) for a stock or demand, when the game's bracket is unknown (Spansh has only
 * the numbers): compared with the median of that commodity among the nearby markets trading it.
 */
export function levelEstimator(markets: TradeMarket[]) {
  const seen = { supply: new Map<string, number[]>(), demand: new Map<string, number[]>() };
  for (const m of markets) {
    for (const i of m.items) {
      const key = commodityKey(i.name);
      if (i.buy > 0 && i.supply > 0) push(seen.supply, key, i.supply);
      if (i.sell > 0 && i.demand > 0) push(seen.demand, key, i.demand);
    }
  }
  const medians = {
    supply: new Map([...seen.supply].map(([k, v]) => [k, median(v)])),
    demand: new Map([...seen.demand].map(([k, v]) => [k, median(v)])),
  };
  return (side: 'supply' | 'demand', commodity: string, volume: number) => {
    const med = medians[side].get(commodityKey(commodity));
    if (!med || volume <= 0) return volume > 0 ? 2 : 0;
    return volume >= med * 2 ? 3 : volume >= med / 2 ? 2 : 1;
  };
}
const push = (map: Map<string, number[]>, key: string, v: number) => {
  const list = map.get(key);
  if (list) list.push(v);
  else map.set(key, [v]);
};
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The `size` highest-scoring items seen; trimmed in batches so adding stays cheap. */
class Best<T> {
  private items: T[] = [];
  private readonly size: number;
  private readonly score: (x: T) => number;
  constructor(size: number, score: (x: T) => number) {
    this.size = size;
    this.score = score;
  }
  add(x: T) {
    this.items.push(x);
    if (this.items.length >= this.size * 4) this.trim();
  }
  list(): T[] {
    this.trim();
    return this.items;
  }
  private trim() {
    this.items.sort((x, y) => this.score(y) - this.score(x));
    this.items.length = Math.min(this.items.length, this.size);
  }
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
