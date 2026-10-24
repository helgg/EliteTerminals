// Trade engine: leg choice, filters, loops, timing, local Market.json merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialState, type TradeMarket, type TradeQuery } from '@et/shared';
import {
  acceptsMarket, bestLeg, commodityKey, commodityQuotes, computeTrade, legSeconds, supercruiseSeconds,
} from '../src/trade/engine.ts';
import { fromSpanshStation, searchBody } from '../src/trade/markets.ts';
import { withLocalMarket } from '../src/trade/service.ts';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3.6e6).toISOString();

const Q: TradeQuery = {
  radius: 30, maxAgeH: 0, pad: 'L', planetary: false, carriers: false, fromHere: false, maxLs: 0,
  cargo: 100, capital: 1e9, jumpRange: 20,
};

function market(id: number, pos: [number, number, number], items: TradeMarket['items'], extra: Partial<TradeMarket> = {}): TradeMarket {
  return {
    marketId: id, station: `S${id}`, system: `Sys${id}`, systemId64: id * 10, pos, ls: 1000, type: 'Coriolis Starport',
    planetary: false, pads: { s: 4, m: 4, l: 4 }, updatedAt: hoursAgo(1), source: 'spansh', items, ...extra,
  };
}
const item = (name: string, buy: number, sell: number, supply = 10000, demand = 10000) => ({ name, buy, sell, supply, demand });

test('best leg picks the commodity with the biggest total, limited by hold, stock, demand and money', () => {
  const a = market(1, [0, 0, 0], [item('Gold', 9000, 0, 50), item('Tea', 1000, 0)]);
  const b = market(2, [10, 0, 0], [item('Gold', 0, 9500), item('Tea', 0, 1600)]);
  const leg = bestLeg(a, b, Q)!;
  // Gold: 500 × 50 (stock) = 25 000; Tea: 600 × 100 (hold) = 60 000
  assert.equal(leg.commodity, 'Tea');
  assert.equal(leg.amount, 100);
  assert.equal(leg.total, 60000);
  assert.equal(bestLeg(a, b, { ...Q, capital: 50000 })!.amount, 50); // only 50 t of tea affordable
  assert.equal(bestLeg(b, a, Q), null); // nothing to buy at b
});

test('filters: pad, planetary, carriers, distance to star, price age', () => {
  const m = market(1, [0, 0, 0], [item('Tea', 1, 2)]);
  assert.equal(acceptsMarket({ ...m, pads: { s: 4, m: 4, l: 0 } }, Q, NOW), false);
  assert.equal(acceptsMarket({ ...m, pads: { s: 4, m: 4, l: 0 } }, { ...Q, pad: 'M' }, NOW), true);
  assert.equal(acceptsMarket({ ...m, planetary: true }, Q, NOW), false);
  assert.equal(acceptsMarket({ ...m, type: 'Drake-Class Carrier' }, Q, NOW), false);
  assert.equal(acceptsMarket({ ...m, ls: 6000 }, { ...Q, maxLs: 5000 }, NOW), false);
  assert.equal(acceptsMarket({ ...m, updatedAt: hoursAgo(30) }, { ...Q, maxAgeH: 24 }, NOW), false);
  assert.equal(acceptsMarket({ ...m, updatedAt: hoursAgo(30) }, { ...Q, maxAgeH: 0 }, NOW), true);
});

test('timing: jumps by laden range, supercruise and docking', () => {
  assert.deepEqual(legSeconds(45, 20, 0).jumps, 3);
  assert.equal(legSeconds(0, 20, 0).jumps, 0); // same system
  assert.ok(Math.abs(supercruiseSeconds(1000) - 91) < 3);
  assert.ok(supercruiseSeconds(100000) > supercruiseSeconds(10000));
});

test('routes, loop back-haul and from-here restriction', () => {
  const a = market(1, [0, 0, 0], [item('Tea', 1000, 900), item('Gold', 0, 9800)]);
  const b = market(2, [10, 0, 0], [item('Tea', 0, 1600), item('Gold', 9000, 0)]);
  const c = market(3, [5, 0, 0], [item('Tea', 0, 1100)]);
  const me = { pos: [0, 0, 0] as [number, number, number], systemId64: 10, marketId: 1 };
  const r = computeTrade([a, b, c], Q, me, 'Sys1', NOW);
  const ab = r.routes.find((x) => x.id === '1-2')!;
  assert.equal(ab.leg.commodity, 'Tea');
  assert.equal(ab.back?.commodity, 'Gold');
  assert.equal(ab.pct, 60);
  assert.ok(ab.loopPerHour > ab.perHour);
  assert.ok(r.routes[0].perHour >= r.routes[r.routes.length - 1].perHour);
  assert.deepEqual(r.commodities, ['Gold', 'Tea']);

  const here = computeTrade([a, b, c], { ...Q, fromHere: true }, me, 'Sys1', NOW);
  assert.ok(here.routes.every((x) => x.src.marketId === 1));
});

test('commodity finder: cheapest buy, dearest sell', () => {
  const a = market(1, [0, 0, 0], [item('Tea', 1000, 900)]);
  const b = market(2, [10, 0, 0], [item('Tea', 800, 1600)]);
  const q = commodityQuotes([a, b], 'tea', Q, [0, 0, 0], NOW);
  assert.deepEqual(q.buy.map((x) => x.end.marketId), [2, 1]);
  assert.deepEqual(q.sell.map((x) => x.end.marketId), [2, 1]);
});

test('commodity keys match journal and Spansh names', () => {
  assert.equal(commodityKey('$basicmedicines_name;'), commodityKey('Basic Medicines'));
  assert.equal(commodityKey('$lowtemperaturediamond_name;'), commodityKey('Low Temperature Diamonds'));
});

test('Spansh station page maps to markets; search body carries the filters', () => {
  const page = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/spansh-stations-ADLeonis.json'), 'utf8'));
  const markets = page.results.map(fromSpanshStation);
  assert.equal(markets.length, 10);
  assert.ok(markets.every((m: TradeMarket) => m.marketId > 0 && m.items.length > 0 && m.system));
  const body = searchBody({ reference: 'AD Leonis', radius: 25, maxAgeH: 72, carriers: false }, 1, NOW);
  assert.equal(body.page, 1);
  assert.equal((body.filters as any).distance.max, 25);
  assert.ok(!(body.filters as any).type.value.includes('Drake-Class Carrier'));
  assert.ok((body.filters as any).market_updated_at);
});

test('local Market.json replaces an older Spansh copy of the same station', () => {
  const remote = market(7, [0, 0, 0], [item('Basic Medicines', 200, 180)], { updatedAt: hoursAgo(48) });
  const s = initialState();
  s.market = {
    marketId: 7, station: 'S7', system: 'Sys7', updatedAt: hoursAgo(0.1),
    items: [{ name: '$basicmedicines_name;', label: 'Remédios básicos', category: '', buy: 210, sell: 190, meanPrice: 0, stock: 5, demand: 1 }],
  };
  const [merged] = withLocalMarket([remote], s);
  assert.equal(merged.source, 'local');
  assert.equal(merged.items[0].name, 'Basic Medicines');
  assert.equal(merged.items[0].buy, 210);
  assert.equal(merged.ls, 1000); // station metadata kept from Spansh
});
