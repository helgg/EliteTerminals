// Journal reducer and reader tests (T1–T7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initialState, STATUS_FLAGS, STATUS_FLAGS2 } from '@et/shared';
import { applyEvent, decodeFlags } from '../src/reducer.ts';
import { applyLine, JournalReader, splitLines } from '../src/reader.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures/journal');
const JOURNAL = 'Journal.2026-10-08T162446.01.log';

const trueFlags = (flags: Record<string, boolean>) => Object.keys(flags).filter((k) => flags[k]).sort();

test('T1 Flags:0 clears every flag and leaves pips alone', () => {
  const s = initialState();
  s.pips = { sys: 2, eng: 6, wep: 4 };
  applyEvent(s, { event: 'Status', Flags: 0 });
  assert.deepEqual(trueFlags(s.flags), []);
  assert.equal(Object.keys(s.flags).length, STATUS_FLAGS.length + STATUS_FLAGS2.length);
  assert.deepEqual(s.pips, { sys: 2, eng: 6, wep: 4 });
});

test('T2 Flags 16842765 = docked, gear, shields, mass-locked, in main ship', () => {
  assert.deepEqual(
    trueFlags(decodeFlags(16842765)),
    ['docked', 'fsdMassLocked', 'inMainShip', 'landingGearDown', 'shieldsUp'],
  );
});

test('T2b bit 31 and Flags2 decode', () => {
  const f = decodeFlags(2 ** 31, 0b1001);
  assert.equal(f.srvHighBeam, true);
  assert.equal(f.onFoot, true);
  assert.equal(f.onFootInStation, true);
  assert.equal(f.inTaxi, false);
});

test('T3 pips stay in half-pips', () => {
  const s = initialState();
  applyEvent(s, { event: 'Status', Flags: 0, Pips: [4, 8, 0] });
  assert.deepEqual(s.pips, { sys: 4, eng: 8, wep: 0 });
});

test('T4 replay of a real journal rebuilds commander and ship', () => {
  const s = initialState();
  const { lines } = splitLines(readFileSync(join(FIXTURES, JOURNAL), 'utf8') + '\n');
  lines.forEach((l) => applyLine(s, l));
  assert.equal(s.meta.parseErrors, 0);
  assert.equal(s.commander.name, 'SCORPZ');
  assert.equal(s.ship.type, 'PantherMkII');
  assert.equal(s.ship.cargoCapacity, 1216);
  assert.equal(s.ship.fuelCapacity, 128);
  assert.ok(s.commander.credits > 0);
  assert.ok(s.location.system.length > 0);
  // The fixture ends with Shutdown.
  assert.equal(s.meta.online, false);
});

test('T5 truncated line is counted and does not corrupt state', () => {
  const s = initialState();
  applyLine(s, '{"event":"LoadGame","Commander":"A","Credits":10}');
  assert.equal(applyLine(s, '{"event":"LoadGame","Commander":"B","Cre'), false);
  assert.equal(s.meta.parseErrors, 1);
  assert.equal(s.commander.name, 'A');
});

test('T7 MarketSell adds realised profit to the session', () => {
  const s = initialState();
  applyEvent(s, { event: 'MarketSell', Type: 'gold', Count: 100, SellPrice: 5000, TotalSale: 500000, AvgPricePaid: 3000 });
  assert.equal(s.session.tradeProfit, 200000);
  assert.equal(s.session.tonsSold, 100);
  assert.equal(s.commander.credits, 500000);
});

test('Status Balance overrides derived credits', () => {
  const s = initialState();
  applyEvent(s, { event: 'LoadGame', Credits: 1000 });
  applyEvent(s, { event: 'MarketBuy', TotalCost: 400, Count: 1 });
  assert.equal(s.commander.credits, 600);
  applyEvent(s, { event: 'Status', Flags: 0, Balance: 999 });
  assert.equal(s.commander.credits, 999);
});

test('SRV cargo does not replace the ship hold', () => {
  const s = initialState();
  applyEvent(s, { event: 'Cargo', Vessel: 'Ship', Count: 5, Inventory: [{ Name: 'gold', Count: 5, Stolen: 0 }] });
  applyEvent(s, { event: 'Cargo', Vessel: 'SRV', Count: 0, Inventory: [] });
  assert.equal(s.cargo.count, 5);
});

test('T6 reader follows appended lines, companion files and a newer journal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'et-'));
  try {
    const older = join(dir, 'Journal.2026-01-01T000000.01.log');
    await writeFile(older, '{"event":"LoadGame","Commander":"OLD","Credits":1}\n');
    const reader = new JournalReader(dir);
    await reader.start();
    try {
      assert.equal(reader.state.commander.name, 'OLD');

      // half a line, then the rest: only applied once complete
      await appendFile(older, '{"event":"Commander","Name":"MID",');
      await new Promise((r) => setTimeout(r, 400)); // let a poll see the partial line
      assert.equal(reader.state.commander.name, 'OLD');
      await appendFile(older, '"FID":"F1"}\n');
      await waitFor(() => reader.state.commander.name === 'MID');

      await writeFile(join(dir, 'Status.json'), '{"event":"Status","Flags":4,"Pips":[2,4,6]}');
      await waitFor(() => reader.state.flags.landingGearDown);
      assert.deepEqual(reader.state.pips, { sys: 2, eng: 4, wep: 6 });

      await new Promise((r) => setTimeout(r, 50));
      await writeFile(join(dir, 'Journal.2026-01-02T000000.01.log'), '{"event":"LoadGame","Commander":"NEW","Credits":2}\n');
      await waitFor(() => reader.state.commander.name === 'NEW', 5000);
    } finally {
      reader.stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function waitFor(cond: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  if (!cond()) throw new Error('condition not met in time');
}
