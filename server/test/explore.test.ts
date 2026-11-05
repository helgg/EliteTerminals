// EXPLORE: Spansh bodies → the map's model, the search presets, and what the journal says was scanned.
// The Spansh shapes are from real responses (2026-10-30); the journal events follow Frontier's Journal Manual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareOrbit, designation, initialState } from '@et/shared';
import { applyEvent, type JournalEvent } from '../src/reducer.ts';
import { beltsOf, findBody, fromDump, fromSearchHit, genusName, infoOf, mixOf } from '../src/explore/bodies.ts';

const planet = {
  bodyId: 1, name: 'Col 359 Sector BL-O d6-72 1', type: 'Planet', subType: 'High metal content world',
  distanceToArrival: 321.64, isLandable: true, gravity: 1.4775, radius: 7490.3, earthMasses: 2.04,
  surfaceTemperature: 700, surfacePressure: 0, atmosphereType: null, volcanismType: 'No volcanism',
  terraformingState: 'Not terraformable', parents: [{ Star: 0 }],
  materials: { Iron: 22.8, Nickel: 17.2, Carbon: 13.5 },
  signals: { genuses: ['$Codex_Ent_Bacterial_Genus_Name;'], signals: { '$SAA_SignalType_Geological;': 3, '$SAA_SignalType_Biological;': 2 } },
  stations: [{ name: 'Roeg Vision', type: 'Planetary Construction Depot' }],
};
const star = { bodyId: 0, name: 'Col 359 Sector BL-O d6-72', type: 'Star', subType: 'A (Blue-White) Star', distanceToArrival: 0, mainStar: true, solarRadius: 1.37, solarMasses: 1.625, surfaceTemperature: 8035, parents: [] };

test('a dump body keeps what the map shows: size, signals, materials by share, genera', () => {
  const b = fromDump(planet, { scan: 15954, map: 69136 });
  assert.equal(b.id, 1);
  assert.equal(b.parent, 0);
  assert.equal(b.landable, true);
  assert.equal(b.radius, 7490.3);
  assert.equal(b.volcanism, '');
  assert.deepEqual([b.geo, b.bio], [3, 2]);
  assert.deepEqual(b.genuses, ['Bacterial']);
  assert.deepEqual(b.materials.map((m) => m.name), ['Iron', 'Nickel', 'Carbon']);
  assert.deepEqual(b.materials.map((m) => m.grade), [1, 1, 1]);
  assert.deepEqual([b.scanValue, b.mapValue], [15954, 69136]);
  assert.equal(b.stations[0].name, 'Roeg Vision');
});

test('a star is sized in km from its solar radius', () => {
  const s = fromDump(star);
  assert.equal(s.mainStar, true);
  assert.equal(Math.round(s.radius), Math.round(1.37 * 695700));
  assert.ok(s.earthMasses > 500000);
  assert.equal(s.parent, -1);
});

test('a star keeps its asteroid belts, nearest first, in light-seconds (Spansh gives metres)', () => {
  const s = fromDump({ ...star, belts: [
    { name: 'Alpha B Belt', type: 'Icy', innerRadius: 632560000, outerRadius: 1775700000 },
    { name: 'Alpha A Belt', type: 'Metal Rich', innerRadius: 21354000000, outerRadius: 215230000000 },
  ] });
  // radii are in metres: the belt of FM-M d7-90 A starts at 71 Ls and ends at 718 Ls, between its 3rd and 4th planets
  assert.deepEqual(s.belts.map((b) => [b.name, b.type, Math.round(b.innerLs), Math.round(b.outerLs)]), [['Alpha B Belt', 'Icy', 2, 6], ['Alpha A Belt', 'Metal Rich', 71, 718]]);
  assert.deepEqual(beltsOf({}), []);
  assert.deepEqual(fromDump(planet).belts, []);
});

