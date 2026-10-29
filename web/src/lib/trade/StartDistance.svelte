<script lang="ts">
  import type { TradeEnd } from '@et/shared';

  // First thing on a route: how far its start is from the player (routes may begin elsewhere).
  // The system is A's, named right below. Drawn as a jump lane like the ones between stops, in amber, to read as the trip before the route starts.
  let { start, jumpRange }: { start: TradeEnd; jumpRange: number } = $props();
  const here = $derived(start.fromMe < 0.01);
  const jumps = $derived(here ? 0 : Math.max(1, Math.ceil(start.fromMe / Math.max(jumpRange, 1))));
</script>

<div class="start" class:here>
  <span class="plate">
    <span class="arrow">{here ? '⌖' : '▼'}</span>
    {#if here}
      <b>IN SYSTEM A</b>
    {:else}
      <span class="k">INITIAL TRIP</span>
      <span class="sep">·</span>
      <b class="num">{start.fromMe.toFixed(1)}ly</b>
      <span class="sep">·</span>
      <span class="num">≈{jumps} {jumps === 1 ? 'JUMP' : 'JUMPS'}</span>
      <span class="sep">·</span>
      <span class="k">TO A</span>
    {/if}
  </span>
</div>

<style>
  .start {
    display: flex; justify-content: center; align-items: center; min-height: 26px; min-width: 0;
    /* amber chevron lane pointing down to A */
    background:
      linear-gradient(to right, var(--panel), transparent 15%, transparent 85%, var(--panel)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9'%3E%3Cpath d='M1 2l6 5 6-5' fill='none' stroke='%23ffb545' stroke-opacity='.4' stroke-width='1.5'/%3E%3C/svg%3E")
        center / 14px 9px;
    border-top: 1px dashed var(--rule);
    border-bottom: 1px dashed var(--rule);
  }
  /* already there: the same lane in green, the chevrons resting on A */
  .here {
    background:
      linear-gradient(to right, var(--panel), transparent 15%, transparent 85%, var(--panel)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9'%3E%3Cpath d='M1 2l6 5 6-5' fill='none' stroke='%2335d07f' stroke-opacity='.3' stroke-width='1.5'/%3E%3C/svg%3E")
        center / 14px 9px;
  }
  .plate {
    display: inline-flex; gap: 6px; align-items: baseline; min-width: 0; max-width: calc(100% - 8px);
    padding: 3px 12px; flex-wrap: wrap; justify-content: center; row-gap: 0; white-space: nowrap;
    background: var(--panel); border: 1px solid var(--faint);
    color: var(--muted); font-size: 10px; letter-spacing: 0.06em;
    clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%);
  }
  .arrow { color: var(--hud-hi); }
  .k { color: var(--hud-hi); font-weight: 700; letter-spacing: 0.12em; }
  b { color: var(--hud-hi); font-size: 11px; }
  .here .arrow, .here b { color: var(--ok); }
  .sep { color: var(--faint); }
</style>
