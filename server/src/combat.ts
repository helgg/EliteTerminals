// Combat events → state.combat: scanned contacts, massacre missions, bounties and bonds, fighter, consumables.
// Pure apart from mutating the `state` it is given; no I/O here.
import { initialCombat, shipLabel, type EdState, type MassacreMission } from '@et/shared';
import type { JournalEvent } from './reducer.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Events that move a mission on; the only ones replayed from older journals (see missionHistory). */
export const MISSION_EVENTS = new Set([
  'MissionAccepted', 'MissionRedirected', 'MissionCompleted', 'MissionAbandoned', 'MissionFailed', 'Bounty',
]);

export function applyCombat(state: EdState, e: JournalEvent): void {
  const c = state.combat;
  switch (e.event) {
    case 'Fileheader':
      // A new game session: missions carry over (the next Missions event prunes them), the rest starts again.
      state.combat = { ...initialCombat(), missions: c.missions };
      break;

    // Every one of these puts the ship in another instance: the ships around are new.
    case 'Location':
    case 'FSDJump':
    case 'SupercruiseEntry':
    case 'SupercruiseExit':
    case 'Died':
    case 'Resurrect':
      c.contacts = [];
      break;

    case 'ShipTargeted':
      if (e.TargetLocked && num(e.ScanStage) >= 1) noteContact(state, e);
      break;

    case 'Loadout':
      c.rebuy = num(e.Rebuy);
      c.heatSinks = ammo(e, /heatsinklauncher/);
      c.shieldCells = ammo(e, /shieldcellbank/);
      c.chaff = ammo(e, /chafflauncher/);
      c.fighter = Array.isArray(e.Modules) && e.Modules.some((m: any) => /fighterbay/.test(str(m.Item))) ? 'docked' : 'none';
      break;

    case 'LaunchFighter':
      c.fighter = 'out';
      break;
    case 'DockFighter':
    case 'FighterRebuilt':
      c.fighter = 'docked';
      break;
    case 'FighterDestroyed':
      c.fighter = 'destroyed';
      break;

    case 'Bounty': {
      // Skimmers report one Reward; ships a Rewards list per faction, summed in TotalReward.
      const reward = num(e.TotalReward) || num(e.Reward);
      earn(state, e, reward);
      c.session.bounties += reward;
      const pilot = str(e.PilotName_Localised) || str(e.PilotName);
      if (pilot) c.contacts = c.contacts.filter((k) => k.pilot !== pilot);
      countKill(c.missions, str(e.VictimFaction));
      break;
    }

    case 'FactionKillBond':
    case 'CapShipBond':
      earn(state, e, num(e.Reward));
      c.session.bonds += num(e.Reward);
      break;

    case 'RedeemVoucher':
      if (e.Type === 'bounty' || e.Type === 'CombatBond') {
        c.session.unredeemed = Math.max(0, c.session.unredeemed - num(e.Amount));
      }
      break;

    case 'Missions':
      // Written at login: the missions still active. Anything else we remember has ended.
      if (Array.isArray(e.Active)) {
        const active = new Set(e.Active.map((m: any) => num(m.MissionID)));
        c.missions = c.missions.filter((m) => active.has(m.id));
      }
      break;
  }
  applyMission(c.missions, e);
}

/** Mission bookkeeping, shared by the live journal and the replay of older ones. */
export function applyMission(missions: MassacreMission[], e: JournalEvent): void {
  switch (e.event) {
    case 'MissionAccepted':
      if (/^Mission_Massacre/i.test(str(e.Name)) && num(e.KillCount) > 0 && !missions.some((m) => m.id === e.MissionID)) {
        missions.push({
          id: num(e.MissionID), faction: str(e.Faction), targetFaction: str(e.TargetFaction),
          killCount: num(e.KillCount), kills: 0, reward: num(e.Reward), expiry: str(e.Expiry), done: false,
        });
      }
      break;
    case 'MissionRedirected': {
      const m = missions.find((x) => x.id === e.MissionID);
      if (m) {
        m.done = true;
        m.kills = m.killCount;
      }
      break;
    }
    case 'MissionCompleted':
    case 'MissionAbandoned':
    case 'MissionFailed': {
      const i = missions.findIndex((x) => x.id === e.MissionID);
      if (i >= 0) missions.splice(i, 1);
      break;
    }
  }
}

/**
 * One kill of the target faction counts for one mission per giving faction: the oldest unfinished one
 * (that is how stacked massacre missions progress in the game).
 */
export function countKill(missions: MassacreMission[], victimFaction: string): void {
  if (!victimFaction) return;
  const givers = new Set<string>();
  for (const m of missions) {
    if (m.targetFaction !== victimFaction || m.done || m.kills >= m.killCount || givers.has(m.faction)) continue;
    m.kills += 1;
    givers.add(m.faction);
  }
}

/** Replays older journals' mission events (oldest first) so missions taken in past sessions are known. */
export function missionHistory(events: JournalEvent[]): MassacreMission[] {
  const missions: MassacreMission[] = [];
  for (const e of events) {
    if (e.event === 'Bounty') countKill(missions, str(e.VictimFaction));
    else applyMission(missions, e);
  }
  return missions;
}

function noteContact(state: EdState, e: JournalEvent) {
  const ship = shipLabel(str(e.Ship), str(e.Ship_Localised));
  const pilot = str(e.PilotName_Localised) || str(e.PilotName);
  if (!pilot) return;
  const list = state.combat.contacts;
  // Most recently seen first: the ship you just looked at is at the top.
  const i = list.findIndex((x) => x.ship === ship && x.pilot === pilot);
  const k = i >= 0 ? list.splice(i, 1)[0] : { ship, pilot, rank: '', legalStatus: '', bounty: 0, faction: '', seenAt: '' };
  list.unshift(k);
  k.seenAt = str(e.timestamp);
  if ('PilotRank' in e) k.rank = str(e.PilotRank);
  if ('LegalStatus' in e) k.legalStatus = str(e.LegalStatus);
  if ('Bounty' in e) k.bounty = num(e.Bounty);
  if ('Faction' in e) k.faction = str(e.Faction);
}

function earn(state: EdState, e: JournalEvent, amount: number) {
  const s = state.combat.session;
  s.kills += 1;
  s.unredeemed += amount;
  if (!s.firstKillAt) s.firstKillAt = str(e.timestamp);
  s.lastKillAt = str(e.timestamp);
}

function ammo(e: JournalEvent, item: RegExp): number {
  if (!Array.isArray(e.Modules)) return 0;
  return e.Modules.filter((m: any) => item.test(str(m.Item)))
    .reduce((sum: number, m: any) => sum + num(m.AmmoInClip) + num(m.AmmoInHopper), 0);
}
