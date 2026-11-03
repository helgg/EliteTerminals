import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poiBody, pointsOf, snapWindow } from '../src/explore/pois.ts';

test('a window is snapped so that a small pan asks for the same thing', () => {
  const a = snapWindow([-9530.5, -910.3, 19808.1], 180);
  const b = snapWindow([-9528, -908, 19811], 180);
  assert.deepEqual(a, b);
  assert.equal(a.radius, 175);
  assert.equal(snapWindow([0, 0, 0], 5000).radius, 1500);
  assert.equal(snapWindow([0, 0, 0], 1).radius, 25);
});

test('stars ask for a window around a point, nearest first, one page of 500', () => {
  const b: any = poiBody({ kind: 'neutron', center: [100, 5, -40], radius: 300 });
  assert.deepEqual(b.filters.subtype.value, ['Neutron Star']);
  assert.equal(b.filters.distance.max, 300);
  assert.equal(b.size, 500);
  assert.equal(b.reference_coords.x, 75); // 100 snapped to a grid of radius / 4
  assert.equal((poiBody({ kind: 'blackhole', center: [0, 0, 0], radius: 100 }) as any).filters.subtype.value[0], 'Black Hole');
});

test('sites ask for the signal, from Sol, a hundred a page', () => {
  const g: any = poiBody({ kind: 'guardian' }, 2);
  assert.deepEqual(g.filters.signals, [{ name: 'Guardian', value: [1, 99] }]);
  assert.equal(g.page, 2);
  assert.equal(g.size, 100);
  assert.equal((poiBody({ kind: 'thargoid' }) as any).filters.signals[0].name, 'Thargoid');
});

test('hits become points: coordinates needed, one per body, the site named by its signals', () => {
  const rows = [
    { name: 'Novas A 6', system_name: 'Novas', system_x: 10, system_y: 2, system_z: -30, signals: [{ name: 'Guardian', count: 1 }, { name: 'Human', count: 5 }] },
    { name: 'Novas A 6', system_name: 'Novas', system_x: 10, system_y: 2, system_z: -30, signals: [{ name: 'Guardian', count: 1 }] },
    { name: 'X 2', system_name: 'X', system_x: 1, system_y: 1, system_z: 1, signals: [{ name: 'Guardian', count: 3 }] },
    { name: 'No coords', system_name: 'Nowhere' },
  ];
  const pts = pointsOf('guardian', rows);
  assert.equal(pts.length, 2);
  assert.equal(pts[0].detail, 'Guardian site');
  assert.equal(pts[1].detail, 'Guardian sites ×3');
  const star = pointsOf('neutron', [{ name: 'A B-1', system_name: 'A B-1', subtype: 'Neutron Star', system_x: 5, system_y: 0, system_z: 9 }]);
  assert.equal(star[0].detail, 'Neutron Star');
  assert.deepEqual(star[0].pos, [5, 0, 9]);
  assert.deepEqual(pointsOf('neutron', 'nope'), []);
});
