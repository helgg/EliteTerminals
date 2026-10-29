// Macros: several key presses in a row, each step checked against what the game reports back
// (Status.json flags and pips, ShipTargeted, fighter events) before the next one is sent.
import type { SharedMacros } from '@et/shared';
import { keyFor, link, onMacroMessage, pasteText, runCommand, send } from './link.svelte.ts';

export const macro = $state({
  /** Name of the macro running on this screen; one at a time, a second tap is ignored. */
  running: '',
});

/** Progress every screen shows (link.state.macros); set here at once, and on the others through the server. */
const shared = () => link.state.macros;
function share(patch: SharedMacros) {
  Object.assign(link.state.macros, patch);
  send({ type: 'share', patch });
}
const setPlot = (p: Partial<SharedMacros['plot'] & object>) => share({ plot: { ...shared().plot, ...p } });

class Stop extends Error {}
/** A search that ends without a target; its message is shown on every screen. */
class GiveUp extends Stop {}

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

/** Macro running on another screen of the panel, '' when none. */
const elsewhere = () => (macro.running ? '' : link.state.macros.running);
/** True while the macro runs here or on any other screen. */
export const busy = (name: string) => macro.running === name || link.state.macros.running === name;
/** How the last search of this macro ended, when it found nothing. */
export const noteOf = (name: string) =>
  !busy(name) && link.state.macros.noteFor === name ? link.state.macros.note : '';

/**
 * Runs `body` as the named macro unless another one is running, here or on another screen.
 * Tapping the running one again stops it, wherever it runs.
 */
export async function run(name: string, body: () => Promise<void>) {
  if (macro.running) {
    if (macro.running === name) cancelled = true;
    return;
  }
  if (elsewhere()) {
    if (elsewhere() === name) send({ type: 'stopMacro' });
    return;
  }
  macro.running = name;
  cancelled = false;
  send({ type: 'macro', running: name });
  let note = '';
  let done = () => {};
  finished = new Promise((r) => (done = r));
  try {
    await body();
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
    if (err instanceof GiveUp) note = err.message;
  } finally {
    macro.running = '';
    if (shared().locking) share({ locking: '' });
    send({ type: 'macro', running: '', note, noteFor: name });
    done();
  }
}

/** Stops whatever macro is running, here or on another screen, and waits for it to let go. */
export async function cancelMacro() {
  if (macro.running) {
    cancelled = true;
    await finished;
  } else if (elsewhere()) {
    send({ type: 'stopMacro' });
    for (const end = Date.now() + 3000; elsewhere() && Date.now() < end;) await sleep(50);
  }
}

onMacroMessage((msg) => {
  if (msg.type === 'stopMacro') {
    if (macro.running) cancelled = true;
  } else if (MACROS[msg.macro] && canRun(msg.macro)) void runMacro(msg.macro);
});

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

type Info = { ship: string; pilot: string; rank: string; legalStatus: string; faction: string; bounty: number };
/** A ship as the game tells them apart: type, pilot name and rank (NPCs have no id). */
type Who = { ship: string; pilot: string; rank: string };
export const keyOf = (a: Who) => `${a.ship}|${a.pilot}|${a.rank}`;
const sameShip = (a: Who, b: Who) => a.ship === b.ship && a.pilot === b.pilot && a.rank === b.rank;

