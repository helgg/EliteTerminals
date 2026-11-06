// CARRIER TRADE engine: a carrier's cargo from a region with plenty of a commodity to one that pays much more.
// Pure: the candidate rows come from the price database (see PriceDb.haulRows) so the maths can be tested on small lists.
import type {
  CarrierTradeCarrier, CarrierTradeQuery, CarrierTradeResult, CarrierTradeRoute, CarrierTradeSide,
} from '@et/shared';
import { jumpFuel } from '../carrier/route.ts';
import { commodityKey, legSeconds } from './engine.ts';

/** Ly one carrier jump covers at most. */
export const CARRIER_JUMP_LY = 500;
/**
 * Seconds one carrier jump takes: the countdown before it, the jump and the cooldown after it. ASSUMED (about 20 min),
 * not measured: checked against the player's own jumps when the screen is calibrated (docs/design/CARRIER-TRADE.md).
 */
export const CARRIER_JUMP_SECONDS = 20 * 60;
/** Stock or demand above this is not a real market (some stations report hundreds of millions of tons). */
export const MAX_QTY = 2_000_000;
/** Destinations tried per commodity, best price first. */
const ANCHORS = 25;
const MAX_ROUTES = 100;
/** A price this many times above the usual is worth a warning even when it is let through. */
const HIGH_WARN = 2;

/** One commodity at one market: a possible source (price = what the player pays) or destination (price = what it pays). */
export interface HaulRow {
  marketId: number;
  station: string;
  system: string;
  pos: [number, number, number];
  ls: number;
  type: string;
  planetary: boolean;
  pad: 'S' | 'M' | 'L' | '-';
  updatedAt: string;
  key: string;
  name: string;
  price: number;
  qty: number;
}

const PAD_RANK: Record<string, number> = { S: 1, M: 2, L: 3, '-': 0 };
const dist = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ageH = (r: HaulRow, now: number) => Math.max(0, (now - Date.parse(r.updatedAt)) / 3.6e6);

/** Another player's carrier: its type says so, or (when the price message did not carry a type) its name is a callsign. */
export const isCarrierLike = (station: string, type: string) => /carrier/i.test(type) || /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(station);
/** Colonisation construction sites list the materials they need, not a market to trade with. */
export const isConstruction = (type: string) => /constructiondepot/i.test(type);

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export interface Clean { rows: HaulRow[]; carriers: number; implausible: number }

/** Rows the player could really use: right kind of market for the ship, fresh enough, a believable quantity. */
export function clean(rows: HaulRow[], q: CarrierTradeQuery, side: 'source' | 'sink', now: number): Clean {
  const out: HaulRow[] = [];
  let carriers = 0;
  let implausible = 0;
  const min = side === 'source' ? q.minSupply : q.minDemand;
  const want = q.commodity ? commodityKey(q.commodity) : '';
  for (const r of rows) {
    if (want && r.key !== want) continue;
    if (isConstruction(r.type)) continue;
    if (!q.carriers && isCarrierLike(r.station, r.type)) { carriers++; continue; }
    if (PAD_RANK[r.pad] < PAD_RANK[q.pad]) continue;
    if (!q.planetary && r.planetary) continue;
    if (q.maxLs && r.ls > q.maxLs) continue;
    if (q.maxAgeH && ageH(r, now) > q.maxAgeH) continue;
    if (r.price <= 0 || r.qty < min) continue;
    if (r.qty > MAX_QTY) { implausible++; continue; }
    out.push(r);
  }
  return { rows: out, carriers, implausible };
}

interface Slice { row: HaulRow; tons: number }

/** Cheapest first for a source, dearest first for a destination, `tons` taken in all (or what there is). */
function fill(rows: HaulRow[], tons: number, cheapFirst: boolean): Slice[] {
  const sorted = [...rows].sort((a, b) => (cheapFirst ? a.price - b.price : b.price - a.price));
  const out: Slice[] = [];
  let left = tons;
  for (const row of sorted) {
    if (left <= 0) break;
    const take = Math.min(row.qty, left);
    out.push({ row, tons: take });
    left -= take;
  }
  return out;
}

const total = (s: Slice[]) => s.reduce((t, x) => t + x.tons, 0);
const biggest = (s: Slice[]) => s.reduce((b, x) => (x.tons > b.tons ? x : b), s[0]).row;

