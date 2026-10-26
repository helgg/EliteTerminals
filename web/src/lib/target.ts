// Works out what the player is pointing at and what we know about it.
import type { BodyInfo, EdState, StationInfo, SystemDetail } from '@et/shared';
import type { HoloTarget } from './Hologram.svelte';
import { isScoopable, norm, starClass } from './astro.ts';
import { largestPad } from './PadBadge.svelte';

export interface TargetView {
  holo: HoloTarget;
  /** "SYSTEM", "STAR", "PLANET", "STATION"… */
  label: string;
  name: string;
  subtitle: string;
  facts: [string, string][];
  scoopable: boolean;
  /** Stations only: largest pad and Spansh service names, drawn as icons. */
  pad?: string;
  services?: string[];
  /** Spansh had no data (yet) for this target. */
  pending: boolean;
}

const ls = (d: number) => `${Math.round(d).toLocaleString('en-US')}ls`;

export function resolveTarget(s: EdState): TargetView {
  const here = s.location.address;
  const dest = s.destination;

  // A destination in another system, or a plotted FSD target: show that system's main star.
  if ((dest.system && dest.system !== here) || (!dest.name && s.route.fsdTarget)) {
    const id = dest.system && dest.system !== here ? dest.system : s.route.fsdTargetAddress;
    const name = (dest.system && dest.system !== here ? dest.name : s.route.fsdTarget) || '—';
    const detail = s.galaxy.target;
    const hop = s.route.hops.find((h) => h.address === id);
    const cls = starClass(detail?.primaryStar || hop?.starClass || '');
    return {
      holo: cls ? { kind: 'star', cls } : { kind: 'unknown' },
      label: 'SYSTEM',
      name,
      subtitle: detail?.primaryStar || (cls ? `class ${cls}` : 'unknown star'),
      facts: systemFacts(detail),
      scoopable: isScoopable(cls),
      pending: !detail,
    };
  }

  // A body or station in this system.
  if (dest.name) {
    const detail = s.galaxy.current;
    const key = norm(dest.name);
    const station = detail?.stations.find((st) => norm(st.name) === key);
    if (station) return stationView(station);
    const body = detail?.bodies.find((b) => norm(b.name) === key);
    if (body) {
      const tb = s.galaxy.targetBody;
      return bodyView(body, tb && tb.system === dest.system && tb.body === dest.body ? tb.rings : []);
    }
    return signalView(dest.name, !detail);
  }

  return {
    holo: { kind: 'none' }, label: 'NO TARGET', name: 'No destination', subtitle: 'select a target in the game',
    facts: [], scoopable: false, pending: false,
  };
}

function systemFacts(d: SystemDetail | null): [string, string][] {
  if (!d) return [];
  const facts: [string, string][] = [['SEC', d.security || '—']];
  if (d.controllingPower) facts.push(['POWER', `${d.controllingPower}${d.powerState ? ` · ${d.powerState}` : ''}`]);
  if (d.factionState && d.factionState !== 'None') facts.push(['STATE', d.factionState]);
  facts.push(['BODIES', String(d.bodies.length)], ['STATIONS', String(d.stations.filter((x) => !/carrier/i.test(x.type)).length)]);
  if (d.needsPermit) facts.push(['PERMIT', 'required']);
  return facts;
}

function stationView(st: StationInfo): TargetView {
  const facts: [string, string][] = [['DIST', ls(st.distance)]];
  if (st.body) facts.push(['BODY', st.body]);
  return {
    holo: { kind: 'station', stationType: st.type }, label: 'STATION', name: st.name, subtitle: st.type,
    facts, scoopable: false, pending: false, pad: largestPad(st.pads), services: st.services,
  };
}

/** Destinations Spansh doesn't list, told apart by the (localised) name the game gives them. */
function signalView(name: string, pending: boolean): TargetView {
  const view = (holo: HoloTarget, label: string, subtitle: string): TargetView =>
    ({ holo, label, name, subtitle, facts: [], scoopable: false, pending });
  if (/nav beacon/i.test(name)) return view({ kind: 'poi', poi: 'beacon' }, 'NAV BEACON', 'navigation beacon');
  if (/resource extraction/i.test(name)) return view({ kind: 'poi', poi: 'res' }, 'RES', 'resource extraction site');
  if (/conflict zone|combat zone/i.test(name)) return view({ kind: 'poi', poi: 'cz' }, 'CONFLICT ZONE', 'combat zone');
  // fleet carriers are named "<name> <ID>" with an ident like "X7K-41T", and many aren't on Spansh
  if (/\b[A-Z0-9]{3}-[A-Z0-9]{3}\b/.test(name)) return view({ kind: 'station', stationType: 'FleetCarrier' }, 'STATION', 'Fleet carrier');
  // without the system's data yet it may still turn out to be a body or station
  if (pending) return view({ kind: 'unknown' }, 'DESTINATION', 'no data');
  return view({ kind: 'poi', poi: 'signal' }, 'SIGNAL', 'signal source');
}

function bodyView(b: BodyInfo, rings: string[]): TargetView {
  const star = b.type === 'Star';
  const cls = star ? starClass(b.subType) : '';
  const facts: [string, string][] = [['DIST', ls(b.distance)]];
  if (b.terraforming && b.terraforming !== 'Not terraformable') facts.push(['TERRA', b.terraforming]);
  // a star's "rings" are asteroid belts: only planets get drawn with rings
  if (!star && rings.length) facts.push(['RINGS', rings.join(', ')]);
  return {
    holo: star ? { kind: 'star', cls } : { kind: 'planet', subType: b.subType, rings: rings.length > 0 },
    label: star ? 'STAR' : 'PLANET', name: b.name, subtitle: b.subType, facts,
    scoopable: star && isScoopable(cls), pending: false,
  };
}
