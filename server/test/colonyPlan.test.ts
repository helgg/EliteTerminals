import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProfiles, defaultPlanConfig, FACILITIES, guessSurface, planSystem, potentials, systemReserve, type ExploreBody, type PlanConfig } from '@et/shared';
import { fromDump } from '../src/explore/bodies.ts';

const SYS = 'Col 359 Sector FM-M d7-90';
let id = 0;
// a few moons and giants of the system (radii, geology and volcanism from the Spansh dump, 2026-11-02)
const body = (name: string, subType: string, radius: number, geo: number, volcanism: string): ExploreBody =>
  fromDump({
    bodyId: ++id, name: `${SYS} ${name}`, type: 'Planet', subType, isLandable: radius < 3000 && !/giant/i.test(subType) || radius === 7581, radius,
    volcanismType: volcanism || 'No volcanism', signals: geo ? { signals: { '$SAA_SignalType_Geological;': geo } } : {}, parents: [{ Star: 1 }],
  });
const bodies = [
  body('B 9', 'Class I gas giant', 60000, 0, ''),
  body('B 9 a', 'Icy body', 1585, 2, 'Major Water Geysers'),
  body('B 9 b', 'Icy body', 1185, 2, 'Major Water Geysers'),
  body('B 9 c', 'Icy body', 958, 0, ''),
  body('B 4', 'High metal content world', 7581, 3, 'Minor Metallic Magma'),
  body('A 9 a', 'Rocky body', 1304, 3, 'Minor Metallic Magma'),
];
const cfg = (over: Partial<PlanConfig> = {}): PlanConfig => ({ ...defaultPlanConfig(), ...over });

test('slot estimates follow the radius and geology seen on 26 bodies', () => {
  assert.equal(guessSurface({ radius: 958, landable: true, geo: 0 }), 1); // B 9 c: 1
  assert.equal(guessSurface({ radius: 1185, landable: true, geo: 2 }), 2); // B 9 b: 2
  assert.equal(guessSurface({ radius: 1585, landable: true, geo: 2 }), 3); // B 9 a: 3
  assert.equal(guessSurface({ radius: 1603, landable: true, geo: 0 }), 2); // B 9 e: 2
  assert.equal(guessSurface({ radius: 7581, landable: true, geo: 3 }), 6); // B 4: 6
  assert.equal(guessSurface({ radius: 60000, landable: false, geo: 0 }), 0);
});

test('a moon with geology and volcanism offers extraction 1.0 + 0.4 + 0.4 with good reserves (the A 9 a popup)', () => {
  const a9a = bodies.find((b) => b.name.endsWith('A 9 a'))!;
  assert.equal(potentials(a9a, true).find((p) => p.econ === 'extraction')!.value, 1.8);
  assert.equal(potentials(a9a, false).find((p) => p.econ === 'extraction')!.value, 1.4);
  assert.equal(potentials(a9a, true).find((p) => p.econ === 'refinery')!.value, 1.4); // rocky + reserves: 1.4 in the popup
  const b9a = bodies.find((b) => b.name.endsWith('B 9 a'))!;
  assert.equal(potentials(b9a, true).find((p) => p.econ === 'industrial')!.value, 1.4); // icy: 1.0 + 0.4
});

test('the facility catalogue keeps the costs read in the build list', () => {
  const by = (k: string) => FACILITIES.find((f) => f.id === k)!;
  assert.deepEqual([by('coriolis').t2, by('coriolis').t3], [-3, 1]);
  assert.deepEqual([by('mining-settlement-l').t2, by('mining-settlement-l').t3], [-1, 2]);
  assert.equal(by('ocellus').t3, -6);
  assert.equal(by('industrial-outpost').t2, 1);
});

