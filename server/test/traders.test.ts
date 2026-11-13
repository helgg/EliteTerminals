// ENGINEERING: the search for the nearest material trader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSpanshTrader, traderBody } from '../src/traders.ts';

test('the search asks Spansh for one kind of trader, nearest first, around the system', () => {
  const b = traderBody({ kind: 'Encoded', reference: 'Sol' });
  assert.deepEqual(b.filters, { material_trader: { value: ['Encoded'] } });
  assert.deepEqual(b.sort, [{ distance: { direction: 'asc' } }]);
  assert.equal(b.reference_system, 'Sol');
});

test('a Spansh station becomes a trader card, with its biggest pad', () => {
  const t = fromSpanshTrader({
    name: 'Broglie Terminal', system_name: '61 Cygni', distance: 11.36, distance_to_arrival: 24.07, type: 'Ocellus Starport',
    is_planetary: false, large_pads: 6, medium_pads: 12, small_pads: 4, updated_at: '2026-11-12T21:06:37Z', material_trader: 'Raw',
  });
  assert.deepEqual(t, {
    station: 'Broglie Terminal', system: '61 Cygni', ly: 11.36, ls: 24.07, type: 'Ocellus Starport', planetary: false, pad: 'L',
    updatedAt: '2026-11-12T21:06:37Z',
  });
  assert.equal(fromSpanshTrader({ name: 'x', medium_pads: 2 }).pad, 'M');
  assert.equal(fromSpanshTrader({ name: 'x', small_pads: 1 }).pad, 'S');
  assert.equal(fromSpanshTrader({ name: 'x' }).pad, '');
});
