// COLONY v2: construction sites from the journal, deliveries, and the copy kept on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialState } from '@et/shared';
import { applyEvent } from '../src/reducer.ts';
import { mergeDepots, siteName } from '../src/colony/depots.ts';

// The real event at the colonisation ship of Col 359 Sector FM-M d7-90 (OBSERVED 2026-10-29).
const DEPOT = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/colony/construction-depot-2026-10-29.json'), 'utf8'));

function docked() {
  const s = initialState();
  applyEvent(s, {
    event: 'Location', timestamp: '2026-10-29T17:41:46Z', Docked: true, StarSystem: 'Col 359 Sector FM-M d7-90',
    SystemAddress: 3102736353715, StarPos: [-588.3125, -140.625, 698.84375], Body: 'Col 359 Sector FM-M d7-90 B 9 e',
    StationName: '$EXT_PANEL_ColonisationShip; Archambault Territory', StationType: 'SurfaceStation', MarketID: DEPOT.MarketID,
  });
  return s;
}

test('site name: the colonisation ship reads as words', () => {
  assert.equal(siteName('$EXT_PANEL_ColonisationShip; Archambault Territory'), 'Colonisation Ship · Archambault Territory');
});

test('construction depot: the whole list, where it is, and an estimated 28-day deadline', () => {
  const s = docked();
  applyEvent(s, DEPOT);
  const [d] = s.colony.depots;
  assert.equal(d.marketId, 3966749186);
  assert.equal(d.system, 'Col 359 Sector FM-M d7-90');
  assert.equal(d.station, 'Colonisation Ship · Archambault Territory');
  assert.equal(d.resources.length, 19);
  assert.equal(d.resources.reduce((t, r) => t + r.required, 0), 70533);
  assert.deepEqual(d.resources.find((r) => r.label === 'Steel'), { name: '$steel_name;', label: 'Steel', required: 19436, provided: 0, payment: 5057 });
  assert.equal(d.deadline, new Date(Date.parse(DEPOT.timestamp) + 28 * 864e5).toISOString());
  assert.equal(d.deadlineSet, false);
  // the same event again (every ~15 s while docked) keeps one site
  applyEvent(s, { ...DEPOT, timestamp: '2026-10-29T17:42:04Z' });
  assert.equal(s.colony.depots.length, 1);
});

test('a contribution counts until the next full list; an older list does not undo it', () => {
  const s = docked();
  applyEvent(s, DEPOT);
  applyEvent(s, {
    event: 'ColonisationContribution', timestamp: '2026-10-29T18:30:00Z', MarketID: DEPOT.MarketID,
    Contributions: [{ Name: '$Steel_name;', Name_Localised: 'Steel', Amount: 1184 }],
  });
  assert.equal(s.colony.depots[0].resources.find((r) => r.label === 'Steel')!.provided, 1184);
  applyEvent(s, DEPOT); // replaying the journal: the first copy is older
  assert.equal(s.colony.depots[0].resources.find((r) => r.label === 'Steel')!.provided, 1184);
});

test('kept on disk: the newer copy wins, a deadline the player set survives', () => {
  const s = docked();
  applyEvent(s, DEPOT);
  const live = s.colony.depots[0];
  const saved = { ...live, updatedAt: '2026-10-28T00:00:00Z', deadline: '2026-11-20T12:00:00.000Z', deadlineSet: true };
  const [merged] = mergeDepots([saved], [live]);
  assert.equal(merged.updatedAt, live.updatedAt);
  assert.equal(merged.deadline, '2026-11-20T12:00:00.000Z');
  assert.equal(merged.deadlineSet, true);
});

test('the real first delivery (OBSERVED 2026-10-30): CamelCase names match the depot list, 1,018 t', () => {
  const CONTRIB = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/colony/contribution-2026-10-30.json'), 'utf8'));
  const s = docked();
  applyEvent(s, DEPOT);
  applyEvent(s, CONTRIB);
  const r = s.colony.depots[0].resources;
  assert.equal(r.reduce((t, x) => t + x.provided, 0), 1018);
  assert.equal(r.find((x) => x.label === 'Computer Components')!.provided, 205);
});