test('bodies that share a parent follow the game numbering, not the snapshot distance', () => {
  const sys = 'Col 359 Sector FM-M d7-90';
  // from Spansh: A 18 is nearer than A 17 at the moment of the snapshot, and moon b nearer than a (both around a barycentre)
  const body = (n: string, ls: number, id: number) => ({ name: `${sys} ${n}`, ls, id });
  const sorted = [body('A 18', 7354.1, 70), body('A 17', 7397.9, 62), body('A 9', 2030.8, 30), body('A 10', 2055.5, 36)].sort((a, b) => compareOrbit(a, b, sys));
  assert.deepEqual(sorted.map((b) => b.name.slice(sys.length + 1)), ['A 9', 'A 10', 'A 17', 'A 18']);
  const moons = [body('A 9 c', 2033.5, 35), body('A 9 b', 2029.6, 34), body('A 9 a', 2029.9, 33)].sort((a, b) => compareOrbit(a, b, sys));
  assert.deepEqual(moons.map((b) => b.name.slice(-1)), ['a', 'b', 'c']);
  assert.deepEqual([designation(`${sys} A 9 a`, sys), designation(`${sys} B`, sys), designation('Earth', 'Sol'), designation('Sol A 3', 'Sol')], ['A 9 a', 'B', null, 'A 3']);
  // a one-star system names its bodies without the star letter ("d7-19 6 a"): same numbering, never the snapshot distance
  const one = 'Col 359 Sector FM-M d7-19';
  const nb = (n: string, ls: number, id: number) => ({ name: `${one} ${n}`, ls, id });
  assert.deepEqual([designation(`${one} 6 a`, one), designation(`${one} 12`, one), designation(one, one)], ['6 a', '12', null]);
  const pair = [nb('5', 307, 10), nb('4', 308, 7), nb('12', 2231, 39), nb('6', 559, 14)].sort((a, b) => compareOrbit(a, b, one));
  assert.deepEqual(pair.map((b) => b.name.slice(one.length + 1)), ['4', '5', '6', '12']);
  const sm = [nb('6 b', 558, 18), nb('6 a', 558, 17)].sort((a, b) => compareOrbit(a, b, one));
  assert.deepEqual(sm.map((b) => b.name.slice(-1)), ['a', 'b']);
  // named bodies (Sol) keep the distance order, and a mix never throws
  const named = [{ name: 'Mars', ls: 824, id: 6 }, { name: 'Earth', ls: 506, id: 5 }, { name: 'Venus', ls: 363, id: 4 }].sort((a, b) => compareOrbit(a, b, 'Sol'));
  assert.deepEqual(named.map((b) => b.name), ['Venus', 'Earth', 'Mars']);
});

test('genus names and atmosphere mixes read both Spansh shapes', () => {
  assert.equal(genusName('$Codex_Ent_Fungoids_Genus_Name;'), 'Fungoids');
  assert.equal(genusName({ name: 'Osseus' }), 'Osseus');
  assert.deepEqual(mixOf({ Argon: 30, Neon: 70 }).map((x) => x.name), ['Neon', 'Argon']);
  assert.deepEqual(mixOf([{ name: 'Argon', share: 100 }]), [{ name: 'Argon', share: 100 }]);
  assert.deepEqual(mixOf(null), []);
});

test('the presets ask Spansh for the right bodies', () => {
  const bio = findBody({ preset: 'bio', reference: 'Sol', radius: 80, minBio: 4 });
  assert.deepEqual(bio.filters.signals, [{ name: 'Biological', value: [4, 99] }]);
  assert.deepEqual(bio.filters.is_landable, { value: true });
  assert.deepEqual(findBody({ preset: 'elw', reference: 'Sol', radius: 50 }).filters.subtype, { value: ['Earth-like world'] });
  const terra = findBody({ preset: 'terra', reference: 'Sol', radius: 50 });
  assert.deepEqual(terra.filters.terraforming_state, { value: ['Terraformable'] });
  assert.deepEqual(terra.sort, [{ estimated_scan_value: { direction: 'desc' } }]);
  assert.deepEqual(findBody({ preset: 'geo', reference: 'Sol', radius: 50, landableOnly: true }).filters.is_landable, { value: true });
});

