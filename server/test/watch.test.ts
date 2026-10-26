import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TradeWatch } from '@et/shared';
import { checkWatch, watchedMarkets } from '../src/prices/watch.ts';
import { PriceDb } from '../src/prices/db.ts';

const watch: TradeWatch = {
  id: 'r1',
  legs: [{
    src: 1, dst: 2, srcName: 'A Hub', dstName: 'B Port',
    items: [{ commodity: 'Gold', buy: 45000, sell: 50000, amount: 100 }, { commodity: 'Silver', buy: 4000, sell: 6000, amount: 50 }],
  }],
};
const market = (at: string, items: Record<string, [number, number, number, number]>) => ({
  at, items: new Map(Object.entries(items).map(([k, [buy, sell, supply, demand]]) => [k, { buy, sell, supply, demand }])),
});

test('a watched route with unchanged prices raises nothing', () => {
  const prices = (id: number) => id === 1
    ? market('2026-10-26T10:00:00Z', { gold: [45000, 0, 900, 0], silver: [4000, 0, 900, 0] })
    : market('2026-10-26T10:05:00Z', { gold: [0, 50000, 0, 900], silver: [0, 6000, 0, 900] });
  const w = checkWatch(watch, prices);
  assert.deepEqual(w.alerts, []);
  assert.equal(w.profitWas, 5000 * 100 + 2000 * 50);
  assert.equal(w.profitNow, w.profitWas);
  assert.equal(w.checkedAt, '2026-10-26T10:05:00Z');
});

test('a price drop, short stock and a commodity gone are reported', () => {
  const prices = (id: number) => id === 1
    ? market('2026-10-26T10:00:00Z', { gold: [45000, 0, 60, 0] })
    : market('2026-10-26T10:05:00Z', { gold: [0, 49000, 0, 900], silver: [0, 6000, 0, 900] });
  const w = checkWatch(watch, prices);
  const kinds = w.alerts.map((a) => `${a.commodity}:${a.kind}:${a.where}`);
  assert.deepEqual(kinds, ['Gold:profit:dst', 'Gold:supply:src', 'Silver:gone:src']);
  assert.deepEqual(w.alerts[0], { legIndex: 0, commodity: 'Gold', src: 'A Hub', dst: 'B Port', kind: 'profit', where: 'dst', was: 5000, now: 4000 });
  assert.equal(w.profitNow, 4000 * 60, 'only the stock left, at the new margin');
});

test('a market without data keeps the figures the route was picked with', () => {
  const w = checkWatch(watch, () => null);
  assert.deepEqual(w.alerts, []);
  assert.equal(w.profitNow, w.profitWas);
  assert.deepEqual([...watchedMarkets(watch)], [1, 2]);
});

test('price history is kept for tracked markets only, and pruned after 7 days', () => {
  const db = new PriceDb(':memory:');
  db.putSystem('A', [0, 0, 0]);
  const put = (marketId: number, at: string, sell: number) => db.putMarket({
    marketId, station: `S${marketId}`, system: 'A', updatedAt: at, source: 'eddn',
    items: [{ name: 'gold', buy: 0, sell, supply: 0, demand: 10 }],
  });
  db.tracked.add(1);
  put(1, '2026-10-01T10:00:00Z', 100);
  put(1, '2026-10-26T10:00:00Z', 90);
  put(2, '2026-10-26T10:00:00Z', 80);
  assert.deepEqual(db.history(1, 'Gold').map((h) => h.sell), [100, 90]);
  assert.deepEqual(db.history(2, 'Gold'), [], 'not tracked');
  db.prune(7 * 24 * 3600e3, Date.parse('2026-10-26T12:00:00Z'));
  assert.deepEqual(db.history(1, 'Gold').map((h) => h.sell), [90]);
  assert.equal(db.market(1)?.items.get('gold')?.sell, 90);
  db.close();
});
