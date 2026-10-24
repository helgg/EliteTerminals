<script lang="ts">
  import type { TradeEnd } from '@et/shared';
  import Name from '../Name.svelte';

  // First thing on a route: how far its start is from the player (routes may begin elsewhere).
  let { start, jumpRange }: { start: TradeEnd; jumpRange: number } = $props();
  const here = $derived(start.fromMe < 0.01);
  const jumps = $derived(here ? 0 : Math.max(1, Math.ceil(start.fromMe / Math.max(jumpRange, 1))));
</script>

<div class="start" class:here>
  <span class="k">⌖ TO A</span>
  {#if here}
    <b>IN SYSTEM</b>
  {:else}
    <b class="num">{start.fromMe.toFixed(1)}ly</b>
    <span class="dim">≈{jumps} {jumps === 1 ? 'jump' : 'jumps'}</span>
  {/if}
  <span class="sys"><Name value={start.system} system icon /></span>
</div>

<style>
  .start {
    display: flex; gap: 8px; align-items: baseline; padding: 5px 8px; white-space: nowrap; overflow: hidden;
    border: 1px solid var(--telemetry); background: rgb(55 198 212 / 0.08);
  }
  .k { color: var(--telemetry); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  b { color: var(--telemetry); font-size: 16px; }
  .here b { color: var(--ok); font-size: 13px; }
  .dim { font-size: 10px; }
  .sys { margin-left: auto; min-width: 0; overflow: hidden; color: var(--text); font-size: 11px; }
</style>
