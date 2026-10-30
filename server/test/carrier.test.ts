// CARRIER: the fleet carrier from the journal, and the tritium along a route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialState } from '@et/shared';
import { applyEvent } from '../src/reducer.ts';
import { mergeCarrier } from '../src/carrier/state.ts';
import { hopsOf, jumpFuel, simulate } from '../src/carrier/route.ts';

const ID = 3700000001;

test('carrier from the journal: stats, fuel deposit, a scheduled jump and its arrival', () => {
  const s = initialState();
  // the real CarrierStats of 2026-10-30 (OBSERVED), name left out
  applyEvent(s, {
    timestamp: '2026-10-30T01:11:06Z', event: 'CarrierStats', CarrierID: ID, CarrierType: 'FleetCarrier', Callsign: 'KTX-01Y',
    FuelLevel: 1000, JumpRangeCurr: 500, JumpRangeMax: 500,
    SpaceUsage: { TotalCapacity: 25000, Crew: 680, Cargo: 500, CargoSpaceReserved: 1500, ShipPacks: 0, ModulePacks: 0, FreeSpace: 22320 },
    Finance: { CarrierBalance: 2376417000, ReserveBalance: 0, AvailableBalance: 2275668000 },
  });
  const c = s.carrier;
  assert.equal(c.callsign, 'KTX-01Y');
  assert.equal(c.fuel, 1000);
  assert.deepEqual(c.space, { total: 25000, crew: 680, cargo: 500, reserved: 1500, packs: 0, free: 22320 });
  assert.equal(c.available, 2275668000);
  applyEvent(s, { timestamp: '2026-10-30T01:12:00Z', event: 'CarrierLocation', CarrierID: ID, StarSystem: 'Kakmbutan', SystemAddress: 3549513615723 });
  applyEvent(s, { timestamp: '2026-10-30T01:13:00Z', event: 'CarrierDepositFuel', CarrierID: ID, Amount: 0, Total: 900 });
  assert.equal(c.fuel, 900);
  applyEvent(s, {
    timestamp: '2026-10-30T01:14:00Z', event: 'CarrierJumpRequest', CarrierID: ID, SystemName: 'Col 359 Sector PS-T d3-60',
    Body: 'Col 359 Sector PS-T d3-60 A', DepartureTime: '2026-10-30T01:29:00Z',
  });
  assert.equal(c.jump?.system, 'Col 359 Sector PS-T d3-60');
  applyEvent(s, { timestamp: '2026-10-30T01:31:00Z', event: 'CarrierLocation', CarrierID: ID, StarSystem: 'Col 359 Sector PS-T d3-60', SystemAddress: 2071977773459 });
  assert.equal(c.system, 'Col 359 Sector PS-T d3-60');
  assert.equal(c.jump, null);
  // on foot aboard: CarrierJump without MarketID, to the system the jump was scheduled for (OBSERVED 2026-10-30)
  applyEvent(s, { timestamp: '2026-10-30T01:51:36Z', event: 'CarrierJumpRequest', CarrierID: ID, SystemName: 'Col 359 Sector EJ-D b27-4', Body: '', DepartureTime: '2026-10-30T02:07:10Z' });
  applyEvent(s, { timestamp: '2026-10-30T02:08:02Z', event: 'CarrierJump', Docked: false, OnFoot: true, StarSystem: 'Col 359 Sector EJ-D b27-4', SystemAddress: 9458993997505 });
  assert.equal(c.system, 'Col 359 Sector EJ-D b27-4');
  assert.equal(c.jump, null);
  // someone else's carrier the player docks at does not replace it
  applyEvent(s, { timestamp: '2026-10-30T02:00:00Z', event: 'CarrierFinance', CarrierID: 1, CarrierBalance: 5 });
  assert.equal(c.balance, 2376417000);
});

test('carrier kept on disk: the newer copy wins', () => {
  const saved = { ...initialState().carrier, id: ID, fuel: 700, updatedAt: '2026-10-30T00:00:00Z' };
  assert.equal(mergeCarrier(saved, initialState().carrier).fuel, 700);
  assert.equal(mergeCarrier(saved, { ...saved, fuel: 600, updatedAt: '2026-10-30T01:00:00Z' }).fuel, 600);
});

test('tritium per jump matches Spansh', () => {
  // Spansh, Kakmbutan → Col 359 Sector FM-M d7-90 with 2,680 t used: 74 t then 50 t
  assert.equal(jumpFuel(499.715545061951, 2680, 124), 74);
  assert.equal(jumpFuel(323.393236705524, 2680, 50), 50);
  assert.equal(jumpFuel(159, 2680, 1000), 28);
});

// Spansh's result for Kakmbutan → Sol → Col 359 Sector FM-M d7-90 (Sol repeated with a zero hop)
const RESULT = {
  jumps: [
    { name: 'Kakmbutan', id64: 1, distance: 0, distance_to_destination: 159, is_desired_destination: 1, x: 0, y: 0, z: 0 },
    { name: 'Sol', id64: 2, distance: 159, distance_to_destination: 0, is_desired_destination: 1, x: 0, y: 0, z: 0 },
    { name: 'Sol', id64: 2, distance: 0, distance_to_destination: 926, is_desired_destination: 1, x: 0, y: 0, z: 0 },
    { name: 'Col 359 Sector VX-H b11-3', id64: 3, distance: 500, distance_to_destination: 426, has_icy_ring: true, is_system_pristine: true, x: 0, y: 0, z: 0 },
    { name: 'Col 359 Sector FM-M d7-90', id64: 4, distance: 426, distance_to_destination: 0, is_desired_destination: 1, x: 0, y: 0, z: 0 },
  ],
};

