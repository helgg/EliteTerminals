// Visited-market history and clipboard text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MarketSnapshot } from '@et/shared';
import { addSnapshot } from '../src/marketHistory.ts';
import { clipText } from '../src/clipboard.ts';

const snap = (id: number, at: string): MarketSnapshot => ({
  marketId: id, station: `S${id}`, stationType: 'Coriolis', system: `Sys${id}`, updatedAt: at,
  items: [{ name: 'gold', label: 'Gold', category: 'Metals', buy: 1, sell: 2, meanPrice: 2, stock: 1, demand: 1, stockBracket: 1, demandBracket: 0 }],
});

test('market history keeps the newest snapshot per station, newest first, bounded', () => {
  let list: MarketSnapshot[] = [];
  list = addSnapshot(list, snap(1, '2026-10-24T10:00:00Z'));
  list = addSnapshot(list, snap(2, '2026-10-24T11:00:00Z'));
  list = addSnapshot(list, snap(1, '2026-10-24T12:00:00Z'));
  assert.deepEqual(list.map((m) => [m.marketId, m.updatedAt.slice(11, 13)]), [[1, '12'], [2, '11']]);
  const same = addSnapshot(list, snap(2, '2026-10-24T09:00:00Z')); // older copy: ignored
  assert.equal(same, list);
  assert.equal(addSnapshot(list, { ...snap(3, '2026-10-24T13:00:00Z'), items: [] }), list); // empty market
  assert.equal(addSnapshot(list, snap(3, '2026-10-24T13:00:00Z'), 2).length, 2);
});

test('clipboard text is one short printable line', () => {
  assert.equal(clipText('  Jameson Memorial\r\n'), 'Jameson Memorial');
  assert.equal(clipText('a\tb'), 'a b');
  assert.equal(clipText(undefined), '');
  assert.equal(clipText('x'.repeat(500)).length, 200);
});
