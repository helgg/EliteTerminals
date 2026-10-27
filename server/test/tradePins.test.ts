import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TradeChain, TradeResult, TradeRoute } from '@et/shared';
import { addPin, refreshPins, toPin } from '../src/tradePins.ts';

const route = (id: string, loopPerHour: number) =>
  ({ id, src: { marketId: 1 }, dst: { marketId: 2 }, leg: { total: 1 }, back: null, loopPerHour }) as unknown as TradeRoute;
const chain = (id: string, perHour: number) => ({ id, legs: [route('1-2', 0)], perHour }) as unknown as TradeChain;
const result = (routes: TradeRoute[], chains: TradeChain[] = []) => ({ routes, chains }) as unknown as TradeResult;

test('a pin must carry a loop route or a linear chain', () => {
  assert.equal(toPin(null), null);
  assert.equal(toPin({ kind: 'loop' }), null);
  assert.equal(toPin({ kind: 'linear', chain: { id: 'x', legs: [] } }), null);
  assert.equal(toPin({ kind: 'other', route: route('1-2', 5) }), null);
  assert.equal(toPin({ kind: 'loop', route: route('1-2', 5) })!.id, '1-2');
  assert.equal(toPin({ kind: 'linear', chain: chain('1-2-3', 5) })!.kind, 'linear');
});

test('pinning the same route again moves it up and keeps when it was first pinned', () => {
  const t0 = new Date('2026-10-27T10:00:00Z');
  const a = toPin({ kind: 'loop', route: route('1-2', 5) }, t0)!;
  const b = toPin({ kind: 'loop', route: route('3-4', 5) }, t0)!;
  const again = toPin({ kind: 'loop', route: route('1-2', 9) }, new Date('2026-10-27T11:00:00Z'))!;
  const list = addPin(addPin(addPin([], a), b), again);
  assert.deepEqual(list.map((p) => p.id), ['1-2', '3-4']);
  assert.equal(list[0].pinnedAt, t0.toISOString());
  assert.equal(list[0].route!.loopPerHour, 9);
});

test('a new scan refreshes the pins it found and leaves the others with their old figures', () => {
  const t0 = new Date('2026-10-27T10:00:00Z');
  const t1 = new Date('2026-10-27T12:00:00Z');
  const list = [
    toPin({ kind: 'loop', route: route('1-2', 5) }, t0)!,
    toPin({ kind: 'loop', route: route('3-4', 5) }, t0)!,
    toPin({ kind: 'linear', chain: chain('1-2', 5) }, t0)!,
  ];
  // a loop with the same id as a pinned chain does not refresh the chain
  const next = refreshPins(list, result([route('1-2', 7)]), t1)!;
  assert.equal(next[0].route!.loopPerHour, 7);
  assert.equal(next[0].seenAt, t1.toISOString());
  assert.equal(next[1], list[1]);
  assert.equal(next[2], list[2]);
  assert.equal(refreshPins(list, result([route('9-9', 1)])), null);
});
