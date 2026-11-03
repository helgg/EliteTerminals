// Points of interest of the galaxy map (EXPLORE › GALAXY): stars worth a detour and sites worth a trip, from Spansh.
import type { Pos } from './galaxy.ts';

export type PoiKind = 'neutron' | 'blackhole' | 'guardian' | 'thargoid';

/** Neutron stars and black holes are too many to draw: they come as a window around a point (the nearest to it). */
export const POI_WINDOWED: readonly PoiKind[] = ['neutron', 'blackhole'];
/** Most points one window brings (one page of Spansh's search: 500 is its page limit). */
export const POI_WINDOW_MAX = 500;

export interface PoiQuery {
  kind: PoiKind;
  /** Windowed kinds: the centre of the window (ly) and how far it reaches. Ignored by the sites, which come whole. */
  center?: Pos;
  radius?: number;
}

export interface PoiPoint {
  /** The body: the star, or the world that carries the site. */
  name: string;
  system: string;
  pos: Pos;
  /** A few words: the star type, or what the site is. */
  detail: string;
}

export interface PoiResult {
  kind: PoiKind;
  points: PoiPoint[];
  /** Spansh's count of matches (it stops counting at 10 000). */
  total: number;
  /** True when the window held more than it brought: zoom in for the rest. */
  more: boolean;
  /** The window actually asked for (centre snapped to a grid, so repeated looks hit the cache). */
  window: { center: Pos; radius: number } | null;
  fetchedAt: string;
}
