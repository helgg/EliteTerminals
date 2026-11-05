import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRiches, richesForm, richesResult } from '../src/explore/riches.ts';

test('a road to riches is asked as a loop from the system, within sane limits', () => {
  const q = cleanRiches({ from: ' Sol ', range: 9999, stops: 1 });
  assert.deepEqual(q, { from: 'Sol', range: 500, stops: 3 });
  assert.deepEqual(cleanRiches({ from: 'Sol' }), { from: 'Sol', range: 30, stops: 15 });
  const f = richesForm(q);
  assert.equal(f.get('from'), 'Sol');
  assert.equal(f.get('to'), 'Sol');
  assert.equal(f.get('loop'), '1');
  assert.equal(f.get('max_results'), '3');
  // the pool Spansh picks from grows with the stops, or a loop would only ever find the few systems next to the start
  assert.equal(f.get('radius'), '100');
  assert.equal(richesForm(cleanRiches({ from: 'Sol', stops: 100 })).get('radius'), '800');
});

test('Spansh rows become stops with the value of their bodies', () => {
  const r = richesResult(cleanRiches({ from: 'A' }), [
    { name: 'A', x: 1, y: 2, z: 3, bodies: [] },
    { name: 'B', x: 10, y: 0, z: -5, bodies: [
      { name: 'B 1', subtype: 'Water world', is_terraformable: true, distance_to_arrival: 120.5, estimated_mapping_value: 900, estimated_scan_value: 100 },
      { name: 'B 2', subtype: 'Earth-like world', is_terraformable: false, distance_to_arrival: 40, estimated_mapping_value: 500, estimated_scan_value: 50 },
    ] },
    { name: '', bodies: [] },
  ]);
  assert.equal(r.stops.length, 2);
  assert.deepEqual(r.stops[0].pos, [1, 2, 3]);
  assert.equal(r.stops[1].value, 1550);
  assert.equal(r.stops[1].bodies[0].terraformable, true);
  assert.equal(r.value, 1550);
});
