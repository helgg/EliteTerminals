// Mining events → state.mining: prospected asteroids, refined tons, limpets, cracked cores, tools, own ring scans.
// Pure apart from mutating the `state` it is given; no I/O here. Event fields: Frontier's Journal Manual.
import { initialMining, type EdState, type GeoPoint, type MiningTools, type RingInfo, type RingSignal } from '@et/shared';
import type { JournalEvent } from './reducer.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const MAX_PROSPECTS = 30;
const MAX_TRAIL = 3000;
/** A new trail point once the ship has moved this far (m): Status.json is written several times a second. */
const TRAIL_STEP_M = 25;

/** "$AsteroidMaterialContent_High;" → "High". */
export function contentLevel(v: unknown): string {
  return /_(High|Medium|Low);?$/i.exec(str(v))?.[1].replace(/^./, (c) => c.toUpperCase()) ?? '';
}

/** "$lowtemperaturediamond_name;" → "lowtemperaturediamond", the key the Cargo event uses too. */
export const internalName = (v: unknown) => str(v).toLowerCase().replace(/^\$/, '').replace(/_name;$/, '');

export function applyMining(state: EdState, e: JournalEvent): void {
  const m = state.mining;
  const ss = m.session;
  switch (e.event) {
    case 'Fileheader':
      // a new game session: the counters start again, what the ship carries and knows stays
      state.mining = { ...initialMining(), tools: m.tools, scanned: m.scanned, trail: m.trail };
      break;

    case 'Status':
      noteTrail(state);
      break;

    case 'Loadout':
      m.tools = tools(e);
      break;

    case 'ProspectedAsteroid': {
      const materials = (Array.isArray(e.Materials) ? e.Materials : [])
        .map((x: any) => ({ name: str(x.Name), label: str(x.Name_Localised) || str(x.Name), pct: num(x.Proportion) }))
        .sort((a: { pct: number }, b: { pct: number }) => b.pct - a.pct);
      m.prospects.unshift({
        at: str(e.timestamp), materials, content: contentLevel(e.Content),
        remaining: typeof e.Remaining === 'number' ? e.Remaining : 100,
        motherlode: str(e.MotherlodeMaterial_Localised) || str(e.MotherlodeMaterial),
        pos: here(state),
      });
      m.prospects.length = Math.min(m.prospects.length, MAX_PROSPECTS);
      ss.prospected += 1;
      break;
    }

    case 'MiningRefined': {
      const name = internalName(e.Type);
      if (!name) break;
      const row = ss.refined.find((r) => r.name === name);
      if (row) row.count += 1;
      else ss.refined.push({ name, label: str(e.Type_Localised) || name, count: 1 });
      ss.refined.sort((a, b) => b.count - a.count);
      if (!ss.firstRefinedAt) ss.firstRefinedAt = str(e.timestamp);
      ss.lastRefinedAt = str(e.timestamp);
      break;
    }

    case 'AsteroidCracked':
      ss.cracked += 1;
      break;

    case 'LaunchDrone':
      if (e.Type === 'Prospector') ss.prospectors += 1;
      else if (e.Type === 'Collection') ss.collectors += 1;
      break;

    case 'SAASignalsFound': {
      // a ring mapped with the surface scanner: its hotspots, straight from the game
      const ring = str(e.BodyName);
      if (!/ ring$/i.test(ring) || !Array.isArray(e.Signals)) break;
      m.scanned[ring] = e.Signals.map((x: any) => ({ name: str(x.Type_Localised) || str(x.Type), count: num(x.Count) }))
        .filter((x: RingSignal) => x.name && x.count > 0);
      break;
    }
  }
}

/** The ship's position from the last Status.json, when the game gives one. */
function here(state: EdState): GeoPoint | null {
  const s = state.status;
  if (s.latitude === null || s.longitude === null || !s.planetRadius) return null;
  return { lat: s.latitude, lon: s.longitude, alt: s.altitude ?? 0 };
}

/** Metres between two points on a body of radius `r` (flat, fine at mining distances), altitude included. */
export function metres(a: GeoPoint, b: GeoPoint, r: number): number {
  const k = (Math.PI / 180) * r;
  const dx = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)) * k;
  const dy = (b.lat - a.lat) * k;
  return Math.hypot(dx, dy, b.alt - a.alt);
}

function noteTrail(state: EdState) {
  const p = here(state);
  if (!p) return;
  const t = state.mining.trail;
  const body = state.status.bodyName || state.location.body;
  if (t.body !== body) {
    // another body: the old trail means nothing here
    state.mining.trail = { body, radius: state.status.planetRadius!, points: [p] };
    return;
  }
  const last = t.points.at(-1);
  if (last && metres(last, p, t.radius) < TRAIL_STEP_M) return;
  t.points.push(p);
  if (t.points.length > MAX_TRAIL) t.points.splice(0, t.points.length - MAX_TRAIL);
}

function tools(e: JournalEvent): MiningTools {
  const items: string[] = Array.isArray(e.Modules) ? e.Modules.map((x: any) => str(x.Item).toLowerCase()) : [];
  const count = (re: RegExp) => items.filter((i) => re.test(i)).length;
  return {
    lasers: count(/^hpt_mininglaser/),
    abrasion: count(/^hpt_mining_abrblstr/),
    seismic: count(/^hpt_mining_seismchrgwarhead/),
    subsurface: count(/^hpt_mining_subsurfdispmisle/),
    pulseWave: count(/^hpt_mrascanner/) > 0,
    // multi-limpet controllers (mining / universal) also launch prospectors and collectors
    prospector: count(/dronecontrol_prospector|multidronecontrol_(mining|universal)/) > 0,
    collector: count(/dronecontrol_collection|multidronecontrol_(mining|operations|universal)/) > 0,
    refinery: count(/^int_refinery/) > 0,
  };
}

/**
 * The current system's rings: Spansh's, with the player's own ring scans in place of what Spansh knows.
 * Rings Spansh does not know (or no answer yet) still show when the player scanned them here.
 */
export function systemRings(system: string, spansh: RingInfo[] | null, scanned: Record<string, RingSignal[]>): RingInfo[] | null {
  const prefix = system.toLowerCase() + ' ';
  const out = (spansh ?? []).map((r) => (scanned[r.name] ? { ...r, signals: scanned[r.name], own: true } : r));
  for (const [name, signals] of Object.entries(scanned)) {
    if (!name.toLowerCase().startsWith(prefix) || out.some((r) => r.name === name)) continue;
    out.push({ name, body: name.replace(/ [A-Z] Ring$/i, ''), type: '', reserve: '', ls: 0, signals, own: true });
  }
  return spansh || out.length ? out : null;
}
