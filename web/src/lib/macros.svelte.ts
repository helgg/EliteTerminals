// Macros: several key presses in a row, each step checked against what the game reports back
// (Status.json flags and pips, ShipTargeted, fighter events) before the next one is sent.
import { keyFor, link, runCommand } from './link.svelte.ts';

export const macro = $state({
  /** Name of the macro running now; one at a time, a second tap is ignored. */
  running: '',
  /** Last fighter order the game accepted: the journal never reports orders. */
  order: '',
  autoNext: readAutoNext(),
  /** Contacts ("ship|pilot") the last lap of the targets did not find: out of sensor range, or dead. */
  absent: [] as string[],
  /** Contact being locked from the list, for its row to show it. */
  locking: '',
});

class Stop extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const st = () => link.state;

/** Set to stop the running macro at its next step. */
let cancelled = false;
let finished: Promise<void> = Promise.resolve();

/** Resolves true as soon as `ok()` holds, false after `ms`. */
async function waitFor(ok: () => boolean, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) {
    if (cancelled) throw new Stop('cancelled');
    if (ok()) return true;
  }
  return ok();
}

/** One key press; stops the macro when the key could not be sent. */
async function press(action: string) {
  if (cancelled) throw new Stop('cancelled');
  if (!(await runCommand(action))) throw new Stop(action);
}

/** Runs `body` as the named macro unless another one is running. Tapping the running one again stops it. */
export async function run(name: string, body: () => Promise<void>) {
  if (macro.running) {
    if (macro.running === name) cancelled = true;
    return;
  }
  macro.running = name;
  cancelled = false;
  let done = () => {};
  finished = new Promise((r) => (done = r));
  try {
    await body();
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
  } finally {
    macro.running = '';
    macro.locking = '';
    done();
  }
}

/** Stops whatever macro is running and waits for it to let go. */
export async function cancelMacro() {
  if (!macro.running) return;
  cancelled = true;
  await finished;
}

// --- power ---

export const PIPS_CMDS = ['IncreaseSystemsPower', 'IncreaseEnginesPower', 'IncreaseWeaponsPower'];
/** Targets in half-pips (SYS, ENG, WEP). */
export const PRESETS = {
  DEF: [8, 4, 0],
  RUN: [4, 8, 0],
  ATK: [4, 0, 8],
} as const satisfies Record<string, readonly [number, number, number]>;

const pipsNow = () => [st().pips.sys, st().pips.eng, st().pips.wep];

/**
 * Closed loop: reset, then press the channel furthest below its target and wait for the game to report
 * the new pips, until they match (or stop moving: game closed, or out of reach).
 */
export async function setPips(target: readonly number[]) {
  await press('ResetPowerDistribution');
  await settle(pipsNow());
  for (let n = 0; n < 10; n++) {
    const now = pipsNow();
    const gap = target.map((t, k) => t - now[k]);
    const k = gap.indexOf(Math.max(...gap));
    if (gap[k] <= 0) return;
    await press(PIPS_CMDS[k]);
    if (!(await settle(now))) return;
  }
}
/** True once the pips differ from `before`, false after ~0.7s without change. */
const settle = (before: number[]) => waitFor(() => pipsNow().some((v, k) => v !== before[k]), 700);

// --- targeting ---

/** Subsystems by the game's internal id, which does not depend on the game language. */
export const SUBSYSTEMS = {
  PowerPlant: /powerplant/i,
  Drives: /_drive_|engine/i, // thrusters are "$ext_drive_class7_a_name;"
  FSD: /hyperdrive/i,
  ShieldGen: /shieldgenerator/i,
  Distributor: /powerdistributor/i,
  Hatch: /cargobaydoor|cargohatch/i, // "$modularcargobaydoor_name;"
} as const;
export type Subsystem = keyof typeof SUBSYSTEMS;

export function onSubsystem(which: Subsystem): boolean {
  const t = st().target;
  return t.locked && SUBSYSTEMS[which].test(t.subsystemId);
}

/**
 * Presses "next subsystem" until the game reports the one we want (the target must be fully scanned).
 * The journal now and then misses a step, so a silent press is not the end: only three in a row are.
 */
async function lockSubsystem(which: Subsystem) {
  if (!st().target.locked) throw new Stop('no target');
  // The game names the targeted subsystem only once the scan is complete.
  if (!(await waitFor(() => st().target.scanStage >= 3, 4000))) throw new Stop('target not scanned');
  let silent = 0;
  for (let n = 0; n < 24 && !onSubsystem(which); n++) {
    const seq = st().target.seq;
    await press('CycleNextSubsystem');
    if (await waitFor(() => st().target.seq !== seq, 1200)) silent = 0;
    else if (++silent >= 3) throw new Stop('no subsystem reported');
  }
}

