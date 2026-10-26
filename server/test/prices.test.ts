import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PriceDb, padsByType } from '../src/prices/db.ts';
import { fromEddnCommodity, fromEddnJournal } from '../src/prices/eddn.ts';
import { fromAutocomplete } from '../src/trade/reference.ts';

// Synthetic messages in the shape of the public EDDN schemas (commodity/3, journal/1).
const commodity = (marketId: number, timestamp: string, sell: number) => ({
  $schemaRef: 'https://eddn.edcd.io/schemas/commodity/3',
  header: { softwareName: 'test', softwareVersion: '1', gatewayTimestamp: timestamp },
  message: {
    systemName: 'Alpha', stationName: 'Alpha Hub', stationType: 'Coriolis', marketId, timestamp,
    commodities: [
      { name: 'gold', meanPrice: 47000, buyPrice: 45000, stock: 900, stockBracket: 2, sellPrice: 44000, demand: 0, demandBracket: 0 },
      { name: 'lowtemperaturediamond', meanPrice: 1, buyPrice: 0, stock: 0, stockBracket: 0, sellPrice: sell, demand: 300, demandBracket: 3 },
      { name: 'water', meanPrice: 1, buyPrice: 0, stock: 0, stockBracket: 0, sellPrice: 0, demand: 0, demandBracket: 0 },
    ],
  },
});
const journal = (event: string, extra: object = {}) => ({
  $schemaRef: 'https://eddn.edcd.io/schemas/journal/1',
  header: { softwareName: 'test', softwareVersion: '1', gatewayTimestamp: '2026-10-26T10:00:00Z' },
  message: { timestamp: '2026-10-26T10:00:00Z', event, StarSystem: 'Alpha', StarPos: [10, 0, 0], SystemAddress: 42, ...extra },
});

test('EDDN commodity message maps to market prices', () => {
  const m = fromEddnCommodity(commodity(7, '2026-10-26T10:00:00Z', 180000))!;
  assert.equal(m.marketId, 7);
  assert.equal(m.system, 'Alpha');
  assert.equal(m.source, 'eddn');
  assert.deepEqual(m.items[0], { name: 'gold', buy: 45000, sell: 44000, supply: 900, demand: 0, supplyBracket: 2, demandBracket: 0 });
  assert.equal(fromEddnCommodity(journal('FSDJump')), null);
});

test('EDDN journal gives the system position and, when docked, the station', () => {
  const jump = fromEddnJournal(journal('FSDJump'))!;
  assert.deepEqual(jump.system, { name: 'Alpha', pos: [10, 0, 0], id64: 42 });
  assert.equal(jump.station, null);
  const docked = fromEddnJournal(journal('Docked', {
    StationName: 'Alpha Hub', StationType: 'Outpost', MarketID: 7, DistFromStarLS: 512.5,
    LandingPads: { Small: 2, Medium: 1, Large: 0 }, StationFaction: { Name: 'X', FactionState: 'Boom' },
  }))!;
  assert.deepEqual(docked.station, {
    marketId: 7, station: 'Alpha Hub', system: 'Alpha', systemId64: 42, type: 'Outpost', ls: 512.5,
    pads: { s: 2, m: 1, l: 0 }, state: 'Boom',
  });
  assert.equal(fromEddnJournal(journal('Scan')), null);
});

test('price database answers markets near a position, keeping the newest copy', () => {
  const db = new PriceDb(':memory:');
  db.putSystem('Alpha', [10, 0, 0], 42);
  db.putSystem('Far', [500, 0, 0]);
  assert.equal(db.putMarket(fromEddnCommodity(commodity(7, '2026-10-26T10:00:00Z', 180000))!), true);
  // an older copy arriving late is ignored
  assert.equal(db.putMarket(fromEddnCommodity(commodity(7, '2026-10-26T09:00:00Z', 1))!), false);
  const now = Date.parse('2026-10-26T11:00:00Z');
  const near = db.near({ pos: [0, 0, 0], radius: 20, maxAgeH: 0, carriers: false }, now);
  assert.equal(near.length, 1);
  const m = near[0];
  assert.equal(m.system, 'Alpha');
  assert.deepEqual(m.pos, [10, 0, 0]);
  assert.deepEqual(m.pads, { s: 1, m: 1, l: 1 }, 'pads guessed from the station type until a Docked is heard');
  assert.equal(m.items.length, 2, 'commodities neither bought nor sold are dropped');
  assert.equal(m.items.find((i) => i.demand === 300)?.sell, 180000);
  // the price age filter
  assert.equal(db.near({ pos: [0, 0, 0], radius: 20, maxAgeH: 0.5, carriers: false }, now).length, 0);
  // a Docked event brings the real pads
  db.putStation({ marketId: 7, station: 'Alpha Hub', system: 'Alpha', pads: { s: 2, m: 1, l: 0 }, ls: 512 });
  const after = db.near({ pos: [0, 0, 0], radius: 20, maxAgeH: 0, carriers: false }, now)[0];
  assert.deepEqual(after.pads, { s: 2, m: 1, l: 0 });
  assert.equal(after.ls, 512);
  assert.equal(after.type, 'Coriolis', 'a Docked without a type keeps the one we had');
  db.close();
});