test('the plan earns 3 T2 with cheap builds before the first Coriolis, and the balance never goes negative', () => {
  const p = planSystem(SYS, bodies, cfg({ steps: 8 }));
  assert.equal(p.start.t2, 0);
  const firstAnchor = p.steps.findIndex((s) => s.purpose === 'anchor');
  assert.equal(p.steps[firstAnchor].kind.id, 'coriolis');
  assert.equal(firstAnchor, 3); // three +1 T2 steps first
  for (const s of p.steps) assert.ok(s.after.t2 >= 0 && s.after.t3 >= 0, `${s.key}: ${JSON.stringify(s.after)}`);
  assert.equal(p.steps[firstAnchor].after.t3, 2); // 1 T3 now + 1 from the Coriolis
});

test('steps use a slot only while one is free', () => {
  const p = planSystem(SYS, bodies, cfg({ steps: 30 }));
  const used = new Map<string, number>();
  for (const s of p.steps) used.set(`${s.body}|${s.slot}`, (used.get(`${s.body}|${s.slot}`) ?? 0) + 1);
  for (const [k, n] of used) {
    const [name, slot] = k.split('|');
    const sl = p.slots.find((x) => x.name === name)!;
    assert.ok(n <= (slot === 'surface' ? sl.surface : sl.orbital), `${k} used ${n}`);
  }
});

test('marking steps done applies them to the balance and the slots before the rest is planned', () => {
  const first = planSystem(SYS, bodies, cfg({ steps: 4 }));
  const done = first.steps.slice(0, 3).map((s) => s.key);
  const next = planSystem(SYS, bodies, cfg({ steps: 4, done }));
  assert.equal(next.steps.filter((s) => s.done).length, 3);
  assert.deepEqual(next.steps[2].after, first.steps[2].after);
  assert.equal(next.steps[3].kind.id, 'coriolis');
  assert.ok(!next.steps.slice(3).some((s) => done.includes(s.key)), 'a done step is not planned twice');
});

test('the profile steers the builds: extraction picks mining, high tech picks science', () => {
  const ext = planSystem(SYS, bodies, cfg({ profile: 'extraction', steps: 3 }));
  const sci = planSystem(SYS, bodies, cfg({ profile: 'hightech', steps: 3 }));
  assert.ok(ext.steps.some((s) => s.kind.econ === 'extraction'), ext.steps.map((s) => s.kind.id).join());
  assert.ok(sci.steps.some((s) => s.kind.econ === 'hightech'), sci.steps.map((s) => s.kind.id).join());
  const custom = planSystem(SYS, bodies, cfg({ profile: 'custom', weights: { extraction: 0, industrial: 3, refinery: 0, hightech: 0, tourism: 0, agriculture: 0 }, steps: 3 }));
  assert.ok(custom.steps.every((s) => s.kind.econ === 'industrial' || s.kind.econ === null), custom.steps.map((s) => s.kind.id).join());
});

test('typed slots win over the estimate, and an excluded body is left out', () => {
  const p = planSystem(SYS, bodies, cfg({ steps: 6, slots: { [`${SYS} B 4`]: { surface: 1 } }, excluded: [`${SYS} B 9 a`] }));
  assert.equal(p.slots.find((s) => s.name.endsWith('B 4'))!.surface, 1);
  assert.equal(p.slots.find((s) => s.name.endsWith('B 4'))!.surfaceGuess, false);
  assert.ok(!p.steps.some((s) => s.body.endsWith('B 9 a')));
});

test('no bodies end the plan with a note instead of looping', () => {
  const none = planSystem(SYS, [], cfg());
  assert.equal(none.steps.length, 0);
  assert.ok(none.notes.length > 0);
  assert.equal(systemReserve(bodies), '');
});

