// Routes pinned on the TRADE screen, kept on disk. Each pin holds the route as the last scan priced it, so a
// new scan refreshes the pins it finds and the others stay listed with their older figures.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TradeChain, TradePin, TradeResult, TradeRoute } from '@et/shared';

const MAX_PINS = 50;
const MAX_BYTES = 200_000;

/** Cleans what the UI sent; null when it is not a loop route or a linear chain. Pure, for tests. */
export function toPin(v: unknown, now = new Date()): TradePin | null {
  const o = (v ?? {}) as { kind?: unknown; route?: TradeRoute; chain?: TradeChain };
  if (JSON.stringify(o).length > MAX_BYTES) return null;
  const at = now.toISOString();
  if (o.kind === 'loop' && typeof o.route?.id === 'string' && o.route.src && o.route.dst && o.route.leg)
    return { id: o.route.id, kind: 'loop', pinnedAt: at, seenAt: at, route: o.route };
  if (o.kind === 'linear' && typeof o.chain?.id === 'string' && Array.isArray(o.chain.legs) && o.chain.legs.length)
    return { id: o.chain.id, kind: 'linear', pinnedAt: at, seenAt: at, chain: o.chain };
  return null;
}

/** Adds `p` on top; pinning the same route again only refreshes it. Pure. */
export function addPin(list: TradePin[], p: TradePin, max = MAX_PINS): TradePin[] {
  const old = list.find((x) => x.kind === p.kind && x.id === p.id);
  return [old ? { ...p, pinnedAt: old.pinnedAt } : p, ...list.filter((x) => x !== old)].slice(0, max);
}

/** Pins found again in `result` take its figures; null when none was in it. Pure. */
export function refreshPins(list: TradePin[], result: TradeResult, now = new Date()): TradePin[] | null {
  const routes = new Map(result.routes.map((r) => [r.id, r]));
  const chains = new Map((result.chains ?? []).map((c) => [c.id, c]));
  let changed = false;
  const next = list.map((p) => {
    const route = p.kind === 'loop' ? routes.get(p.id) : undefined;
    const chain = p.kind === 'linear' ? chains.get(p.id) : undefined;
    if (!route && !chain) return p;
    changed = true;
    return { ...p, seenAt: now.toISOString(), ...(route ? { route } : { chain }) };
  });
  return changed ? next : null;
}

export class TradePins {
  list: TradePin[] = [];
  readonly file: string;

  constructor(cacheDir: string) {
    this.file = join(cacheDir, 'trade-pins.json');
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (Array.isArray(saved)) this.list = saved;
    } catch {
      // nothing saved yet
    }
  }

  async add(p: TradePin) {
    this.list = addPin(this.list, p);
    await this.save();
  }

  /** False when no pin has that id. */
  async remove(id: string): Promise<boolean> {
    const next = this.list.filter((x) => x.id !== id);
    if (next.length === this.list.length) return false;
    this.list = next;
    await this.save();
    return true;
  }

  /** True when a pin took new figures from `result`. */
  async refresh(result: TradeResult): Promise<boolean> {
    const next = refreshPins(this.list, result);
    if (!next) return false;
    this.list = next;
    await this.save();
    return true;
  }

  private async save() {
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.list));
  }
}
