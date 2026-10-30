// A → B trade path: on the way from one system to another, the stops that make the most money.
// Pure: the markets of the corridor come in, the best path for each number of stops comes out.
import type { PathEnd, TradeChain, TradeLeg, TradeMarket, TradePathQuery, TradePathResult, TradeRoute } from '@et/shared';
import { acceptsMarket, bestLeg, end, legSeconds, levelEstimator } from './engine.ts';

/** Longest A → B handled: the corridor is scanned in spheres, each a Spansh search. */
export const MAX_PATH_LY = 500;
/** Most legs on a path (13 stops). */
const MAX_PATH_LEGS = 12;

type Pos = [number, number, number];
export interface PathPoint {
  name: string;
  pos: Pos;
}

const dist = (a: Pos, b: Pos) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const key = (s: string) => s.trim().toLowerCase();

/** Spheres covering the corridor A → B of half-width `width`: centres along the line and their radius. */
export function corridorSpheres(a: Pos, b: Pos, width: number): { centres: Pos[]; radius: number } {
  const d = dist(a, b);
  const n = Math.max(1, Math.ceil(d / width)) + 1;
  const centres = Array.from({ length: n }, (_, i): Pos => {
    const t = n > 1 ? i / (n - 1) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  });
  // a sphere every `step` ly covers a tube of radius `width` when its radius reaches the tube's edge half-way between centres
  const step = n > 1 ? d / (n - 1) : 0;
  return { centres, radius: Math.hypot(width, step / 2) };
}

const EMPTY: TradeLeg = { commodity: '', items: [], amount: 0, cost: 0, total: 0, profit: 0, supply: 0, demand: 0 };

/**
 * The best trade path from A to B for each number of legs. Stops lie in the corridor (within `q.radius` ly of
 * the line A → B) and always move forward along it, so a path never turns back. A leg with nothing profitable
 * to carry is flown empty. Each number of legs keeps the path with the most profit; a longer path is listed only
 * when it makes more than every shorter one.
 */
