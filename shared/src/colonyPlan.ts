// COLONY › PLAN: what to build next in a system whose first construction is done. Pure, no I/O.
//
// Rules OBSERVED in RavenColonial's build list (2026-11-02): every facility costs or gives Tier 2 / Tier 3 points.
//   Outposts, installations, small and medium settlements        +1 T2
//   Coriolis, Asteroid base                                      −3 T2, +1 T3
//   Large settlements                                            −1 T2, +2 T3
//   Ocellus, Orbis, Dodec, Large Planetary Port                  −6 T3
// The list there was only partly read (military and tourism settlements, hubs and others are not in the catalogue
// below), so this plan only uses what was seen. What each body does for an economy was read from its popups
// (geology, volcanism, icy or rocky type, ring reserves); where nothing was seen the weight is a guess and says so.
// Slot counts are NOT in any public data: they are typed by the player, or estimated (and marked as estimates).
import type { ExploreBody } from './index.ts';

export type Econ = 'extraction' | 'industrial' | 'refinery' | 'hightech' | 'tourism' | 'agriculture';
export const ECONS: readonly Econ[] = ['extraction', 'industrial', 'refinery', 'hightech', 'tourism', 'agriculture'];

/** What a facility moves in the system's numbers (the five Raven shows): security, wealth, technology level, standard of living, development. */
export type Stat = 'security' | 'wealth' | 'tech' | 'sol' | 'dev';
export const STATS: readonly Stat[] = ['security', 'wealth', 'tech', 'sol', 'dev'];
export const STAT_LABEL: Record<Stat, string> = { security: 'SECURITY', wealth: 'WEALTH', tech: 'TECH LEVEL', sol: 'STD OF LIVING', dev: 'DEVELOPMENT' };

export interface FacilityKind {
  id: string;
  name: string;
  where: 'orbital' | 'surface';
  /** Change of the T2 / T3 balance when built (negative = costs). */
  t2: number;
  t3: number;
  /** The economy it is built for; null = it takes the economy of the body and its neighbours (or has none). */
  econ: Econ | null;
  /** 'points' earns T2 (cheap), 'convert' spends T2 for T3, 'anchor' is a big port that spends T3. */
  role: 'points' | 'anchor' | 'convert';
  /** Chevrons RavenColonial shows per stat (negative = red). Read by eye: one chevron more or less is possible. */
  stats: Partial<Record<Stat, number>>;
  /** Only built when the player allows pirate builds (PlanConfig.pirates). */
  pirate?: boolean;
  /** Only on an asteroid belt. */
  belt?: boolean;
}

const kind = (id: string, name: string, where: FacilityKind['where'], t2: number, t3: number, econ: Econ | null, stats: FacilityKind['stats'], flags: Pick<FacilityKind, 'pirate' | 'belt'> = {}): FacilityKind =>
  ({ id, name, where, t2, t3, econ, stats, ...flags, role: t2 > 0 ? 'points' : t3 < 0 || id === 'coriolis' || id === 'asteroid-starport' ? 'anchor' : 'convert' });
const S = (security = 0, wealth = 0, tech = 0, sol = 0, dev = 0): FacilityKind['stats'] => ({ security, wealth, tech, sol, dev });

/**
 * Everything seen in RavenColonial's type picker (docs/design/COLONY-FACILITIES.md). The pirate builds only enter the
 * plan when the player allows them; the Asteroid Starport only goes on a belt.
 */
