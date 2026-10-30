<script lang="ts">
  import type { EdState, StationInfo } from '@et/shared';
  import Panel from './Panel.svelte';
  import StarIcon from './StarIcon.svelte';
  import PadBadge, { largestPad } from './PadBadge.svelte';
  import ServiceIcon, { serviceKinds } from './ServiceIcon.svelte';
  import PlaceIcon, { placeKind } from './PlaceIcon.svelte';
  import Name from './Name.svelte';
  import ExpButton from './explore/ExpButton.svelte';
  import { addFavorite, removeFavorite } from './favorites.ts';
  import { ALLEGIANCE, norm, securityTone, starClass, starColor } from './astro.ts';

  // Current system at a glance: journal data first (fresh), Spansh to fill the gaps; then every station
  // Spansh knows here, with its pad and services, filtered by kind. ★ saves a station (or the system) as a favourite.
  let { s }: { s: EdState } = $props();

  const loc = $derived(s.location);
  const g = $derived(s.galaxy.current);
  const security = $derived(g?.security || loc.security);
  const power = $derived(loc.controllingPower || g?.controllingPower || '');
  const powerState = $derived(loc.powerState || g?.powerState || '');
  const powers = $derived(loc.powers.length ? loc.powers : (g?.powers ?? []));
  const factionState = $derived(loc.factionState || g?.factionState || '');
  const cls = $derived(starClass(g?.primaryStar ?? ''));
  const pop = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);

  type Group = 'orbital' | 'surface' | 'carrier';
  const group = (x: StationInfo): Group => {
    const k = placeKind(x.type);
    return k === 'carrier' ? 'carrier' : k === 'planetary' || k === 'settlement' || /planetary/i.test(x.type) ? 'surface' : 'orbital';
  };
  const FILTERS = [
    { id: 'all', label: 'ALL' },
    { id: 'orbital', label: 'ORBITAL' },
    { id: 'surface', label: 'SURFACE' },
    { id: 'carrier', label: 'CARRIER' },
  ] as const;
  type Filter = (typeof FILTERS)[number]['id'];
  let filter = $state<Filter>(readFilter());
  function readFilter(): Filter {
    try {
      const v = localStorage.getItem('et.system.filter');
      if (FILTERS.some((f) => f.id === v)) return v as Filter;
    } catch {}
    return 'all';
  }
  function setFilter(f: Filter) {
    filter = f;
    try { localStorage.setItem('et.system.filter', f); } catch {}
  }

  const all = $derived(g?.stations ?? []);
  const counts = $derived({
    all: all.length,
    orbital: all.filter((x) => group(x) === 'orbital').length,
    surface: all.filter((x) => group(x) === 'surface').length,
    carrier: all.filter((x) => group(x) === 'carrier').length,
  });
  const isDocked = (x: StationInfo) => !!loc.station && norm(x.name) === norm(loc.station);
  // where we're docked first, then by distance from the star; carriers last in ALL (they come and go)
  const stations = $derived(
    all
      .filter((x) => filter === 'all' || group(x) === filter)
      .toSorted((a, b) =>
        Number(isDocked(b)) - Number(isDocked(a))
        || Number(group(a) === 'carrier') - Number(group(b) === 'carrier')
        || a.distance - b.distance),
  );
  // the station we're docked at, even when Spansh does not list it (yet)
  const dockedUnlisted = $derived(loc.station && !all.some(isDocked) ? loc.station : '');

  const favOf = (station: string) =>
    s.favorites.find((f) => norm(f.system) === norm(loc.system) && norm(f.station) === norm(station));
  function toggleFav(station: string, stationType: string) {
    const f = favOf(station);
    if (f) void removeFavorite(f.id);
    else void addFavorite({ system: loc.system, station, stationType, pos: loc.pos });
  }
  const ls = (d: number) => (d >= 1e5 ? `${(d / 1000).toFixed(0)}k` : d >= 1000 ? `${(d / 1000).toFixed(1)}k` : d.toFixed(0));
</script>