test('a search hit lists the species others logged, richest first; each pays once, however often it was seen', () => {
  const t = fromSearchHit({
    system_name: 'Luhman 16', system_id64: 22960358574928, name: 'Luhman 16 A 3', subtype: 'Rocky body', distance: 6.6, distance_to_arrival: 1688,
    is_landable: true, atmosphere: 'Thin Argon', gravity: 0.26, estimated_scan_value: 500, estimated_mapping_value: 2221,
    signals: [{ count: 5, name: 'Planetary Mining Location' }, { count: 4, name: 'Biological' }],
    genuses: [{ name: 'Fungoids' }, { name: 'Bacterial' }],
    landmarks: [
      { type: 'Bacterium', subtype: 'Bacterium Vesicula', value: 1000000 },
      { type: 'Bacterium', subtype: 'Bacterium Vesicula', value: 1000000 },
      { type: 'Fungoida', subtype: 'Fungoida Bullarum', value: 3703200 },
      { type: 'Surface Station', subtype: 'Settlement', value: 0 },
    ],
  });
  assert.equal(t.id64, 22960358574928);
  assert.equal(t.bio, 4);
  assert.deepEqual(t.species.map((x) => [x.name, x.count]), [['Fungoida Bullarum', 1], ['Bacterium Vesicula', 2]]);
  assert.equal(t.bioValue, 3703200 + 1000000);
  assert.deepEqual(t.genuses, ['Fungoids', 'Bacterial']);
});

const run = (events: JournalEvent[], s = initialState()) => {
  events.forEach((e, i) => applyEvent(s, { timestamp: `2026-10-30T15:${String(i).padStart(2, '0')}:00Z`, ...e }));
  return s;
};

test('scans, signals and samples of the current system are kept, and a new system starts over', () => {
  const s = run([
    { event: 'FSDJump', StarSystem: 'Alpha', SystemAddress: 11 },
    { event: 'FSSDiscoveryScan', BodyCount: 9, NonBodyCount: 2 },
    { event: 'Scan', ScanType: 'AutoScan', BodyID: 0, BodyName: 'Alpha', SystemAddress: 11, WasDiscovered: true, WasMapped: false },
    { event: 'Scan', ScanType: 'Detailed', BodyID: 3, BodyName: 'Alpha 3', SystemAddress: 11, WasDiscovered: false, WasMapped: false },
    { event: 'Scan', ScanType: 'AutoScan', BodyID: 3, BodyName: 'Alpha 3', SystemAddress: 11 },
    { event: 'FSSBodySignals', BodyID: 3, Signals: [{ Type: '$SAA_SignalType_Biological;', Count: 4 }, { Type: '$SAA_SignalType_Geological;', Count: 1 }] },
    { event: 'SAAScanComplete', BodyID: 3, BodyName: 'Alpha 3' },
    { event: 'SAASignalsFound', BodyID: 3, Signals: [{ Type: '$SAA_SignalType_Biological;', Count: 4 }], Genuses: [{ Genus: '$Codex_Ent_Tussocks_Genus_Name;', Genus_Localised: 'Tussocks' }] },
    { event: 'ScanOrganic', ScanType: 'Log', Genus: '$Codex_Ent_Tussocks_Genus_Name;', Species: '$Codex_Ent_Tussocks_01_Name;', Species_Localised: 'Tussock Pennata', Variant_Localised: 'Tussock Pennata - Green', Body: 3 },
    { event: 'ScanOrganic', ScanType: 'Sample', Genus_Localised: 'Tussocks', Species_Localised: 'Tussock Pennata', Variant_Localised: 'Tussock Pennata - Green', Body: 3 },
  ]);
  const x = s.explore;
  assert.deepEqual([x.system, x.bodyCount, x.nonBodyCount], ['Alpha', 9, 2]);
  const b3 = x.bodies.find((b) => b.id === 3)!;
  assert.deepEqual([b3.scan, b3.mapped, b3.wasDiscovered, b3.bio, b3.geo, b3.genuses], ['detailed', true, false, 4, 1, ['Tussocks']]);
  assert.equal(x.bodies.find((b) => b.id === 0)!.wasDiscovered, true);
  assert.equal(x.organics.length, 1);
  assert.deepEqual([x.organics[0].stage, x.organics[0].species], [2, 'Tussock Pennata']);

  run([{ event: 'FSDJump', StarSystem: 'Beta', SystemAddress: 22 }], s);
  assert.deepEqual([s.explore.system, s.explore.bodies.length, s.explore.organics.length], ['Beta', 0, 0]);
});

