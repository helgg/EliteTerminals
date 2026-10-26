import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initialState } from '@et/shared';
import { bodyId64, fromSpansh, ringTypes, summary } from '../src/galaxy.ts';
import { applyEvent } from '../src/reducer.ts';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/spansh-system-LHS412.json');

test('body id64 packs the body id over the system address, past 2^53', () => {
  // Saturn: body 13 in Sol, as Spansh lists it
  assert.equal(bodyId64(10477373803, 13), '468374371723905387');
});

test('ring types come from a Spansh body record, without repeats', () => {
  assert.deepEqual(ringTypes({ rings: [{ name: 'A Ring', type: 'Icy' }, { name: 'B Ring', type: 'Icy' }, { name: 'C Ring', type: 'Rocky' }] }), ['Icy', 'Rocky']);
  assert.deepEqual(ringTypes({ name: 'no rings' }), []);
});

test('Spansh record maps to system detail', () => {
  const d = fromSpansh(JSON.parse(readFileSync(FIXTURE, 'utf8')).record);
  assert.equal(d.name, 'LHS 412');
  assert.equal(d.id64, 7268024329665);
  assert.equal(d.security, 'Low');
  assert.equal(d.controllingPower, 'Nakato Kaine');
  assert.equal(d.powerState, 'Exploited');
  assert.equal(d.factionState, 'Boom');
  assert.equal(d.primaryStar, 'M (Red dwarf) Star');
  assert.equal(d.bodies.length, 8);
  assert.equal(d.stations.length, 11);
  const carrier = d.stations.find((s) => s.name === 'V8X-L5Z')!;
  assert.deepEqual(carrier.pads, { s: 4, m: 4, l: 8 });
  assert.equal('bodies' in summary(d), false);
});

test('Status Destination and journal powerplay fields', () => {
  const s = initialState();
  applyEvent(s, { event: 'Status', Flags: 0, Destination: { System: 5368172661576, Body: 0, Name: 'AD Leonis' } });
  assert.deepEqual(s.destination, { system: 5368172661576, body: 0, name: 'AD Leonis' });
  applyEvent(s, { event: 'Status', Flags: 0 });
  assert.equal(s.destination.system, 0);

  applyEvent(s, {
    event: 'FSDJump', StarSystem: 'X', SystemAddress: 1, ControllingPower: 'Jerome Archer',
    Powers: ['Jerome Archer', 'Yuri Grom'], PowerplayState: 'Fortified',
    SystemFaction: { Name: 'New Pilots Initiative', FactionState: 'Boom' },
  });
  assert.equal(s.location.controllingPower, 'Jerome Archer');
  assert.equal(s.location.powerState, 'Fortified');
  assert.equal(s.location.factionState, 'Boom');
});
