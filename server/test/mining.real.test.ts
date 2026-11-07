// MINING against the player's own journal: one real session of laser mining (prospector, collectors, refinery, DSS, sale).
// No core asteroid in it: the journal gives no motherlode here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialState } from '@et/shared';
import { applyEvent, type JournalEvent } from '../src/reducer.ts';

const events: JournalEvent[] = readFileSync(resolve(import.meta.dirname, 'fixtures/mining/real-session.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

function replay() {
  const s = initialState();
  for (const e of events) applyEvent(s, e);
  return s;
}

test('real session: counts match what the journal holds', () => {
  const n = (ev: string) => events.filter((e) => e.event === ev).length;
  const s = replay();
  const m = s.mining;
  assert.equal(m.session.prospected, n('ProspectedAsteroid'));
  assert.equal(m.session.prospectors, events.filter((e) => e.event === 'LaunchDrone' && e.Type === 'Prospector').length);
  assert.equal(m.session.collectors, events.filter((e) => e.event === 'LaunchDrone' && e.Type === 'Collection').length);
  assert.equal(m.session.refined.reduce((a, r) => a + r.count, 0), n('MiningRefined'));
  assert.equal(m.session.cracked, 0);
});

test('real session: refined ore is keyed like the cargo and the market', () => {
  const m = replay().mining;
  assert.deepEqual(m.session.refined.map((r) => [r.name, r.label]), [['samarium', 'Samarium']]);
  assert.ok(m.session.firstRefinedAt && m.session.lastRefinedAt);
});

test('real session: asteroids keep the order, shares and content level of the game', () => {
  const m = replay().mining;
  const last = m.prospects[0];
  assert.ok(m.prospects.length > 0 && m.prospects.length <= 30);
  assert.ok(['Low', 'Medium', 'High'].includes(last.content));
  assert.equal(last.motherlode, '');
  assert.ok(last.materials.every((x) => x.pct > 0 && x.label));
  // sorted by share, best first
  assert.deepEqual(last.materials.map((x) => x.pct), [...last.materials.map((x) => x.pct)].sort((a, b) => b - a));
});

test('real session: the DSS scan of the ring gives its hotspots under the names the market uses', () => {
  const m = replay().mining;
  const ring = Object.keys(m.scanned).find((k) => / Ring$/.test(k))!;
  assert.ok(ring);
  assert.deepEqual(m.scanned[ring].map((x) => x.name).sort(), ['Grandidierite', 'Low Temperature Diamonds', 'Void Opal']);
});

// A second real session: motherlode cores (4 prospected, 3 cracked) in a ring; only those events are kept.
const coreEvents: JournalEvent[] = readFileSync(resolve(import.meta.dirname, 'fixtures/mining/core-session.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('real cores: MotherlodeMaterial comes as a plain name and AsteroidCracked names the ring', () => {
  const s = initialState();
  for (const e of coreEvents) applyEvent(s, e);
  assert.equal(s.mining.session.cracked, 3);
  assert.equal(s.mining.session.prospected, 4);
  assert.deepEqual(s.mining.prospects.map((p) => p.motherlode).reverse(), ['Serendibite', 'Monazite', 'Monazite', 'Monazite']);
  // a core rock lists only its two or three biggest materials; the core mineral is not among them
  assert.ok(s.mining.prospects.every((p) => p.materials.length >= 2 && !p.materials.some((m) => m.name === p.motherlode)));
  assert.match(String(coreEvents.find((e) => e.event === 'AsteroidCracked')?.Body), / Ring$/);
});