export const FACILITIES: readonly FacilityKind[] = [
  // big ports
  kind('coriolis', 'Coriolis Starport', 'orbital', -3, 1, null, S(-2, 4, 2, 3, 4)),
  kind('ocellus', 'Ocellus Starport', 'orbital', 0, -6, null, S(-3, 5, 5, 4, 6)),
  kind('orbis', 'Orbis Starport', 'orbital', 0, -6, null, S(-3, 5, 5, 4, 6)),
  kind('dodec', 'Dodec Starport', 'orbital', 0, -6, null, S(-3, 6, 7, 6, 8)),
  kind('asteroid-starport', 'Asteroid Starport', 'orbital', -3, 1, 'extraction', S(-1, 4, 2, -3, 6), { belt: true }),
  kind('lpp', 'Large Planetary Port', 'surface', 0, -6, null, S(-2, 3, 3, 4, 6)),
  // orbital, tier 1: +1 T2
  kind('industrial-outpost', 'Industrial Outpost', 'orbital', 1, 0, 'industrial', S(0, 0, 2, 0, 3)),
  kind('scientific-outpost', 'Scientific Outpost', 'orbital', 1, 0, 'hightech', S(0, 0, 3, 0, 0)),
  kind('civilian-outpost', 'Civilian Outpost', 'orbital', 1, 0, 'tourism', S(-1, 1, 0, 2, 1)),
  kind('commercial-outpost', 'Commercial Outpost', 'orbital', 1, 0, null, S(-1, 3, 0, 4, 0)),
  kind('pirate-outpost', 'Pirate Outpost', 'orbital', 1, 0, null, S(-2, 3, 0, 0, 0), { pirate: true }),
  kind('pirate-installation', 'Pirate Base Installation', 'orbital', 1, 0, null, S(-3, 3, 0, 0, 0), { pirate: true }),
  kind('military-outpost', 'Military Outpost', 'orbital', 1, 0, null, S(2, 0, 0, 0, 0)),
  kind('space-farm', 'Space Farm', 'orbital', 1, 0, 'agriculture', S(0, 0, 0, 4, 1)),
  kind('mining-installation', 'Mining/Industrial Installation', 'orbital', 1, 0, 'extraction', S(0, 3, 0, -2, 0)),
  kind('relay-installation', 'Relay Installation', 'orbital', 1, 0, 'hightech', S(1, 0, 0, 0, 1)),
  kind('satellite-installation', 'Satellite Installation', 'orbital', 1, 0, null, S(0, 1, 0, 2, 1)),
  kind('communication-installation', 'Communication Installation', 'orbital', 1, 0, null, S(1, 0, 2, 0, 0)),
  // orbital, tier 2: 1 T2 → 1 T3
  kind('medical-installation', 'Medical Installation', 'orbital', -1, 1, 'hightech', S(0, 0, 2, 4, 0)),
  kind('research-installation', 'Research Installation', 'orbital', -1, 1, 'hightech', S(0, 0, 6, 0, 2)),
  kind('tourist-installation', 'Tourist Installation', 'orbital', -1, 1, 'tourism', S(-2, 4, 0, 0, 2)),
  kind('space-bar-installation', 'Space Bar Installation', 'orbital', -1, 1, 'tourism', S(-2, 2, 0, 3, 0)),
  kind('security-installation', 'Security Installation', 'orbital', -1, 1, null, S(6, 0, 0, 2, 2)),
  kind('military-installation', 'Military Installation', 'orbital', -1, 1, null, S(5, 0, 0, 0, 0)),
  kind('government-installation', 'Government Installation', 'orbital', -1, 1, null, S(2, 0, 0, 5, 2)),
  // surface, tier 1: +1 T2
  kind('industrial-surface-outpost', 'Industrial Surface Outpost', 'surface', 1, 0, 'industrial', S(-1, 2, 0, 0, 0)),
  kind('scientific-surface-outpost', 'Scientific Surface Outpost', 'surface', 1, 0, 'hightech', S(-1, 0, 3, 0, 1)),
  kind('civilian-surface-outpost', 'Civilian Surface Outpost', 'surface', 1, 0, 'tourism', S(-2, 0, 0, 2, 0)),
  kind('agriculture-settlement-s', 'Agriculture Settlement (small)', 'surface', 1, 0, 'agriculture', S(0, 0, 0, 2, 0)),
  kind('agriculture-settlement-m', 'Agriculture Settlement (medium)', 'surface', 1, 0, 'agriculture', S(0, 0, 0, 4, 0)),
  kind('mining-settlement-s', 'Mining Settlement (small)', 'surface', 1, 0, 'extraction', S(0, 2, 0, 0, 0)),
  kind('mining-settlement-m', 'Mining Settlement (medium)', 'surface', 1, 0, 'extraction', S(0, 4, 0, 0, 0)),
  kind('industrial-settlement-s', 'Industrial Settlement (small)', 'surface', 1, 0, 'industrial', S(0, 0, 0, 0, 2)),
  kind('industrial-settlement-m', 'Industrial Settlement (medium)', 'surface', 1, 0, 'industrial', S(0, 0, 0, 0, 3)),
  kind('military-settlement-s', 'Military Settlement (small)', 'surface', 1, 0, null, S(2, 0, 0, 0, 0)),
  kind('military-settlement-m', 'Military Settlement (medium)', 'surface', 1, 0, null, S(3, 0, 0, 0, 0)),
  // surface, tier 2: spend 1 T2
  kind('agriculture-settlement-l', 'Agriculture Settlement (large)', 'surface', -1, 2, 'agriculture', S(0, 0, 0, 7, 0)),
  kind('mining-settlement-l', 'Mining Settlement (large)', 'surface', -1, 2, 'extraction', S(0, 5, 2, -2, 0)),
  kind('industrial-settlement-l', 'Industrial Settlement (large)', 'surface', -1, 2, 'industrial', S(0, 3, 0, 0, 6)),
  kind('military-settlement-l', 'Military Settlement (large)', 'surface', -1, 2, null, S(5, 0, 0, 0, 2)),
  kind('bio-settlement-s', 'Bio Settlement (small)', 'surface', -1, 1, 'hightech', S(0, 0, 2, 0, 1)),
  kind('bio-settlement-m', 'Bio Settlement (medium)', 'surface', -1, 1, 'hightech', S(0, 0, 5, 0, 1)),
  kind('bio-settlement-l', 'Bio Settlement (large)', 'surface', -1, 2, 'hightech', S(0, 0, 7, 0, 2)),
  kind('tourist-settlement-s', 'Tourist Settlement (small)', 'surface', -1, 1, 'tourism', S(-1, 1, 0, 0, 0)),
  kind('tourist-settlement-m', 'Tourist Settlement (medium)', 'surface', -1, 1, 'tourism', S(-1, 2, 0, 0, 0)),
  kind('tourist-settlement-l', 'Tourist Settlement (large)', 'surface', -1, 2, 'tourism', S(-2, 3, 0, 0, 0)),
  kind('extraction-hub', 'Extraction Hub', 'surface', -1, 1, 'extraction', S(0, 7, 0, -3, 2)),
  kind('civilian-hub', 'Civilian Hub', 'surface', -1, 1, null, S(-2, 0, 0, 3, 2)),
  kind('exploration-hub', 'Exploration Hub', 'surface', -1, 1, 'tourism', S(-1, 0, 5, 0, 0)),
  kind('outpost-hub', 'Outpost Hub', 'surface', -1, 1, null, S(-2, 0, 0, 3, 2)),
  kind('scientific-hub', 'Scientific Hub', 'surface', -1, 1, 'hightech', S(0, 0, 7, 0, 0)),
  kind('military-hub', 'Military Hub', 'surface', -1, 1, null, S(7, 0, 0, 0, 0)),
  kind('refinery-hub', 'Refinery Hub', 'surface', -1, 1, 'refinery', S(-1, 4, 2, -2, 5)),
  kind('high-tech-hub', 'High Tech Hub', 'surface', -1, 1, 'hightech', S(-2, 3, 7, 0, 0)),
  kind('industrial-hub', 'Industrial Hub', 'surface', -1, 1, 'industrial', S(0, 4, 2, -3, 2)),
];
const KIND = new Map(FACILITIES.map((k) => [k.id, k]));
export const facility = (id: string) => KIND.get(id);

