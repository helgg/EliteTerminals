<script lang="ts">
  import type { TradeChain, TradeEnd } from '@et/shared';
  import LoadList from './LoadList.svelte';
  import StartDistance from './StartDistance.svelte';
  import Name from '../Name.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected linear route as a checklist: at each stop sell everything, then buy the listed load.
  let { chain, jumpRange }: { chain: TradeChain | null; jumpRange: number } = $props();
  const letter = (k: number) => String.fromCharCode(65 + k);
</script>

{#snippet stop(e: TradeEnd, k: number, what: string)}
  <div class="stop">
    <span class="badge">{letter(k)}</span>
    <div class="info">
      <div class="name"><Name value={e.station} stationType={e.type} icon /> <span class="role">{what}</span></div>
      <div class="meta">
        <span class="sys"><Name value={e.system} system icon /></span>
        <span>{cr(e.ls)}ls</span>
        <span>PAD {e.pad}</span>
        <span class={ageTone(e.ageH)}>{ageLabel(e.ageH)}</span>
        {#if e.state && e.state !== 'None'}<span class="state">{e.state.toUpperCase()}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

{#if chain}
  <div class="detail">
    <StartDistance start={chain.legs[0].src} {jumpRange} />
    <div class="totals">
      <span class="ok">+{short(chain.total)}Cr</span>
      <span class="tele">{short(chain.perHour)}Cr/h</span>
      <span class="dim">≈{duration(chain.seconds)} · {chain.legs.length + 1} stops</span>
    </div>
    {#each chain.legs as l, k (k)}
      {@render stop(l.src, k, k ? 'SELL ALL · BUY' : 'BUY')}
      <LoadList leg={l.leg} title="{letter(k)}→{letter(k + 1)}" />
      <div class="hop dim">▼ {l.hopLy.toFixed(1)}ly · {l.jumps} {l.jumps === 1 ? 'jump' : 'jumps'} · ≈{duration(l.legSeconds)}</div>
    {/each}
    {@render stop(chain.legs[chain.legs.length - 1].dst, chain.legs.length, 'SELL ALL · END')}
  </div>
{:else}
  <p class="dim">Select a route in the table.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 5px; }
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
  .sys { color: var(--telemetry); overflow: hidden; min-width: 0; }
  .fresh { color: var(--ok); }
  .ok { color: var(--ok); }
  .stale { color: var(--danger); }
  .state { color: var(--telemetry); font-weight: 700; }
  .hop { font-size: 10px; text-align: center; }
  .sub { font-size: 10px; }
</style>
