// A road to riches from Spansh's route planner (checked 2026-11-03): POST /api/riches/route with the form fields below
// answers {job}; GET /api/results/<job> answers the route once it is done (a few seconds), systems with the bodies that pay.
import type { RichesBody, RichesQuery, RichesResult, RichesStop } from '@et/shared';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The limits a route is asked within: Spansh gives up on very long ones and the map has no room for them. */
export const RICHES_LIMITS = { range: [5, 100], stops: [3, 40] } as const;
const clamp = (v: number, [lo, hi]: readonly number[]) => Math.min(Math.max(v, lo), hi);

export function cleanRiches(q: Partial<RichesQuery>): RichesQuery {
  return {
    from: String(q.from ?? '').trim(),
    range: Math.round(clamp(num(q.range) || 30, RICHES_LIMITS.range) * 100) / 100,
    stops: Math.round(clamp(num(q.stops) || 15, RICHES_LIMITS.stops)),
  };
}

/** The form fields Spansh takes: a loop that comes back to the start, within 25 ly of the road, bodies worth 100 000 Cr and up. */
export function richesForm(q: RichesQuery): URLSearchParams {
  return new URLSearchParams({
    from: q.from,
    to: q.from,
    range: String(q.range),
    radius: '25',
    max_results: String(q.stops),
    max_distance: '5000',
    min_value: '100000',
    use_mapping_value: '1',
    loop: '1',
  });
}

/** Spansh's rows → stops; the starting row (no bodies) stays so the line leaves from where you are. */
export function stopsOf(rows: unknown): RichesStop[] {
  const out: RichesStop[] = [];
  for (const r of Array.isArray(rows) ? (rows as any[]) : []) {
    const system = typeof r?.name === 'string' ? r.name : '';
    if (!system) continue;
    const bodies: RichesBody[] = (Array.isArray(r.bodies) ? r.bodies : []).map((b: any) => ({
      name: String(b?.name ?? ''),
      subtype: String(b?.subtype ?? ''),
      terraformable: b?.is_terraformable === true,
      ls: num(b?.distance_to_arrival),
      value: num(b?.estimated_mapping_value) + num(b?.estimated_scan_value),
    }));
    out.push({ system, pos: [num(r.x), num(r.y), num(r.z)], bodies, value: bodies.reduce((a, b) => a + b.value, 0) });
  }
  return out;
}

export function richesResult(q: RichesQuery, rows: unknown): RichesResult {
  const stops = stopsOf(rows);
  return { query: q, stops, value: stops.reduce((a, s) => a + s.value, 0), fetchedAt: new Date().toISOString() };
}