export type PlanProfileId = 'balanced' | 'industrial' | 'extraction' | 'hightech' | 'tourism' | 'custom';
export const PLAN_PROFILES: { id: PlanProfileId; label: string; hint: string; weights: Record<Econ, number> }[] = [
  { id: 'balanced', label: 'BALANCED', hint: 'a bit of everything', weights: { extraction: 1, industrial: 1, refinery: 1, hightech: 1, tourism: 1, agriculture: 1 } },
  { id: 'industrial', label: 'INDUSTRIAL', hint: 'industry and refineries first', weights: { extraction: 1, industrial: 2, refinery: 1.5, hightech: 0.5, tourism: 0.3, agriculture: 0.3 } },
  { id: 'extraction', label: 'EXTRACTION', hint: 'mining and refining first', weights: { extraction: 2, industrial: 1, refinery: 1.5, hightech: 0.4, tourism: 0.3, agriculture: 0.3 } },
  { id: 'hightech', label: 'HIGH TECH', hint: 'science and tourism on geological worlds', weights: { extraction: 0.4, industrial: 0.5, refinery: 0.3, hightech: 2, tourism: 1.2, agriculture: 0.5 } },
  { id: 'tourism', label: 'TOURISM', hint: 'tourism, then high tech and farms', weights: { extraction: 0.3, industrial: 0.3, refinery: 0.3, hightech: 1, tourism: 2, agriculture: 0.8 } },
  { id: 'custom', label: 'CUSTOM', hint: 'your own weights for each economy', weights: { extraction: 1, industrial: 1, refinery: 1, hightech: 1, tourism: 1, agriculture: 1 } },
];

