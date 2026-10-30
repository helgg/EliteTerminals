<script lang="ts">
  import type { ColonyProfile, ColonyQuery, ColonyResult, ColonySystem, EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import ReferencePicker from '../lib/trade/ReferencePicker.svelte';
  import ColonyDetail from '../lib/colony/ColonyDetail.svelte';
  import ColonyBuild from '../lib/colony/ColonyBuild.svelte';
  import Name from '../lib/Name.svelte';
  import ScoopIcon from '../lib/ScoopIcon.svelte';
  import { link } from '../lib/link.svelte.ts';
  import { viewport } from '../lib/viewport.svelte.ts';
  import { colonyStore as cs, restoreLastColony } from '../lib/colony/store.svelte.ts';
  import { ageLabel } from '../lib/format.ts';

  // COLONY v1: find the best system to colonise (docs/design/COLONY.md). Candidates are uncolonised systems within
  // reach of populated space; each is scored by what its bodies hold, weighted by the profile picked.
  let { s, now }: { s: EdState; now: number } = $props();

  // FINDER: the system to colonise · BUILD: the construction site being supplied (opens on BUILD while one is open)
  // svelte-ignore state_referenced_locally
  let mode = $state<'find' | 'build'>(
    new URLSearchParams(location.search).get('view') === 'build' || s.colony.depots.some((d) => !d.complete && !d.failed) ? 'build' : 'find',
  );
  const openSites = $derived(s.colony.depots.filter((d) => !d.complete && !d.failed).length);

  type Filters = Omit<ColonyQuery, 'reference'> & { reference: string };
  const DEFAULTS: Filters = { reference: '', radius: 250, maxPopulatedLy: 15, minBodies: 5, profile: 'balanced' };
  let f = $state<Filters>(readFilters());
  $effect(() => {
    try { localStorage.setItem('et.colony.filters', JSON.stringify(f)); } catch {}
  });
  function readFilters(): Filters {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('et.colony.filters') ?? '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  const RADII: [number, string][] = [[100, '100'], [250, '250'], [500, '500'], [1000, '1000']];
  const REACH: [number, string][] = [[5, '5'], [10, '10'], [15, '15'], [16, '16']];
  const BODIES: [number, string][] = [[1, '1+'], [5, '5+'], [10, '10+'], [15, '15+'], [25, '25+']];
  const PROFILES: [ColonyProfile, string][] = [['balanced', 'BALANCED'], ['mining', 'MINING'], ['build', 'BUILD']];
  const PROFILE_HINT: Record<ColonyProfile, string> = {
    balanced: 'an even mix: landable bodies, rings, belts, life-bearing worlds',
    mining: 'rings first: pristine, metallic, hotspots, asteroid belts',
    build: 'room to build: many bodies, landable and with atmosphere, gas giants',
  };

  let busy = $state(false);
  let error = $state('');
  void restoreLastColony();
  const result = $derived(cs.result);
  const progress = $derived(link.colonyProgress);
  const picked = $derived(result?.systems.find((x) => x.id64 === cs.selected) ?? null);

  async function search() {
    drawer = false;
    if (phone) page = 'list';
    busy = true;
    error = '';
    link.colonyProgress = null;
    try {
      const res = await fetch('/api/colony/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      cs.result = body as ColonyResult;
      cs.selected = cs.result.systems[0]?.id64 ?? 0;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  /** Another profile re-scores the last search on the server: nothing is fetched again. */
  async function setProfile(p: ColonyProfile) {
    f.profile = p;
    if (!result || busy) return;
    const res = await fetch('/api/colony/rescore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    }).catch(() => null);
    if (res?.status === 200) cs.result = await res.json();
  }

  /** Marks a system refused or claimed in game (it leaves the list), or with `reason` null puts it back. */
  async function hide(id64: number, name: string, reason: 'not allowed' | 'claimed' | null) {
    const res = await fetch('/api/colony/hide', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id64, name, reason }),
    }).catch(() => null);
    if (!res?.ok) return;
    const next = (await res.json()) as ColonyResult;
    if (!next?.systems) return;
    if (reason && cs.selected === id64) {
      const at = sorted.findIndex((x) => x.id64 === id64);
      cs.selected = (sorted[at + 1] ?? sorted[at - 1])?.id64 ?? 0;
    }
    cs.result = next;
  }
  const seenH = (x: ColonySystem) => (x.seenAt ? (Date.now() - Date.parse(x.seenAt)) / 3.6e6 : 1e6);

  // --- list sorting ---
  type Key = 'score' | 'distance' | 'bodies' | 'landable' | 'rings' | 'hotspots' | 'belts' | 'life' | 'pop' | 'seen';
  const COLS: [Key, string, string][] = [
    ['score', 'SCORE', 'Score for the profile picked'], ['distance', 'LY', 'Distance from FROM'],
    ['bodies', 'BODIES', 'Bodies known / in the system'], ['landable', 'LAND', 'Landable bodies (with atmosphere)'],
    ['rings', 'RINGS', 'Rings (pristine)'], ['hotspots', 'HOT', 'Ring hotspots'], ['belts', 'BELTS', 'Asteroid belts'],
    ['life', 'ELW·WW·T', 'Earth-like, water and ammonia worlds · terraformable'], ['pop', 'REACH', 'ly to the nearest populated system (colonisation reach)'],
    ['seen', 'DATA', 'Age of Spansh\'s data: a claim made since is not in it'],
  ];
  let sortKey = $state<Key>('score');
  let sortDesc = $state(true);
  const value = (x: ColonySystem, k: Key) =>
    k === 'score' ? x.score : k === 'distance' ? x.distance : k === 'bodies' ? x.bodiesKnown : k === 'landable' ? x.counts.landable
    : k === 'rings' ? x.counts.rings : k === 'hotspots' ? x.counts.hotspots : k === 'belts' ? x.counts.belts
    : k === 'life' ? x.counts.elw * 3 + x.counts.ww * 2 + x.counts.aw + x.counts.terraformable / 10
    : k === 'seen' ? seenH(x) : x.nearestPopulated;
  const sorted = $derived([...(result?.systems ?? [])].sort((a, b) => (sortDesc ? -1 : 1) * (value(a, sortKey) - value(b, sortKey))));
  function sortBy(k: Key) {
    if (sortKey === k) sortDesc = !sortDesc;
    else {
      sortKey = k;
      sortDesc = k !== 'distance' && k !== 'pop' && k !== 'seen';
    }
  }
  function pick(id: number) {
    cs.selected = id;
    if (phone) page = 'system';
  }

  // --- layout ---
  const vp = $derived(viewport.vp);
  const phone = $derived(viewport.device === 'phone');
  let drawer = $state(new URLSearchParams(location.search).get('filters') === 'open');
  type Page = 'search' | 'list' | 'system';
  let page = $state<Page>('list');
  const PAGES: { id: Page; label: string; icon: string }[] = [
    { id: 'search', label: 'SEARCH', icon: '⚙' }, { id: 'list', label: 'SYSTEMS', icon: '≡' }, { id: 'system', label: 'SYSTEM', icon: '◎' },
  ];
  const compact = $derived(vp !== 'desktop-landscape');
</script>

{#snippet chips<T>(options: [T, string][], value: T, set: (v: T) => void)}
  <div class="chips">
    {#each options as [v, label] (label)}
      <button class:on={v === value} onclick={() => set(v)}>{label}</button>
    {/each}
  </div>
{/snippet}

{#snippet filters()}
  <div class="filters">
    <ReferencePicker bind:value={f.reference} current={s.location.system} stations={false} />
    <div class="group">
      <span class="k">RADIUS (ly from FROM)</span>
      {@render chips(RADII, f.radius, (v) => (f.radius = v))}
    </div>
    <div class="group">
      <span class="k" title="Colonisation reach: how far the system may be from populated space">MAX LY TO POPULATED</span>
      {@render chips(REACH, f.maxPopulatedLy, (v) => (f.maxPopulatedLy = v))}
    </div>
    <div class="group">
      <span class="k">MIN BODIES</span>
      {@render chips(BODIES, f.minBodies, (v) => (f.minBodies = v))}
    </div>
    <div class="group">
      <span class="k">PROFILE</span>
      {@render chips(PROFILES, f.profile, setProfile)}
      <span class="hint">{PROFILE_HINT[f.profile]}</span>
    </div>
    <div class="go">
      {@render searchButton()}
      {@render hints()}
    </div>
  </div>
{/snippet}

{#snippet searchButton()}
  <button class="search" disabled={busy || !(f.reference || s.location.system)} onclick={search}>
    {#if busy}
      SEARCHING {progress?.total ? `${progress.loaded}/${progress.total}` : '…'}
    {:else}
      SEARCH · {(f.reference || s.location.system || '?').toUpperCase()}
    {/if}
  </button>
  {#if busy && progress?.total}<div class="bar"><div style:width="{(progress.loaded / progress.total) * 100}%"></div></div>{/if}
{/snippet}

{#snippet hints()}
  {#if result}
    <div class="hint" title="Taken or off limits: a permit, a fixed station (megaship, prison ship, outpost, construction site), a controlling faction or allegiance, or a Thargoid / Guardian site">
      {result.candidates} unpopulated in reach · {result.checked} with the most bodies checked · {result.locked} taken or off limits ·
      {result.systems.length} listed</div>
    {#if result.hidden?.length}
      <div class="hidden">
        <span class="k">HIDDEN BY YOU · {result.hidden.length}</span>
        {#each result.hidden as h (h.id64)}
          <span class="hid">{h.name.toUpperCase()} <span class="dim">{h.reason}</span>
            <button onclick={() => hide(h.id64, h.name, null)} title="Put it back (shows on the next SEARCH)">↺</button></span>
        {/each}
      </div>
    {/if}
    {#if result.failed}<div class="bad">{result.failed} could not be loaded (Spansh busy): SEARCH again to fetch them</div>{/if}
  {/if}
  {#if error}<div class="bad">{error}</div>{/if}
{/snippet}

{#snippet list()}
  {#if !result}
    <p class="dim">Pick where to look (FROM and RADIUS) and tap SEARCH. Colonisation room is mostly at the edge of the
      bubble: try a system on its rim and 250–500ly. Systems are uncolonised, not being colonised, and within reach of
      populated space; each is scored by what its bodies hold.</p>
  {:else if !result.systems.length}
    <p class="dim">No scanned system matches. Widen the radius, lower MIN BODIES, or search from another rim system.</p>
  {:else if compact}
    <div class="sortbar">
      <span class="k">SORT</span>
      {#each COLS as [k, label, title] (k)}
        <button class:on={sortKey === k} {title} onclick={() => sortBy(k)}>{label}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}</button>
      {/each}
    </div>
    <div class="scroll cards">
      {#each sorted as x (x.id64)}
        <div class="card" class:sel={cs.selected === x.id64} role="button" tabindex="0" onclick={() => pick(x.id64)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(x.id64)}>
          <span class="cs num">{x.score}</span>
          <span class="cn"><b>{x.name.toUpperCase()}</b>
            <span class="dim">{x.distance.toFixed(0)}ly away · {x.bodiesKnown}/{x.bodyCount} bodies · {x.nearestPopulated.toFixed(1)}ly to populated ·
              <span class:warn={seenH(x) > 720}>data {ageLabel(seenH(x))}</span></span></span>
          <span class="cc">
            <span><b>{x.counts.landable}</b> LAND</span>
            <span><b>{x.counts.rings}</b> RINGS{#if x.counts.pristineRings}<i>&nbsp;· {x.counts.pristineRings} PRISTINE</i>{/if}</span>
            <span><b>{x.counts.hotspots}</b> HOT</span>
            <span><b>{x.counts.belts}</b> BELTS</span>
            <span><b>{x.counts.elw}·{x.counts.ww}·{x.counts.terraformable}</b> ELW·WW·T</span>
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>System</th>
            {#each COLS as [k, label, title] (k)}
              <th class="r"><button class="sort" class:on={sortKey === k} {title} onclick={() => sortBy(k)}>{label}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}</button></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sorted as x (x.id64)}
            <tr class:sel={cs.selected === x.id64} onclick={() => (cs.selected = x.id64)}>
              <td class="sysn"><Name value={x.name} system />{#if x.counts.human}<span class="hum" title="Human signal: could be someone's construction">HUMAN</span>{/if}<span class="dim star">{x.mainStar.replace(/ Star$/, '')}</span>{#if x.scoopable}<ScoopIcon size={11} />{/if}</td>
              <td class="r num score">{x.score}</td>
              <td class="r num">{x.distance.toFixed(0)}</td>
              <td class="r num" class:warn={x.bodiesKnown < x.bodyCount}>{x.bodiesKnown}/{x.bodyCount}</td>
              <td class="r num">{x.counts.landable}{#if x.counts.atmospheric}<i> ({x.counts.atmospheric})</i>{/if}</td>
              <td class="r num">{x.counts.rings}{#if x.counts.pristineRings}<i> ({x.counts.pristineRings})</i>{/if}</td>
              <td class="r num">{x.counts.hotspots || ''}</td>
              <td class="r num">{x.counts.belts || ''}</td>
              <td class="r num">{x.counts.elw}·{x.counts.ww + x.counts.aw}·{x.counts.terraformable}</td>
              <td class="r num">{x.nearestPopulated.toFixed(1)}</td>
              <td class="r num" class:warn={seenH(x) > 720}>{ageLabel(seenH(x))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#snippet listPanel()}
  <Panel class="center" title="Systems to colonise" aside={result ? `${result.systems.length} · ${result.query.profile.toUpperCase()}` : ''}>
    <div class="pane">{@render list()}</div>
  </Panel>
{/snippet}

{#snippet detailPanel()}
  <Panel class="right" title="System" aside={picked ? `${picked.bodiesKnown} bodies` : ''}>
    <div class="pane">
      <ColonyDetail sys={picked} reach={result?.query.maxPopulatedLy ?? f.maxPopulatedLy}
        onhide={(reason) => picked && hide(picked.id64, picked.name, reason)} />
    </div>
  </Panel>
{/snippet}

<div class="colwrap">
  <nav class="modes" aria-label="Colony">
    <button class:on={mode === 'find'} onclick={() => (mode = 'find')}>FIND A SYSTEM</button>
    <button class:on={mode === 'build'} onclick={() => (mode = 'build')}>BUILD{#if openSites}<b class="num"> · {openSites}</b>{/if}</button>
  </nav>
  <div class="modebody">
  {#if mode === 'build'}
    <ColonyBuild {s} {now} />
  {:else}
{#if vp === 'desktop-landscape'}
  <div class="colony wide">
    <Panel class="left" title="Search" scroll={false}>{@render filters()}</Panel>
    {@render listPanel()}
    {@render detailPanel()}
  </div>
{:else if phone}
  <div class="colony phone {viewport.orientation}">
    <nav class="pages" aria-label="Colony pages">
      {#each PAGES as p (p.id)}
        <button class:on={page === p.id} onclick={() => (page = p.id)}><span class="pi">{p.icon}</span>{p.label}</button>
      {/each}
    </nav>
    <div class="page">
      {#if page === 'search'}
        <Panel class="left" title="Search" scroll={false}>{@render filters()}</Panel>
      {:else if page === 'list'}
        {@render listPanel()}
      {:else}
        {@render detailPanel()}
      {/if}
    </div>
  </div>
{:else}
  <div class="colony mid {viewport.orientation}">
    <div class="topbar">
      <button class="filt" class:on={drawer} onclick={() => (drawer = !drawer)}>FILTERS {drawer ? '▴' : '▾'}</button>
      <div class="topsearch">{@render searchButton()}</div>
      <div class="tophint">{@render hints()}</div>
    </div>
    {@render listPanel()}
    {@render detailPanel()}
    {#if drawer}
      <button class="shade" aria-label="Close filters" onclick={() => (drawer = false)}></button>
      <div class="drawer"><Panel class="left" title="Filters" scroll={false}>{@render filters()}</Panel></div>
    {/if}
  </div>
{/if}
  {/if}
  </div>
</div>

<style>
  .colwrap { display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0; }
  .modebody { flex: 1; min-height: 0; }
  .modes { display: flex; gap: 4px; }
  .modes button {
    padding: 6px 16px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi);
    font-size: 11px; font-weight: 800; letter-spacing: 0.1em;
  }
  .modes button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .colony { display: grid; gap: 8px; height: 100%; min-height: 0; position: relative; }
  .colony.wide { grid-template-columns: 260px minmax(0, 1fr) minmax(360px, 30%); }
  .colony :global(.center .body), .colony :global(.right .body) { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  .filters { display: flex; flex-direction: column; gap: 10px; }
  .group { display: flex; flex-direction: column; gap: 3px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chips button {
    flex: 1; padding: 8px 4px; background: var(--steel); border: 1px solid var(--rule); color: var(--muted);
    font-size: 11px; font-weight: 700;
  }
  .chips button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .hint { font-size: 10px; color: var(--muted); line-height: 1.4; }
  .bad { font-size: 11px; color: var(--danger); }
  .hidden { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; font-size: 10px; }
  .hid { display: flex; gap: 6px; align-items: baseline; color: var(--muted); }
  .hid button { margin-left: auto; padding: 0 6px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi); cursor: pointer; }
  .go { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .search {
    padding: 12px; background: var(--hud); color: var(--void); border: 0; font-weight: 800; letter-spacing: 0.1em;
    box-shadow: var(--glow); overflow-wrap: anywhere;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }
  .search:disabled { opacity: 0.6; cursor: progress; }
  .bar { height: 4px; background: var(--steel); }
  .bar div { height: 100%; background: var(--telemetry); transition: width 0.3s; }

  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { position: sticky; top: 0; background: var(--panel); text-align: left; font-size: 10px; color: var(--dim); letter-spacing: 0.08em; padding: 3px 4px; }
  th.r, td.r { text-align: right; }
  .sort { background: none; border: 0; padding: 0; color: inherit; font: inherit; letter-spacing: inherit; cursor: pointer; }
  .sort.on { color: var(--hud-hi); }
  td { padding: 4px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
  td i { font-style: normal; color: var(--telemetry); font-size: 10px; }
  tr { cursor: pointer; }
  tr:hover td { background: rgb(255 122 24 / 0.06); }
  tr.sel td { background: rgb(255 122 24 / 0.14); }
  tr.sel td:first-child { box-shadow: inset 2px 0 var(--hud); }
  .sysn { color: var(--telemetry); font-weight: 700; display: flex; gap: 8px; align-items: baseline; }
  .sysn .star { font-size: 10px; font-weight: 400; }
  .hum { font-size: 9px; font-weight: 700; padding: 0 3px; color: var(--void); background: var(--danger); }
  .score { color: var(--hud); font-weight: 800; font-size: 13px; }
  .warn { color: var(--hud-hi); }

  .sortbar { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-bottom: 4px; }
  .sortbar .k { margin-right: 2px; }
  .sortbar button {
    padding: 6px 8px; background: var(--steel); border: 1px solid var(--rule); color: var(--muted);
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  }
  .sortbar button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .cards { display: flex; flex-direction: column; gap: 4px; }
  .card {
    display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 2px 10px; align-items: center; padding: 6px 8px; cursor: pointer;
    background: rgb(36 26 16 / 0.6); border: 1px solid var(--rule); font-size: 12px;
  }
  .card.sel { background: rgb(255 122 24 / 0.14); border-color: var(--hud); box-shadow: inset 2px 0 var(--hud); }
  .cs { grid-row: span 2; font-size: 20px; font-weight: 800; color: var(--hud); text-align: center; }
  .cn { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; min-width: 0; }
  .cn b { color: var(--telemetry); overflow-wrap: anywhere; }
  .cn .dim { font-size: 10px; }
  .cc { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 10px; color: var(--muted); letter-spacing: 0.06em; }
  .cc b { color: var(--text); font-size: 12px; }
  .cc i { font-style: normal; color: var(--telemetry); }

  /* tablets: a bar with FILTERS and SEARCH; list and system side by side (landscape) or one above the other */
  .colony.mid { grid-template-rows: auto minmax(0, 1fr); }
  .mid.landscape { grid-template-columns: minmax(0, 1fr) minmax(340px, 42%); }
  .mid.portrait { grid-template-rows: auto minmax(0, 45fr) minmax(0, 55fr); }
  .topbar { grid-column: 1 / -1; display: flex; gap: 8px; align-items: stretch; }
  .filt {
    flex: none; padding: 0 16px; background: var(--steel); border: 1px solid var(--hud); color: var(--hud-hi);
    font-size: 12px; font-weight: 800; letter-spacing: 0.1em;
  }
  .filt.on { background: var(--hud); color: var(--void); }
  .topsearch { flex: 0 1 360px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .topsearch .search { flex: 1; }
  .tophint { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .shade { position: absolute; inset: 0; z-index: 30; background: rgb(0 0 0 / 0.55); border: 0; }
  .drawer {
    position: absolute; z-index: 31; top: 0; left: 0; bottom: 0; width: min(360px, 92%); padding: 8px; overflow-y: auto;
    background: var(--void); border-right: 1px solid var(--hud); box-shadow: 8px 0 24px rgb(0 0 0 / 0.6);
  }

  /* phones: pages, tabs at the bottom standing up, down the left on its side */
  .colony.phone { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 6px; }
  .colony.phone.landscape { grid-template-columns: 74px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .phone.portrait .pages { grid-row: 2; }
  .phone.portrait .page { grid-row: 1; }
  .pages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .landscape .pages { grid-template-columns: 1fr; grid-auto-rows: 1fr; }
  .pages button {
    min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted);
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule);
  }
  .pages .pi { font-size: 18px; line-height: 1; }
  .pages button.on { background: var(--hud); border-color: var(--hud); color: var(--void); box-shadow: var(--glow); }
  .page { min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; }
  .page > :global(.center), .page > :global(.right) { flex: 1; min-height: 0; }
</style>
