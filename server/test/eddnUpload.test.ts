import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EddnUploader, canSend, envelope, fromJournalEvent, fromMarketFile, fromOutfittingFile, fromShipyardFile,
  newContext, observe, stripLocalised, SOFTWARE_NAME, UPLOAD_URL,
} from '../src/prices/eddnUpload.ts';

// Synthetic journal events in the shapes the game writes; nothing here is a real player's data.
const SYS = { name: 'Alpha', address: 42, pos: [10, 0, -5] as [number, number, number] };
const jump = (ts = '2026-11-04T10:00:00Z') => ({
  timestamp: ts, event: 'FSDJump', StarSystem: SYS.name, SystemAddress: SYS.address, StarPos: SYS.pos, JumpDist: 12.3, FuelUsed: 1.2,
  FuelLevel: 20, BoostUsed: 1, Wanted: true, SystemAllegiance: 'Federation', SystemAllegiance_Localised: 'Federação',
  Factions: [{ Name: 'Alpha Gov', MyReputation: 50, HomeSystem: 'Alpha', Government_Localised: 'Democracy', SquadronFaction: true }],
});
const ready = () => {
  const ctx = newContext();
  observe(ctx, { event: 'Fileheader', gameversion: '4.1.0.0', build: 'r1/r0 ' });
  observe(ctx, { event: 'LoadGame', Commander: 'TEST', Horizons: true, Odyssey: true, FID: 'F123' });
  observe(ctx, jump());
  return ctx;
};

test('the session context follows the journal and is live-game only', () => {
  const ctx = ready();
  assert.equal(canSend(ctx), true);
  assert.equal(ctx.gameBuild, 'r1/r0 '); // passed through untouched
  assert.equal(ctx.system?.address, 42);
  const old = newContext();
  observe(old, { event: 'Fileheader', gameversion: '3.8.0.1', build: 'x' });
  observe(old, { event: 'Commander', Name: 'TEST' });
  assert.equal(canSend(old), false);
  // a missing Odyssey key stays unknown, never false
  const base = newContext();
  observe(base, { event: 'LoadGame', Commander: 'TEST', Horizons: false });
  assert.equal(base.odyssey, undefined);
  assert.equal(base.horizons, false);
});

test('_Localised keys vanish at any depth', () => {
  assert.deepEqual(stripLocalised({ a: 1, a_Localised: 'x', b: [{ c: 2, c_Localised: 'y' }] }), { a: 1, b: [{ c: 2 }] });
});

test('FSDJump loses everything about the player and keeps the rest', () => {
  const [out] = fromJournalEvent(ready(), jump());
  assert.equal(out.schema, 'journal/1');
  const m = out.message;
  for (const k of ['Wanted', 'JumpDist', 'FuelUsed', 'FuelLevel', 'BoostUsed', 'SystemAllegiance_Localised']) assert.equal(k in m, false, k);
  assert.deepEqual(m.Factions, [{ Name: 'Alpha Gov' }]);
  assert.equal(m.SystemAllegiance, 'Federation');
  assert.equal(m.horizons, true);
  assert.equal(m.odyssey, true);
  assert.equal('FID' in m, false);
});

test('events are cross-checked against the last jump and given the system they lack', () => {
  const ctx = ready();
  const saa = { timestamp: '2026-11-04T10:05:00Z', event: 'SAASignalsFound', BodyName: 'Alpha 1', SystemAddress: 42, BodyID: 3, Signals: [{ Type: '$x;', Type_Localised: 'X', Count: 2 }] };
  const [ok] = fromJournalEvent(ctx, saa);
  assert.equal(ok.message.StarSystem, 'Alpha');
  assert.deepEqual(ok.message.StarPos, SYS.pos);
  assert.deepEqual(ok.message.Signals, [{ Type: '$x;', Count: 2 }]);
  assert.deepEqual(fromJournalEvent(ctx, { ...saa, SystemAddress: 99 }), []); // another system: dropped
  assert.deepEqual(fromJournalEvent(newContext(), saa), []); // no jump seen yet: dropped
  const docked = { timestamp: '2026-11-04T10:06:00Z', event: 'Docked', StationName: 'Hub', MarketID: 7, StarSystem: 'Beta', SystemAddress: 42, Wanted: false, ActiveFine: true };
  assert.deepEqual(fromJournalEvent(ctx, docked), []); // the name disagrees with the address
  const good = fromJournalEvent(ctx, { ...docked, StarSystem: 'Alpha' })[0].message;
  assert.equal('ActiveFine' in good, false);
  assert.equal('Wanted' in good, false);
});