export interface PlanConfig {
  profile: PlanProfileId;
  /** Used by the CUSTOM profile: 0 (never) … 3 (above all). */
  weights: Record<Econ, number>;
  /** How much each of the system's numbers matters: 0 (ignore) … 3 (above all). */
  stats: Record<Stat, number>;
  /** The T2 / T3 balance now, as the game's system map shows it. */
  points: { t2: number; t3: number };
  /** Slot counts the player typed, by body name. */
  slots: Record<string, { surface?: number; orbital?: number }>;
  /** Steps marked as built (their key), applied to the balance and the slots before planning. */
  done: string[];
  /** Bodies left out of the plan. */
  excluded: string[];
  /** The body the first station orbits ('' = worked out from the finished build): it takes one orbital slot, and bodies near it are worth more. */
  hub: string;
  /** Allow the pirate builds (Pirate Outpost, Pirate Base): off unless the player says so. */
  pirates: boolean;
  /** How many steps to plan. */
  steps: number;
}

/** After the first construction (a Coriolis): 0 T2 and 1 T3, as RavenColonial shows for Abe City. INFERRED: the first build costs nothing. */
export const defaultPlanConfig = (): PlanConfig => ({
  profile: 'balanced',
  weights: { extraction: 1, industrial: 1, refinery: 1, hightech: 1, tourism: 1, agriculture: 1 },
  stats: { security: 1, wealth: 1, tech: 1, sol: 1, dev: 1 },
  points: { t2: 0, t3: 1 },
  slots: {},
  done: [],
  excluded: [],
  hub: '',
  pirates: false,
  steps: 14,
});

export interface BodySlots {
  name: string;
  /** 'Planet' | 'Star' | 'Belt'. */
  type: string;
  surface: number;
  orbital: number;
  surfaceGuess: boolean;
  orbitalGuess: boolean;
  /** Free after what is done. */
  surfaceFree: number;
  orbitalFree: number;
}

/**
 * Surface slots of a landable body from its size and geology. INFERRED from 26 bodies of one system (Raven's own
 * estimates there, marked "?"): about 1 below 1500 km radius, 2 up to ~3000, one more with a geological signal, and a
 * big world (7581 km) had 6. Only a guess: the game's system map has the real number.
 */
export function guessSurface(b: Pick<ExploreBody, 'radius' | 'landable' | 'geo'>): number {
  if (!b.landable) return 0;
  const base = b.radius < 1500 ? 1 : b.radius < 3000 ? 2 : b.radius < 6000 ? 3 : 5;
  return base + (b.geo > 0 ? 1 : 0);
}
/** Orbital slots: unknown everywhere in public data. One per planet is a placeholder, always shown as a guess; stars and belts have slots in the game too, but how many is only known from its system map, so they start at 0 until typed. */
export const guessOrbital = (b: Pick<ExploreBody, 'type'>) => (b.type === 'Planet' ? 1 : 0);

/**
 * Every place that can hold a build: the planets and moons, the stars and the asteroid belts (a belt becomes a place of
 * its own, "<star> Belt", type 'Belt', keeping the star's distance of its inner edge).
 */
export function placesOf(bodies: ExploreBody[]): ExploreBody[] {
  const out: ExploreBody[] = [];
  for (const b of bodies) {
    out.push(b);
    for (const belt of b.belts ?? []) {
      out.push({
        ...b, id: -1000000 - out.length, name: belt.name, type: 'Belt', subType: `${belt.type} belt`, ls: belt.innerLs, parent: b.id, bary: -1,
        depth: b.depth + 1, mainStar: false, landable: false, terraformable: false, volcanism: '', geo: 0, bio: 0, human: 0, thargoid: 0, guardian: 0,
        rings: [], belts: [], stations: [], reserve: '', radius: 0,
      });
    }
  }
  return out;
}