/** Money for the slices with the price moving by `slip` as the market's stock (or demand) is used. */
function money(s: Slice[], slip: number, dir: 1 | -1) {
  let listed = 0;
  let real = 0;
  for (const { row, tons } of s) {
    listed += tons * row.price;
    real += tons * row.price * (1 + dir * slip * (tons / row.qty) / 2);
  }
  return { listed, real };
}

/** Time to carry `s` between the parking system and the markets: whole trips of the ship's hold, there and back. */
function shuttleSeconds(s: Slice[], park: [number, number, number], q: CarrierTradeQuery): number {
  if (q.cargo <= 0) return 0;
  let t = 0;
  for (const { row, tons } of s) {
    const there = legSeconds(dist(park, row.pos), q.jumpRange, row.ls).seconds;
    t += Math.ceil(tons / q.cargo) * 2 * there;
  }
  return t;
}

const trips = (s: Slice[], cargo: number) => (cargo > 0 ? s.reduce((t, x) => t + Math.ceil(x.tons / cargo), 0) : 0);

function side(x: Slice, park: [number, number, number], now: number): CarrierTradeSide {
  const r = x.row;
  return {
    marketId: r.marketId, station: r.station, system: r.system, ls: r.ls, pad: r.pad, tons: x.tons, price: r.price,
    stock: r.qty, ageH: ageH(r, now), fromCarrier: dist(park, r.pos),
  };
}

/** Tritium (t) the carrier burns on hops of `ly` each, carrying `used` t of mass with `tank` t in the tank. */
function burn(totalLy: number, hops: number, used: number, tank: number): number {
  if (hops <= 0) return 0;
  const hop = totalLy / hops;
  let t = 0;
  for (let i = 0; i < hops; i++) t += jumpFuel(hop, used, tank);
  return t;
}

function evaluate(
  key: string, buy: Slice[], sell: Slice[], ref: number, q: CarrierTradeQuery, c: CarrierTradeCarrier, now: number,
): CarrierTradeRoute | null {
  const lot = total(buy);
  if (lot <= 0 || total(sell) <= 0) return null;
  const a = biggest(buy);
  const b = biggest(sell);
  if (a.system === b.system) return null;
  const ly = dist(a.pos, b.pos);
  const toLoad = dist(c.pos, a.pos);
  const jumpsTo = toLoad < 0.5 ? 0 : Math.ceil(toLoad / CARRIER_JUMP_LY);
  const jumps = Math.ceil(ly / CARRIER_JUMP_LY);
  if (jumps > q.maxJumps) return null;

  const cost = money(buy, q.slip, 1);
  const income = money(sell, q.slip, -1);
  const tritium = burn(toLoad, jumpsTo, c.used, c.tank) + burn(ly, jumps, c.used + lot, c.tank);
  const price = q.tritiumPrice > 0 ? q.tritiumPrice : c.tritiumPrice;
  const tritiumCost = tritium * price;
  const seconds = (jumpsTo + jumps) * CARRIER_JUMP_SECONDS + shuttleSeconds(buy, a.pos, q) + shuttleSeconds(sell, b.pos, q);
  const hours = seconds / 3600;
  const upkeepCost = c.upkeep > 0 ? (c.upkeep * hours) / 168 : 0;
  const net = income.real - cost.real - tritiumCost - upkeepCost;
  const netListed = income.listed - cost.listed - tritiumCost - upkeepCost;
  if (!(net > 0)) return null;

  const warnings: string[] = [];
  const worst = Math.max(...buy.map((x) => ageH(x.row, now)), ...sell.map((x) => ageH(x.row, now)));
  if (worst > 24) warnings.push(`prices up to ${Math.round(worst)} h old`);
  if (ref > 0 && sell.some((x) => x.row.price > HIGH_WARN * ref)) warnings.push('a selling price is over twice the usual: check it in the game');
  const have = c.tank + c.tritiumCargo;
  if (tritium > have) warnings.push(`needs ${Math.ceil(tritium - have)} t more tritium than the carrier holds`);
  if (q.cargo <= 0) warnings.push('enter the ship\'s hold: ship trips are not in the time');
  if (q.cargo > 0 && q.jumpRange <= 0) warnings.push('enter the ship\'s jump range: the ship\'s jumps are not in the time');
  if (!(price > 0)) warnings.push('tritium price unknown: it is not in the cost');
  if (!(c.upkeep > 0)) warnings.push('weekly upkeep not given: it is not in the cost');

  return {
    key, commodity: buy[0].row.name || key, lot,
    buy: buy.map((x) => side(x, a.pos, now)), sell: sell.map((x) => side(x, b.pos, now)),
    buyAvg: cost.real / lot, sellAvg: income.real / lot, buyListed: cost.listed / lot, sellListed: income.listed / lot,
    from: a.system, to: b.system, ly, jumpsTo, jumps,
    tritium, tritiumHave: have, buyCost: cost.real, revenue: income.real, tritiumCost, upkeepCost, net, netListed,
    tripsBuy: trips(buy, q.cargo), tripsSell: trips(sell, q.cargo), hours, netPerHour: hours > 0 ? net / hours : 0,
    worstAgeH: worst, warnings,
  };
}

