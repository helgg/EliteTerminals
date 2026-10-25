<script lang="ts">
  import { duration } from '../format.ts';

  // The jump between two stops: a lane of chevrons, like the galaxy map's plotted route, with the
  // distance, jumps and time on a plate in the middle. With no distance it is just the way back.
  let { ly, jumps, seconds, up = false, label = '' }: {
    ly?: number;
    jumps?: number;
    seconds?: number;
    up?: boolean;
    label?: string;
  } = $props();
</script>

<div class="hop" class:up>
  <span class="plate">
    <span class="arrow">{up ? '▲' : '▼'}</span>
    {#if ly !== undefined}
      <b class="num">{ly.toFixed(1)}ly</b>
      <span class="sep">·</span>
      <span class="num">{jumps} {jumps === 1 ? 'JUMP' : 'JUMPS'}</span>
      {#if seconds}<span class="sep">·</span><span class="num">≈{duration(seconds)}</span>{/if}
    {/if}
    {#if label}<span>{label}</span>{/if}
  </span>
</div>

<style>
  .hop {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 26px;
    margin: 2px 0;
    /* chevron lane pointing the way of travel */
    background:
      linear-gradient(to right, var(--panel), transparent 15%, transparent 85%, var(--panel)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9'%3E%3Cpath d='M1 2l6 5 6-5' fill='none' stroke='%23ff7a18' stroke-opacity='.3' stroke-width='1.5'/%3E%3C/svg%3E")
        center / 14px 9px;
    border-top: 1px dashed var(--rule);
    border-bottom: 1px dashed var(--rule);
  }
  .plate {
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
    padding: 3px 10px;
    background: var(--panel);
    border: 1px solid var(--faint);
    color: var(--muted);
    font-size: 10px;
    letter-spacing: 0.06em;
    white-space: nowrap;
    clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%);
  }
  .arrow { color: var(--hud); text-shadow: var(--glow); }
  b { color: var(--hud-hi); font-size: 11px; }
  .sep { color: var(--faint); }
  .up .arrow { color: var(--telemetry); text-shadow: none; }
  .up {
    background:
      linear-gradient(to right, var(--panel), transparent 15%, transparent 85%, var(--panel)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9'%3E%3Cpath d='M1 7l6-5 6 5' fill='none' stroke='%2337c6d4' stroke-opacity='.3' stroke-width='1.5'/%3E%3C/svg%3E")
        center / 14px 9px;
  }
</style>