export interface EconPotential { econ: Econ; value: number; why: string }

/** What a body offers each economy, from the rules read in Raven's popups (geology 1.0 for extraction, +0.4 for good ring reserves and for volcanism …). */
export function potentials(b: ExploreBody, goodReserve: boolean): EconPotential[] {
  const out: EconPotential[] = [];
  const buff = goodReserve ? 0.4 : 0;
  const rocky = /rocky|high metal|metal-rich/i.test(b.subType);
  const icy = /icy/i.test(b.subType);
  if (b.geo > 0) out.push({ econ: 'extraction', value: Math.round((1 + buff + (b.volcanism ? 0.4 : 0)) * 100) / 100, why: `geology 1.0${buff ? ' +0.4 reserves' : ''}${b.volcanism ? ' +0.4 volcanism' : ''}` });
  if (icy || b.geo > 0) out.push({ econ: 'industrial', value: 1 + buff, why: `${icy ? 'icy' : 'geology'} 1.0${buff ? ' +0.4 reserves' : ''}` });
  if (rocky) out.push({ econ: 'refinery', value: 1 + buff, why: `rocky 1.0${buff ? ' +0.4 reserves' : ''}` });
  if (b.geo > 0) out.push({ econ: 'hightech', value: 0.6, why: 'geology (guess 0.6; the link bonus seen is 0.4)' });
  if (b.geo > 0) out.push({ econ: 'tourism', value: 0.4, why: 'geology 0.4' });
  if (b.terraformable || /earth-like|water world|ammonia/i.test(b.subType)) out.push({ econ: 'agriculture', value: icy ? 0.6 : 1, why: 'a living or terraformable world (guess)' });
  else if (b.landable && !icy) out.push({ econ: 'agriculture', value: 0.2, why: 'landable (guess)' });
  return out;
}

export interface PlanStep {
  /** `kind@body`, the same facility on the same body twice gets `#2`. */
  key: string;
  kind: FacilityKind;
  body: string;
  /** Which slot it uses and whether that slot count is a guess. */
  slot: 'surface' | 'orbital';
  guess: boolean;
  t2: number;
  t3: number;
  after: { t2: number; t3: number };
  econ: Econ | null;
  score: number;
  /** What the body offers this facility, no profile weights (distance to the hub counted): the same yardstick for every profile. */
  value: number;
  /** Why this one, now. */
  why: string[];
  done: boolean;
  /** 'points' earns T2 for what comes next, 'convert' turns T2 into T3, 'anchor' is the big one. */
  purpose: 'points' | 'convert' | 'anchor' | 'fill';
}

export interface Plan {
  steps: PlanStep[];
  slots: BodySlots[];
  /** Best ring reserve level seen in the system ('' = none known): it adds 0.4 to extraction, industry and refining when major or pristine. */
  reserve: string;
  goodReserve: boolean;
  start: { t2: number; t3: number };
  end: { t2: number; t3: number };
  /** Economy mix of the facilities in the plan (done ones included). */
  mix: Partial<Record<Econ, number>>;
  /** What the plan (built steps included) does to the system's numbers, in chevrons. */
  stats: Record<Stat, number>;
  /** Sum of `value` of the steps still to build: how much of the system's potential the plan uses. */
  used: number;
  notes: string[];
}

/** The big builds the plan works towards, round and round: a Coriolis (or an Asteroid Starport), then the big orbital port, then a Large Planetary Port. */
const ANCHORS: readonly (readonly string[])[] = [['coriolis', 'asteroid-starport'], ['ocellus', 'orbis', 'dodec'], ['lpp']];
const RESERVE_RANK = ['', 'Depleted', 'Low', 'Common', 'Major', 'Pristine'];

const weightsOf = (cfg: PlanConfig) =>
  cfg.profile === 'custom' ? cfg.weights : (PLAN_PROFILES.find((p) => p.id === cfg.profile) ?? PLAN_PROFILES[0]).weights;

export function systemReserve(bodies: ExploreBody[]): string {
  let best = 0;
  for (const b of bodies) best = Math.max(best, RESERVE_RANK.indexOf(b.reserve));
  return RESERVE_RANK[best] ?? '';
}

/** The short name of a body: "Col 359 Sector FM-M d7-90 B 9 a" → "B 9 a". */
export const shortBody = (name: string, system: string) => (name.startsWith(system) ? name.slice(system.length).trim() || 'A' : name);

