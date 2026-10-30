// Colony finder: a system's bodies from Spansh's dump, what they hold, and a score for each profile.
// Pure, for tests: no I/O.
import type { ColonyBody, ColonyCounts, ColonyProfile, ColonyRing } from '@et/shared';

const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Spansh dump body → what the finder needs. */
export function fromDumpBody(b: any): ColonyBody {
  const signals: Record<string, number> = b?.signals?.signals ?? {};
  const parents: Record<string, number>[] = Array.isArray(b?.parents) ? b.parents : [];
  // the nearest real parent: barycentres ('Null') are skipped, as they are not bodies
  const direct = parents.map((p) => Object.entries(p)[0]).find((e) => e && e[0] !== 'Null');
  return {
    bodyId: num(b?.bodyId),
    name: str(b?.name),
    type: str(b?.type),
    subType: str(b?.subType),
    ls: num(b?.distanceToArrival),
    landable: b?.isLandable === true,
    atmosphere: str(b?.atmosphereType) === 'No atmosphere' ? '' : str(b?.atmosphereType),
    terraformable: /terraform/i.test(str(b?.terraformingState)) && !/not terraformable/i.test(str(b?.terraformingState)),
    gravity: typeof b?.gravity === 'number' ? b.gravity : null,
    reserve: str(b?.reserveLevel),
    rings: (Array.isArray(b?.rings) ? b.rings : []).map((r: any): ColonyRing => ({
      name: str(r?.name),
      type: str(r?.type),
      hotspots: Object.entries((r?.signals?.signals ?? {}) as Record<string, number>).map(([name, count]) => ({ name, count: num(count) })),
    })),
    belts: Array.isArray(b?.belts) ? b.belts.length : 0,
    bio: num(signals['$SAA_SignalType_Biological;']) || (Array.isArray(b?.signals?.genuses) ? b.signals.genuses.length : 0),
    geo: num(signals['$SAA_SignalType_Geological;']),
    miningSites: num(signals['$PlanetaryMiningLocation_Name;']),
    thargoid: num(signals['$SAA_SignalType_Thargoid;']),
    guardian: num(signals['$SAA_SignalType_Guardian;']),
    human: num(signals['$SAA_SignalType_Human;']),
    parent: direct ? num(direct[1]) : -1,
    depth: parents.filter((p) => !('Null' in p)).length,
  };
}

/** Spansh dumps list barycentres among the bodies: they are only orbit centres. */
export const isBody = (b: any) => b?.type === 'Star' || b?.type === 'Planet';

/** Stars a fuel scoop works on: KGBFOAM. */
export const scoopable = (subType: string) => /^[OBAFGKM] /.test(subType) || /^[OBAFGKM][0-9]? /.test(subType);

export function countsOf(bodies: ColonyBody[]): ColonyCounts {
  const c: ColonyCounts = {
    landable: 0, atmospheric: 0, rings: 0, pristineRings: 0, metalRings: 0, hotspots: 0, belts: 0, gasGiants: 0,
    elw: 0, ww: 0, aw: 0, terraformable: 0, bio: 0, geo: 0, miningSites: 0, thargoid: 0, guardian: 0, human: 0, stars: 0, maxLs: 0,
  };
  for (const b of bodies) {
    if (b.type === 'Star') c.stars++;
    if (b.landable) c.landable++;
    if (b.landable && b.atmosphere) c.atmospheric++;
    c.rings += b.rings.length;
    if (b.reserve === 'Pristine') c.pristineRings += b.rings.length;
    c.metalRings += b.rings.filter((r) => /metal/i.test(r.type)).length;
    c.hotspots += b.rings.reduce((t, r) => t + r.hotspots.reduce((u, h) => u + h.count, 0), 0);
    c.belts += b.belts;
    if (/gas giant/i.test(b.subType)) c.gasGiants++;
    if (/earth-like/i.test(b.subType)) c.elw++;
    if (/water world/i.test(b.subType)) c.ww++;
    if (/ammonia world/i.test(b.subType)) c.aw++;
    if (b.terraformable) c.terraformable++;
    c.bio += b.bio;
    c.geo += b.geo;
    c.miningSites += b.miningSites;
    c.thargoid += b.thargoid ?? 0;
    c.guardian += b.guardian ?? 0;
    c.human += b.human ?? 0;
    c.maxLs = Math.max(c.maxLs, b.ls);
  }
  return c;
}

