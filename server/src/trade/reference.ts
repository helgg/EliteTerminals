// System name search for the trade reference picker: Spansh's name autocomplete (which also gives coordinates,
// kept in the price database) merged with the systems the database already knows.
import type { SystemMatch } from '@et/shared';
import { nameKey, type PriceDb } from '../prices/db.ts';

const AUTOCOMPLETE = 'https://spansh.co.uk/api/systems/field_values/system_names?q=';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const LIMIT = 12;

const dist = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Spansh autocomplete answer → systems with coordinates. Pure, for tests. */
export function fromAutocomplete(body: any): { name: string; id64: number; pos: [number, number, number] }[] {
  return (Array.isArray(body?.min_max) ? body.min_max : [])
    .filter((s: any) => typeof s?.name === 'string' && [s.x, s.y, s.z].every((v) => typeof v === 'number'))
    .map((s: any) => ({ name: s.name, id64: typeof s.id64 === 'number' ? s.id64 : 0, pos: [s.x, s.y, s.z] }));
}

/** Systems whose name starts with `q`: exact match first, then nearest to the player. */
export async function searchSystems(db: PriceDb, q: string, me: [number, number, number]): Promise<SystemMatch[]> {
  const text = q.trim();
  if (text.length < 2) return [];
  try {
    const res = await fetch(AUTOCOMPLETE + encodeURIComponent(text), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const found = fromAutocomplete(await res.json());
      db.batch(() => found.forEach((s) => db.putSystem(s.name, s.pos, s.id64 || undefined)));
    }
  } catch {
    // offline: the database's own systems still answer
  }
  const key = nameKey(text);
  return db.searchSystems(text, 50)
    .map((s) => ({ name: s.name, pos: s.pos, distance: dist(s.pos, me) }))
    .sort((a, b) => Number(nameKey(b.name) === key) - Number(nameKey(a.name) === key) || a.distance - b.distance)
    .slice(0, LIMIT);
}