import { sanitizePlan } from '../src/colony/plans.ts';
test('sanitizePlan keeps what is valid and clamps or drops the rest', () => {
  const c = sanitizePlan({
    profile: 'nonsense', weights: { extraction: 9, industrial: -2, hightech: 'x' }, points: { t2: -5, t3: 4.4 },
    slots: { 'A 1': { surface: 3, orbital: '' }, 'B 2': { surface: 99 }, bad: 5 }, done: ['a@b', 7], excluded: 'no', steps: 500, extra: 1,
  });
  assert.equal(c.profile, 'balanced');
  assert.equal(c.weights.extraction, 3);
  assert.equal(c.weights.industrial, 0);
  assert.equal(c.weights.hightech, 1);
  assert.deepEqual(c.points, { t2: 0, t3: 4 });
  assert.deepEqual(c.slots, { 'A 1': { surface: 3 }, 'B 2': { surface: 12 } });
  assert.deepEqual(c.done, ['a@b']);
  assert.deepEqual(c.excluded, []);
  assert.equal(c.hub, '');
  assert.equal(c.steps, 200);
  assert.equal('extra' in c, false);
  assert.deepEqual(sanitizePlan(null), sanitizePlan({}));
});

test('bodies far from the hub lose to bodies near it, so the plan stays where the carrier waits', () => {
  const far = body('A 15 a', 'Rocky body', 819, 3, 'Major Silicate Vapour Geysers');
  const near = body('B 9 a', 'Icy body', 1585, 2, 'Major Water Geysers');
  (far as { ls: number }).ls = 5125;
  (near as { ls: number }).ls = 122947;
  const set = [far, near];
  const blind = planSystem(SYS, set, cfg({ steps: 1 }));
  const hub = planSystem(SYS, set, cfg({ steps: 1 }), { ls: 122955, body: '' });
  assert.ok(hub.steps[0].body.endsWith('B 9 a'), hub.steps[0].body);
  assert.ok(blind.steps[0].body.endsWith('A 15 a'), 'without a hub the richer body wins');
  assert.ok(hub.steps[0].score > 0);
});

test('a balanced plan spreads over economies where a focused one piles up', () => {
  const many = Array.from({ length: 6 }, (_, i) => body(`B 9 ${'abcdef'[i]}`, 'Icy body', 1600, 2, 'Major Water Geysers'));
  const spread = planSystem(SYS, many, cfg({ steps: 6 }));
  const focused = planSystem(SYS, many, cfg({ steps: 6, profile: 'extraction' }));
  const kinds = (p: ReturnType<typeof planSystem>) => new Set(p.steps.map((s) => s.econ).filter(Boolean)).size;
  assert.ok(kinds(spread) > kinds(focused), `${kinds(spread)} vs ${kinds(focused)}`);
});

test('the first station takes one orbital slot of its body, typed counts included', () => {
  const moon = bodies.find((b) => b.name.endsWith('B 9 a'))!;
  const typed = { [moon.name]: { surface: 0, orbital: 1 } };
  const free = planSystem(SYS, [moon], cfg({ steps: 3, slots: typed }));
  const used = planSystem(SYS, [moon], cfg({ steps: 3, slots: typed }), { ls: 0, body: moon.name });
  assert.equal(free.steps.length, 1);
  assert.equal(used.steps.length, 0);
  assert.equal(used.slots[0].orbitalFree, 0);
});

test('a body with no economy only gets what its stats are worth, and nothing when no stat matters', () => {
  const gg = body('B 9', 'Class I gas giant', 60000, 0, '');
  const slots = { [gg.name]: { orbital: 4 } };
  const some = planSystem(SYS, [gg], cfg({ steps: 6, slots }));
  assert.ok(some.steps.length > 0 && some.steps.every((s) => s.econ === null || s.kind.stats.tech || s.kind.stats.dev || s.kind.stats.sol));
  const none = planSystem(SYS, [gg], cfg({ steps: 6, slots, stats: { security: 0, wealth: 0, tech: 0, sol: 0, dev: 0 } }));
  assert.equal(none.steps.length, 0);
  assert.ok(none.notes.some((n) => /worth building/.test(n)));
});

