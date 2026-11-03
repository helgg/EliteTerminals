// Where a system lies in the galaxy: the codex region of a set of coordinates and the distances to well-known places.
// Pure, no I/O. The region grid is the community's mapping of the game's region borders (shared/THIRD-PARTY.md, MIT):
// 2048 × 2048 cells of 4096/83 ly, each row a run-length list [length, region, length, region, …].
import data from './regionmap.json' with { type: 'json' };

export const REGION_NAMES: (string | null)[] = data.regions;
/** Grid origin (x, z in ly), cell size (ly) and cells per side. */
export const REGION_GRID = { x0: -49985, z0: -24105, cell: 4096 / 83, size: 2048 } as const;

const rows: number[][] = data.rows;

/** The grid cell of a position, or null outside the grid. */
export function regionCell(x: number, z: number): [number, number] | null {
  const px = Math.floor((x - REGION_GRID.x0) / REGION_GRID.cell);
  const pz = Math.floor((z - REGION_GRID.z0) / REGION_GRID.cell);
  return px < 0 || pz < 0 || px >= REGION_GRID.size || pz >= REGION_GRID.size ? null : [px, pz];
}

/** Region id of grid cell (px, pz); 0 = outside every region. */
export function regionIdAt(px: number, pz: number): number {
  const row = rows[pz];
  if (!row || px < 0) return 0;
  let at = 0;
  for (let i = 0; i < row.length; i += 2) {
    at += row[i];
    if (px < at) return row[i + 1];
  }
  return 0;
}

/** The codex region a position is in: `{ id, name }`, or null outside the map. */
export function regionAt(x: number, z: number): { id: number; name: string } | null {
  const cell = regionCell(x, z);
  if (!cell) return null;
  const id = regionIdAt(cell[0], cell[1]);
  return id ? { id, name: REGION_NAMES[id] ?? '' } : null;
}

/** The whole grid as one region id per cell (row-major, `size` × `size`): what the galaxy map paints. */
export function regionGrid(): Uint8Array {
  const n = REGION_GRID.size;
  const out = new Uint8Array(n * n);
  rows.forEach((row, pz) => {
    let at = 0;
    for (let i = 0; i < row.length; i += 2) {
      out.fill(row[i + 1], pz * n + at, pz * n + at + row[i]);
      at += row[i];
    }
  });
  return out;
}

export type Pos = readonly [number, number, number];

export interface Landmark {
  id: string;
  name: string;
  pos: Pos;
  /** What it is, for the label colour: the core, home, a far colony, the far end of the map. */
  kind: 'core' | 'home' | 'colony' | 'edge';
}

/** Coordinates as Spansh has them (checked 2026-11-02). */
export const LANDMARKS: readonly Landmark[] = [
  { id: 'sol', name: 'Sol', pos: [0, 0, 0], kind: 'home' },
  { id: 'sgra', name: 'Sagittarius A*', pos: [25.21875, -20.90625, 25899.96875], kind: 'core' },
  { id: 'colonia', name: 'Colonia', pos: [-9530.5, -910.28125, 19808.125], kind: 'colony' },
  { id: 'beagle', name: 'Beagle Point', pos: [-1111.5625, -134.21875, 65269.75], kind: 'edge' },
];

export const distance = (a: Pos, b: Pos) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Distances from a position to each landmark, nearest first. */
export function landmarkDistances(pos: Pos): { id: string; name: string; ly: number }[] {
  return LANDMARKS.map((l) => ({ id: l.id, name: l.name, ly: distance(pos, l.pos) })).sort((a, b) => a.ly - b.ly);
}