/** How much a body is worth by its distance from the hub (where the carrier and the first station are): hauling to a far star costs days. */
export const nearness = (ls: number, hubLs: number | null) => (hubLs === null ? 1 : 1 / (1 + Math.abs(ls - hubLs) / 5000));

/** How hard repeating an economy is punished: a balanced plan spreads out, a focused one piles up. */
const DIVERSITY: Record<PlanProfileId, number> = { balanced: 0.7, industrial: 0.25, extraction: 0.25, hightech: 0.25, tourism: 0.25, custom: 0.35 };

/** `hub`: the body of the first station (its distance from the star and its name), null when unknown. */
export function planSystem(system: string, spansh: ExploreBody[], cfg: PlanConfig, hub: { ls: number; body: string } | null = null): Plan {
  const bodies = placesOf(spansh);
  const hubLs = hub?.ls ?? null;
  const reserve = systemReserve(bodies);
  const goodReserve = reserve === 'Major' || reserve === 'Pristine';
  const w = weightsOf(cfg);
  const notes: string[] = [];
  const pool = bodies.filter((b) => !cfg.excluded.includes(b.name));

  const slots: BodySlots[] = bodies
    .map((b) => {
      const typed = cfg.slots[b.name] ?? {};
      const surface = typed.surface ?? guessSurface(b);
      const orbital = typed.orbital ?? guessOrbital(b);
      return { name: b.name, type: b.type, surface, orbital, surfaceGuess: typed.surface === undefined && b.landable, orbitalGuess: typed.orbital === undefined, surfaceFree: surface, orbitalFree: orbital };
    });
  const slotOf = new Map(slots.map((s) => [s.name, s]));
  const hubSlots = hub ? slotOf.get(hub.body) : undefined;
  // typed counts are the ones of the game's system map, which still include the first station: it takes one slot
  if (hubSlots) hubSlots.orbitalFree = Math.max(0, hubSlots.orbitalFree - 1);
  const bodyOf = new Map(bodies.map((b) => [b.name, b]));

  let t2 = cfg.points.t2;
  let t3 = cfg.points.t3;
  const start = { t2, t3 };
  const steps: PlanStep[] = [];
  const mix: Partial<Record<Econ, number>> = {};
  const seen = new Map<string, number>();
  const kindCount = new Map<string, number>();
  const totals: Record<Stat, number> = { security: 0, wealth: 0, tech: 0, sol: 0, dev: 0 };

  // what a facility does to the system's numbers, weighted by the player's priorities: the same on any body
  const STAT_UNIT = 0.1;
  const statCache = new Map<string, { part: number; why: string }>();
  const statOf = (k: FacilityKind) => {
    let hit = statCache.get(k.id);
    if (!hit) {
      const rows = STATS.map((st) => ({ st, n: k.stats[st] ?? 0, v: (k.stats[st] ?? 0) * (cfg.stats[st] ?? 1) * STAT_UNIT })).filter((r) => r.n !== 0);
      const top = [...rows].sort((x, y) => Math.abs(y.v) - Math.abs(x.v)).slice(0, 3).filter((r) => r.v !== 0);
      statCache.set(k.id, (hit = { part: rows.reduce((n, r) => n + r.v, 0), why: top.map((r) => `${STAT_LABEL[r.st].toLowerCase()} ${r.n > 0 ? '+' : ''}${r.n}`).join(' ') }));
    }
    return hit;
  };
  const potCache = new Map<string, EconPotential[]>();
  const valCache = new Map<string, { score: number; why: string[]; raw: number }>();
  const econValue = (kind: FacilityKind, b: ExploreBody): { score: number; why: string[]; raw: number } => {
    const ck = `${kind.id}@${b.name}`;
    const hit = valCache.get(ck);
    if (hit) return hit;
    const out = econValueOf(kind, b);
    valCache.set(ck, out);
    return out;
  };
  const econValueOf = (kind: FacilityKind, b: ExploreBody): { score: number; why: string[]; raw: number } => {
    const near = nearness(b.ls, hubLs);
    const far = near < 0.5 ? [`far: ${Math.round(Math.abs(b.ls - (hubLs ?? 0))).toLocaleString('en-US')} ls from the hub`] : [];
    const r = econValueRaw(kind, b);
    const st = statOf(kind);
    return { score: (r.score + st.part) * near, why: [...r.why, ...(st.why ? [st.why] : []), ...far], raw: (r.raw + st.part) * near };
  };
  const econValueRaw = (kind: FacilityKind, b: ExploreBody): { score: number; why: string[]; raw: number } => {
    let pot = potCache.get(b.name);
    if (!pot) potCache.set(b.name, (pot = potentials(b, goodReserve)));
    if (kind.econ) {
      const p = pot.find((x) => x.econ === kind.econ);
      return p ? { score: p.value * w[kind.econ], why: [`${kind.econ}: ${p.why}`], raw: p.value } : { score: 0, why: [`no ${kind.econ} bonus on ${shortBody(b.name, system)}`], raw: 0 };
    }
    // a facility with no economy of its own (a satellite, a military outpost…): only its stats count
    if (kind.role !== 'anchor') return { score: 0, why: [], raw: 0 };
    // a port: the sum of what the body offers, weighted
    const parts = pot.map((p) => ({ ...p, v: p.value * w[p.econ] })).sort((a, c) => c.v - a.v);
    return { score: parts.reduce((n, p) => n + p.v, 0), why: parts.slice(0, 3).map((p) => `${p.econ} ${p.value.toFixed(1)}`), raw: parts.reduce((n, p) => n + p.value, 0) };
  };

  const push = (kind: FacilityKind, body: ExploreBody, done: boolean, purpose: PlanStep['purpose'], extra: string[] = []) => {
    const sl = slotOf.get(body.name)!;
    const where = kind.where;
    if (where === 'surface') sl.surfaceFree--; else sl.orbitalFree--;
    t2 += kind.t2;
    t3 += kind.t3;
    const base = `${kind.id}@${body.name}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const ev = econValue(kind, body);
    const econ = kind.econ;
    if (econ) mix[econ] = (mix[econ] ?? 0) + 1;
    kindCount.set(kind.id, (kindCount.get(kind.id) ?? 0) + 1);
    for (const st of STATS) totals[st] += kind.stats[st] ?? 0;
    steps.push({
      key: n > 1 ? `${base}#${n}` : base, kind, body: body.name, slot: where, guess: where === 'surface' ? sl.surfaceGuess : sl.orbitalGuess,
      t2: kind.t2, t3: kind.t3, after: { t2, t3 }, econ, score: Math.round(ev.score * 100) / 100, value: ev.raw, why: [...extra, ...ev.why], done, purpose,
    });
  };

  // what is already built
  for (const key of cfg.done) {
    const [id, name] = key.replace(/#\d+$/, '').split('@');
    const kind = KIND.get(id);
    const body = bodyOf.get(name);
    if (kind && body && slotOf.has(name)) push(kind, body, true, kind.role === 'anchor' ? 'anchor' : kind.role === 'convert' ? 'convert' : 'points');
  }
  const builtCount = steps.length;

  const free = (kind: FacilityKind, b: ExploreBody) => {
    const sl = slotOf.get(b.name);
    if (kind.pirate && !cfg.pirates) return false;
    if (kind.belt && b.type !== 'Belt') return false;
    if (b.type === 'Belt' && kind.role === 'anchor' && !kind.belt) return false; // the big ports are not built in a belt
    return !!sl && (kind.where === 'surface' ? sl.surfaceFree : sl.orbitalFree) > 0 && (kind.where === 'orbital' || b.landable);
  };
  type Cand = { kind: FacilityKind; body: ExploreBody; ev: { score: number; why: string[]; raw: number } };
  const candidates = (pred: (k: FacilityKind) => boolean): Cand[] =>
    FACILITIES.filter(pred).flatMap((kind) => pool.filter((b) => free(kind, b)).map((body) => ({ kind, body, ev: econValue(kind, body) }))).filter((c) => c.ev.score > 0);
  const spread = DIVERSITY[cfg.profile] ?? 0.5;
  const worth = (c: { ev: { score: number }; kind: FacilityKind }) =>
    c.ev.score / (1 + spread * (c.kind.econ ? (mix[c.kind.econ] ?? 0) : 0)) / (1 + 0.12 * (kindCount.get(c.kind.id) ?? 0));
  const best = <T extends { ev: { score: number }; body: ExploreBody; kind: FacilityKind }>(list: T[]) =>
    [...list].sort((a, b) => worth(b) - worth(a) || a.body.name.localeCompare(b.body.name) || a.kind.id.localeCompare(b.kind.id))[0];
  const affordable = (k: FacilityKind) => t2 + k.t2 >= 0 && t3 + k.t3 >= 0;

  let blocked = false;
  let anchorIdx = steps.filter((s) => s.purpose === 'anchor').length % ANCHORS.length;
  const room = cfg.steps;
  for (let guard = 0; steps.length - builtCount < room && guard < room * 4; guard++) {
    // the next big one the plan works towards: Coriolis, then Ocellus, then a Large Planetary Port, round again
    let target: Cand | undefined;
    for (let i = 0; i < ANCHORS.length && !target; i++) {
      const ids = ANCHORS[(anchorIdx + i) % ANCHORS.length];
      target = best(candidates((k) => ids.includes(k.id)));
      if (target) anchorIdx = (anchorIdx + i) % ANCHORS.length;
    }
    if (target && affordable(target.kind)) {
      push(target.kind, target.body, false, 'anchor', [`the next big one: ${target.kind.name}`]);
      anchorIdx = (anchorIdx + 1) % ANCHORS.length;
      continue;
    }
    // not yet: earn what it needs
    const needT2 = target ? Math.max(0, -(t2 + target.kind.t2)) : 1;
    const needT3 = target ? Math.max(0, -(t3 + target.kind.t3)) : 0;
    const label = target ? `for the ${target.kind.name}` : '';
    if (target && needT3 > 0 && t2 >= 1) {
      // the cheapest way to T3: the most T3 per T2 spent, then what the system gains
      const list = candidates((k) => k.role === 'convert' && affordable(k));
      const c = [...list].sort((x, y) => worth(y) * y.kind.t3 - worth(x) * x.kind.t3 || x.body.name.localeCompare(y.body.name) || x.kind.id.localeCompare(y.kind.id))[0];
      if (c) { push(c.kind, c.body, false, 'convert', [`turns 1 T2 into ${c.kind.t3} T3 ${label}`]); continue; }
    }
    if (target) {
      const p = best(candidates((k) => k.role === 'points'));
      if (p) { push(p.kind, p.body, false, 'points', [`+1 T2 ${label}`.trim()]); continue; }
      if (!blocked) { blocked = true; notes.push(`The ${target.kind.name} cannot be paid: it needs ${needT2 ? `${needT2} more T2` : ''}${needT3 ? ` ${needT3} more T3` : ''} and no cheap slot is left. The rest of the plan fills the free slots.`); }
    }
    // nothing big left or reachable: put what is worth it in the free slots
    const f = best(candidates((k) => k.role !== 'anchor' && affordable(k)));
    if (f) { push(f.kind, f.body, false, 'fill', [f.kind.role === 'convert' ? 'turns 1 T2 into T3 and fills a free slot' : 'fills a free slot']); continue; }
    if (!target) notes.push('Nothing else is worth building: the free slots left give no economy and no stat you care about (or the slot counts were not typed).');
    break;
  }

  if (!bodies.some((b) => b.type === 'Planet')) notes.push('Spansh has no bodies for this system yet.');
  if (steps.some((s) => s.guess)) notes.push('Steps marked ? use an estimated slot count: confirm it in the game\'s system map before hauling.');
  if (!reserve) notes.push('No ring reserve level is known: the +0.4 for major or pristine reserves is not counted.');
  return { steps, slots, reserve, goodReserve, start, end: { t2, t3 }, mix, stats: totals, used: Math.round(steps.filter((x) => !x.done).reduce((n, x) => n + x.value, 0) * 10) / 10, notes };
}

/** The same settings under each ready-made profile: which profile uses most of the system's potential (the system's vocation). */
export function compareProfiles(system: string, bodies: ExploreBody[], cfg: PlanConfig, hub: { ls: number; body: string } | null = null) {
  return PLAN_PROFILES.filter((p) => p.id !== 'custom')
    .map((p) => {
      const plan = planSystem(system, bodies, { ...cfg, profile: p.id }, hub);
      const todo = plan.steps.filter((x) => !x.done);
      return { id: p.id, label: p.label, builds: todo.length, used: plan.used, mix: plan.mix };
    })
    .sort((a, b) => b.used - a.used);
}