type Weights = Record<
  'landable' | 'atmospheric' | 'body' | 'ring' | 'pristine' | 'metal' | 'hotspot' | 'belt' | 'gasGiant' | 'elw' | 'ww' | 'aw' |
  'terraformable' | 'bio' | 'geo' | 'miningSite' | 'scoop',
  number
>;

/** Points per thing found, by profile. BUILD favours room for ports and settlements; MINING, rings and asteroids. */
export const WEIGHTS: Record<ColonyProfile, Weights> = {
  balanced: {
    landable: 3, atmospheric: 2, body: 1, ring: 4, pristine: 3, metal: 2, hotspot: 2, belt: 3, gasGiant: 2,
    elw: 15, ww: 8, aw: 6, terraformable: 4, bio: 1, geo: 1, miningSite: 0.1, scoop: 5,
  },
  mining: {
    landable: 2, atmospheric: 1, body: 0.5, ring: 6, pristine: 6, metal: 5, hotspot: 4, belt: 5, gasGiant: 1,
    elw: 4, ww: 2, aw: 2, terraformable: 1, bio: 0.5, geo: 1, miningSite: 0.3, scoop: 5,
  },
  build: {
    landable: 5, atmospheric: 3, body: 2, ring: 3, pristine: 1, metal: 1, hotspot: 1, belt: 2, gasGiant: 3,
    elw: 10, ww: 6, aw: 4, terraformable: 3, bio: 0.5, geo: 0.5, miningSite: 0.1, scoop: 5,
  },
};

/** The score and where it comes from, largest part first (parts worth nothing are left out). */
export function scoreOf(c: ColonyCounts, bodiesKnown: number, isScoopable: boolean, profile: ColonyProfile) {
  const w = WEIGHTS[profile];
  const parts: { label: string; points: number }[] = [
    { label: 'landable', points: c.landable * w.landable },
    { label: 'atmosphere', points: c.atmospheric * w.atmospheric },
    { label: 'bodies', points: bodiesKnown * w.body },
    { label: 'rings', points: c.rings * w.ring },
    { label: 'pristine', points: c.pristineRings * w.pristine },
    { label: 'metal rings', points: c.metalRings * w.metal },
    { label: 'hotspots', points: c.hotspots * w.hotspot },
    { label: 'belts', points: c.belts * w.belt },
    { label: 'gas giants', points: c.gasGiants * w.gasGiant },
    { label: 'ELW', points: c.elw * w.elw },
    { label: 'water worlds', points: c.ww * w.ww },
    { label: 'ammonia', points: c.aw * w.aw },
    { label: 'terraformable', points: c.terraformable * w.terraformable },
    { label: 'bio', points: c.bio * w.bio },
    { label: 'geo', points: c.geo * w.geo },
    { label: 'mining sites', points: Math.min(c.miningSites, 100) * w.miningSite },
    { label: 'scoopable star', points: isScoopable ? w.scoop : 0 },
  ].filter((p) => p.points > 0).sort((a, b) => b.points - a.points);
  return { score: Math.round(parts.reduce((t, p) => t + p.points, 0)), parts: parts.map((p) => ({ ...p, points: Math.round(p.points * 10) / 10 })) };
}

/** Bodies in system-map order: each body under its parent, by body id. */
export function treeOrder(bodies: ColonyBody[]): ColonyBody[] {
  const ids = new Set(bodies.map((b) => b.bodyId));
  const kids = new Map<number, ColonyBody[]>();
  for (const b of bodies) {
    // -1 = no parent; 0 is a real body id (a lone main star is body 0)
    const p = b.parent !== b.bodyId && ids.has(b.parent) ? b.parent : -1;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(b);
  }
  const out: ColonyBody[] = [];
  const walk = (p: number, depth: number) => {
    for (const b of (kids.get(p) ?? []).sort((x, y) => x.bodyId - y.bodyId)) {
      out.push({ ...b, depth });
      walk(b.bodyId, depth + 1);
    }
  };
  walk(-1, 0);
  return out;
}