// --- targets ---

type Info = { ship: string; pilot: string; legalStatus: string; faction: string; bounty: number };
export const keyOf = (a: { ship: string; pilot: string }) => `${a.ship}|${a.pilot}`;
const sameShip = (a: { ship: string; pilot: string }, b: { ship: string; pilot: string }) =>
  a.ship === b.ship && a.pilot === b.pilot;

/** What we know about the locked ship: from its own scan, or from the contact list when we met it before. */
function lockedInfo(): Info {
  const t = st().target;
  const known = t.pilot ? st().combat.contacts.find((c) => sameShip(c, t)) : undefined;
  return {
    ship: t.ship, pilot: t.pilot,
    legalStatus: t.legalStatus || known?.legalStatus || '',
    faction: t.faction || known?.faction || '',
    bounty: t.bounty || known?.bounty || 0,
  };
}

export const massacreFactions = () =>
  new Set(st().combat.missions.filter((m) => !m.done && m.kills < m.killCount).map((m) => m.targetFaction));

/** How much a ship is worth as the next target; below zero it is not one. */
type Score = (t: Info) => number;
/** Wanted ships, the highest bounty first. */
export const wantedScore: Score = (t) => (t.legalStatus === 'Wanted' ? t.bounty : -1);
/** Ships of a massacre target faction, the highest bounty first. */
export const massacreScore: Score = (t) => (massacreFactions().has(t.faction) ? t.bounty : -1);
/** Massacre ships first, then any wanted one: what AUTO NEXT picks. */
export const bestScore: Score = (t) => {
  const m = massacreScore(t);
  return m >= 0 ? 1e12 + m : wantedScore(t);
};

/** Presses "next target" once and waits for the game's answer; false when it locked nothing. */
async function nextTarget(): Promise<boolean> {
  for (let tries = 0; tries < 2; tries++) {
    const seq = st().target.seq;
    await press('CycleNextTarget');
    if (await waitFor(() => st().target.seq !== seq, 1200)) {
      // A ship scanned before comes back at stage 3 at once; a new one at stage 0, its pilot a moment later.
      if (st().target.locked && st().target.scanStage === 0) await waitFor(() => st().target.scanStage >= 1, 400);
      return st().target.locked;
    }
  }
  return false;
}

/**
 * Locks the best target by `score`. One quick lap of the targets in range (no waiting for scans) finds which
 * known ships are still here, then it cycles to the best of them. When none is worth it, it waits for the
 * scans of the new ships and stops at the first good one.
 */
async function cycleToBest(score: Score) {
  const contacts = () => st().combat.contacts;
  const cap = Math.min(40, contacts().length + 16);
  const top = () => Math.max(-1, ...contacts().filter((k) => !macro.absent.includes(keyOf(k))).map((k) => score(k)));
  const good = (i: Info) => score(i) >= 0 && score(i) >= top();

  // The ship locked now may already be the best.
  if (st().target.locked && st().target.pilot && good(lockedInfo())) return;

  const seen = new Map<string, Info>();
  let fresh = 0;
  let mark = '';
  for (let n = 0; n < cap; n++) {
    if (!(await nextTarget())) continue;
    const info = lockedInfo();
    if (!info.pilot) { fresh++; continue; }
    const key = keyOf(info);
    if (key === mark) break; // one full lap
    if (!mark) mark = key;
    seen.set(key, info);
    // Nothing known is worth more than this one: no need to finish the lap.
    if (good(info)) return;
  }
  if (mark) macro.absent = contacts().map(keyOf).filter((k) => !seen.has(k));

  const best = [...seen.values()].filter((i) => score(i) >= 0).sort((a, b) => score(b) - score(a))[0];
  if (best) {
    await cycleToShip(best);
    return;
  }
  // No known ship is worth it: scan the new ones, a few at most, and stop at the first good one.
  for (let n = 0, scans = 0; n < cap && scans < Math.max(fresh, 4); n++) {
    if (!(await nextTarget())) continue;
    if (st().target.scanStage >= 3) continue; // scanned before, and not good
    scans++;
    if (!(await waitFor(() => st().target.scanStage >= 3, 8000))) continue;
    if (score(lockedInfo()) >= 0) return;
  }
}

