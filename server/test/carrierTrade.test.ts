import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CarrierTradeCarrier, CarrierTradeQuery } from '@et/shared';
import { CARRIER_JUMP_SECONDS, computeCarrierTrade, tritiumPriceFrom, type HaulRow } from '../src/trade/carrierTrade.ts';
import { jumpFuel } from '../src/carrier/route.ts';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const FRESH = '2026-11-05T10:00:00Z';

const query = (over: Partial<CarrierTradeQuery> = {}): CarrierTradeQuery => ({
  sourceRadius: 30, maxJumps: 1, destRadius: 30, minSupply: 10000, minDemand: 10000, maxAgeH: 0, pad: 'L', cargo: 0,
  jumpRange: 0, planetary: false, carriers: false, maxLs: 0, commodity: '', lot: 0, tritiumPrice: 0, slip: 0,
  maxPriceRatio: 3, ...over,
});
const carrier = (over: Partial<CarrierTradeCarrier> = {}): CarrierTradeCarrier => ({
  system: 'Home', pos: [0, 0, 0], free: 25000, used: 1000, tank: 500, tritiumCargo: 0, upkeep: 0, tritiumPrice: 0, tritiumPriceFrom: '', ...over,
});
const row = (over: Partial<HaulRow>): HaulRow => ({
  marketId: 1, station: 'Hub', system: 'Home', pos: [0, 0, 0], ls: 100, type: 'Coriolis', planetary: false, pad: 'L',
  updatedAt: FRESH, key: 'bauxite', name: 'Bauxite', price: 600, qty: 20000, ...over,
});
const src = (over: Partial<HaulRow> = {}) => row({ marketId: 1, ...over });
const dst = (over: Partial<HaulRow> = {}) => row({ marketId: 2, station: 'Far Hub', system: 'Far', pos: [300, 0, 0], price: 1500, qty: 20000, ...over });
const run = (s: HaulRow[], d: HaulRow[], q = query(), c = carrier()) => computeCarrierTrade(s, d, q, c, NOW);

test('fills the carrier from the source and sells at the destination: lot, prices and net', () => {
  const r = run([src()], [dst()]);
  assert.equal(r.routes.length, 1);
  const x = r.routes[0];
  assert.equal(x.lot, 20000); // stock and demand both 20 000 t, the carrier has room
  assert.equal(x.buyAvg, 600);
  assert.equal(x.sellAvg, 1500);
  assert.equal(x.jumps, 1);
  assert.equal(x.jumpsTo, 0);
  assert.equal(x.tritium, jumpFuel(300, 1000 + 20000, 500));
  assert.equal(x.hours, CARRIER_JUMP_SECONDS / 3600); // no ship given: only the carrier's jump
  assert.equal(x.net, 20000 * 900); // no tritium price, no upkeep
});

test('the lot is limited by the free space, then by stock and by demand', () => {
  assert.equal(run([src()], [dst()], query(), carrier({ free: 8000 })).routes[0].lot, 8000);
  assert.equal(run([src()], [dst()], query({ lot: 5000 })).routes[0].lot, 5000);
  assert.equal(run([src({ qty: 12000 })], [dst()]).routes[0].lot, 12000);
  assert.equal(run([src()], [dst({ qty: 11000 })]).routes[0].lot, 11000);
});

test('stock and demand below the minimum are not used (10 000 t by default)', () => {
  assert.equal(run([src({ qty: 9999 })], [dst()]).routes.length, 0);
  assert.equal(run([src()], [dst({ qty: 9999 })]).routes.length, 0);
  assert.equal(run([src({ qty: 5000 })], [dst({ qty: 5000 })], query({ minSupply: 1000, minDemand: 1000 })).routes[0].lot, 5000);
});

test("other players' carriers are left out unless asked for: by type, and by callsign when the type is blank", () => {
  const byType = dst({ marketId: 3, station: 'ABC-12D', type: 'FleetCarrier', price: 9000 });
  const byName = dst({ marketId: 4, station: 'XNT-08K', type: '', price: 9500 });
  const off = run([src()], [dst(), byType, byName]);
  assert.equal(off.excluded.carriers, 2);
  assert.equal(off.routes[0].sell[0].station, 'Far Hub');
  const on = run([src()], [dst(), byType, byName], query({ carriers: true, maxPriceRatio: 100 }));
  assert.equal(on.routes[0].sell[0].marketId, 4);
});

test('construction depots, planetary ports (unless asked) and markets the ship cannot land at are left out', () => {
  assert.equal(run([src()], [dst({ type: 'SpaceConstructionDepot' })]).routes.length, 0);
  assert.equal(run([src()], [dst({ planetary: true })]).routes.length, 0);
  assert.equal(run([src()], [dst({ planetary: true })], query({ planetary: true })).routes.length, 1);
  assert.equal(run([src()], [dst({ pad: 'M' })]).routes.length, 0); // a Large ship
  assert.equal(run([src()], [dst({ pad: 'M' })], query({ pad: 'M' })).routes.length, 1);
});

