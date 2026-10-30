// EXPLORE: how a body looks (colour, size) and the orbit tree the map is drawn from.
import { compareOrbit, type ExploreBody } from '@et/shared';

export interface Look {
  /** Light side, body, dark side of the sphere; and the glow around it. */
  hi: string;
  base: string;
  lo: string;
  glow: string;
}

const L = (hi: string, base: string, lo: string, glow = base): Look => ({ hi, base, lo, glow });

/** Star colour by spectral class, as the game shows them. */
function starLook(sub: string): Look {
  const c = /^([OBAFGKMLTY])\b/.exec(sub)?.[1] ?? '';
  if (/black hole/i.test(sub)) return L('#2b2b36', '#050508', '#000', '#8a5cff');
  if (/neutron/i.test(sub)) return L('#ffffff', '#9fd8ff', '#2b5f8a', '#7fd0ff');
  if (/white dwarf|^D/i.test(sub)) return L('#ffffff', '#dfe8ff', '#7d8db8', '#cfe0ff');
  if (/wolf|^W/i.test(sub)) return L('#e8f0ff', '#8fb4ff', '#2c4a9a', '#7aa2ff');
  if (/carbon|^C\b/i.test(sub)) return L('#ffb07a', '#c8431f', '#5a1608', '#ff6a3a');
  if (/tauri|herbig|^TTS|^AeBe/i.test(sub)) return L('#fff2c8', '#ff9d4a', '#7a3412', '#ffb066');
  switch (c) {
    case 'O': return L('#e3ebff', '#8fa8ff', '#2a3d9a', '#8fa8ff');
    case 'B': return L('#eef3ff', '#a9bcff', '#3a4fa8', '#a9bcff');
    case 'A': return L('#ffffff', '#d3deff', '#6a7fc0', '#d3deff');
    case 'F': return L('#ffffff', '#fff6e0', '#b9a36a', '#fff0c0');
    case 'G': return L('#fffbe8', '#ffe27a', '#b8841c', '#ffd35a');
    case 'K': return L('#ffe6b8', '#ffa63d', '#8a4a10', '#ff9a33');
    case 'M': return L('#ffd0a0', '#ff6a2e', '#701c0a', '#ff5a24');
    case 'L': return L('#c98a6a', '#8a3a24', '#2e0f08', '#a04a2c');
    case 'T': return L('#a07088', '#5e2a52', '#1e0a1c', '#7a3a6a');
    case 'Y': return L('#6e6478', '#3a2f48', '#120e1a', '#4c3e60');
  }
  return L('#ffffff', '#ffd9a0', '#7a5a2a', '#ffc070');
}

function planetLook(sub: string): Look {
  const s = sub.toLowerCase();
  if (s.includes('earth-like')) return L('#b8f0ff', '#2f9a6a', '#0b3a52', '#4fe0b0');
  if (s.includes('water world')) return L('#a8e0ff', '#1f6fc4', '#08254f', '#4aa8ff');
  if (s.includes('ammonia world')) return L('#f4f0a0', '#a8a030', '#4a4410', '#d8d060');
  if (s.includes('water giant')) return L('#b8d8ff', '#3f78d0', '#10265a', '#6aa0ff');
  if (s.includes('water-based')) return L('#c0d8ff', '#4a7ac0', '#142a58', '#7aa8ff');
  if (s.includes('ammonia-based')) return L('#f0e0a0', '#b09a40', '#4a3e12', '#d8c060');
  if (s.includes('gas giant with water')) return L('#c8e0ff', '#5a8ad0', '#18305e', '#86b0ff');
  if (s.includes('helium-rich')) return L('#fff4e0', '#d8c8a0', '#6a5a3a', '#ffe8b8');
  if (s.includes('helium gas')) return L('#fff4e0', '#d0c090', '#5a4a2a', '#ffe0a0');
  if (s.includes('class v')) return L('#ffd8a8', '#c8683a', '#4a1e0c', '#ff8a4a');
  if (s.includes('class iv')) return L('#ffe0b8', '#b8844a', '#4a2c10', '#e8b070');
  if (s.includes('class iii')) return L('#e0e8ff', '#5a6ab8', '#161c4a', '#8a9aff');
  if (s.includes('class ii')) return L('#f0f4ff', '#a8b4d8', '#3a4468', '#d0d8f8');
  if (s.includes('class i ')) return L('#fff6ea', '#e0c8a0', '#6a5230', '#f4e0b8');
  if (s.includes('gas giant')) return L('#f4e8d0', '#c8a878', '#5a4426', '#e8cc98');
  if (s.includes('rocky ice')) return L('#e8eef4', '#8a92a0', '#2e3440', '#c4cede');
  if (s.includes('icy')) return L('#ffffff', '#cfe4f4', '#6a8aa8', '#e4f4ff');
  if (s.includes('high metal')) return L('#e8c8a0', '#9a6a42', '#321c0c', '#c89868');
  if (s.includes('metal')) return L('#e6e6ee', '#8a8a98', '#2a2a34', '#c0c0d0');
  if (s.includes('rocky')) return L('#d8cabc', '#8a7868', '#2e261e', '#b4a090');
  return L('#e8e0d8', '#8a8078', '#2a2622', '#b8aea4');
}

