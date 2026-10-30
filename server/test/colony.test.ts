// Colony finder: Spansh dump bodies → counts → profile scores; system-map order; candidate search body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsOf, fromDumpBody, isBody, scoopable, scoreOf, treeOrder } from '../src/colony/finder.ts';
import { blockedBy, candidatesBody, claimBody, fromClaimStation } from '../src/colony/service.ts';

// Shaped like Spansh's /api/dump bodies (OBSERVED 2026-10-29, LAWD 26).
const DUMP = [
  { bodyId: 1, name: 'X A', type: 'Star', subType: 'K (Yellow-Orange) Star', distanceToArrival: 0, belts: [{ name: 'X A A Belt' }], parents: [{ Null: 0 }] },
  {
    bodyId: 20, name: 'X A 1', type: 'Planet', subType: 'Class III gas giant', distanceToArrival: 10695, isLandable: false,
    reserveLevel: 'Pristine', terraformingState: 'Not terraformable', parents: [{ Star: 1 }, { Null: 0 }],
    rings: [{ name: 'X A 1 A Ring', type: 'Metal Rich', signals: { signals: { Rhodplumsite: 1, Serendibite: 2 } } }],
  },
  {
    bodyId: 22, name: 'X A 1 a', type: 'Planet', subType: 'Rocky body', distanceToArrival: 10692, isLandable: true,
    atmosphereType: 'Thin Carbon dioxide', terraformingState: 'Candidate for terraforming', parents: [{ Planet: 20 }, { Star: 1 }, { Null: 0 }],
    signals: { signals: { '$SAA_SignalType_Biological;': 3, '$PlanetaryMiningLocation_Name;': 28 } },
  },
  { bodyId: 5, name: 'X A 2', type: 'Planet', subType: 'Earth-like world', distanceToArrival: 500, isLandable: false, parents: [{ Star: 1 }, { Null: 0 }] },
];

test('dump bodies: landable, atmosphere, terraformable, rings with hotspots, signals, parents', () => {
  const [star, giant, moon] = DUMP.map(fromDumpBody);
  assert.equal(star.belts, 1);
  assert.equal(giant.reserve, 'Pristine');
  assert.deepEqual(giant.rings[0].hotspots, [{ name: 'Rhodplumsite', count: 1 }, { name: 'Serendibite', count: 2 }]);
  assert.equal(moon.landable, true);
  assert.equal(moon.atmosphere, 'Thin Carbon dioxide');
  assert.equal(moon.terraformable, true);
  assert.equal(moon.bio, 3);
  assert.equal(moon.miningSites, 28);
  assert.equal(moon.parent, 20);
  assert.equal(giant.terraformable, false);
  assert.ok(scoopable(star.subType));
  assert.ok(!scoopable('T Tauri Star') && !scoopable('White Dwarf (DA) Star') && !scoopable('Neutron Star'));
});

test('counts and profile scores: MINING ranks rings above BUILD, every part is listed', () => {
  const bodies = DUMP.map(fromDumpBody);
  const c = countsOf(bodies);
  assert.deepEqual(
    [c.landable, c.atmospheric, c.rings, c.pristineRings, c.metalRings, c.hotspots, c.belts, c.gasGiants, c.elw, c.terraformable, c.bio],
    [1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 3],
  );
  const mining = scoreOf(c, bodies.length, true, 'mining');
  const build = scoreOf(c, bodies.length, true, 'build');
  const ringPoints = (s: typeof mining) => s.parts.filter((p) => /ring|pristine|hotspot|belt/.test(p.label)).reduce((t, p) => t + p.points, 0);
  assert.ok(ringPoints(mining) > ringPoints(build));
  assert.equal(mining.score, Math.round(mining.parts.reduce((t, p) => t + p.points, 0)));
  assert.ok(mining.parts.every((p, i) => i === 0 || mining.parts[i - 1].points >= p.points));
});

test('Thargoid, Guardian and human signals are counted (sites that keep a system off limits)', () => {
  // HR 1358: a Thargoid signal on one body, refused in game (OBSERVED 2026-10-29)
  const b = fromDumpBody({ bodyId: 3, name: 'HR 1358 3', type: 'Planet', signals: { signals: { '$SAA_SignalType_Thargoid;': 1, '$SAA_SignalType_Human;': 2 } } });
  const c = countsOf([b, fromDumpBody({ bodyId: 4, type: 'Planet', signals: { signals: { '$SAA_SignalType_Guardian;': 1 } } })]);
  assert.deepEqual([c.thargoid, c.guardian, c.human], [1, 1, 2]);
});

