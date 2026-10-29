// COMBAT state: contacts, massacre missions, bounties and bonds, fighter, consumables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '@et/shared';
import { applyEvent, type JournalEvent } from '../src/reducer.ts';
import { missionHistory } from '../src/combat.ts';

const run = (events: JournalEvent[], s = initialState()) => {
  events.forEach((e, i) => applyEvent(s, { timestamp: `2026-10-26T21:00:${String(i).padStart(2, '0')}Z`, ...e }));
  return s;
};

const scan = (ship: string, pilot: string, extra: Record<string, unknown> = {}): JournalEvent => ({
  event: 'ShipTargeted', TargetLocked: true, Ship: ship.toLowerCase(), Ship_Localised: ship, ScanStage: 3,
  PilotName: `$npc_name_decorate:#name=${pilot};`, PilotName_Localised: pilot, PilotRank: 'Dangerous',
  LegalStatus: 'Wanted', Bounty: 412500, Faction: "Lavigny's Legion", ...extra,
});

const massacre = (id: number, giver: string, kills: number): JournalEvent => ({
  event: 'MissionAccepted', MissionID: id, Name: 'Mission_Massacre', Faction: giver,
  TargetFaction: "Lavigny's Legion", KillCount: kills, Reward: 10_000_000, Expiry: '2026-10-30T00:00:00Z',
});

test('scanned ships become contacts, updated in place and newest first', () => {
  const s = run([
    { event: 'ShipTargeted', TargetLocked: true, Ship: 'python', ScanStage: 0 },
    scan('Python', 'Kara Voss', { ScanStage: 1, LegalStatus: undefined, Bounty: undefined }),
    scan('Krait Mk II', 'Nick Coates', { LegalStatus: 'Clean', Bounty: 0, Faction: 'Earth Defense Fleet' }),
    scan('Python', 'Kara Voss'),
  ]);
  assert.deepEqual(s.combat.contacts.map((c) => [c.ship, c.pilot, c.legalStatus, c.bounty]), [
    ['Python', 'Kara Voss', 'Wanted', 412500],
    ['Krait Mk II', 'Nick Coates', 'Clean', 0],
  ]);
});

test('ships with the same type and pilot name are told apart by rank, and a kill takes only the locked one', () => {
  const fss = (rank: string) => scan('Viper Mk III', 'Federal Security Service', { PilotRank: rank, LegalStatus: 'Clean', Bounty: 0 });
  const s = run([fss('Master'), fss('Expert'), fss('Master'), fss('Competent')]);
  assert.deepEqual(s.combat.contacts.map((c) => c.rank), ['Competent', 'Master', 'Expert']);
  run([fss('Master'), { event: 'Bounty', Target: 'viper_mkiii', PilotName_Localised: 'Federal Security Service', TotalReward: 1, VictimFaction: 'X' }], s);
  assert.deepEqual(s.combat.contacts.map((c) => c.rank), ['Competent', 'Expert']);
});

test('contacts are cleared on every instance change', () => {
  for (const event of ['SupercruiseEntry', 'SupercruiseExit', 'FSDJump', 'Location', 'Died']) {
    const s = run([scan('Python', 'Kara Voss'), { event }]);
    assert.equal(s.combat.contacts.length, 0, event);
  }
});

test('a new lock forgets the previous target and keeps the subsystem id', () => {
  const s = run([
    scan('Python', 'Kara Voss', { Subsystem: '$int_powerplant_size8_class5_name;', Subsystem_Localised: 'Power Plant', SubsystemHealth: 74 }),
  ]);
  assert.equal(s.target.subsystemId, '$int_powerplant_size8_class5_name;');
  assert.equal(s.target.scanStage, 3);
  run([{ event: 'ShipTargeted', TargetLocked: true, Ship: 'vulture', Ship_Localised: 'Vulture', ScanStage: 0 }], s);
  assert.equal(s.target.ship, 'Vulture');
  assert.equal(s.target.pilot, '');
  assert.equal(s.target.legalStatus, '');
  assert.equal(s.target.subsystemId, '');
});

test('every ShipTargeted moves target.seq on, even the same ship reported again or an unlock', () => {
  const drive = { Subsystem: '$ext_drive_class7_a_name;', Subsystem_Localised: 'Drive', SubsystemHealth: 100 };
  const s = run([scan('Anaconda', 'Alexander Adamlyuk', drive), scan('Anaconda', 'Alexander Adamlyuk', drive)]);
  assert.equal(s.target.seq, 2);
  run([{ event: 'ShipTargeted', TargetLocked: false }], s);
  assert.equal(s.target.seq, 3);
  assert.equal(s.target.locked, false);
});