/** Cycles until the given ship is locked; one lap at most. */
async function cycleToShip(want: { ship: string; pilot: string }): Promise<boolean> {
  if (sameShip(st().target, want)) return true;
  const cap = Math.min(40, st().combat.contacts.length + 16);
  for (let n = 0; n < cap; n++) {
    if (!(await nextTarget())) continue;
    // Same type but no pilot yet: the scan may have been forgotten, give it a moment.
    if (st().target.ship === want.ship && !st().target.pilot) await waitFor(() => st().target.pilot !== '', 3000);
    if (sameShip(st().target, want)) return true;
  }
  return false;
}

const nextWanted = () => cycleToBest(wantedScore);
const nextMassacre = () => cycleToBest(massacreScore);
const nextBest = () => cycleToBest(bestScore);

/** Locks a ship from the contact list; stops any macro running first (AUTO NEXT, a NEXT…). */
export async function lockContact(c: { ship: string; pilot: string }) {
  await cancelMacro();
  const key = keyOf(c);
  return run('LOCK', async () => {
    macro.locking = key;
    const found = await cycleToShip(c);
    macro.absent = found ? macro.absent.filter((k) => k !== key) : [...new Set([...macro.absent, key])];
  });
}

// --- ship ---

async function hardpoints(deployed: boolean) {
  if (st().flags.hardpointsDeployed === deployed) return;
  await press('DeployHardpointToggle');
  await waitFor(() => st().flags.hardpointsDeployed === deployed, 1500);
}

async function order(action: string) {
  await press(action);
  macro.order = action;
}

const focus = () => order('OrderFocusTarget');

// --- the console's macros: name → keys they need, and the steps ---

type Macro = { keys: string[]; steps: () => Promise<void> };
const PIP_KEYS = ['ResetPowerDistribution', ...PIPS_CMDS];
const SUB_KEYS = ['CycleNextSubsystem'];
const subMacro = (which: Subsystem): Macro => ({ keys: SUB_KEYS, steps: () => lockSubsystem(which) });

