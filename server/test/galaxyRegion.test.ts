import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS, REGION_NAMES, distance, landmarkDistances, regionAt, regionGrid, regionIdAt, regionCell } from '@et/shared';

// Spansh's own `region` for the same systems (record fetched 2026-11-02)
test('region of known systems matches what Spansh says', () => {
  assert.equal(regionAt(-588.3125, 698.84375)?.name, 'Inner Orion Spur'); // Col 359 Sector FM-M d7-90
  assert.equal(regionAt(0, 0)?.name, 'Inner Orion Spur'); // Sol
  assert.equal(regionAt(25.21875, 25899.96875)?.name, 'Galactic Centre'); // Sagittarius A*
});

test('outside the grid or the map there is no region', () => {
  assert.equal(regionAt(-60000, 0), null);
  assert.equal(regionAt(0, 100000), null);
  assert.equal(regionCell(0, 0) !== null, true);
});

test('the painted grid agrees with the point lookup and uses every named region', () => {
  const grid = regionGrid();
  assert.equal(grid.length, 2048 * 2048);
  for (const [px, pz] of [[1000, 500], [1013, 488], [200, 1900], [2047, 2047], [0, 0]]) assert.equal(grid[pz * 2048 + px], regionIdAt(px, pz));
  const used = new Set(grid);
  used.delete(0);
  assert.equal(used.size, REGION_NAMES.length - 1);
});

test('distances to the landmarks', () => {
  const d = landmarkDistances([-588.3125, -140.625, 698.84375]);
  assert.equal(d.length, LANDMARKS.length);
  assert.equal(d[0].id, 'sol');
  assert.ok(Math.abs(d[0].ly - 924.3) < 0.1, `Sol at ${d[0].ly}`); // the portal and Spansh agree: 924.3 ly
  assert.equal(distance([0, 0, 0], [3, 4, 0]), 5);
});