/** What we know about the locked ship: from its own scan, or from the contact list when we met it before. */
function lockedInfo(): Info {
  const t = st().target;
  const known = t.pilot ? st().combat.contacts.find((c) => sameShip(c, t)) : undefined;
  return {
    ship: t.ship, pilot: t.pilot, rank: t.rank,
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

/** You picked another ship in the game (or let go of it) while a macro waited on this one. */
const takenOver = (ship: string) => !st().target.locked || st().target.ship !== ship;

/** Waits for the locked ship's scan; stops the macro when you lock another one yourself. */
function waitScan(ms: number) {
  const ship = st().target.ship;
  return waitFor(() => {
    if (takenOver(ship)) throw new GiveUp('stopped: you picked a target');
    return st().target.scanStage >= 3;
  }, ms);
}

/**
 * "Next target" with bounds, for one search: it gives up after `ms`, or when presses in a row lock nothing
 * (no ship in range), instead of cycling on and on.
 */
function bounded(ms = 30000) {
  const until = Date.now() + ms;
  let empty = 0;
  return async (): Promise<boolean> => {
    if (Date.now() > until) throw new GiveUp(`gave up after ${ms / 1000} s`);
    const ok = await nextTarget();
    if (ok) empty = 0;
    else if (++empty >= 3) throw new GiveUp('no ship in range');
    return ok;
  };
}

/**
 * Locks the best target by `score`. One quick lap of the targets in range (no waiting for scans) finds which
 * known ships are still here, then it cycles to the best of them. When none is worth it, it waits for the
 * scans of the new ships and stops at the first good one.
 */
async function cycleToBest(score: Score, what: string) {
  const next = bounded();
  const contacts = () => st().combat.contacts;
  const cap = Math.min(40, contacts().length + 16);
  const top = () => Math.max(-1, ...contacts().filter((k) => !shared().absent.includes(keyOf(k))).map((k) => score(k)));
  const good = (i: Info) => score(i) >= 0 && score(i) >= top();

  // The ship locked now may already be the best.
  if (st().target.locked && st().target.pilot && good(lockedInfo())) return;

  const seen = new Map<string, Info>();
  let fresh = 0;
  let mark = '';
  for (let n = 0; n < cap; n++) {
    if (!(await next())) continue;
    const info = lockedInfo();
    if (!info.pilot) { fresh++; continue; }
    const key = keyOf(info);
    if (key === mark) break; // one full lap
    if (!mark) mark = key;
    seen.set(key, info);
    // Nothing known is worth more than this one: no need to finish the lap.
    if (good(info)) return;
  }
  if (mark) share({ absent: contacts().map(keyOf).filter((k) => !seen.has(k)) });

  const best = [...seen.values()].filter((i) => score(i) >= 0).sort((a, b) => score(b) - score(a))[0];
  if (best) {
    if (!(await cycleToShip(best, next))) throw new GiveUp(`${what} ship lost`);
    return;
  }
  // No known ship is worth it: scan the new ones, a few at most, and stop at the first good one.
  for (let n = 0, scans = 0; n < cap && scans < Math.min(Math.max(fresh, 4), 8); n++) {
    if (!(await next())) continue;
    if (st().target.scanStage >= 3) continue; // scanned before, and not good
    scans++;
    if (!(await waitScan(8000))) continue;
    if (score(lockedInfo()) >= 0) return;
  }
  throw new GiveUp(`no ${what} ship in range`);
}

/** Cycles until the given ship is locked; one lap at most. */
async function cycleToShip(want: Who, next = bounded()): Promise<boolean> {
  if (sameShip(st().target, want)) return true;
  const cap = Math.min(40, st().combat.contacts.length + 16);
  for (let n = 0; n < cap; n++) {
    if (!(await next())) continue;
    // Same type but no pilot yet: the scan may have been forgotten, give it a moment.
    if (st().target.ship === want.ship && !st().target.pilot) await waitFor(() => st().target.pilot !== '', 3000);
    if (sameShip(st().target, want)) return true;
  }
  return false;
}

const nextWanted = () => cycleToBest(wantedScore, 'wanted');
const nextMassacre = () => cycleToBest(massacreScore, 'massacre');
const nextBest = () => cycleToBest(bestScore, 'wanted or massacre');

/** Locks a ship from the contact list; stops any macro running first (AUTO NEXT, a NEXT…). */
export async function lockContact(c: Who) {
  await cancelMacro();
  const key = keyOf(c);
  return run('LOCK', async () => {
    share({ locking: key });
    let found = false;
    try {
      found = await cycleToShip(c);
    } finally {
      const absent = shared().absent;
      share({ absent: found ? absent.filter((k) => k !== key) : [...new Set([...absent, key])] });
    }
    if (!found) throw new GiveUp('not in range');
  });
}

// --- ship ---

async function hardpoints(deployed: boolean) {
  if (st().flags.hardpointsDeployed === deployed) return;
  await press('DeployHardpointToggle');
  await waitFor(() => st().flags.hardpointsDeployed === deployed, 1500);
}

async function scoop(open: boolean) {
  if (st().flags.cargoScoopDeployed === open) return;
  await press('ToggleCargoScoop');
  await waitFor(() => st().flags.cargoScoopDeployed === open, 1500);
}

/** Cycles the fire groups until the game reports group `n` (0 = A); one lap at most. */
async function fireGroup(n: number) {
  for (let i = 0; i < 8 && st().status.fireGroup !== n; i++) {
    const before = st().status.fireGroup;
    await press('CycleFireGroupNext');
    if (!(await waitFor(() => st().status.fireGroup !== before, 1000))) return;
  }
}

async function order(action: string) {
  await press(action); // the server keeps it as the last order, for every screen
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

// MINING: ready at the rock (scoop open, hardpoints out, power to the lasers); leave (all in, power to engines)
MACROS.MineReady = {
  keys: ['ToggleCargoScoop', 'DeployHardpointToggle', ...PIP_KEYS],
  steps: async () => { await scoop(true); await hardpoints(true); await setPips(PRESETS.ATK); },
};
MACROS.MineLeave = {
  keys: ['ToggleCargoScoop', 'DeployHardpointToggle', ...PIP_KEYS],
  steps: async () => { await scoop(false); await hardpoints(false); await setPips(PRESETS.RUN); },
};
for (let n = 0; n < 6; n++) MACROS[`FireGroup${n}`] = { keys: ['CycleFireGroupNext'], steps: () => fireGroup(n) };

export const canRun = (id: string) => MACROS[id]?.keys.every((k) => keyFor(k)) ?? false;
export const runMacro = (id: string) => run(id, MACROS[id].steps);

/** A plain key that is a fighter order also lights its LED. */
export function sendOrder(action: string) {
  return run(action, () => order(action));
}

// --- route: plot one to a system through the galaxy map ---

/** Galaxy map, as Status.json's GuiFocus reports it. */
const GALAXY_MAP = 6;
const sameSystem = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const routeEndsAt = (system: string) => sameSystem(st().route.hops.at(-1)?.system ?? '', system);

/**
 * Keys pressed in the open galaxy map (calibrated in game, Odyssey): Up arrow + Space opens the search field,
 * paste the name, Down + Space picks the first suggestion and the map flies there, then holding the left mouse
 * button on it (middle of the screen) plots the route. Each entry is a bind, a plain key or 'paste', with the pause the map needs after it.
 */
export const PLOT_STEPS: [step: string, waitMs: number][] = [
  ['KeyUp', 1000], // the search box gets the focus
  ['UI_Select', 1000], // …and opens for typing
  ['paste', 1500], // the suggestions come from Frontier's servers
  ['KeyDown', 1000], // first suggestion
  ['UI_Select', 3000], // the map flies to the system and centres it
  ['MouseHoldCenter', 1000], // held 3 s on it: plot route
];
/** Never less than this between two steps: the map drops input that comes faster (seen in game). */
const PLOT_MIN_GAP_MS = 1000;
/** Keys the server always has (no bind needed). */
const TEXT_KEYS = ['TextEnter', 'KeyUp', 'KeyDown', 'MouseHoldCenter'];
const PLOT_KEYS = ['GalaxyMapOpen', ...new Set(PLOT_STEPS.map(([step]) => step).filter((x) => x !== 'paste'))];

async function plotRoute(system: string) {
  setPlot({ system, stage: 'map', error: '' });
  const fail = (error: string) => {
    setPlot({ error });
    throw new Stop(error);
  };
  if (routeEndsAt(system)) {
    setPlot({ stage: 'done' });
    return;
  }
  if (st().status.guiFocus !== GALAXY_MAP) {
    await press('GalaxyMapOpen');
    if (!(await waitFor(() => st().status.guiFocus === GALAXY_MAP, 6000))) fail('galaxy map did not open');
    await sleep(2000); // the map takes a moment to answer keys after it opens
  }
  setPlot({ stage: 'search' });
  for (const [step, waitMs] of PLOT_STEPS) {
    if (step === 'paste') {
      if (cancelled) throw new Stop('cancelled');
      if (!(await pasteText(system))) fail('could not type the name');
    } else await press(step);
    await sleep(Math.max(waitMs, PLOT_MIN_GAP_MS));
  }
  setPlot({ stage: 'plot' });
  if (!(await waitFor(() => routeEndsAt(system), 6000))) fail('route not plotted: finish it in the map (the name is on the clipboard)');
  setPlot({ stage: 'done' });
  await press('GalaxyMapOpen');
  await waitFor(() => st().status.guiFocus !== GALAXY_MAP, 3000);
}

/** Keys the route macro needs that the player has not bound. */
export const plotMissing = () => PLOT_KEYS.filter((k) => !TEXT_KEYS.includes(k) && !keyFor(k));

/** Plots a route to `system`; tapping the same one while it runs stops it. */
export async function plotTo(system: string) {
  if (macro.running && macro.running !== 'Plot') await cancelMacro();
  return run('Plot', () => plotRoute(system));
}

// --- AUTO NEXT: after each kill, lock the best target (a massacre ship, else the highest bounty) ---
// The server keeps it on or off for every screen, and after a kill asks one of them (the last used) to run NextBest.

export const autoNext = () => link.state.macros.autoNext;
export function toggleAutoNext() {
  const on = !autoNext();
  send({ type: 'autoNext', on });
  if (!on && busy('NextBest')) void cancelMacro();
}
