<script lang="ts">
  import { openInExplore } from './nav.svelte.ts';

  // EXP: opens EXPLORE on this system (its map, and what to scan there). Same look as PLOT and PLAN.
  let { system, id64 = 0 }: { system: string; id64?: number } = $props();
</script>

<button class="exp" disabled={!system} title="Open {system} in EXPLORE" onclick={(e) => { e.stopPropagation(); openInExplore(system, id64); }}>
  <span aria-hidden="true">›</span>EXP
</button>

<style>
  .exp {
    --tone: var(--hud-hi);
    flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 58px;
    padding: 5px 7px 4px; font: inherit; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; border: 0;
    color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, var(--steel)); box-shadow: inset 0 2px var(--tone);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
    white-space: nowrap;
  }
  .exp:hover:not(:disabled) { background: color-mix(in srgb, var(--tone) 24%, var(--steel)); }
  .exp:disabled { --tone: var(--faint); color: var(--dim); background: var(--steel); cursor: default; }
</style>
