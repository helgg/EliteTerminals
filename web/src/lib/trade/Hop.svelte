<script lang="ts">
  import { duration } from '../format.ts';

  // The jump between two stops: a lane of chevrons, like the galaxy map's plotted route, with the
  // distance, jumps and time on a plate in the middle. With no distance it is just the way back.
  // `vertical` stands the lane up between two columns: out points right (A→B), the way back left.
  let { ly, jumps, seconds, up = false, label = '', vertical = false }: {
    ly?: number;
    jumps?: number;
    seconds?: number;
    up?: boolean;
    label?: string;
    vertical?: boolean;
  } = $props();

  const arrow = $derived(vertical ? (up ? '◀' : '▶') : up ? '▲' : '▼');
</script>

<div class="hop" class:up class:vertical>
  <span class="plate">
    <span class="arrow">{arrow}</span>
    {#if ly !== undefined}
      <b class="num">{ly.toFixed(1)}ly</b>
      {#if jumps !== undefined}<span class="sep">·</span>
      <span class="num">{jumps} {jumps === 1 ? 'JUMP' : 'JUMPS'}</span>{/if}
      {#if seconds}<span class="sep">·</span><span class="num">≈{duration(seconds)}</span>{/if}
    {/if}
    {#each label ? label.split(' · ') : [] as part, i (i)}
      {#if i > 0}<span class="sep">·</span>{/if}<span>{part}</span>
    {/each}
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

  /* standing up: the lane runs top to bottom, the plate stacks its figures one per line */
  .hop.vertical {
    height: 100%;
    margin: 0;
    border: 0;
    border-left: 1px dashed var(--rule);
    border-right: 1px dashed var(--rule);
    background:
      linear-gradient(to bottom, var(--panel), transparent 12%, transparent 88%, var(--panel)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='14'%3E%3Cpath d='M2 1l5 6-5 6' fill='none' stroke='%23ff7a18' stroke-opacity='.3' stroke-width='1.5'/%3E%3C/svg%3E")
        center / 9px 14px;
  }
  .hop.vertical.up {
    background:
      linear-gradient(to bottom, var(--panel), transparent 12%, transparent 88%, var(--panel)),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='14'%3E%3Cpath d='M7 1l-5 6 5 6' fill='none' stroke='%2337c6d4' stroke-opacity='.3' stroke-width='1.5'/%3E%3C/svg%3E")
        center / 9px 14px;
  }
  .vertical .plate {
    flex-direction: column;
    align-items: center;
    gap: 2px;
    max-width: calc(100% - 6px);
    padding: 8px 4px;
    letter-spacing: 0.02em;
    text-align: center;
    white-space: normal;
    clip-path: polygon(50% 0, 100% 6px, 100% calc(100% - 6px), 50% 100%, 0 calc(100% - 6px), 0 6px);
  }
  .vertical .sep { display: none; }
  .vertical .arrow { font-size: 12px; }
</style>
