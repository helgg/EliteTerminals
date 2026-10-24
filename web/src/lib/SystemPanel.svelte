<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from './Panel.svelte';
  import ScoopIcon from './ScoopIcon.svelte';
  import Name from './Name.svelte';
  import { ALLEGIANCE, isScoopable, securityTone, starClass, starColor } from './astro.ts';

  // Current system at a glance: journal data first (fresh), Spansh to fill the gaps.
  let { s }: { s: EdState } = $props();

  const loc = $derived(s.location);
  const g = $derived(s.galaxy.current);
  const security = $derived(g?.security || loc.security);
  const power = $derived(loc.controllingPower || g?.controllingPower || '');
  const powerState = $derived(loc.powerState || g?.powerState || '');
  const powers = $derived(loc.powers.length ? loc.powers : (g?.powers ?? []));
  const factionState = $derived(loc.factionState || g?.factionState || '');
  const cls = $derived(starClass(g?.primaryStar ?? ''));
  const stations = $derived(g ? g.stations.filter((x) => !/carrier/i.test(x.type)).length : null);
  const carriers = $derived(g ? g.stations.length - (stations ?? 0) : null);
  const pop = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);
</script>

<Panel class="system" scroll={false} title="System" aside={g?.updatedAt ? `spansh ${g.updatedAt.slice(0, 10)}` : ''}>
  <div class="sys">
    <div class="name">
      {#if cls}<span class="cls" style:color={starColor(cls)}>{cls}</span>{/if}
      {#if isScoopable(cls)}<ScoopIcon size={11} />{/if}
      <Name value={loc.system} system />
    </div>
    <dl>
      <dt>SEC</dt><dd style:color={securityTone(security)}>{security || '—'}</dd>
      <dt>ALLEG</dt><dd>{ALLEGIANCE[loc.allegiance] ?? (loc.allegiance || '—')} <span class="dim">{loc.government}</span></dd>
      <dt>ECON</dt><dd>{loc.economy || '—'}{loc.secondEconomy ? ` / ${loc.secondEconomy}` : ''}</dd>
      <dt>POP</dt><dd class="num">{loc.population ? pop(loc.population) : 'unpopulated'}</dd>
      <dt>POWER</dt>
      <dd class="pw" title={powers.join(', ')}>
        {#if power}{power} <span class="state">{powerState}</span>{:else if powers.length}<span class="dim">contested: {powers.length} powers</span>{:else}—{/if}
      </dd>
      <dt>FACTION</dt><dd title={loc.faction}>{loc.faction || '—'}</dd>
      {#if factionState && factionState !== 'None'}<dt>STATE</dt><dd class="tele">{factionState}</dd>{/if}
      {#if stations !== null}<dt>PORTS</dt><dd class="num">{stations} <span class="dim">· {carriers} carriers · {g?.bodies.length} bodies</span></dd>{/if}
    </dl>
    {#if loc.station}
      <div class="docked"><span class="dim">DOCKED</span> <Name value={loc.station} stationType={loc.stationType} icon /> <span class="dim">{loc.stationType}</span></div>
    {/if}
  </div>
</Panel>

<style>
  .sys { display: flex; flex-direction: column; gap: 6px; }
  .name { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; }
  .cls { font-size: 12px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; font-size: 12px; }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { color: var(--telemetry); font-size: 11px; }
  .docked { font-size: 11px; padding-top: 4px; border-top: 1px solid var(--rule); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