test('events the journal schema does not list are not sent', () => {
  assert.deepEqual(fromJournalEvent(ready(), { timestamp: '2026-11-04T10:00:00Z', event: 'Music', MusicTrack: 'x' }), []);
  assert.deepEqual(fromJournalEvent(ready(), { timestamp: '2026-11-04T10:00:00Z', event: 'CodexEntry', SystemAddress: 42 }), []);
});

test('exploration events become their own schemas with exactly the keys they allow', () => {
  const ctx = ready();
  const t = '2026-11-04T10:10:00Z';
  const fss = fromJournalEvent(ctx, { timestamp: t, event: 'FSSDiscoveryScan', Progress: 0.1, BodyCount: 5, NonBodyCount: 2, SystemName: 'Alpha', SystemAddress: 42 })[0];
  assert.equal(fss.schema, 'fssdiscoveryscan/1');
  assert.deepEqual(Object.keys(fss.message).sort(), ['BodyCount', 'NonBodyCount', 'StarPos', 'SystemAddress', 'SystemName', 'event', 'horizons', 'odyssey', 'timestamp']);
  const all = fromJournalEvent(ctx, { timestamp: t, event: 'FSSAllBodiesFound', SystemName: 'Alpha', SystemAddress: 42, Count: 5 })[0];
  assert.equal(all.schema, 'fssallbodiesfound/1');
  const sig = fromJournalEvent(ctx, { timestamp: t, event: 'FSSBodySignals', BodyName: 'Alpha 2', BodyID: 4, SystemAddress: 42, Signals: [{ Type: '$a;', Type_Localised: 'A', Count: 1 }] })[0];
  assert.equal(sig.schema, 'fssbodysignals/1');
  assert.equal(sig.message.StarSystem, 'Alpha');
  assert.deepEqual(sig.message.Signals, [{ Type: '$a;', Count: 1 }]);
  const nav = fromJournalEvent(ctx, { timestamp: t, event: 'NavBeaconScan', SystemAddress: 42, NumBodies: 9 })[0];
  assert.equal(nav.schema, 'navbeaconscan/1');
  const bary = fromJournalEvent(ctx, { timestamp: t, event: 'ScanBaryCentre', StarSystem: 'Alpha', SystemAddress: 42, BodyID: 1, SemiMajorAxis: 1, Eccentricity: 0.1, OrbitalInclination: 0, Periapsis: 1, OrbitalPeriod: 2, AscendingNode: 3, MeanAnomaly: 4 })[0];
  assert.equal(bary.schema, 'scanbarycentre/1');
  assert.equal(fromJournalEvent(ctx, { timestamp: t, event: 'FSSAllBodiesFound', SystemName: 'Alpha', SystemAddress: 1, Count: 5 }).length, 0);
});

const market = (over: object = {}) => ({
  timestamp: '2026-11-04T10:20:00Z', event: 'Market', MarketID: 7, StationName: 'Hub', StationType: 'Coriolis', StarSystem: 'Alpha',
  Items: [
    { id: 1, Name: '$gold_name;', Name_Localised: 'Ouro', Category: '$MARKET_category_metals;', Category_Localised: 'Metais', BuyPrice: 100, SellPrice: 90, MeanPrice: 95, StockBracket: 2, DemandBracket: 0, Stock: 50, Demand: 0, Consumer: false, Producer: true, Rare: false },
    { id: 2, Name: '$drones_name;', Category: '$MARKET_category_NonMarketable;', BuyPrice: 1, SellPrice: 1, MeanPrice: 1, StockBracket: 1, DemandBracket: 1, Stock: 1, Demand: 1 },
    { id: 3, Name: '$bad_name;', BuyPrice: 'x', SellPrice: 1, MeanPrice: 1, StockBracket: 1, DemandBracket: 1, Stock: 1, Demand: 1 },
  ],
  ...over,
});