test('barycentres are not bodies; a body around one hangs from its nearest real parent', () => {
  assert.equal(isBody({ type: 'Barycentre' }), false);
  const b = fromDumpBody({ bodyId: 9, name: 'X AB 1', type: 'Planet', parents: [{ Null: 3 }, { Star: 1 }, { Null: 0 }] });
  assert.equal(b.parent, 1);
  assert.equal(b.depth, 1);
});

test('a lone main star is body 0: its planets still hang from it', () => {
  const star = fromDumpBody({ bodyId: 0, name: 'Y', type: 'Star', subType: 'M (Red dwarf) Star', parents: [] });
  const planet = fromDumpBody({ bodyId: 1, name: 'Y 1', type: 'Planet', subType: 'Icy body', parents: [{ Star: 0 }] });
  assert.equal(star.parent, -1);
  assert.deepEqual(treeOrder([planet, star]).map((b) => [b.name, b.depth]), [['Y', 0], ['Y 1', 1]]);
});

test('bodies in system-map order: each under its parent', () => {
  const order = treeOrder(DUMP.map(fromDumpBody)).map((b) => [b.name, b.depth]);
  assert.deepEqual(order, [['X A', 0], ['X A 2', 1], ['X A 1', 1], ['X A 1 a', 2]]);
});

test('candidate search: unpopulated, in reach, most bodies first (no is_colonised filter: null on free systems)', () => {
  const body = candidatesBody({ radius: 300, maxPopulatedLy: 15, minBodies: 10, profile: 'balanced' }, 'AD Leonis', 2) as any;
  assert.equal(body.reference_system, 'AD Leonis');
  assert.equal(body.page, 2);
  assert.equal(body.filters.is_colonised, undefined);
  assert.deepEqual(body.filters.body_count.value, [10, 9999]);
  assert.deepEqual(body.sort, [{ body_count: { direction: 'desc' } }]);
  assert.deepEqual(body.filters.nearest_populated_distance.value, [0, 15]);
  assert.equal(body.filters.distance.max, 300);
});

test('claim stations: the System Colonisation contact within reach, docks only, nearest first', () => {
  const body = claimBody('21 Eridani', 15) as any;
  assert.deepEqual(body.filters.services, { value: ['System Colonisation'] });
  assert.equal(body.filters.distance.max, 15);
  assert.ok(!body.filters.type.value.some((t: string) => /carrier|mega/i.test(t)));
  // shaped like the Spansh answer (OBSERVED 2026-10-29 near 21 Eridani)
  const st = fromClaimStation({ system_name: 'Ceti Sector XJ-Z b5', name: "Nixon's Inheritance", type: 'Coriolis Starport', distance: 0.6, distance_to_arrival: 5, large_pads: 6 });
  assert.deepEqual(st, { system: 'Ceti Sector XJ-Z b5', station: "Nixon's Inheritance", type: 'Coriolis Starport', ls: 5, ly: 0.6, pad: 'L' });
});

test('taken or off limits: permit, colonised, a fixed station or a controlling faction; carriers do not count', () => {
  // shaped like Spansh system results (OBSERVED 2026-10-29)
  assert.equal(blockedBy({ name: '18 Camelopardalis', is_colonised: null, population: 0, stations: [] }), '');
  assert.equal(blockedBy({ stations: [{ type: 'Drake-Class Carrier' }] }), '');
  assert.equal(blockedBy({ name: 'HIP 22460', needs_permit: true }), 'permit');
  assert.equal(blockedBy({ name: '21 Eridani', controlling_minor_faction: 'Torval Mining Ltd', stations: [{ type: 'Mega ship' }] }), 'station');
  assert.equal(blockedBy({ controlling_minor_faction: 'Sirius Inc', stations: [] }), 'faction');
  assert.equal(blockedBy({ is_being_colonised: true }), 'colonised');
  assert.equal(blockedBy({ name: 'HIP 16572', allegiance: 'Thargoid', population: 0, stations: [{ type: 'Drake-Class Carrier' }] }), 'allegiance');
  assert.equal(blockedBy({ allegiance: 'None' }), '');
});
