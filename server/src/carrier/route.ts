// Fleet carrier routes: the systems from Spansh's carrier router (500 ly jumps through real systems), the
// tritium worked out here from the carrier's own load, so the tank, the cargo and the top-ups are the player's.
import type { CarrierJump, CarrierRoute, CarrierRouteQuery } from '@et/shared';

const ROUTE = 'https://spansh.co.uk/api/fleetcarrier/route';
const RESULTS = 'https://spansh.co.uk/api/results/';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';

export const CARRIER_CAPACITY = 25000;
export const TANK = 1000;

/**
 * Tritium one jump burns: 5 + ly × (25000 + used + tank) / 200000, rounded as Spansh does. Checked against
 * Spansh's own numbers (Kakmbutan → Col 359 Sector PS-T d3-60, 499.7 ly, 2,680 t used, 124 t in the tank: 74 t).
 */
export const jumpFuel = (ly: number, used: number, tank: number) =>
  Math.round(5 + (ly * (CARRIER_CAPACITY + used + tank)) / 200000);

interface Hop {
  system: string; id64: number; pos: [number, number, number]; ly: number; toGo: number;
  waypoint: boolean; icyRing: boolean; pristine: boolean;
}

/**
 * Tank and cargo along the hops. Moving tritium from the cargo into the tank keeps the mass the same; before a
 * jump the tank cannot cover, the tank is filled up (one trip to the carrier menu instead of one per jump).
 */
export function simulate(hops: Hop[], q: CarrierRouteQuery): Omit<CarrierRoute, 'query' | 'fetchedAt'> {
  let tank = Math.min(TANK, q.fuel);
  let cargo = q.tritium;
  let burnt = 0;
  let missing = 0;
  const jumps: CarrierJump[] = hops.map((h, i) => {
    if (i === 0) return { ...h, fuelUsed: 0, tank, topUp: 0, cargo, short: false };
    // the mass is the space used (cargo tritium included) plus the tank, whatever moves between them
    const need = jumpFuel(h.ly, Math.max(0, q.used - (q.tritium - cargo)), tank);
    let topUp = 0;
    if (tank < need) {
      topUp = Math.min(cargo, TANK - tank);
      tank += topUp;
      cargo -= topUp;
    }
    const short = tank < need;
    if (short) missing += need - tank;
    tank = Math.max(0, tank - need);
    burnt += need;
    return { ...h, fuelUsed: need, tank, topUp, cargo, short };
  });
  return { jumps, distance: hops.reduce((t, h) => t + h.ly, 0), tritium: burnt, missing };
}

/** Spansh's jumps, the start once and each system once (a waypoint can repeat with a zero-length hop). */
export function hopsOf(result: any): Hop[] {
  const out: Hop[] = [];
  for (const j of result?.jumps ?? []) {
    if (out.length && !(j.distance > 0)) {
      if (j.is_desired_destination) out[out.length - 1].waypoint = true;
      continue;
    }
    out.push({
      system: String(j.name ?? ''), id64: Number(j.id64 ?? 0), pos: [j.x ?? 0, j.y ?? 0, j.z ?? 0],
      ly: Number(j.distance ?? 0), toGo: Number(j.distance_to_destination ?? 0),
      waypoint: !!j.is_desired_destination, icyRing: !!j.has_icy_ring, pristine: !!j.is_system_pristine,
    });
  }
  return out;
}

export async function carrierRoute(q: CarrierRouteQuery): Promise<CarrierRoute> {
  const to = q.to.map((t) => t.trim()).filter(Boolean);
  if (!q.from.trim()) throw new Error('pick where the carrier starts (FROM)');
  if (!to.length) throw new Error('pick a destination (TO)');
  const form = new URLSearchParams({ source: q.from.trim(), capacity_used: String(Math.max(0, Math.round(q.used))), calculate_starting_fuel: '1' });
  to.forEach((t) => form.append('destinations', t));
  const res = await fetch(ROUTE, {
    method: 'POST', body: form, signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  const job = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !job.job) throw new Error(job.error ?? `Spansh answered ${res.status}`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i ? 1500 : 500));
    const r = await fetch(RESULTS + job.job, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const body = (await r.json().catch(() => ({}))) as any;
    if (body.status === 'queued') continue;
    if (body.status !== 'ok' || body.error) throw new Error(body.error ?? 'Spansh could not plot this route');
    const hops = hopsOf(body.result);
    if (hops.length < 2) throw new Error('Spansh found no route');
    return { query: { ...q, to }, ...simulate(hops, q), fetchedAt: new Date().toISOString() };
  }
  throw new Error('Spansh took too long: try again');
}
