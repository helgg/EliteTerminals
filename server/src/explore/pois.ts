// Points of interest for the galaxy map, from Spansh's body search (checked 2026-11-03):
// - stars by `subtype` (Neutron Star, Black Hole) around `reference_coords`, nearest first, at most 500 a page;
// - sites by signal on a body: Guardian (352 bodies / 301 systems then) and Thargoid (530 / 370), small enough to come whole.
import { POI_WINDOW_MAX, type PoiKind, type PoiPoint, type PoiQuery } from '@et/shared';

const SUBTYPE: Partial<Record<PoiKind, string>> = { neutron: 'Neutron Star', blackhole: 'Black Hole' };
const SIGNAL: Partial<Record<PoiKind, string>> = { guardian: 'Guardian', thargoid: 'Thargoid' };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The window snapped to a grid a fraction of its size, so panning a little asks for the same thing (and the cache answers). */
export function snapWindow(center: readonly [number, number, number], radius: number) {
  const r = Math.min(Math.max(Math.round(radius / 25) * 25, 25), 1500);
  const step = Math.max(10, r / 4);
  const snap = (v: number) => Math.round(v / step) * step;
  return { center: [snap(center[0]), snap(center[1]), snap(center[2])] as [number, number, number], radius: r };
}

/** Spansh's request for one page of a kind. Sites ignore the window (Sol is only the reference for the order). */
export function poiBody(q: PoiQuery, page = 0) {
  const sub = SUBTYPE[q.kind];
  if (sub) {
    const w = snapWindow(q.center ?? [0, 0, 0], q.radius ?? 200);
    return {
      filters: { subtype: { value: [sub] }, distance: { min: 0, max: w.radius } },
      reference_coords: { x: w.center[0], y: w.center[1], z: w.center[2] },
      sort: [{ distance: { direction: 'asc' } }],
      size: POI_WINDOW_MAX,
      page,
    };
  }
  return {
    filters: { signals: [{ name: SIGNAL[q.kind], value: [1, 99] }] },
    reference_system: 'Sol',
    sort: [{ distance: { direction: 'asc' } }],
    size: 100,
    page,
  };
}

/** A search hit → a point, or null when Spansh gave no coordinates. */
export function fromPoi(kind: PoiKind, r: any): PoiPoint | null {
  const pos: [number, number, number] = [num(r?.system_x), num(r?.system_y), num(r?.system_z)];
  const system = str(r?.system_name);
  if (!system || (!pos[0] && !pos[1] && !pos[2] && system !== 'Sol')) return null;
  const signals: { name: string; count: number }[] = Array.isArray(r?.signals) ? r.signals : [];
  const count = (n: string) => num(signals.find((s) => s?.name === n)?.count);
  let detail = str(r?.subtype);
  if (kind === 'guardian') detail = count('Guardian') > 1 ? `Guardian sites ×${count('Guardian')}` : 'Guardian site';
  if (kind === 'thargoid') detail = count('Thargoid') > 1 ? `Thargoid signals ×${count('Thargoid')}` : 'Thargoid signal';
  return { name: str(r?.name) || system, system, pos, detail };
}

/** Sites come as bodies: one point per body (a system with two is two points, a few ly of orbit apart that no map shows). */
export function pointsOf(kind: PoiKind, rows: unknown): PoiPoint[] {
  const seen = new Set<string>();
  const out: PoiPoint[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const p = fromPoi(kind, r);
    if (!p || seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
  }
  return out;
}
