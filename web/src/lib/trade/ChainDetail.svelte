<script lang="ts">
  import type { TradeChain, TradeEnd } from '@et/shared';
  import Hop from './Hop.svelte';
  import PinButton from './PinButton.svelte';
  import FavStar from '../FavStar.svelte';
  import LoadList from './LoadList.svelte';
  import StartDistance from './StartDistance.svelte';
  import Name from '../Name.svelte';
  import PadBadge from '../PadBadge.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected linear route as a checklist: at each stop sell everything, then buy the listed load.
  // `split` (portrait screens, phones on their side) reads like text: two stops a row with the jump lane standing
  // between them (A ▶ B), a full-width jump down to the next row (▼ TO C), then C ▶ D, filling the panel.
  let { chain, jumpRange, split = false }: { chain: TradeChain | null; jumpRange: number; split?: boolean } = $props();
  const letter = (k: number) => String.fromCharCode(65 + k);
  const role = (k: number, last: number) => (k === 0 ? 'BUY' : k === last ? 'SELL ALL · END' : 'SELL ALL · BUY');
  // rows: start, totals, then a row of two stops and a turn row between each pair
  // (a last stop alone on its row takes only its height, so the rows with loads get the room)
  const rows = (stops: number) =>
    `auto auto ${Array.from({ length: Math.ceil(stops / 2) }, (_, p) => (2 * p + 1 < stops ? 'minmax(min-content, 1fr)' : 'auto')).join(' auto ')}`;
</script>

{#snippet stop(e: TradeEnd, k: number, what: string)}
  <div class="stop">
    <span class="badge">{letter(k)}</span>
    <div class="info">
      <div class="name"><Name value={e.station} stationType={e.type} icon /><FavStar system={e.system} station={e.station} stationType={e.type} /> <span class="role">{what}</span></div>
      <div class="meta">
        <span class="sys"><Name value={e.system} system icon /><FavStar system={e.system} /></span>
        <span>{cr(e.ls)}ls</span>
        <PadBadge pad={e.pad} />
        <span class={ageTone(e.ageH)}>{ageLabel(e.ageH)}</span>
        {#if e.live}<span class="live" title="Prices and stock from your own Market.json">● OWN DATA</span>{/if}
        {#if e.state && e.state !== 'None'}<span class="state">{e.state.toUpperCase()}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

{#if chain && split}
  {@const stops = [chain.legs[0].src, ...chain.legs.map((l) => l.dst)]}
  <div class="detail split" style:grid-template-rows={rows(stops.length)}>
    <div class="start wide"><StartDistance start={chain.legs[0].src} {jumpRange} /><PinButton pin={{ kind: 'linear', item: chain }} label /></div>
    <div class="totals wide">
      <span class="ok">+{short(chain.total)} Cr</span>
      <span class="tele">{short(chain.perHour)} Cr/h</span>
      <span class="dim">≈{duration(chain.seconds)} · {stops.length} stops</span>
    </div>
    {#each stops as e, k (k)}
      {@const row = 3 + 2 * Math.floor(k / 2)}
      {@const l = chain.legs[k]}
      <div class="cell" style:grid-row={row} style:grid-column={k % 2 ? 3 : 1}>
        {@render stop(e, k, role(k, stops.length - 1))}
        {#if l}<LoadList leg={l.leg} title="{letter(k)}→{letter(k + 1)}" />{/if}
      </div>
      {#if l && k % 2 === 0}
        <div class="lane" style:grid-row={row} style:grid-column="2"><Hop ly={l.hopLy} jumps={l.jumps} seconds={l.legSeconds} vertical /></div>
      {:else if l}
        <div class="wide" style:grid-row={row + 1}><Hop ly={l.hopLy} jumps={l.jumps} seconds={l.legSeconds} label="TO {letter(k + 1)}" /></div>
      {/if}
    {/each}
  </div>
{:else if chain}
  <div class="detail">
    <div class="start"><StartDistance start={chain.legs[0].src} {jumpRange} /><PinButton pin={{ kind: 'linear', item: chain }} /></div>
    <div class="totals">
      <span class="ok">+{short(chain.total)} Cr</span>
      <span class="tele">{short(chain.perHour)} Cr/h</span>
      <span class="dim">≈{duration(chain.seconds)} · {chain.legs.length + 1} stops</span>
    </div>
    {#each chain.legs as l, k (k)}
      {@render stop(l.src, k, role(k, chain.legs.length))}
      <LoadList leg={l.leg} title="{letter(k)}→{letter(k + 1)}" />
      <Hop ly={l.hopLy} jumps={l.jumps} seconds={l.legSeconds} />
    {/each}
    {@render stop(chain.legs[chain.legs.length - 1].dst, chain.legs.length, role(chain.legs.length, chain.legs.length))}
  </div>
{:else}
  <p class="dim">Select a route in the table.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 5px; }
  .split { display: grid; min-height: 100%; gap: 6px 8px; grid-template-columns: minmax(0, 1fr) 84px minmax(0, 1fr); }
  .split .wide { grid-column: 1 / -1; }
  .cell { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .cell > :global(.load) { flex: 1; }
  .split .name, .split .meta { flex-wrap: wrap; white-space: normal; }
  .split .name :global(.text), .split .sys :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .totals { display: flex; gap: 10px; align-items: baseline; font-weight: 700; white-space: nowrap; }
  .totals .dim { font-size: 10px; font-weight: 400; margin-left: auto; }
  .stop { display: grid; grid-template-columns: 22px 1fr; gap: 6px; align-items: center; }
  .badge {
    display: grid; place-items: center; height: 22px; background: var(--hud); color: var(--void); font-weight: 800;
    clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px);
  }
  .info { min-width: 0; }
  .name { display: flex; gap: 6px; align-items: baseline; font-weight: 700; white-space: nowrap; overflow: hidden; }
  .role { color: var(--hud-hi); font-size: 9px; letter-spacing: 0.1em; }
  .meta { display: flex; gap: 7px; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; }
  .sys { display: inline-flex; align-items: baseline; color: var(--telemetry); overflow: hidden; min-width: 0; }
  .start { display: flex; gap: 6px; align-items: stretch; }
  .start > :global(:first-child) { flex: 1; min-width: 0; }
  .fresh { color: var(--ok); }
  .ok { color: var(--ok); }
  .stale { color: var(--danger); }
  .state { color: var(--telemetry); font-weight: 700; }
  .live { color: var(--ok); font-weight: 700; }
  .sub { font-size: 10px; }
</style>