test('a scan from another system (nav beacon) does not land in this one', () => {
  const s = run([
    { event: 'Location', StarSystem: 'Alpha', SystemAddress: 11 },
    { event: 'Scan', ScanType: 'NavBeaconDetail', BodyID: 5, BodyName: 'Far 5', SystemAddress: 99 },
  ]);
  assert.equal(s.explore.bodies.length, 0);
});

test('a binary: the planets of the pair share the main star\'s line, a bare companion is stacked with it, pairs share one place, a star with its own planets is on the line', async () => {
  const { orbitTree } = await import('../../web/src/lib/explore/explore.ts');
  const sys = 'Col 359 Sector FM-M d7-48';
  // parents as in Spansh's dump (2026-10-31): A and B orbit the system centre (Null 0); AB 8 shares barycentre 45 with the star AB 7
  const b = (id: number, name: string, type: string, parents: object[], extra: object = {}) =>
    fromDump({ bodyId: id, name: `${sys} ${name}`, type, distanceToArrival: id * 10, parents, ...extra });
  const bodies = [
    b(1, 'A', 'Star', [{ Null: 0 }], { mainStar: true }),
    b(2, 'B', 'Star', [{ Null: 0 }]),
    b(3, 'AB 1', 'Planet', [{ Null: 0 }]),
    b(6, 'AB 1 a', 'Planet', [{ Planet: 3 }, { Null: 0 }]),
    b(11, 'AB 2', 'Planet', [{ Null: 10 }, { Null: 0 }]),
    b(19, 'AB 3', 'Planet', [{ Null: 10 }, { Null: 0 }]),
    b(46, 'AB 7', 'Star', [{ Null: 45 }, { Null: 0 }], { subType: 'Y (Brown dwarf) Star' }),
    b(48, 'AB 7 a', 'Planet', [{ Star: 46 }, { Null: 45 }, { Null: 0 }]),
    b(49, 'AB 8', 'Planet', [{ Null: 45 }, { Null: 0 }]),
    b(50, 'AB 9', 'Star', [{ Null: 0 }], { subType: 'Y (Brown dwarf) Star' }),
    b(53, 'AB 9 a', 'Planet', [{ Star: 50 }, { Null: 0 }]),
  ];
  const tree = orbitTree(bodies, sys);
  const nm = (x: { name: string }) => x.name.slice(sys.length + 1);
  assert.equal(tree.length, 1);
  // the centre: A and its bare companion B, stacked
  assert.deepEqual(tree[0].centre.map(nm), ['A', 'B']);
  // one line, in the game's order; bodies around one barycentre (AB 2 + AB 3, AB 7 + AB 8) share a place; AB 9 is on the line too
  assert.deepEqual(tree[0].cols.map((c) => c.map((n) => nm(n.body))), [['AB 1'], ['AB 2', 'AB 3'], ['AB 7', 'AB 8'], ['AB 9']]);
  assert.deepEqual(tree[0].cols[0][0].kids.map((n) => nm(n.body)), ['AB 1 a']);
  assert.deepEqual(tree[0].cols[2][0].kids.map((n) => nm(n.body)), ['AB 7 a']);
  assert.deepEqual(tree[0].cols[3][0].kids.map((n) => nm(n.body)), ['AB 9 a']);
  // a single star is unchanged
  const solo = orbitTree([b(0, 'A', 'Star', [], { mainStar: true }), b(1, 'A 1', 'Planet', [{ Star: 0 }])], sys);
  assert.equal(solo.length, 1);
  assert.deepEqual(solo[0].centre.map(nm), ['A']);
  assert.deepEqual(solo[0].cols.map((c) => c.length), [1]);
});

