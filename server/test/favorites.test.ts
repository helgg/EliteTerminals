import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFavorite, toFavorite } from '../src/favorites.ts';

test('a favourite needs a system; text is cleaned and bad coordinates dropped', () => {
  assert.equal(toFavorite({ station: 'Homer Platform' }), null);
  assert.equal(toFavorite(null), null);
  const f = toFavorite({ system: '  AD Leonis\n', station: 'Homer Platform', pos: [1, 'x', 3] })!;
  assert.equal(f.system, 'AD Leonis');
  assert.equal(f.station, 'Homer Platform');
  assert.equal(f.pos, null);
  assert.deepEqual(toFavorite({ system: 'Sol', pos: [0, 0, 0] })!.pos, [0, 0, 0]);
});

test('saving the same place again moves it to the top, keeping its id and position', () => {
  const sol = toFavorite({ system: 'Sol', pos: [0, 0, 0] })!;
  const leo = toFavorite({ system: 'AD Leonis' })!;
  const homer = toFavorite({ system: 'AD Leonis', station: 'Homer Platform' })!;
  let list = addFavorite(addFavorite(addFavorite([], sol), leo), homer);
  assert.deepEqual(list.map((x) => x.station || x.system), ['Homer Platform', 'AD Leonis', 'Sol']);
  list = addFavorite(list, toFavorite({ system: 'sol' })!);
  assert.equal(list.length, 3);
  assert.equal(list[0].id, sol.id);
  assert.deepEqual(list[0].pos, [0, 0, 0]);
  assert.equal(addFavorite(list, toFavorite({ system: 'X' })!, 3).length, 3);
});