test("prices far above the commodity's usual and absurd quantities are dropped and counted", () => {
  const usual = [dst({ marketId: 5, price: 1400 }), dst({ marketId: 6, price: 1500 }), dst({ marketId: 7, price: 1600 })];
  const made = dst({ marketId: 8, station: 'Made Up', system: 'Fake', pos: [200, 0, 0], price: 45000 });
  const silly = dst({ marketId: 9, station: 'Silly', system: 'Silly', pos: [250, 0, 0], qty: 233_000_000 });
  const r = run([src()], [...usual, made, silly]);
  assert.equal(r.excluded.outliers, 1);
  assert.equal(r.excluded.implausible, 1);
  assert.ok(r.routes[0].sell.every((x) => x.station !== 'Made Up' && x.station !== 'Silly'));
});

test('a destination beyond the jumps is out of reach; more jumps are allowed on request, and cost more tritium', () => {
  const far = dst({ pos: [700, 0, 0] });
  assert.equal(run([src()], [far]).routes.length, 0);
  const two = run([src()], [far], query({ maxJumps: 2 }));
  assert.equal(two.routes[0].jumps, 2);
  assert.equal(two.routes[0].tritium, jumpFuel(350, 21000, 500) * 2);
  assert.ok(two.routes[0].hours >= (2 * CARRIER_JUMP_SECONDS) / 3600 - 1e-9);
});

test('a carrier away from the loading system pays the jump there first', () => {
  const r = run([src()], [dst()], query(), carrier({ pos: [-400, 0, 0], system: 'Elsewhere' }));
  assert.equal(r.routes[0].jumpsTo, 1);
  assert.equal(r.routes[0].tritium, jumpFuel(400, 1000, 500) + jumpFuel(300, 21000, 500));
});

test('the slip lowers the net; the listed net stays what the markets show', () => {
  const flat = run([src()], [dst()]).routes[0];
  const slip = run([src()], [dst()], query({ slip: 0.1 })).routes[0];
  assert.ok(slip.net < flat.net);
  assert.equal(slip.netListed, flat.net);
  assert.ok(slip.buyAvg > 600 && slip.sellAvg < 1500);
});

test('tritium and upkeep are paid out of the net; the tritium price override wins', () => {
  const base = run([src()], [dst()]).routes[0];
  const paid = run([src()], [dst()], query({ tritiumPrice: 50000 }), carrier({ upkeep: 10_000_000 })).routes[0];
  assert.equal(paid.tritiumCost, base.tritium * 50000);
  assert.equal(paid.upkeepCost, (10_000_000 * paid.hours) / 168);
  assert.equal(paid.net, base.net - paid.tritiumCost - paid.upkeepCost);
  const auto = run([src()], [dst()], query(), carrier({ tritiumPrice: 48000 })).routes[0];
  assert.equal(auto.tritiumCost, auto.tritium * 48000);
});

test('ship trips: whole holds there and back, counted at both ends and added to the time', () => {
  const noShip = run([src()], [dst()]).routes[0];
  const ship = run([src()], [dst()], query({ cargo: 400, jumpRange: 20, lot: 1000 })).routes[0];
  assert.equal(ship.tripsBuy, 3); // 1 000 t in a 400 t hold
  assert.equal(ship.tripsSell, 3);
  assert.ok(ship.hours > noShip.hours);
});

test('a route that does not pay is not listed; the best destination of each commodity wins', () => {
  assert.equal(run([src({ price: 1600 })], [dst()]).routes.length, 0);
  const near = dst({ marketId: 10, station: 'Near Hub', system: 'Near', pos: [100, 0, 0], price: 1200 });
  const r = run([src()], [near, dst()]);
  assert.equal(r.routes.length, 1);
  assert.equal(r.routes[0].to, 'Far'); // 900 Cr/t beats 600 Cr/t, one jump either way
});

test('warnings: old prices, missing upkeep and tritium price, not enough tritium', () => {
  const r = run([src({ updatedAt: '2026-11-03T12:00:00Z' })], [dst()], query(), carrier({ tank: 10 })).routes[0];
  assert.ok(r.warnings.some((w) => /48 h old/.test(w)));
  assert.ok(r.warnings.some((w) => /upkeep/.test(w)));
  assert.ok(r.warnings.some((w) => /tritium price/.test(w)));
  assert.ok(r.warnings.some((w) => /more tritium/.test(w)));
});

test('one commodity can be asked for by name', () => {
  const gold = (o: Partial<HaulRow>) => ({ key: 'gold', name: 'Gold', price: 44000, ...o });
  const s = [src(), src({ ...gold({}), marketId: 11 })];
  const d = [dst(), dst({ ...gold({ price: 60000 }), marketId: 12 })];
  assert.equal(run(s, d).routes.length, 2);
  assert.deepEqual(run(s, d, query({ commodity: 'Gold' })).routes.map((x) => x.key), ['gold']);
});

test("the tritium price is the nearest market's", () => {
  const t = (id: number, x: number, price: number) => row({ marketId: id, station: `T${id}`, pos: [x, 0, 0], key: 'tritium', price });
  const got = tritiumPriceFrom([t(1, 100, 52000), t(2, 10, 49000), t(3, 50, 51000)], [0, 0, 0]);
  assert.equal(got.price, 49000);
  assert.match(got.from, /T2/);
  assert.equal(tritiumPriceFrom([], [0, 0, 0]).price, 0);
});