test('Market.json becomes commodity/3 as the schema asks', () => {
  const out = fromMarketFile(ready(), market())!;
  assert.equal(out.schema, 'commodity/3');
  const m = out.message;
  assert.deepEqual(Object.keys(m).sort(), ['commodities', 'horizons', 'marketId', 'odyssey', 'stationName', 'systemName', 'timestamp']);
  assert.equal(m.commodities.length, 1); // limpets and the malformed row are left out
  assert.deepEqual(m.commodities[0], {
    name: 'gold', meanPrice: 95, buyPrice: 100, stock: 50, stockBracket: 2, sellPrice: 90, demand: 0, demandBracket: 0, statusFlags: ['Producer'],
  });
  assert.equal(fromMarketFile(ready(), market({ StarSystem: 'Beta' })), null); // not where the player is
});

test('Outfitting.json becomes outfitting/2: names only, nothing the schema does not allow', () => {
  const f = {
    timestamp: '2026-11-04T10:21:00Z', event: 'Outfitting', MarketID: 7, StationName: 'Hub', StarSystem: 'Alpha', Horizons: true,
    Items: [{ id: 1, Name: 'hpt_beamlaser_fixed_small', BuyPrice: 1 }, { id: 2, Name: 'int_planetapproachsuite' }, { id: 3, Name: 'paintjob_x' },
      { id: 4, Name: 'int_engine_size3_class5', BuyPrice: 2 }, { id: 5, Name: 'hpt_beamlaser_fixed_small' },
      { id: 6, Name: 'hpt_railgun_fixed_medium', sku: 'ELITE_POWERPLAY_X' }],
  };
  const out = fromOutfittingFile(ready(), f)!;
  assert.equal(out.schema, 'outfitting/2');
  assert.deepEqual(out.message.modules, ['Hpt_beamlaser_fixed_small', 'Int_engine_size3_class5']);
  assert.equal('Items' in out.message, false);
});

test('Shipyard.json becomes shipyard/2 with the game spelling of each ship', () => {
  const f = {
    timestamp: '2026-11-04T10:22:00Z', event: 'Shipyard', MarketID: 7, StationName: 'Hub', StarSystem: 'Alpha', AllowCobraMkIV: false,
    PriceList: [{ id: 1, ShipType: 'cobramkiii', ShipType_Localised: 'Cobra', ShipPrice: 1 }, { id: 2, ShipType: 'ferdelance', ShipPrice: 2 }, { id: 3, ShipType: 'unknownship' }],
  };
  const out = fromShipyardFile(ready(), f)!;
  assert.equal(out.schema, 'shipyard/2');
  assert.deepEqual(out.message.ships, ['CobraMkIII', 'FerDeLance']);
  assert.equal(out.message.allowCobraMkIV, false);
});

test('the envelope names the software and uses /test schemas when asked', () => {
  const ctx = ready();
  const live = envelope(ctx, { schema: 'commodity/3', message: {} }, false);
  assert.equal(live.$schemaRef, 'https://eddn.edcd.io/schemas/commodity/3');
  assert.equal(live.header.softwareName, SOFTWARE_NAME);
  assert.equal(live.header.uploaderID, 'TEST');
  assert.equal(live.header.gameversion, '4.1.0.0');
  assert.equal(envelope(ctx, { schema: 'journal/1', message: {} }, true).$schemaRef, 'https://eddn.edcd.io/schemas/journal/1/test');
});