test('a shipyard swap changes the ship in the header; Loadout fixes it even without the swap', () => {
  const s = run([
    { event: 'LoadGame', Commander: 'SCORPZ', Ship: 'PantherMkII', Ship_Localised: 'Panther Clipper Mk II' },
    { event: 'ShipyardSwap', ShipType: 'federation_corvette', ShipType_Localised: 'Federal Corvette' },
    { event: 'Loadout', Ship: 'federation_corvette', ShipName: 'vendetta', ShipIdent: 'Z-5150' },
  ]);
  assert.equal(s.ship.label, 'Federal Corvette');
  run([{ event: 'Loadout', Ship: 'mamba', ShipName: '', ShipIdent: '' }], s);
  assert.equal(s.ship.label, 'Mamba');
  run([{ event: 'Loadout', Ship: 'MAMBA', ShipName: '', ShipIdent: '' }], s);
  assert.equal(s.ship.type, 'mamba');
});

test('bounties and bonds add up; redeeming takes them off the unredeemed total', () => {
  const s = run([
    { event: 'Bounty', Rewards: [{ Faction: 'A', Reward: 100_000 }], TotalReward: 100_000, VictimFaction: 'X' },
    { event: 'Bounty', Faction: 'A', Reward: 5_000, VictimFaction: 'X' },
    { event: 'FactionKillBond', Reward: 20_000, AwardingFaction: 'A', VictimFaction: 'Y' },
    { event: 'RedeemVoucher', Type: 'bounty', Amount: 105_000 },
  ]);
  const ss = s.combat.session;
  assert.equal(ss.bounties, 105_000);
  assert.equal(ss.bonds, 20_000);
  assert.equal(ss.kills, 3);
  assert.equal(ss.unredeemed, 20_000);
  assert.equal(ss.firstKillAt, '2026-10-26T21:00:00Z');
});

test('a killed ship leaves the contact list', () => {
  const s = run([scan('Python', 'Kara Voss'), scan('Vulture', 'Ono Haas'),
    { event: 'Bounty', TotalReward: 412500, PilotName: '$npc_name_decorate:#name=Kara Voss;', PilotName_Localised: 'Kara Voss', VictimFaction: "Lavigny's Legion" }]);
  assert.deepEqual(s.combat.contacts.map((c) => c.pilot), ['Ono Haas']);
});

test('massacre kills count once per giving faction, oldest mission first', () => {
  const kill: JournalEvent = { event: 'Bounty', TotalReward: 1, VictimFaction: "Lavigny's Legion" };
  const s = run([
    massacre(1, 'Giver A', 2), massacre(2, 'Giver A', 3), massacre(3, 'Giver B', 4),
    { event: 'MissionAccepted', MissionID: 9, Name: 'Mission_Courier', Faction: 'Giver A' },
    kill, kill, kill,
  ]);
  assert.deepEqual(s.combat.missions.map((m) => [m.id, m.kills]), [[1, 2], [2, 1], [3, 3]]);
});

test('missions end on redirect/complete and the login Missions list prunes the rest', () => {
  const s = run([massacre(1, 'A', 5), massacre(2, 'B', 5), massacre(3, 'C', 5),
    { event: 'MissionRedirected', MissionID: 1 }, { event: 'MissionCompleted', MissionID: 2 }]);
  assert.deepEqual(s.combat.missions.map((m) => [m.id, m.done, m.kills]), [[1, true, 5], [3, false, 0]]);
  run([{ event: 'Missions', Active: [{ MissionID: 1 }], Failed: [], Complete: [] }], s);
  assert.deepEqual(s.combat.missions.map((m) => m.id), [1]);
});

test('mission history from older journals carries into a new session', () => {
  const history = missionHistory([massacre(7, 'A', 10),
    { event: 'Bounty', VictimFaction: "Lavigny's Legion" }, { event: 'Bounty', VictimFaction: 'Someone else' }]);
  const s = initialState();
  s.combat.missions = history;
  run([{ event: 'Fileheader', gameversion: '4.2' }, { event: 'Missions', Active: [{ MissionID: 7 }] }], s);
  assert.deepEqual(s.combat.missions.map((m) => [m.id, m.kills]), [[7, 1]]);
});

test('Loadout gives rebuy, consumables and a fighter bay', () => {
  const s = run([{
    event: 'Loadout', Rebuy: 58_900_000, Modules: [
      { Slot: 'TinyHardpoint1', Item: 'hpt_heatsinklauncher_turret_tiny', AmmoInClip: 1, AmmoInHopper: 2 },
      { Slot: 'TinyHardpoint2', Item: 'hpt_chafflauncher_tiny', AmmoInClip: 1, AmmoInHopper: 9 },
      { Slot: 'Slot01_Size7', Item: 'int_shieldcellbank_size7_class5', AmmoInClip: 1, AmmoInHopper: 3 },
      { Slot: 'Slot02_Size6', Item: 'int_fighterbay_size6_class1' },
    ],
  }, { event: 'LaunchFighter', Loadout: 'one', PlayerControlled: false }]);
  const c = s.combat;
  assert.deepEqual([c.rebuy, c.heatSinks, c.chaff, c.shieldCells, c.fighter], [58_900_000, 3, 10, 4, 'out']);
  run([{ event: 'FighterDestroyed' }], s);
  assert.equal(s.combat.fighter, 'destroyed');
});
