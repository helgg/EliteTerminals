<script lang="ts" module>
  export type Pad = 'S' | 'M' | 'L';

  /** Largest landing pad from pad counts; '' when none is known. */
  export function largestPad(p: { s: number; m: number; l: number }): Pad | '' {
    return p.l ? 'L' : p.m ? 'M' : p.s ? 'S' : '';
  }
</script>

<script lang="ts">
  // Largest landing pad as a small chamfered tag: L solid, M outlined amber, S dim.
  let { pad, size = 13 }: { pad: Pad | string; size?: number } = $props();
  const p = $derived((['S', 'M', 'L'].includes(pad) ? pad : '') as Pad | '');
</script>

{#if p}
  <svg class="pad {p}" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="{p} landing pad">
    <title>{p === 'L' ? 'Large' : p === 'M' ? 'Medium' : 'Small'} landing pad</title>
    <path d="M3.5 1h11.5v11.5L12.5 15H1V3.5Z" class="box" />
    <text x="8" y="12" text-anchor="middle">{p}</text>
  </svg>
{/if}

<style>
  .pad { flex: none; vertical-align: -2px; font: 700 11px var(--mono); }
  .box { stroke-width: 1.2; }
  .L .box { fill: var(--hud); stroke: var(--hud); }
  .L text { fill: var(--void); }
  .M .box { fill: rgb(255 181 69 / 0.12); stroke: var(--hud-hi); }
  .M text { fill: var(--hud-hi); }
  .S .box { fill: none; stroke: var(--dim); }
  .S text { fill: var(--muted); }
</style>
