// MINING state: prospected asteroids, refined tons, limpets, tools, rings and hotspots.
// Event shapes follow Frontier's public Journal Manual (no mining journal of the player yet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '@et/shared';
import { applyEvent, type JournalEvent } from '../src/reducer.ts';
import { contentLevel, metres, systemRings } from '../src/mining.ts';
import { hotspotBody, hotspotMatches, ringsOf } from '../src/rings.ts';
import { commodityQuotes } from '../src/trade/engine.ts';

const run = (events: JournalEvent[], s = initialState()) => {
  events.forEach((e, i) => applyEvent(s, { timestamp: `2026-10-26T21:${String(i).padStart(2, '0')}:00Z`, ...e }));
  return s;
};

const prospect = (extra: Record<string, unknown> = {}): JournalEvent => ({
  event: 'ProspectedAsteroid',
  Materials: [
    { Name: 'HydrogenPeroxide', Name_Localised: 'Hydrogen Peroxide', Proportion: 10.189 },
    { Name: 'LowTemperatureDiamond', Name_Localised: 'Low Temperature Diamonds', Proportion: 26.078 },
  ],
  Content: '$AsteroidMaterialContent_Low;', Content_Localised: 'Material Content: Low', Remaining: 100.0,
  ...extra,
});

test('a prospected asteroid lists its materials biggest first, with content and core', () => {
  const s = run([prospect({ MotherlodeMaterial: 'Alexandrite' }), prospect({ Remaining: 42.5, Content: '$AsteroidMaterialContent_High;' })]);
  const [last, first] = s.mining.prospects;
  assert.equal(s.mining.session.prospected, 2);
  assert.deepEqual(last.materials.map((m) => m.label), ['Low Temperature Diamonds', 'Hydrogen Peroxide']);
  assert.equal(last.content, 'High');
  assert.equal(last.remaining, 42.5);
  assert.equal(last.motherlode, '');
  assert.equal(first.motherlode, 'Alexandrite');
  assert.equal(first.content, 'Low');
});

test('the prospect history keeps the last 30 asteroids', () => {
  const s = run(Array.from({ length: 35 }, () => prospect()));
  assert.equal(s.mining.prospects.length, 30);
  assert.equal(s.mining.session.prospected, 35);
});

test('refined tons count per commodity, most first, with the time span', () => {
  const s = run([
    { event: 'MiningRefined', Type: '$platinum_name;', Type_Localised: 'Platinum' },
    { event: 'MiningRefined', Type: '$painite_name;', Type_Localised: 'Painite' },
    { event: 'MiningRefined', Type: '$painite_name;', Type_Localised: 'Painite' },
    { event: 'AsteroidCracked', Body: 'Borann A 2 A Ring' },
    { event: 'LaunchDrone', Type: 'Prospector' },
    { event: 'LaunchDrone', Type: 'Collection' },
    { event: 'LaunchDrone', Type: 'Collection' },
    { event: 'LaunchDrone', Type: 'Repair' },
  ]);
  const ss = s.mining.session;
  assert.deepEqual(ss.refined, [{ name: 'painite', label: 'Painite', count: 2 }, { name: 'platinum', label: 'Platinum', count: 1 }]);
  assert.equal(ss.firstRefinedAt, '2026-10-26T21:00:00Z');
  assert.equal(ss.lastRefinedAt, '2026-10-26T21:02:00Z');
  assert.equal(ss.cracked, 1);
  assert.equal(ss.prospectors, 1);
  assert.equal(ss.collectors, 2);
});

test('a new game session restarts the counters but keeps the tools', () => {
  const s = run([
    { event: 'Loadout', Ship: 'python', Modules: [{ Item: 'hpt_mininglaser_fixed_medium' }] },
    { event: 'MiningRefined', Type: '$platinum_name;' },
    { event: 'Fileheader', gameversion: '4.2' },
  ]);
  assert.equal(s.mining.session.refined.length, 0);
  assert.equal(s.mining.tools.lasers, 1);
});

test('the loadout tells which mining tools are fitted', () => {
  const s = run([{
    event: 'Loadout', Ship: 'python', Modules: [
      { Item: 'Hpt_MiningLaser_Fixed_Medium' }, { Item: 'hpt_mininglaser_fixed_medium' },
      { Item: 'hpt_mining_seismchrgwarhead_turret_medium' }, { Item: 'hpt_mining_subsurfdispmisle_fixed_small' },
      { Item: 'hpt_mining_abrblstr_fixed_small' }, { Item: 'hpt_mrascanner_size0_class3' },
      { Item: 'int_dronecontrol_prospector_size1_class5' }, { Item: 'int_multidronecontrol_mining_size3_class3' },
      { Item: 'int_refinery_size4_class5' },
    ],
  }]);
  assert.deepEqual(s.mining.tools, {
    lasers: 2, abrasion: 1, seismic: 1, subsurface: 1, pulseWave: true, prospector: true, collector: true, refinery: true,
  });
});

test('material content levels', () => {
  assert.equal(contentLevel('$AsteroidMaterialContent_Medium;'), 'Medium');
  assert.equal(contentLevel(''), '');
});