export const look = (b: ExploreBody): Look => (b.type === 'Star' ? starLook(b.subType) : planetLook(b.subType));

/** The sphere's diameter in px: log scale, so a gas giant is not forty times a moon. */
export function orbSize(b: ExploreBody): number {
  if (b.type === 'Star') {
    if (/neutron|black hole|white dwarf|^D/i.test(b.subType)) return 70;
    const sun = Math.max(0.05, b.radius / 695700);
    return Math.round(Math.min(150, Math.max(78, 78 + Math.log10(sun * 4 + 1) * 110)));
  }
  const earth = Math.max(0.03, b.radius / 6371);
  return Math.round(Math.min(124, Math.max(26, 52 + Math.log2(earth) * 15)));
}

/** Ring and belt colours by type, as they look in the game. */
export function ringTone(type: string): string {
  if (/icy/i.test(type)) return '#cfe8ff';
  if (/metal rich/i.test(type)) return '#ff9a4a';
  if (/metallic/i.test(type)) return '#e9c46a';
  return '#b79c84';
}

/** A belt is picked by an id above every body id: the star's id and the belt's place in its list. */
export const BELT_BASE = 1_000_000;
export const beltId = (star: number, index: number) => BELT_BASE + star * 100 + index;
export const isBelt = (id: number) => id >= BELT_BASE;
export const beltOf = (id: number) => ({ star: Math.floor((id - BELT_BASE) / 100), index: (id - BELT_BASE) % 100 });

export const hasRings = (b: ExploreBody) => b.rings.length > 0;

/** "Col 359 Sector BL-O d6-72 A 3 a" → "A 3 a"; the main star keeps a short "A". */
export function shortName(name: string, system: string): string {
  if (name === system) return 'A';
  if (name.startsWith(system + ' ')) return name.slice(system.length + 1);
  return name;
}

export interface TreeNode {
  body: ExploreBody;
  kids: TreeNode[];
}

/** Bodies by what they orbit: the stars at the centre first, then each one's planets and moons by distance. */
export function orbitTree(bodies: ExploreBody[], system = ''): TreeNode[] {
  const nodes = new Map<number, TreeNode>(bodies.map((b) => [b.id, { body: b, kids: [] }]));
  const roots: TreeNode[] = [];
  for (const n of nodes.values()) {
    const parent = nodes.get(n.body.parent);
    if (parent && parent !== n) parent.kids.push(n);
    else roots.push(n);
  }
  // in the game's numbering (A 17 before A 18), not by the distance of one moment: see compareOrbit
  const order = (a: TreeNode, b: TreeNode) => compareOrbit(a.body, b.body, system);
  const walk = (n: TreeNode) => (n.kids.sort(order), n.kids.forEach(walk));
  roots.sort((a, b) => Number(b.body.mainStar) - Number(a.body.mainStar) || order(a, b));
  roots.forEach(walk);
  return roots;
}

/** Gravity in g with the game's own warning: above 2 g is no place to land. */
export const gravityLabel = (g: number | null) => (g === null ? '—' : `${g.toFixed(2)} g`);

export function distanceLabel(ls: number): string {
  if (ls < 1) return '0 Ls';
  if (ls < 100) return `${ls.toFixed(1)} Ls`;
  if (ls < 1000000) return `${Math.round(ls).toLocaleString('en-US')} Ls`;
  return `${(ls / 31557600).toFixed(2)} ly`;
}

export const credits = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n));