test('the stat priorities steer the free slots: security first picks a security build, tech first picks research', () => {
  const gg = body('B 9', 'Class I gas giant', 60000, 0, '');
  const slots = { [gg.name]: { orbital: 1 } };
  const off = { security: 0, wealth: 0, tech: 0, sol: 0, dev: 0 };
  const sec = planSystem(SYS, [gg], cfg({ steps: 1, slots, stats: { ...off, security: 3 } }));
  const tech = planSystem(SYS, [gg], cfg({ steps: 1, slots, stats: { ...off, tech: 3 } }));
  assert.equal(sec.steps[0].kind.stats.security! > 0, true, sec.steps[0].kind.id);
  assert.ok(tech.steps[0].kind.stats.tech! > 0, tech.steps[0].kind.id);
});

test('tier 2 orbital installations turn 1 T2 into 1 T3, and the plan reports what it does to the system', () => {
  for (const id of ['medical-installation', 'research-installation', 'tourist-installation', 'space-bar-installation']) {
    const f = FACILITIES.find((k) => k.id === id)!;
    assert.deepEqual([f.t2, f.t3, f.where], [-1, 1, 'orbital'], id);
  }
  const p = planSystem(SYS, bodies, cfg({ steps: 10 }));
  assert.equal(p.stats.wealth, p.steps.reduce((n, s) => n + (s.kind.stats.wealth ?? 0), 0));
});

test('stars and asteroid belts are listed as places for the player to type their slots', () => {
  const star = fromDump({ bodyId: 1, name: `${SYS} A`, type: 'Star', subType: 'K (Yellow-Orange) Star', belts: [{ name: `${SYS} A Belt`, type: 'Metal Rich', innerRadius: 1e6, outerRadius: 2e6 }] } as never);
  const p = planSystem(SYS, [star], cfg({ steps: 3, slots: { [star.name]: { orbital: 1 } } }));
  assert.deepEqual(p.slots.map((s) => s.name), [star.name, ...star.belts.map((b) => b.name)]);
  assert.equal(p.slots[0].orbital, 1);
});

test('the vocation compares the ready-made profiles on the same yardstick, best first', () => {
  const v = compareProfiles(SYS, bodies, cfg({ steps: 10 }));
  assert.equal(v.length, 5);
  assert.ok(v.every((x, i) => i === 0 || v[i - 1].used >= x.used));
  assert.ok(v[0].used > 0);
});

test('pirate builds need the switch, the Asteroid Starport goes only on a belt, and the big orbital port is the best of Ocellus, Orbis and Dodec', () => {
  const gg = body('B 9', 'Class I gas giant', 60000, 0, '');
  const slots = { [gg.name]: { orbital: 6 } };
  const wealth = { security: 0, wealth: 3, tech: 0, sol: 0, dev: 0 };
  const off = planSystem(SYS, [gg], cfg({ steps: 6, slots, stats: wealth }));
  const on = planSystem(SYS, [gg], cfg({ steps: 6, slots, stats: wealth, pirates: true }));
  assert.ok(!off.steps.some((s) => s.kind.pirate));
  assert.ok(on.steps.some((s) => s.kind.pirate));
  assert.ok(![...off.steps, ...on.steps].some((s) => s.kind.id === 'asteroid-starport'));
  const big = planSystem(SYS, [gg], cfg({ steps: 8, slots, points: { t2: 0, t3: 12 } }));
  assert.ok(big.steps.some((s) => ['ocellus', 'orbis', 'dodec'].includes(s.kind.id)));
  assert.equal(sanitizePlan({ pirates: true }).pirates, true);
  assert.equal(sanitizePlan({ pirates: 'yes' }).pirates, false);
});

test('an asteroid belt takes the Asteroid Starport when the points allow it', () => {
  const star = fromDump({ bodyId: 1, name: `${SYS} A`, type: 'Star', subType: 'K (Yellow-Orange) Star', belts: [{ name: `${SYS} A Belt`, type: 'Metal Rich', innerRadius: 1e6, outerRadius: 2e6 }] } as never);
  const p = planSystem(SYS, [star], cfg({ steps: 1, points: { t2: 3, t3: 1 }, slots: { [star.belts[0].name]: { orbital: 1 } } }));
  assert.equal(p.steps[0]?.kind.id, 'asteroid-starport');
  assert.equal(p.steps[0]?.body, star.belts[0].name);
});