test('commodity names: Spansh English names win over bare EDDN symbols', () => {
  const db = new PriceDb(':memory:');
  db.putSystem('Alpha', [0, 0, 0]);
  db.putMarket(fromEddnCommodity(commodity(7, '2026-10-26T10:00:00Z', 180000))!);
  const q = { pos: [0, 0, 0] as [number, number, number], radius: 5, maxAgeH: 0, carriers: false };
  assert.ok(db.near(q)[0].items.some((i) => i.name === 'Lowtemperaturediamonds'), 'fallback name before any proper one');
  db.putMarket({
    marketId: 8, station: 'B', system: 'Alpha', updatedAt: '2026-10-26T10:00:00Z', source: 'spansh',
    items: [{ name: 'Low Temperature Diamonds', buy: 0, sell: 170000, supply: 0, demand: 10 }],
  });
  const names = db.near(q).flatMap((m) => m.items.map((i) => i.name));
  assert.ok(names.includes('Low Temperature Diamonds'));
  assert.ok(!names.includes('Lowtemperaturediamonds'));
  db.close();
});

test('a Spansh scan covers a region only for the price ages and carriers it asked for', () => {
  const db = new PriceDb(':memory:');
  db.markScanned({ pos: [0, 0, 0], radius: 40, maxAgeH: 24, carriers: false }, 1000);
  const q = { pos: [5, 0, 0] as [number, number, number], radius: 20, maxAgeH: 24, carriers: false };
  assert.equal(db.covered(q, 0), true);
  assert.equal(db.covered({ ...q, radius: 36 }, 0), false, 'reaches past the scanned sphere');
  assert.equal(db.covered({ ...q, maxAgeH: 0 }, 0), false, 'older prices were not asked for');
  assert.equal(db.covered({ ...q, carriers: true }, 0), false);
  assert.equal(db.covered(q, 2000), false, 'too old');
  db.close();
});

test('pads by station type', () => {
  assert.deepEqual(padsByType('Outpost'), { s: 1, m: 1, l: 0 });
  assert.deepEqual(padsByType('FleetCarrier'), { s: 1, m: 1, l: 1 });
  assert.deepEqual(padsByType('OnFootSettlement'), { s: 0, m: 0, l: 0 });
});

test('reference search: Spansh autocomplete gives names with coordinates', () => {
  const body = { min_max: [{ id64: 1, name: 'LHS 3447', x: -43.2, y: -5.3, z: 10.5 }, { name: 'broken' }], values: ['LHS 3447'] };
  assert.deepEqual(fromAutocomplete(body), [{ name: 'LHS 3447', id64: 1, pos: [-43.2, -5.3, 10.5] }]);
  assert.deepEqual(fromAutocomplete({}), []);
});

test('price database finds known systems by name prefix, any case', () => {
  const db = new PriceDb(':memory:');
  db.putSystem('LHS 3447', [1, 2, 3], 99);
  db.putSystem('LHS 3405', [4, 5, 6]);
  db.putSystem('Lave', [7, 8, 9]);
  assert.deepEqual(db.searchSystems('lhs 34', 10).map((s) => s.name).sort(), ['LHS 3405', 'LHS 3447']);
  assert.deepEqual(db.system('lhs 3447'), { name: 'LHS 3447', id64: 99, pos: [1, 2, 3] });
  assert.equal(db.system('Sol'), null);
  db.close();
});
