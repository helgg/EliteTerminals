<script lang="ts">
  // Stars and planets as small filled discs (our own drawings). A star takes its class code
  // ("K", "DA", "N", "H"…), a planet its subtype text ("Gas giant with…", "Icy body"…).
  // Scoopable stars get a corona and an amber fuel notch.
  import { isScoopable, PLANET_COLOR, planetKind, starColor, starKind } from './astro.ts';

  let { cls = '', planet = '', ringed = false, size = 13 }:
    { cls?: string; planet?: string; ringed?: boolean; size?: number } = $props();

  const kind = $derived(planet ? null : starKind(cls));
  const pk = $derived(planet ? planetKind(planet) : null);
  const color = $derived(planet ? PLANET_COLOR[pk!] : starColor(cls));
  const scoop = $derived(!planet && isScoopable(cls));
  const brown = $derived(!planet && /^[LTY]$/.test(cls));
  const label = $derived(planet ? planet : `Class ${cls || '?'} star${scoop ? ' (scoopable)' : ''}`);
</script>

<svg class="body" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={label} style:--c={color}>
  <title>{label}</title>
  {#if pk}
    {#if ringed}<ellipse cx="8" cy="8.6" rx="7.4" ry="2.2" class="ring back" />{/if}
    <circle cx="8" cy="8" r={pk === 'gas' ? 5.6 : 4.8} class="disc" />
    {#if pk === 'gas'}
      <path d="M2.8 6.2h10.4M2.5 8.4h11M3 10.6h10" class="band" />
    {:else if pk === 'water'}
      <path d="M5.2 5.6c1.2-.8 2.4 0 2 1s-1.8 1-1.4 2.2M9.6 9.2c.8-.2 1.6.6 1.2 1.4" class="land" />
    {:else if pk === 'earth'}
      <path d="M4.4 6.6c1.2-1.8 3-1.6 3.4-.4.3 1-1.2 1.4-.8 2.6.3.9 1.4.6 1.6 1.8M9.4 5.2c1 .2 2 .8 2.2 1.8" class="land green" />
    {:else if pk === 'icy'}
      <path d="M5.4 5.4l2 2.4-1 2.4M9 4.4l.2 2.6 2.2 1.4" class="crack" />
    {:else if pk === 'rocky' || pk === 'metal'}
      <circle cx="6.4" cy="6.6" r="1" class="crater" />
      <circle cx="9.6" cy="9.8" r=".8" class="crater" />
    {:else if pk === 'ammonia'}
      <path d="M4.6 7.4c1.6-1.4 4.8-1.4 6.8.4M4.4 9.4c2 1 4.6 1 7-.6" class="band" />
    {/if}
    <path d="M8 3.2a4.8 4.8 0 0 1 0 9.6" class="shade" transform={pk === 'gas' ? 'scale(1.17) translate(-1.15 -1.15)' : ''} />
    {#if ringed}<path d="M.6 8.6a7.4 2.2 0 0 0 14.8 0" class="ring" />{/if}
  {:else if kind === 'blackHole'}
    <ellipse cx="8" cy="8" rx="7.2" ry="2.6" class="ring hot" />
    <circle cx="8" cy="8" r="3.6" class="void" />
    <path d="M.8 8a7.2 2.6 0 0 0 14.4 0" class="ring hot" />
  {:else if kind === 'neutron'}
    <path d="M8 8 5.6.6h4.8ZM8 8l2.4 7.4H5.6Z" class="jet" />
    <circle cx="8" cy="8" r="2.6" class="disc" />
  {:else if kind === 'whiteDwarf'}
    <circle cx="8" cy="8" r="6" class="halo" />
    <circle cx="8" cy="8" r="2.8" class="disc" />
  {:else}
    {#if scoop}
      <path d="M8 .4v2.4M8 13.2v2.4M.4 8h2.4M13.2 8h2.4M2.6 2.6l1.7 1.7M11.7 11.7l1.7 1.7M2.6 13.4l1.7-1.7M11.7 4.3l1.7-1.7" class="ray" />
    {/if}
    <circle cx="8" cy="8" r={brown ? 4.4 : 5} class="disc" class:dim={brown} />
    {#if scoop}<path d="M10.4 11.2h5l-2.5 4.4Z" class="fuel" />{/if}
  {/if}
</svg>

<style>
  .body { flex: none; vertical-align: -2px; overflow: visible; }
  .disc { fill: var(--c); }
  .disc.dim { opacity: .75; }
  .halo { fill: var(--c); opacity: .22; }
  .ray { stroke: var(--c); stroke-width: 1.2; stroke-linecap: round; opacity: .8; }
  .jet { fill: var(--c); opacity: .45; }
  .fuel { fill: var(--hud-hi); stroke: var(--icon-cut, var(--panel)); stroke-width: .8; }
  .void { fill: #000; stroke: var(--c); stroke-width: .8; }
  .ring { fill: none; stroke: var(--muted); stroke-width: 1.1; }
  .ring.back { opacity: .55; }
  .ring.hot { stroke: #ffb545; }
  .band { fill: none; stroke: rgb(0 0 0 / .28); stroke-width: .9; stroke-linecap: round; }
  .land { fill: none; stroke: #e0d3a8; stroke-width: 1.2; stroke-linecap: round; }
  .land.green { stroke: #2f7a4c; }
  .crack { fill: none; stroke: #6e9cb6; stroke-width: .8; stroke-linecap: round; }
  .crater { fill: rgb(0 0 0 / .3); }
  .shade { fill: rgb(0 0 0 / .25); }
</style>
