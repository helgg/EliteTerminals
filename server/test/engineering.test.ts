// ENGINEERING state: materials held (grade and limit), what changes them, and engineer progress.
// Event shapes follow the player's own journal (Materials, EngineerProgress) and Frontier's Journal Manual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '@et/shared';
import { applyEvent, type JournalEvent } from '../src/reducer.ts';

const run = (events: JournalEvent[], s = initialState()) => {
  events.forEach((e, i) => applyEvent(s, { timestamp: `2026-10-30T13:${String(i).padStart(2, '0')}:00Z`, ...e }));
  return s;
};
const inventory: JournalEvent = {
  event: 'Materials',
  Raw: [{ Name: 'nickel', Count: 177 }, { Name: 'tin', Count: 9 }],
  Manufactured: [{ Name: 'refinedfocuscrystals', Name_Localised: 'Refined Focus Crystals', Count: 12 }],
  Encoded: [{ Name: 'shieldpatternanalysis', Name_Localised: 'Aberrant Shield Pattern Analysis', Count: 3 }],
};
const find = (s: ReturnType<typeof initialState>, name: string) => s.engineering.materials.find((m) => m.name === name)!;

test('the inventory gets its grade and the limit of that grade', () => {
  const s = run([inventory]);
  assert.equal(s.engineering.materials.length, 4);
  assert.deepEqual([find(s, 'nickel').grade, find(s, 'nickel').max], [1, 300]);
  assert.deepEqual([find(s, 'tin').grade, find(s, 'tin').max], [3, 200]);
  assert.deepEqual([find(s, 'refinedfocuscrystals').grade, find(s, 'refinedfocuscrystals').max], [4, 150]);
  assert.equal(find(s, 'shieldpatternanalysis').label, 'Aberrant Shield Pattern Analysis');
});

test('collecting, discarding and trading change the counts; zero leaves the list', () => {
  const s = run([
    inventory,
    { event: 'MaterialCollected', Category: 'Raw', Name: 'nickel', Count: 3 },
    { event: 'MaterialCollected', Category: 'Raw', Name: 'carbon', Count: 2 },
    { event: 'MaterialDiscarded', Category: 'Raw', Name: 'tin', Count: 9 },
    { event: 'MaterialTrade', Paid: { Material: 'nickel', Category: 'Raw', Quantity: 80 }, Received: { Material: 'zinc', Category: 'Raw', Quantity: 5 } },
  ]);
  assert.equal(find(s, 'nickel').count, 100);
  assert.equal(find(s, 'carbon').count, 2);
  assert.equal(find(s, 'zinc').grade, 2);
  assert.equal(s.engineering.materials.some((m) => m.name === 'tin'), false);
});

test('crafting and synthesis spend what they list, and a new Materials replaces the count', () => {
  const s = run([
    inventory,
    { event: 'EngineerCraft', Ingredients: [{ Name: 'RefinedFocusCrystals', Count: 2 }, { Name: 'nickel', Count: 7 }] },
    { event: 'Synthesis', Materials: [{ Name: 'nickel', Count: 3 }] },
  ]);
  assert.equal(find(s, 'refinedfocuscrystals').count, 10);
  assert.equal(find(s, 'nickel').count, 167);
  run([{ event: 'Materials', Raw: [{ Name: 'nickel', Count: 5 }], Manufactured: [], Encoded: [] }], s);
  assert.equal(s.engineering.materials.length, 1);
  assert.equal(find(s, 'nickel').count, 5);
});

test('an unknown material still shows, with no grade', () => {
  const s = run([{ event: 'Materials', Raw: [], Manufactured: [{ Name: 'newthing', Name_Localised: 'New Thing', Count: 4 }], Encoded: [] }]);
  assert.deepEqual([find(s, 'newthing').grade, find(s, 'newthing').max, find(s, 'newthing').label], [0, 0, 'New Thing']);
});

test('engineers: the list at load, then one engineer changing', () => {
  const s = run([
    { event: 'EngineerProgress', Engineers: [
      { Engineer: 'Hera Tani', EngineerID: 300090, Progress: 'Unlocked', RankProgress: 64, Rank: 3 },
      { Engineer: 'Eleanor Bresa', EngineerID: 400011, Progress: 'Known' },
    ] },
    { event: 'EngineerProgress', Engineer: 'Eleanor Bresa', EngineerID: 400011, Progress: 'Invited' },
    { event: 'EngineerProgress', Engineer: 'Hera Tani', EngineerID: 300090, Rank: 4, RankProgress: 0 },
  ]);
  assert.equal(s.engineering.engineers.length, 2);
  const [hera, eleanor] = s.engineering.engineers;
  assert.deepEqual([hera.rank, hera.rankProgress], [4, 0]);
  assert.deepEqual([eleanor.progress, eleanor.rank], ['Invited', null]);
});