// ---- the sender: opt-in, live only, retries ----
type Call = { url: string; body: any };
const fakeFetch = (status: number | 'throw', calls: Call[]): typeof fetch =>
  (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (status === 'throw') throw new Error('offline');
    return new Response(status === 200 ? 'OK' : 'FAIL: nope', { status });
  }) as unknown as typeof fetch;

function sender(status: number | 'throw', calls: Call[]) {
  delete process.env.ET_EDDN_UPLOAD;
  delete process.env.ET_EDDN_UPLOAD_TEST;
  const dir = mkdtempSync(join(tmpdir(), 'et-eddn-'));
  const up = new EddnUploader(dir, dir, fakeFetch(status, calls));
  const prime = () => {
    up.feed({ event: 'Fileheader', gameversion: '4.1.0.0', build: 'b' }, false);
    up.feed({ event: 'LoadGame', Commander: 'TEST', Horizons: true, Odyssey: true }, false);
  };
  return { up, dir, prime, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

test('nothing is sent until the player turns it on', async () => {
  const calls: Call[] = [];
  const s = sender(200, calls);
  s.prime();
  assert.equal(s.up.stats.enabled, false);
  s.up.feed({ ...jump(now()) }, true);
  await s.up.pump();
  assert.equal(calls.length, 0);
  s.up.setEnabled(true);
  s.up.feed({ ...jump(now()) }, true);
  await s.up.pump();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, UPLOAD_URL);
  assert.equal(s.up.stats.sent, 1);
  s.done();
});

test('a replayed journal and old events are never sent', async () => {
  const calls: Call[] = [];
  const s = sender(200, calls);
  s.prime();
  s.up.setEnabled(true);
  s.up.feed(jump(now()), false); // replay at startup
  s.up.feed(jump('2020-01-01T00:00:00Z'), true); // live but ancient
  await s.up.pump();
  assert.equal(calls.length, 0);
  s.done();
});

test('a refused message is dropped for good, a network failure is kept for a later retry', async () => {
  const bad: Call[] = [];
  const a = sender(400, bad);
  a.prime();
  a.up.setEnabled(true);
  a.up.feed(jump(now()), true);
  await a.up.pump();
  assert.equal(a.up.stats.failed, 1);
  assert.equal(a.up.stats.queued, 0);
  assert.match(a.up.stats.lastError, /400/);
  a.done();

  const off: Call[] = [];
  const b = sender('throw', off);
  b.prime();
  b.up.setEnabled(true);
  b.up.feed(jump(now()), true);
  await b.up.pump();
  assert.equal(b.up.stats.queued, 1);
  assert.equal(b.up.stats.failed, 0);
  await b.up.pump(); // not due yet: a minute must pass before the next try
  assert.equal(off.length, 1);
  b.done();
});

test('Market.json is read when the journal says it was written, and the same market is not sent twice', async () => {
  const calls: Call[] = [];
  const s = sender(200, calls);
  s.prime();
  s.up.setEnabled(true);
  s.up.feed(jump(now()), true);
  const ts = now();
  writeFileSync(join(s.dir, 'Market.json'), JSON.stringify(market({ timestamp: ts })));
  const ev = { timestamp: ts, event: 'Market', MarketID: 7, StationName: 'Hub', StarSystem: 'Alpha' };
  s.up.feed(ev, true);
  await new Promise((r) => setTimeout(r, 300));
  await s.up.pump();
  s.up.feed(ev, true);
  await new Promise((r) => setTimeout(r, 300));
  await s.up.pump();
  const markets = calls.filter((c) => c.body.$schemaRef.includes('/commodity/3'));
  assert.equal(markets.length, 1);
  s.done();
});

test('an Alpha/Beta journal only ever goes to the test schemas', async () => {
  const calls: Call[] = [];
  const s = sender(200, calls);
  s.up.setJournal('JournalBeta.2026-11-04T100000.01.log');
  s.prime();
  s.up.setEnabled(true);
  s.up.feed(jump(now()), true);
  await s.up.pump();
  assert.match(calls[0].body.$schemaRef, /\/test$/);
  assert.equal(s.up.stats.test, true);
  s.done();
});