export function computePath(
  markets: TradeMarket[],
  q: TradePathQuery,
  a: PathPoint,
  b: PathPoint,
  me: Pos,
  now = Date.now(),
): TradePathResult {
  const d = dist(a.pos, b.pos);
  const result = (paths: TradeChain[], stations: number, note = ''): TradePathResult => ({
    query: q, from: a.name, to: b.name, distance: d, stations, fetchedAt: new Date(now).toISOString(), paths, note,
  });
  if (d < 0.01) throw new Error('A and B are the same system: use LOOP or LINEAR routes');

  const width = Math.max(q.radius, 1);
  const axis: Pos = [(b.pos[0] - a.pos[0]) / d, (b.pos[1] - a.pos[1]) / d, (b.pos[2] - a.pos[2]) / d];
  const along = (p: Pos) => (p[0] - a.pos[0]) * axis[0] + (p[1] - a.pos[1]) * axis[1] + (p[2] - a.pos[2]) * axis[2];
  const off = (p: Pos) => {
    const t = along(p);
    return dist(p, [a.pos[0] + axis[0] * t, a.pos[1] + axis[1] * t, a.pos[2] + axis[2] * t]);
  };

  const seen = new Set<number>();
  // A and B are where the player goes anyway: their stations stay ends of the path whatever the age of their
  // prices, but prices older than the filter are not traded on (the leg there or from there is flown empty)
  const atEnd = (m: TradeMarket) =>
    m.marketId === q.from.marketId || m.marketId === q.to.marketId || key(m.system) === key(a.name) || key(m.system) === key(b.name);
  const stale = new Map<number, TradeMarket>();
  const usable = markets
    .filter((m) => !seen.has(m.marketId) && seen.add(m.marketId) && acceptsMarket(m, atEnd(m) ? { ...q, maxAgeH: 0 } : q, now))
    .map((m) => {
      if (!q.maxAgeH || acceptsMarket(m, q, now)) return m;
      stale.set(m.marketId, m);
      return { ...m, items: [] };
    });
  const nodes = usable
    .map((m) => ({ m, t: along(m.pos) }))
    .filter((n) => off(n.m.pos) <= width && n.t >= -width && n.t <= d + width);

  // the ends: the station asked for, else every station of the system, else (no usable market there) the nearest ones
  const notes: string[] = [];
  const ends = (p: PathPoint, e: PathEnd, label: string) => {
    if (e.marketId) {
      const at = nodes.filter((n) => n.m.marketId === e.marketId);
      if (!at.length) {
        throw new Error(`the station picked at ${label} has no prices that pass the filters (pad, planetary, star distance)`);
      }
      return at;
    }
    const inSystem = nodes.filter((n) => key(n.m.system) === key(p.name));
    if (inSystem.length) return inSystem;
    const near = nodes.filter((n) => dist(n.m.pos, p.pos) <= width);
    if (near.length) {
      notes.push(`no station in ${p.name.toUpperCase()} passes the pad, planetary and star distance filters: ` +
        `the path ${label === 'A' ? 'starts' : 'ends'} within ${width}ly of it`);
    }
    return near;
  };
  const starts = new Set(ends(a, q.from, 'A').map((n) => n.m.marketId));
  const finishes = new Set(ends(b, q.to, 'B').map((n) => n.m.marketId));
  if (!starts.size || !finishes.size) {
    return result([], nodes.length, `no market near ${(starts.size ? b : a).name.toUpperCase()} passes the filters: widen the corridor or the price age`);
  }

  // forward order along the line; the ends of a path come first and last
  nodes.sort((x, y) => x.t - y.t || x.m.marketId - y.m.marketId);
  const n = nodes.length;
  const isStart = nodes.map((x) => starts.has(x.m.marketId));
  const isEnd = nodes.map((x) => finishes.has(x.m.marketId));

  // Legs between stops; a long one only into B (a gap in the corridor is crossed in one go there).
  const maxHop = Math.max(4 * q.jumpRange, 2 * width, 40);
  const into: { from: number; weight: number }[][] = nodes.map(() => []);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < j; i++) {
      const hop = dist(nodes[i].m.pos, nodes[j].m.pos);
      if (hop > maxHop && !isEnd[j] && !isStart[i]) continue;
      if (isEnd[i] && isEnd[j] && !isStart[j]) continue; // already in B: stop there
      const leg = bestLeg(nodes[i].m, nodes[j].m, q);
      const { seconds } = legSeconds(hop, q.jumpRange, nodes[j].m.ls);
      // equal profits (empty legs): the quicker way wins
      into[j].push({ from: i, weight: (leg?.total ?? 0) - seconds / 1000 });
    }
  }

  // best[k][j]: most profit reaching stop j in exactly k legs from a start
  const best = Array.from({ length: MAX_PATH_LEGS + 1 }, () => new Float64Array(n).fill(-Infinity));
  const prev = Array.from({ length: MAX_PATH_LEGS + 1 }, () => new Int32Array(n).fill(-1));
  isStart.forEach((s, i) => s && (best[0][i] = 0));
  for (let k = 1; k <= MAX_PATH_LEGS; k++) {
    for (let j = 0; j < n; j++) {
      for (const e of into[j]) {
        const v = best[k - 1][e.from] + e.weight;
        if (v > best[k][j]) {
          best[k][j] = v;
          prev[k][j] = e.from;
        }
      }
    }
  }

  const routeOf = (i: number, j: number): TradeRoute => {
    const src = nodes[i].m;
    const dst = nodes[j].m;
    const hopLy = dist(src.pos, dst.pos);
    const leg = bestLeg(src, dst, q) ?? EMPTY;
    const { jumps, seconds } = legSeconds(hopLy, q.jumpRange, dst.ls);
    return {
      id: `${src.marketId}-${dst.marketId}`,
      src: end(src, me, now), dst: end(dst, me, now),
      hopLy, jumps, leg, back: null,
      pct: leg.cost ? (leg.total / leg.cost) * 100 : 0,
      legSeconds: seconds, perHour: (leg.total / seconds) * 3600, loopPerHour: 0,
    };
  };

  const paths: TradeChain[] = [];
  let bestTotal = 0;
  for (let k = 1; k <= MAX_PATH_LEGS; k++) {
    let last = -1;
    for (let j = 0; j < n; j++) if (isEnd[j] && best[k][j] > -Infinity && (last < 0 || best[k][j] > best[k][last])) last = j;
    if (last < 0) continue;
    const stops = [last];
    for (let kk = k; kk > 0; kk--) stops.unshift(prev[kk][stops[0]]);
    const legs = stops.slice(1).map((j, s) => routeOf(stops[s], j));
    const total = legs.reduce((t, l) => t + l.leg.total, 0);
    if (total <= bestTotal) continue;
    bestTotal = total;
    const seconds = legs.reduce((t, l) => t + l.legSeconds, 0);
    paths.push({ id: stops.map((i) => nodes[i].m.marketId).join('-'), legs, total, seconds, perHour: (total / seconds) * 3600 });
  }
  const old = [...new Set(paths.flatMap((p) => [p.legs[0].src, p.legs[p.legs.length - 1].dst]).filter((e) => stale.has(e.marketId))
    .map((e) => `${e.station} (${Math.round(e.ageH)}h)`))];
  if (old.length) notes.push(`prices older than the age filter at ${old.join(', ')}: nothing is traded there, the path only flies there`);
  if (!paths.length) notes.push('nothing profitable to carry along the way with these filters: widen the corridor or the price age');

  const level = levelEstimator(usable);
  for (const i of paths.flatMap((p) => p.legs.flatMap((l) => l.leg.items))) {
    if (!i.supplyExact) i.supplyLevel = level('supply', i.commodity, i.supply);
    if (!i.demandExact) i.demandLevel = level('demand', i.commodity, i.demand);
  }
  return result(paths, nodes.length, notes.join(' · '));
}
