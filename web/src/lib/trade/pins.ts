// Pinned routes live on the server (trade-pins.json) and come back in the state; these only ask for changes.
import type { TradeChain, TradePin, TradeRoute } from '@et/shared';

export type Pinnable = { kind: 'loop'; item: TradeRoute } | { kind: 'linear'; item: TradeChain };

export const findPin = (pins: TradePin[], kind: TradePin['kind'], id: string) =>
  pins.find((p) => p.kind === kind && p.id === id);

export async function togglePin(pins: TradePin[], p: Pinnable): Promise<boolean> {
  try {
    if (findPin(pins, p.kind, p.item.id))
      return (await fetch(`/api/trade/pins/${encodeURIComponent(p.item.id)}`, { method: 'DELETE' })).ok;
    const body = p.kind === 'loop' ? { kind: 'loop', route: p.item } : { kind: 'linear', chain: p.item };
    const res = await fetch('/api/trade/pins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The pinned routes of one kind that `ids` (the scan) left out, with the figures they had when last seen. */
export function missingPins(pins: TradePin[], kind: TradePin['kind'], ids: Set<string>): TradePin[] {
  return pins.filter((p) => p.kind === kind && !ids.has(p.id));
}