test('a wide binary: each true star keeps its own line; pairs under a star group by their barycentre, nested ones in one group', async () => {
  const { orbitTree } = await import('../../web/src/lib/explore/explore.ts');
  const sys = 'Col 359 Sector FM-M d7-90';
  const b = (id: number, name: string, type: string, parents: object[], extra: object = {}) =>
    fromDump({ bodyId: id, name: `${sys} ${name}`, type, subType: type === 'Star' ? 'M (Red dwarf) Star' : '', distanceToArrival: id * 10, parents, ...extra });
  const bodies = [
    b(1, 'A', 'Star', [{ Null: 0 }], { mainStar: true }),
    b(2, 'B', 'Star', [{ Null: 0 }]),
    b(3, 'A 1', 'Planet', [{ Star: 1 }, { Null: 0 }]),
    b(15, 'A 4', 'Planet', [{ Null: 14 }, { Star: 1 }, { Null: 0 }]),
    b(18, 'A 5', 'Planet', [{ Null: 14 }, { Star: 1 }, { Null: 0 }]),
    b(23, 'A 6', 'Planet', [{ Null: 22 }, { Null: 21 }, { Star: 1 }, { Null: 0 }]),
    b(25, 'A 7', 'Planet', [{ Null: 22 }, { Null: 21 }, { Star: 1 }, { Null: 0 }]),
    b(26, 'A 8', 'Planet', [{ Null: 21 }, { Star: 1 }, { Null: 0 }]),
    b(77, 'B 1', 'Planet', [{ Star: 2 }, { Null: 0 }]),
    b(82, 'B 5', 'Planet', [{ Null: 81 }, { Star: 2 }, { Null: 0 }]),
    b(86, 'B 6', 'Planet', [{ Null: 81 }, { Star: 2 }, { Null: 0 }]),
    b(88, 'B 6 a', 'Planet', [{ Planet: 86 }, { Null: 81 }, { Star: 2 }, { Null: 0 }]),
  ];
  const nm = (x: { name: string }) => x.name.slice(sys.length + 1);
  const tree = orbitTree(bodies, sys);
  assert.deepEqual(tree.map((r) => nm(r.body)), ['A', 'B']);
  assert.deepEqual(tree[0].centre.map(nm), ['A']);
  assert.deepEqual(tree[0].cols.map((c) => c.map((n) => nm(n.body))), [['A 1'], ['A 4', 'A 5'], ['A 6', 'A 7', 'A 8']]);
  assert.deepEqual(tree[1].centre.map(nm), ['B']);
  assert.deepEqual(tree[1].cols.map((c) => c.map((n) => nm(n.body))), [['B 1'], ['B 5', 'B 6']]);
  assert.deepEqual(tree[1].cols[1][1].kids.map((n) => nm(n.body)), ['B 6 a']);
});

test('fromDump carries the orbit, rotation, tilt and composition of a moon (Col 359 Sector FM-M d7-90 B 9 a)', () => {
  const b = fromDump({
    bodyId: 100, name: 'Col 359 Sector FM-M d7-90 B 9 a', type: 'Planet', subType: 'Icy body', isLandable: true, distanceToArrival: 122946.99,
    parents: [{ Planet: 98 }, { Star: 2 }, { Null: 0 }], orbitalPeriod: 0.778354925, semiMajorAxis: 0.001365, orbitalEccentricity: 0.000157,
    orbitalInclination: 0.001928, rotationalPeriod: -0.778409, rotationalPeriodTidallyLocked: false, axialTilt: 2.56528,
    solidComposition: { Ice: 82.0396, Metal: 1.6098, Rock: 16.3506 }, volcanismType: 'Major Water Geysers',
  });
  assert.equal(b.orbit?.period, 0.778354925);
  assert.equal(b.orbit?.semiMajorAu, 0.001365);
  assert.equal(b.rotation < 0, true); // retrograde
  assert.equal(b.tidalLock, false);
  assert.ok(Math.abs(b.tilt - 146.98) < 0.01, `tilt ${b.tilt}`); // radians in the dump, degrees for us (the portal shows 146.98°)
  assert.deepEqual(b.composition.map((c) => c.name), ['Ice', 'Rock', 'Metal']);
});

test('a star has no orbit when Spansh gives none', () => {
  assert.equal(fromDump({ bodyId: 0, name: 'X', type: 'Star', subType: 'A (Blue-White) Star' }).orbit, null);
});

test('infoOf reads the system record: permit, freshness and the empty economies', () => {
  const i = infoOf({ population: 0, government: 'None', security: 'Anarchy', primary_economy: 'None', secondary_economy: 'None', needs_permit: false, updated_at: '2026-06-04T05:37:17Z' });
  assert.deepEqual(i, { population: 0, allegiance: '', government: '', security: 'Anarchy', economy: '', secondaryEconomy: '', permit: false, updatedAt: '2026-06-04T05:37:17Z' });
  assert.equal(infoOf(null).updatedAt, '');
  assert.equal(infoOf({ needs_permit: true }).permit, true);
});