// Spansh body search answer for Borann A 2 (shape OBSERVED 2026-10-26).
const borannA2 = {
  name: 'Borann A 2', system_name: 'Borann', distance_to_arrival: 1212.5, reserve_level: 'Pristine', distance: 12.3,
  rings: [
    { name: 'Borann A 2 A Ring', type: 'Metal Rich', signals: [{ name: 'Platinum', count: 3 }, { name: 'Painite', count: 10 }] },
    { name: 'Borann A 2 B Ring', type: 'Icy', signals: [{ name: 'Low Temperature Diamonds', count: 3 }] },
  ],
};

test('Spansh rings: type, reserve, hotspots most first', () => {
  const [a, b] = ringsOf(borannA2);
  assert.equal(a.name, 'Borann A 2 A Ring');
  assert.equal(a.body, 'Borann A 2');
  assert.equal(a.reserve, 'Pristine');
  assert.deepEqual(a.signals.map((x) => x.name), ['Painite', 'Platinum']);
  assert.equal(b.type, 'Icy');
  assert.deepEqual(ringsOf({ name: 'Borann A 1' }), []);
});

test('own ring scans replace Spansh, and add rings Spansh does not know', () => {
  const s = run([{
    event: 'SAASignalsFound', BodyName: 'Borann A 2 B Ring', SystemAddress: 1, BodyID: 22,
    Signals: [{ Type: 'LowTemperatureDiamond', Type_Localised: 'Low Temperature Diamonds', Count: 4 }],
  }, {
    event: 'SAASignalsFound', BodyName: 'Borann B 8 A Ring', SystemAddress: 1, BodyID: 70,
    Signals: [{ Type: 'Tritium', Type_Localised: 'Tritium', Count: 1 }],
  }, {
    event: 'SAASignalsFound', BodyName: 'Borann A 1', Signals: [{ Type: '$SAA_SignalType_Geological;', Count: 2 }],
  }]);
  assert.deepEqual(Object.keys(s.mining.scanned), ['Borann A 2 B Ring', 'Borann B 8 A Ring']);
  const rings = systemRings('Borann', ringsOf(borannA2), s.mining.scanned)!;
  assert.equal(rings.length, 3);
  assert.deepEqual(rings[1].signals, [{ name: 'Low Temperature Diamonds', count: 4 }]);
  assert.equal(rings[1].own, true);
  assert.equal(rings[2].body, 'Borann B 8');
  assert.equal(systemRings('Sol', null, s.mining.scanned), null);
});

test('hotspot finder: one row per ring with enough hotspots of the commodity', () => {
  const rows = hotspotMatches([borannA2], { commodity: 'Platinum', minCount: 1 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ring, 'Borann A 2 A Ring');
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].distance, 12.3);
  assert.equal(hotspotMatches([borannA2], { commodity: 'Platinum', minCount: 4 }).length, 0);
  const body = hotspotBody({ commodity: 'Painite', reference: 'Sol', radius: 80, minCount: 2, pristine: true }, 1);
  assert.deepEqual(body.filters.reserve_level, { value: ['Pristine'] });
  assert.equal(body.page, 1);
});

test('mined commodities match market names (journal internal names vs Spansh names)', () => {
  const market = {
    marketId: 1, station: 'Hub', system: 'Borann', systemId64: 1, pos: [0, 0, 0] as [number, number, number], ls: 100,
    type: 'Coriolis Starport', planetary: false, pads: { s: 1, m: 1, l: 1 }, state: '', updatedAt: new Date().toISOString(),
    source: 'spansh' as const, items: [{ name: 'Low Temperature Diamonds', buy: 0, sell: 120000, supply: 0, demand: 500 }],
  };
  const q = {
    radius: 50, maxAgeH: 0, pad: 'L' as const, planetary: false, carriers: false, exportHere: false, importHere: false,
    states: [], hops: 1, maxLs: 0, minSupply: 0, minDemand: 0, cargo: 0, capital: 0, jumpRange: 0,
  };
  assert.equal(commodityQuotes([market], 'lowtemperaturediamond', q, [0, 0, 0]).sell[0].price, 120000);
});

const status = (lat: number, lon: number, extra: Record<string, unknown> = {}): JournalEvent => ({
  event: 'Status', Flags: 0, Latitude: lat, Longitude: lon, Altitude: 0, PlanetRadius: 2_000_000, BodyName: 'Phoenix A 3', ...extra,
});

test('the trail keeps points 25 m apart on the same body, and starts again on another', () => {
  // 1e-3 degrees on a 2,000 km body is ~35 m; 1e-4 is ~3.5 m
  const s = run([status(10, 20), status(10.0001, 20), status(10.001, 20), status(10.002, 20)]);
  assert.equal(s.mining.trail.body, 'Phoenix A 3');
  assert.equal(s.mining.trail.points.length, 3);
  run([status(-5, 1, { BodyName: 'Phoenix A 4' })], s);
  assert.deepEqual(s.mining.trail.points, [{ lat: -5, lon: 1, alt: 0 }]);
  assert.equal(Math.round(metres({ lat: 0, lon: 0, alt: 0 }, { lat: 0.001, lon: 0, alt: 0 }, 2_000_000)), 35);
});

test('a prospect remembers where the ship was, when the game gave a position', () => {
  const s = run([status(10, 20, { Altitude: 120 }), prospect()]);
  assert.deepEqual(s.mining.prospects[0].pos, { lat: 10, lon: 20, alt: 120 });
  run([{ event: 'Status', Flags: 0 }, prospect()], s);
  assert.equal(s.mining.prospects[0].pos, null);
});
