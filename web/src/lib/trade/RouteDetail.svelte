<script lang="ts">
  import type { TradeEnd, TradeRoute } from '@et/shared';
  import Hologram from '../Hologram.svelte';
  import Name from '../Name.svelte';
  import LoadList from './LoadList.svelte';
  import StartDistance from './StartDistance.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected loop, cockpit style: buy at A, sell at B, buy the way-back load at B, sell it at A.
  let { route, jumpRange }: { route: TradeRoute | null; jumpRange: number } = $props();
</script>

{#snippet station(e: TradeEnd, step: string)}
  <div class="end">
    <div class="holo"><Hologram target={{ kind: 'station', stationType: e.type }} /></div>
    <div class="info">
      <div class="role">{step}</div>
      <div class="name"><Name value={e.station} stationType={e.type} icon /></div>
      <div class="sys"><Name value={e.system} system icon /></div>
      <div class="meta">
        <span>{cr(e.ls)}ls</span>
        <span>PAD {e.pad}</span>
        <span class={ageTone(e.ageH)}>{ageLabel(e.ageH)}</span>
        {#if e.state && e.state !== 'None'}<span class="state">{e.state.toUpperCase()}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

{#if route}
  {@const total = route.leg.total + (route.back?.total ?? 0)}
  <div class="detail">
    <StartDistance start={route.src} {jumpRange} />
    {@render station(route.src, 'A · BUY')}
    <LoadList leg={route.leg} title="OUT A→B" />
    <div class="hop dim">▼ {route.hopLy.toFixed(1)}ly · {route.jumps} {route.jumps === 1 ? 'jump' : 'jumps'} · ≈{duration(route.legSeconds)}</div>
    {@render station(route.dst, 'B · SELL ALL, BUY')}
    <LoadList leg={route.back} title="BACK B→A" />
    <div class="hop dim">▲ back to A, sell all</div>

    <dl class="facts">
      <dt>LOOP</dt><dd class="gain">+{short(total)}Cr per loop</dd>
      <dt>CR/H</dt><dd class="tele">{short(route.loopPerHour)}Cr</dd>
      <dt>OUT ONLY</dt><dd>+{short(route.leg.total)}Cr · {short(route.perHour)}Cr/h · {route.pct.toFixed(0)}%</dd>
    </dl>
  </div>
{:else}
  <p class="dim">Select a route in the table.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 5px; }
  .end { display: grid; grid-template-columns: 56px 1fr; gap: 8px; align-items: center; }
  .holo :global(.holo) { max-width: 56px; }
  .info { min-width: 0; }
  .role { color: var(--hud-hi); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; }
  .sys { color: var(--telemetry); font-size: 11px; white-space: nowrap; overflow: hidden; }
  .meta { display: flex; gap: 8px; font-size: 10px; color: var(--muted); }
  .fresh { color: var(--ok); }
  .ok { color: var(--hud-hi); }
  .stale { color: var(--danger); }
  .state { color: var(--telemetry); font-weight: 700; }
  .hop { font-size: 10px; text-align: center; letter-spacing: 0.05em; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 2px 0 0; font-size: 12px; }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gain { color: var(--ok); }
</style>
