// Favourite destinations, kept on disk. The game's own bookmarks live on Frontier's servers (no file, no
// journal event, nothing in the companion API), so the player builds this list here instead.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Favorite } from '@et/shared';

const MAX_FAVORITES = 200;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type FavoriteInput = Pick<Favorite, 'system'> & Partial<Pick<Favorite, 'station' | 'stationType' | 'pos'>>;

/** Cleans what the UI sent; null when it names no system. Pure, for tests. */
export function toFavorite(v: unknown, now = new Date()): Favorite | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '');
  const system = text(o.system);
  if (!system) return null;
  const pos = Array.isArray(o.pos) && o.pos.length === 3 && o.pos.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (o.pos as [number, number, number])
    : null;
  return { id: randomUUID(), system, station: text(o.station), stationType: text(o.stationType), pos, addedAt: now.toISOString() };
}

/** Adds `f` on top; the same system/station saved again only moves up (keeping a position it had). Pure. */
export function addFavorite(list: Favorite[], f: Favorite, max = MAX_FAVORITES): Favorite[] {
  const old = list.find((x) => sameName(x.system, f.system) && sameName(x.station, f.station));
  const next = old ? { ...f, id: old.id, pos: f.pos ?? old.pos } : f;
  return [next, ...list.filter((x) => x !== old)].slice(0, max);
}

export class Favorites {
  list: Favorite[] = [];
  readonly file: string;

  constructor(cacheDir: string) {
    this.file = join(cacheDir, 'favorites.json');
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (Array.isArray(saved)) this.list = saved;
    } catch {
      // nothing saved yet
    }
  }

  async add(f: Favorite) {
    this.list = addFavorite(this.list, f);
    await this.save();
  }

  /** False when no favourite has that id. */
  async remove(id: string): Promise<boolean> {
    const next = this.list.filter((x) => x.id !== id);
    if (next.length === this.list.length) return false;
    this.list = next;
    await this.save();
    return true;
  }

  private async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.list, null, 1));
  }
}
