// Watches the route the player picked: whenever fresh prices arrive for one of its markets, each leg is
// priced again and anything that cut the profit is reported (price drop, stock or demand short, gone).
import type { TradeWatch, WatchAlert, WatchState } from '@et/shared';
import { commodityKey } from '../trade/engine.ts';

export interface Quote {
  buy: number;
  sell: number;
  supply: number;
  demand: number;
}

/** A profit per ton this much lower than when the route was picked is worth a warning. */
export const DROP = 0.1;

/**
 * Prices the watched legs again. `prices(marketId)` gives a market's quotes by commodity key and when
 * they were taken, or null when the database doesn't hold that market. Pure, for tests.
 */
export function checkWatch(
  watch: TradeWatch,
  prices: (marketId: number) => { at: string; items: Map<string, Quote> } | null,
  now = new Date().toISOString(),
): WatchState {
  const alerts: WatchAlert[] = [];
  let profitWas = 0;
  let profitNow = 0;
  let checkedAt = '';
  watch.legs.forEach((leg, legIndex) => {
    const src = prices(leg.src);
    const dst = prices(leg.dst);
    for (const at of [src?.at, dst?.at]) if (at && at > checkedAt) checkedAt = at;
    for (const it of leg.items) {
      const was = it.sell - it.buy;
      profitWas += was * it.amount;
      const key = commodityKey(it.commodity);
      const b = src?.items.get(key);
      const s = dst?.items.get(key);
      // a market we hold no prices for keeps the figures the route was picked with
      const buy = src ? b?.buy ?? 0 : it.buy;
      const sell = dst ? s?.sell ?? 0 : it.sell;
      const supply = src ? b?.supply ?? 0 : it.amount;
      const demand = dst ? s?.demand ?? 0 : it.amount;
      const base = { legIndex, commodity: it.commodity, src: leg.srcName, dst: leg.dstName };
      if (src && !(buy > 0 && supply > 0)) {
        alerts.push({ ...base, kind: 'gone', where: 'src', was: it.buy, now: 0 });
        continue;
      }
      if (dst && !(sell > 0 && demand > 0)) {
        alerts.push({ ...base, kind: 'gone', where: 'dst', was: it.sell, now: 0 });
        continue;
      }
      const now_ = sell - buy;
      const tons = Math.min(it.amount, supply, demand);
      profitNow += Math.max(0, now_) * tons;
      if (now_ < was * (1 - DROP)) alerts.push({ ...base, kind: 'profit', where: buy > it.buy ? 'src' : 'dst', was, now: now_ });
      if (supply < it.amount) alerts.push({ ...base, kind: 'supply', where: 'src', was: it.amount, now: supply });
      if (demand < it.amount) alerts.push({ ...base, kind: 'demand', where: 'dst', was: it.amount, now: demand });
    }
  });
  return { id: watch.id, profitWas, profitNow, alerts, checkedAt: checkedAt || now };
}

/** Every market a watch looks at. */
export const watchedMarkets = (w: TradeWatch | null) =>
  new Set(w ? w.legs.flatMap((l) => [l.src, l.dst]) : []);
