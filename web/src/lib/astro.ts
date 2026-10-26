// Classification helpers for stars, bodies, stations and systems, shared by the hologram and lists.

export type StarKind = 'main' | 'neutron' | 'whiteDwarf' | 'blackHole' | 'other';

/** Main-sequence classes a fuel scoop works on. */
const SCOOPABLE = new Set(['O', 'B', 'A', 'F', 'G', 'K', 'M']);

/** NavRoute gives a class code ("K", "DA", "N", "H", "TTS"); Spansh gives a subtype text. */
export function starClass(codeOrSubtype: string): string {
  const s = codeOrSubtype.trim();
  if (!s) return '';
  if (/neutron/i.test(s)) return 'N';
  if (/black hole/i.test(s)) return 'H';
  if (/white dwarf/i.test(s)) return (s.match(/\((D\w*)\)/)?.[1] ?? 'D').toUpperCase();
  if (/wolf-rayet/i.test(s)) return 'W';
  if (/t tauri/i.test(s)) return 'TTS';
  return s.split(/[\s(]/)[0].toUpperCase();
}

export function starKind(cls: string): StarKind {
  if (SCOOPABLE.has(cls)) return 'main';
  if (cls === 'N') return 'neutron';
  if (cls.startsWith('D')) return 'whiteDwarf';
  if (cls === 'H' || cls === 'SUPERMASSIVEBLACKHOLE') return 'blackHole';
  return 'other';
}

export const isScoopable = (cls: string) => SCOOPABLE.has(cls);

/** Approximate visible colour per spectral class. */
export function starColor(cls: string): string {
  switch (cls[0]) {
    case 'O': return '#9bb0ff';
    case 'B': return '#aabfff';
    case 'A': return '#dfe6ff';
    case 'F': return '#fff6e0';
    case 'G': return '#ffe9a8';
    case 'K': return '#ffbf75';
    case 'M': return '#ff8a5c';
    case 'N': return '#c9f2ff';
    case 'D': return '#f0f6ff';
    case 'H': return '#6b4a9c';
    case 'L': case 'T': case 'Y': return '#c0623c';
    default: return '#ffd59a';
  }
}

export type PlanetKind = 'gas' | 'water' | 'earth' | 'ammonia' | 'icy' | 'metal' | 'rocky';

export function planetKind(subType: string): PlanetKind {
  const s = subType.toLowerCase();
  if (s.includes('gas giant')) return 'gas';
  if (s.includes('water world')) return 'water';
  if (s.includes('earth')) return 'earth';
  if (s.includes('ammonia')) return 'ammonia';
  if (s.includes('ic')) return 'icy';
  if (s.includes('metal')) return 'metal';
  return 'rocky';
}

export const PLANET_COLOR: Record<PlanetKind, string> = {
  gas: '#d9a066', water: '#3f8fd8', earth: '#4fb37a', ammonia: '#b7a24a',
  icy: '#cfe6f2', metal: '#b08a6a', rocky: '#9a8574',
};

/** Security → CSS colour token. */
export function securityTone(security: string): string {
  const s = security.toLowerCase();
  if (s.includes('high')) return 'var(--ok)';
  if (s.includes('medium')) return 'var(--hud-hi)';
  if (s.includes('low')) return 'var(--hud)';
  if (s.includes('anarchy') || s.includes('lawless')) return 'var(--danger)';
  return 'var(--faint)';
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();

export const ALLEGIANCE: Record<string, string> = {
  Federation: 'FED', Empire: 'EMP', Alliance: 'ALL', Independent: 'IND',
  Thargoid: 'THG', Guardian: 'GRD', PilotsFederation: 'PF', 'Pilots Federation': 'PF',
};

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function distanceLy(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