export const MACROS: Record<string, Macro> = {
  PowerDEF: { keys: PIP_KEYS, steps: () => setPips(PRESETS.DEF) },
  PowerRUN: { keys: PIP_KEYS, steps: () => setPips(PRESETS.RUN) },
  PowerATK: { keys: PIP_KEYS, steps: () => setPips(PRESETS.ATK) },

  SubPowerPlant: subMacro('PowerPlant'),
  SubDrives: subMacro('Drives'),
  SubFSD: subMacro('FSD'),
  SubShieldGen: subMacro('ShieldGen'),
  SubDistributor: subMacro('Distributor'),
  SubHatch: subMacro('Hatch'),
  NextWanted: { keys: ['CycleNextTarget'], steps: nextWanted },
  NextMassacre: { keys: ['CycleNextTarget'], steps: nextMassacre },
  NextBest: { keys: ['CycleNextTarget'], steps: nextBest },
  Hunt: {
    keys: ['CycleNextTarget', ...SUB_KEYS, 'OrderFocusTarget'],
    steps: async () => { await nextMassacre(); await lockSubsystem('PowerPlant'); await focus(); },
  },

  SicThreat: {
    keys: ['SelectHighestThreat', 'OrderFocusTarget'],
    steps: async () => {
      const before = st().target.ship + st().target.pilot;
      await press('SelectHighestThreat');
      await waitFor(() => st().target.ship + st().target.pilot !== before, 900);
      await focus();
    },
  },
  SicWanted: { keys: ['CycleNextTarget', 'OrderFocusTarget'], steps: async () => { await nextWanted(); await focus(); } },
  Cripple: { keys: [...SUB_KEYS, 'OrderFocusTarget'], steps: async () => { await lockSubsystem('Drives'); await focus(); } },
  FighterSafe: { keys: ['OrderFollow', 'OrderHoldFire'], steps: async () => { await order('OrderFollow'); await order('OrderHoldFire'); } },

  Escape: {
    keys: ['DeployHardpointToggle', ...PIP_KEYS, 'UseBoostJuice', 'HyperSuperCombination'],
    steps: async () => {
      await hardpoints(false);
      await setPips(PRESETS.RUN);
      await press('UseBoostJuice');
      await press('HyperSuperCombination');
    },
  },
  SubmitRun: {
    keys: ['SetSpeedZero', ...PIP_KEYS, 'UseBoostJuice', 'Supercruise'],
    steps: async () => {
      await press('SetSpeedZero');
      await waitFor(() => !st().flags.beingInterdicted, 15000);
      await setPips(PRESETS.RUN);
      await press('UseBoostJuice');
      // Submitting leaves a short FSD cooldown; supercruise as soon as it is over.
      await waitFor(() => !st().flags.fsdCooldown, 45000);
      await press('Supercruise');
    },
  },
  RecallJump: {
    keys: ['OrderRequestDock', ...PIP_KEYS, 'HyperSuperCombination'],
    steps: async () => {
      if (st().combat.fighter === 'out') {
        await order('OrderRequestDock');
        if (!(await waitFor(() => st().combat.fighter !== 'out', 90000))) return;
      }
      await setPips(PRESETS.RUN);
      await press('HyperSuperCombination');
    },
  },
  Disengage: {
    keys: ['DeployHardpointToggle', 'OrderFollow', ...PIP_KEYS],
    steps: async () => {
      await hardpoints(false);
      if (st().combat.fighter === 'out') await order('OrderFollow');
      await setPips(PRESETS.RUN);
    },
  },

  ShieldSink: {
    keys: ['UseShieldCell', 'DeployHeatSink'],
    steps: async () => { await press('UseShieldCell'); await sleep(1000); await press('DeployHeatSink'); },
  },
  CellCell: {
    keys: ['UseShieldCell', 'DeployHeatSink'],
    steps: async () => {
      for (let i = 0; i < 2; i++) {
        if (i) await sleep(6000); // a cell recharges over ~5 s; a second one any sooner is wasted
        await press('UseShieldCell');
        await sleep(1000);
        await press('DeployHeatSink');
      }
    },
  },
  GoDark: {
    keys: ['ToggleAdvanceMode', 'DeployHeatSink', ...PIP_KEYS],
    steps: async () => {
      if (!st().flags.silentRunning) await press('ToggleAdvanceMode');
      await press('DeployHeatSink');
      await setPips(PRESETS.RUN);
    },
  },
  ChaffBoost: {
    keys: ['FireChaffLauncher', 'UseBoostJuice', ...PIP_KEYS],
    steps: async () => { await press('FireChaffLauncher'); await press('UseBoostJuice'); await setPips(PRESETS.RUN); },
  },
  Brace: {
    keys: [...PIP_KEYS, 'UseShieldCell', 'FireChaffLauncher'],
    steps: async () => { await setPips(PRESETS.DEF); await press('UseShieldCell'); await press('FireChaffLauncher'); },
  },

  Assist0: { keys: ['TargetWingman0', 'SelectTargetsTarget'], steps: () => assist(0) },
  Assist1: { keys: ['TargetWingman1', 'SelectTargetsTarget'], steps: () => assist(1) },
  Assist2: { keys: ['TargetWingman2', 'SelectTargetsTarget'], steps: () => assist(2) },
  AttackRun: {
    keys: ['DeployHardpointToggle', ...PIP_KEYS, 'SelectHighestThreat'],
    steps: async () => { await hardpoints(true); await setPips(PRESETS.ATK); await press('SelectHighestThreat'); },
  },
};

async function assist(n: number) {
  await press(`TargetWingman${n}`);
  await sleep(300);
  await press('SelectTargetsTarget');
}

export const canRun = (id: string) => MACROS[id]?.keys.every((k) => keyFor(k)) ?? false;
export const runMacro = (id: string) => run(id, MACROS[id].steps);

/** A plain key that is a fighter order also lights its LED. */
export function sendOrder(action: string) {
  return run(action, () => order(action));
}

// --- AUTO NEXT: after each kill, lock the best target (a massacre ship, else the highest bounty) ---

function readAutoNext(): boolean {
  try { return localStorage.getItem('et.autoNext') === '1'; } catch { return false; }
}
export function toggleAutoNext() {
  macro.autoNext = !macro.autoNext;
  if (!macro.autoNext && macro.running === 'NextBest') void cancelMacro();
  try { localStorage.setItem('et.autoNext', macro.autoNext ? '1' : '0'); } catch {}
}

let kills = -1;
/** Called on every state update; picks the next target when the kill count goes up. */
export function watchKills() {
  const now = st().combat.session.kills;
  const more = kills >= 0 && now > kills;
  kills = now;
  if (more && macro.autoNext && canRun('NextBest')) {
    // Let the wreck clear the target first.
    setTimeout(() => void runMacro('NextBest'), 1200);
  }
}
