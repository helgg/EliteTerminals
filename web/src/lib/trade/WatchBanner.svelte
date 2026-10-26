<script lang="ts" module>
  import type { TradeChain, TradeLeg, TradeRoute, TradeWatch } from '@et/shared';

  const leg = (src: TradeRoute['src'], dst: TradeRoute['dst'], l: TradeLeg) => ({
    src: src.marketId, dst: dst.marketId, srcName: src.station, dstName: dst.station,
    items: l.items.map((i) => ({ commodity: i.commodity, buy: i.buy, sell: i.sell, amount: i.amount })),
  });

  /** The picked loop (both ways) or chain, as the server watches it. */
  export function toWatch(route: TradeRoute | null, chain: TradeChain | null): TradeWatch | null {
    if (chain) return { id: chain.id, legs: chain.legs.map((r) => leg(r.src, r.dst, r.leg)) };
    if (route) {
      const legs = [leg(route.src, route.dst, route.leg)];
      if (route.back) legs.push(leg(route.dst, route.src, route.back));
      return { id: route.id, legs };
    }
    return null;
  }
</script>

<script lang="ts">
  // Over the route detail: the server prices the picked route again whenever one of its markets gets
  // new prices (EDDN, or the player's own docking) and this says whether it still pays as planned.
  import type { WatchAlert, WatchState } from '@et/shared';
  import { ageLabel, cr, short } from '../format.ts';

  let { watch, id, now }: { watch: WatchState | null; id: string; now: number } = $props();

  const w = $derived(watch && watch.id === id ? watch : null);
  const age = $derived(w ? ageLabel(Math.max(0, now - Date.parse(w.checkedAt)) / 3.6e6) : '');

  function line(a: WatchAlert): string {
    const at = a.where === 'src' ? a.src : a.dst;
    const c = a.commodity.toUpperCase();
    switch (a.kind) {
      case 'profit': return `${c}: profit ${cr(a.was)} → ${cr(a.now)} Cr/t (${a.where === 'src' ? 'buy' : 'sell'} at ${at})`;
      case 'supply': return `${c}: only ${cr(a.now)}t in stock at ${at} (load ${cr(a.was)}t)`;
      case 'demand': return `${c}: demand ${cr(a.now)}t at ${at} (load ${cr(a.was)}t)`;
      default: return `${c}: no longer ${a.where === 'src' ? 'sold' : 'bought'} at ${at}`;
    }
  }
</script>

{#if w}
  {#if w.alerts.length}
    <div class="watch bad" role="alert">
      <div class="head">
        <b>⚠ ROUTE LOST PROFIT</b>
        <span class="num">{short(w.profitWas)} → {short(w.profitNow)} Cr</span>
      </div>
      <ul>
        {#each w.alerts as a, i (i)}<li>{line(a)}</li>{/each}
      </ul>
      <div class="when">prices from {age} ago</div>
    </div>
  {:else}
    <div class="watch ok" title="Every new price for this route's markets (EDDN or your own docking) is checked">
      ✓ PRICES WATCHED LIVE · {age} ago
    </div>
  {/if}
{/if}

<style>
  .watch { font-size: 11px; padding: 6px 8px; margin-bottom: 8px; border: 1px solid; }
  .ok { color: var(--ok); border-color: rgb(53 208 127 / 0.4); background: rgb(53 208 127 / 0.06); letter-spacing: 0.04em; }
  .bad { color: var(--text); border-color: var(--danger); background: rgb(209 72 58 / 0.12); }
  .head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; color: var(--danger); }
  .head .num { color: var(--hud-hi); }
  ul { margin: 4px 0 0; padding-left: 14px; line-height: 1.4; }
  .when { margin-top: 4px; color: var(--muted); font-size: 10px; }
</style>