/**
 * For each commodity: fill the carrier from the cheapest markets near the loading system, then try the best-paying
 * destinations within reach and keep the one that earns most per hour once tritium, upkeep and trips are paid.
 */
export function computeCarrierTrade(
  sources: HaulRow[], sinks: HaulRow[], q: CarrierTradeQuery, c: CarrierTradeCarrier, now = Date.now(),
): CarrierTradeResult {
  const src = clean(sources, q, 'source', now);
  const dst = clean(sinks, q, 'sink', now);
  const maxLot = Math.min(q.lot > 0 ? q.lot : Infinity, c.free);
  const bySrc = new Map<string, HaulRow[]>();
  const byDst = new Map<string, HaulRow[]>();
  for (const r of src.rows) (bySrc.get(r.key) ?? bySrc.set(r.key, []).get(r.key)!).push(r);

  let outliers = 0;
  const refs = new Map<string, number>();
  for (const r of dst.rows) (byDst.get(r.key) ?? byDst.set(r.key, []).get(r.key)!).push(r);
  for (const [k, list] of byDst) {
    const ref = median(list.map((r) => r.price));
    refs.set(k, ref);
    const kept = list.filter((r) => r.price <= q.maxPriceRatio * ref);
    outliers += list.length - kept.length;
    byDst.set(k, kept);
  }
  for (const [k, list] of bySrc) {
    const ref = refs.get(k) ?? 0;
    const kept = ref > 0 ? list.filter((r) => r.price >= ref / q.maxPriceRatio) : list;
    outliers += list.length - kept.length;
    bySrc.set(k, kept);
  }

  const routes: CarrierTradeRoute[] = [];
  if (maxLot > 0) {
    for (const [key, from] of bySrc) {
      const to = byDst.get(key);
      if (!to?.length || !from.length) continue;
      const loaded = fill(from, maxLot, true);
      const park = biggest(loaded).pos;
      const parkSystem = biggest(loaded).system;
      const buyAvg = money(loaded, 0, 1).listed / total(loaded);
      const reach = to.filter((r) => r.system !== parkSystem && dist(park, r.pos) <= q.maxJumps * CARRIER_JUMP_LY && r.price > buyAvg);
      const anchors = [...reach].sort((a, b) => b.price - a.price).slice(0, ANCHORS);
      let best: CarrierTradeRoute | null = null;
      for (const anchor of anchors) {
        const group = reach.filter((r) => dist(r.pos, anchor.pos) <= q.destRadius);
        const demand = group.reduce((t, r) => t + r.qty, 0);
        const lot = Math.min(total(loaded), demand);
        if (lot <= 0) continue;
        const buy = fill(from, lot, true);
        const sell = fill(group, lot, false);
        const route = evaluate(key, buy, sell, refs.get(key) ?? 0, q, c, now);
        if (route && (!best || route.netPerHour > best.netPerHour)) best = route;
      }
      if (best) routes.push(best);
    }
  }
  routes.sort((a, b) => b.netPerHour - a.netPerHour || b.net - a.net);
  const ids = new Set([...src.rows, ...dst.rows].map((r) => r.marketId));
  return {
    query: q, carrier: c, routes: routes.slice(0, MAX_ROUTES), markets: ids.size,
    excluded: { carriers: src.carriers + dst.carriers, outliers, implausible: src.implausible + dst.implausible },
    fetchedAt: new Date(now).toISOString(),
  };
}

/** Cr per ton of tritium: the nearest market that sells it, or the average of the ones known (rows of key "tritium"). */
export function tritiumPriceFrom(
  rows: HaulRow[], at: [number, number, number],
): { price: number; from: string } {
  const sells = rows.filter((r) => r.key === 'tritium' && r.price > 0);
  if (!sells.length) return { price: 0, from: '' };
  const near = sells.reduce((n, r) => (dist(r.pos, at) < dist(n.pos, at) ? r : n));
  return { price: near.price, from: `${near.station}, ${near.system}` };
}
