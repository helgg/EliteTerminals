// Markets the player docked at, kept on disk: the game only keeps the last one (Market.json).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MarketSnapshot } from '@et/shared';

const MAX_MARKETS = 40;

/** Adds `m` as the newest snapshot of its station, newest first. Pure, for tests. */
export function addSnapshot(list: MarketSnapshot[], m: MarketSnapshot, max = MAX_MARKETS): MarketSnapshot[] {
  if (!m.marketId || !m.items.length) return list;
  const old = list.find((x) => x.marketId === m.marketId);
  if (old && Date.parse(old.updatedAt) >= Date.parse(m.updatedAt)) return list;
  return [m, ...list.filter((x) => x.marketId !== m.marketId)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, max);
}

export class MarketHistory {
  markets: MarketSnapshot[] = [];
  readonly file: string;

  constructor(cacheDir: string) {
    this.file = join(cacheDir, 'market-history.json');
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (Array.isArray(saved)) this.markets = saved;
    } catch {
      // nothing saved yet
    }
  }

  /** Records the market if it is new or newer; true when the history changed. */
  async record(m: MarketSnapshot): Promise<boolean> {
    const next = addSnapshot(this.markets, m);
    if (next === this.markets) return false;
    this.markets = next;
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.markets));
    return true;
  }
}