<Panel class="system" scroll={false} title="System" aside={g?.updatedAt ? `spansh ${g.updatedAt.slice(0, 10)}` : ''}>
  <div class="sys">
    <div class="name">
      {#if cls}<StarIcon {cls} size={12} /><span class="cls" style:color={starColor(cls)}>{cls}</span>{/if}
      <Name value={loc.system} system />
      {#if loc.system}
        <button class="fav" class:on={!!favOf('')} onclick={() => toggleFav('', '')}
          title={favOf('') ? 'remove from favourites' : 'save the system as a favourite'}>{favOf('') ? '★' : '☆'}</button>
      {/if}
    </div>
    <dl>
      <dt>SEC</dt><dd class="secrow"><span><span style:color={securityTone(security)}>{security || '—'}</span>
        <span class="dim">· POP</span> <span class="num">{loc.population ? pop(loc.population) : 'none'}</span></span>
        {#if loc.system}<ExpButton system={loc.system} id64={loc.address} />{/if}</dd>
      <dt>ALLEG</dt><dd>{ALLEGIANCE[loc.allegiance] ?? (loc.allegiance || '—')} <span class="dim">{loc.government}</span></dd>
      <dt>ECON</dt><dd>{loc.economy || '—'}{loc.secondEconomy ? ` / ${loc.secondEconomy}` : ''}</dd>
      <dt>POWER</dt>
      <dd class="pw" title={powers.join(', ')}>
        {#if power}{power} <span class="state">{powerState}</span>{:else if powers.length}<span class="dim">contested: {powers.length} powers</span>{:else}—{/if}
      </dd>
      <dt>FACTION</dt><dd title={loc.faction}>{loc.faction || '—'}{#if factionState && factionState !== 'None'}<span class="state fs">{factionState}</span>{/if}</dd>
    </dl>

    <div class="filters" role="group" aria-label="station filter">
      {#each FILTERS as f (f.id)}
        <button class="chip" class:on={filter === f.id} disabled={!counts[f.id]} onclick={() => setFilter(f.id)}>
          {f.label} <span class="num">{counts[f.id]}</span>
        </button>
      {/each}
    </div>

    <ul class="stations">
      {#if dockedUnlisted}
        <li class="docked">
          <span class="row1"><PlaceIcon kind={placeKind(loc.stationType)} /><span class="nm"><Name value={loc.station} /></span>
            <span class="tag">DOCKED</span></span>
        </li>
      {/if}
      {#each stations as x (x.name)}
        {@const fav = !!favOf(x.name)}
        {@const pad = largestPad(x.pads)}
        <li class:docked={isDocked(x)}>
          <span class="row1">
            <PlaceIcon kind={placeKind(x.type)} />
            <span class="nm"><Name value={x.name} /></span>
            {#if isDocked(x)}<span class="tag">DOCKED</span>{/if}
            {#if pad}<PadBadge {pad} size={12} />{/if}
            <span class="ls num">{ls(x.distance)}<small>ls</small></span>
            <button class="fav" class:on={fav} onclick={() => toggleFav(x.name, x.type)}
              title={fav ? 'remove from favourites' : 'save as a favourite'}>{fav ? '★' : '☆'}</button>
          </span>
          {#if x.services.length}
            <span class="svcs">{#each serviceKinds(x.services) as k (k)}<ServiceIcon kind={k} size={11} />{/each}</span>
          {/if}
        </li>
      {:else}
        {#if !dockedUnlisted}<li class="none dim">{g ? 'No stations here.' : 'Waiting for Spansh…'}</li>{/if}
      {/each}
    </ul>
  </div>
</Panel>

<style>
  /* the station list takes whatever height the panel is given, and scrolls inside it */
  :global(.panel.system > .body) { flex: 1; display: flex; flex-direction: column; }
  .sys { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
  .name { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; }
  .cls { font-size: 12px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; margin: 0; font-size: 12px; }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .state { color: var(--telemetry); font-size: 11px; }
  .fs { margin-left: 6px; }

  .fav {
    margin-left: auto; flex: none; font: inherit; font-size: 14px; line-height: 1; padding: 2px 4px; cursor: pointer;
    background: transparent; border: 0; color: var(--faint);
  }
  .fav.on { color: var(--hud-hi); text-shadow: 0 0 6px rgb(255 181 69 / 0.6); }

  .filters { display: flex; gap: 3px; padding-top: 5px; border-top: 1px solid var(--rule); }
  .chip {
    flex: 1; font: inherit; font-size: 9px; letter-spacing: 0.06em; padding: 4px 2px; cursor: pointer; white-space: nowrap;
    background: transparent; color: var(--hud); border: 1px solid var(--rule);
  }
  .chip .num { color: var(--dim); }
  .chip.on { background: var(--hud); color: var(--void); border-color: var(--hud); }
  .chip.on .num { color: rgb(11 7 5 / 0.65); }
  .chip:disabled { opacity: 0.35; cursor: default; }

  .stations { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow: auto; font-size: 11px; }
  .stations li { display: flex; flex-direction: column; gap: 2px; padding: 4px 0 4px; border-bottom: 1px solid var(--rule); }
  .stations li.docked { background: linear-gradient(to right, rgb(55 198 212 / 0.12), transparent); box-shadow: inset 2px 0 var(--telemetry); padding-left: 4px; }
  .row1 { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .row1 .fav { margin-left: 0; font-size: 13px; }
  .nm { flex: 1; min-width: 0; display: flex; }
  /* long station names wrap instead of "…" */
  .nm :global(.text) { white-space: normal; overflow-wrap: anywhere; line-height: 1.25; }
  .tag { color: var(--telemetry); font-size: 9px; letter-spacing: 0.1em; }
  .ls { color: var(--muted); white-space: nowrap; }
  .ls small { color: var(--dim); }
  .svcs { display: flex; flex-wrap: wrap; gap: 2px; padding-left: 18px; }
  .none { border: 0 !important; }
  .secrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
</style>
