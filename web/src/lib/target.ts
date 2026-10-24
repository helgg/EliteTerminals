// Works out what the player is pointing at and what we know about it.
import type { BodyInfo, EdState, StationInfo, SystemDetail } from '@et/shared';
import type { HoloTarget } from './Hologram.svelte';
import { isScoopable, norm, starClass } from './astro.ts';

export interface TargetView {
  holo: HoloTarget;
  /** "SYSTEM", "STAR", "PLANET", "STATION"… */
  label: string;
  name: string;
  subtitle: string;
  facts: [string, string][];
  scoopable: boolean;
  /** Spansh had no data (yet) for this target. */
  pending: boolean;
}

const ls = (d: number) => `${Math.round(d).toLocaleString('pt-BR')}ls`;

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
      subtitle: detail?.primaryStar || (cls ? `classe ${cls}` : 'estrela desconhecida'),
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
    if (body) return bodyView(body);
    return {
      holo: { kind: 'unknown' }, label: 'DESTINATION', name: dest.name, subtitle: 'sem dados',
      facts: [], scoopable: false, pending: !detail,
    };
  }

  return {
    holo: { kind: 'none' }, label: 'NO TARGET', name: 'Nenhum destino', subtitle: 'selecione um alvo no jogo',
    facts: [], scoopable: false, pending: false,
  };
}

function systemFacts(d: SystemDetail | null): [string, string][] {
  if (!d) return [];
  const facts: [string, string][] = [['SEC', d.security || '—']];
  if (d.controllingPower) facts.push(['POWER', `${d.controllingPower}${d.powerState ? ` · ${d.powerState}` : ''}`]);
  if (d.factionState && d.factionState !== 'None') facts.push(['STATE', d.factionState]);
  facts.push(['BODIES', String(d.bodies.length)], ['STATIONS', String(d.stations.filter((x) => !/carrier/i.test(x.type)).length)]);
  if (d.needsPermit) facts.push(['PERMIT', 'necessário']);
  return facts;
}

function stationView(st: StationInfo): TargetView {
  const pad = st.pads.l ? 'L' : st.pads.m ? 'M' : st.pads.s ? 'S' : '—';
  const facts: [string, string][] = [['DIST', ls(st.distance)], ['PAD', pad]];
  const has = (svc: string) => st.services.some((x) => x.toLowerCase() === svc);
  const svc = [has('refuel') && 'FUEL', has('repair') && 'REP', has('restock') && 'AMMO', has('market') && 'MKT',
    has('shipyard') && 'YARD', has('outfitting') && 'OUTF'].filter(Boolean).join(' ');
  if (svc) facts.push(['SVC', svc]);
  if (st.body) facts.push(['BODY', st.body]);
  return {
    holo: { kind: 'station', stationType: st.type }, label: 'STATION', name: st.name, subtitle: st.type,
    facts, scoopable: false, pending: false,
  };
}

function bodyView(b: BodyInfo): TargetView {
  const star = b.type === 'Star';
  const cls = star ? starClass(b.subType) : '';
  const facts: [string, string][] = [['DIST', ls(b.distance)]];
  if (b.terraforming && b.terraforming !== 'Not terraformable') facts.push(['TERRA', b.terraforming]);
  return {
    holo: star ? { kind: 'star', cls } : { kind: 'planet', subType: b.subType },
    label: star ? 'STAR' : 'PLANET', name: b.name, subtitle: b.subType, facts,
    scoopable: star && isScoopable(cls), pending: false,
  };
}