test('route hops: each system once, waypoints kept', () => {
  const hops = hopsOf(RESULT);
  assert.deepEqual(hops.map((h) => h.system), ['Kakmbutan', 'Sol', 'Col 359 Sector VX-H b11-3', 'Col 359 Sector FM-M d7-90']);
  assert.deepEqual(hops.map((h) => h.waypoint), [true, true, false, true]);
  assert.equal(hops[2].icyRing, true);
});

test('tank and cargo: top up from the cargo when the tank runs short, and say what is missing', () => {
  const hops = hopsOf(RESULT);
  // a full tank covers it all
  const full = simulate(hops, { from: 'Kakmbutan', to: [], used: 2680, fuel: 1000, tritium: 0 });
  assert.deepEqual(full.jumps.map((j) => j.fuelUsed), [0, 28, 77, 66]);
  assert.equal(full.tritium, 171);
  assert.equal(full.missing, 0);
  assert.ok(full.jumps.every((j) => !j.topUp && !j.short));
  // 100 t in the tank and 500 t in the cargo: one top-up before the long jump
  const low = simulate(hops, { from: 'Kakmbutan', to: [], used: 2680, fuel: 100, tritium: 500 });
  assert.equal(low.jumps[2].topUp, 500);
  assert.equal(low.missing, 0);
  // too little anywhere: short, and how much to buy
  const dry = simulate(hops, { from: 'Kakmbutan', to: [], used: 2680, fuel: 100, tritium: 0 });
  assert.ok(dry.jumps[2].short);
  assert.ok(dry.missing > 0);
});

// The real CargoTransfer at KTX-01Y (OBSERVED 2026-10-30): six colony commodities to the carrier.
const TRANSFER = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/colony/cargo-transfer-2026-10-30.json'), 'utf8'));

function owned() {
  const s = initialState();
  applyEvent(s, { timestamp: '2026-10-29T18:19:49Z', event: 'CarrierBuy', CarrierID: ID, Callsign: 'KTX-01Y', Location: 'Kakmbutan' });
  return s;
}

test('carrier cargo: transfers, selling into its own buy order, buying back', () => {
  const s = owned();
  applyEvent(s, { timestamp: '2026-10-30T00:35:26Z', event: 'MarketSell', MarketID: ID, Type: 'tritium', Count: 500, SellPrice: 67166, TotalSale: 33583000, AvgPricePaid: 50110 });
  // a sale at a station is not the carrier's
  applyEvent(s, { timestamp: '2026-10-30T00:40:00Z', event: 'MarketSell', MarketID: 4365114371, Type: 'gold', Count: 10, TotalSale: 1 });
  applyEvent(s, TRANSFER);
  const c = s.carrier;
  assert.equal(c.cargo.reduce((t, x) => t + x.count, 0), 1680);
  assert.deepEqual(c.cargo.find((x) => x.name === 'foodcartridges'), { name: 'foodcartridges', label: 'Food Cartridges', count: 242 });
  assert.equal(c.cargo.find((x) => x.name === 'superconductors')?.label, 'Superconductors');
  applyEvent(s, { timestamp: '2026-10-30T03:00:00Z', event: 'CargoTransfer', Transfers: [{ Type: 'superconductors', Count: 342, Direction: 'toship' }] });
  assert.equal(c.cargo.find((x) => x.name === 'superconductors'), undefined);
  applyEvent(s, { timestamp: '2026-10-30T03:01:00Z', event: 'MarketBuy', MarketID: ID, Type: 'tritium', Count: 100, TotalCost: 1 });
  assert.equal(c.cargo.find((x) => x.name === 'tritium')?.count, 400);
});

test('carrier cargo: replaying the journal onto the copy kept on disk counts nothing twice', () => {
  const events = [
    { timestamp: '2026-10-30T00:35:26Z', event: 'MarketSell', MarketID: ID, Type: 'tritium', Count: 500, TotalSale: 1 },
    TRANSFER,
    // two moves in the same second
    { timestamp: '2026-10-30T03:00:00Z', event: 'CargoTransfer', Transfers: [{ Type: 'steel', Count: 100, Direction: 'tocarrier' }] },
    { timestamp: '2026-10-30T03:00:00Z', event: 'CargoTransfer', Transfers: [{ Type: 'steel', Count: 50, Direction: 'tocarrier' }] },
  ];
  const s = owned();
  events.forEach((e) => applyEvent(s, e));
  const total = (st: typeof s) => st.carrier.cargo.reduce((t, x) => t + x.count, 0);
  assert.equal(total(s), 1830);
  // restart: the saved copy, then the same journal read again from the top, then a new move
  const again = owned();
  again.carrier = mergeCarrier(JSON.parse(JSON.stringify(s.carrier)), again.carrier);
  [{ timestamp: '2026-10-29T18:19:49Z', event: 'CarrierBuy', CarrierID: ID, Callsign: 'KTX-01Y', Location: 'Kakmbutan' }, ...events]
    .forEach((e) => applyEvent(again, e));
  assert.equal(total(again), 1830);
  applyEvent(again, { timestamp: '2026-10-30T03:00:00Z', event: 'CargoTransfer', Transfers: [{ Type: 'steel', Count: 7, Direction: 'tocarrier' }] });
  assert.equal(total(again), 1837, 'a third move in that second is new');
});
