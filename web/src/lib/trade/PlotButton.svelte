<script lang="ts">
  // PLOT on a stop of a route: plots the route to its system through the galaxy map (the favourites' macro).
  // Off while the game is off, when the player is already there, while another plot runs or keys are missing.
  import { link } from '../link.svelte.ts';
  import { busy, plotMissing, plotTo, routeEndsAt } from '../macros.svelte.ts';

  let { system }: { system: string } = $props();

  const s = $derived(link.state);
  const same = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
  const plotting = $derived(busy('Plot') ? s.macros.plot.system : '');
  const mine = $derived(!!plotting && same(plotting, system));
  const routed = $derived(routeEndsAt(system));
  const here = $derived(same(s.location.system, system));
  const state = $derived(
    mine ? 'busy' : here ? 'here' : routed ? 'routed' : !s.meta.online || plotMissing().length || plotting ? 'off' : 'ready',
  );
  const title = $derived(
    mine ? 'tap to stop' : here ? 'you are in this system' : !s.meta.online ? 'start the game to plot routes'
      : plotMissing().length ? 'bind the galaxy map keys to plot routes (FLIGHT ★ FAV says which)' : `plot a route to ${system}`,
  );
</script>

<button class="plot {state}" disabled={state === 'off' || state === 'routed' || state === 'here'}
  onclick={(e) => { e.stopPropagation(); void plotTo(system); }} {title}>
  <span aria-hidden="true">{mine ? '■' : routed ? '✓' : here ? '⌖' : '›'}</span>{mine ? 'STOP' : routed ? 'ROUTED' : here ? 'HERE' : 'PLOT'}
</button>

<style>
  /* the favourites' PLOT, smaller: it sits at the end of a stop's line */
  .plot {
    --tone: var(--telemetry);
    flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 58px;
    padding: 5px 7px 4px; font: inherit; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; border: 0;
    color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, var(--steel)); box-shadow: inset 0 2px var(--tone);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
    white-space: nowrap;
  }
  .plot:hover:not(:disabled) { background: color-mix(in srgb, var(--tone) 24%, var(--steel)); }
  .plot.busy { color: var(--void); background: var(--tone); box-shadow: none; animation: pulse 1s ease-in-out infinite; }
  .plot.routed, .plot.here { --tone: var(--ok); cursor: default; }
  .plot.off { --tone: var(--faint); color: var(--dim); background: var(--steel); cursor: default; }
  @keyframes pulse { 50% { opacity: 0.6; } }
</style>
