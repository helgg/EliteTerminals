<script lang="ts">
  import type { EdState, TradeQuery, TradeResult } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import RouteTable from '../lib/trade/RouteTable.svelte';
  import RouteDetail from '../lib/trade/RouteDetail.svelte';
  import ChainTable from '../lib/trade/ChainTable.svelte';
  import ChainDetail from '../lib/trade/ChainDetail.svelte';
  import CommodityFinder from '../lib/trade/CommodityFinder.svelte';
  import LocalMarket from '../lib/trade/LocalMarket.svelte';
  import ReferencePicker from '../lib/trade/ReferencePicker.svelte';
  import WatchBanner, { toWatch } from '../lib/trade/WatchBanner.svelte';
  import { link } from '../lib/link.svelte.ts';
  import { ladenJumpRange } from '../lib/jump.ts';
  import { viewport } from '../lib/viewport.svelte.ts';
  import { cr, short } from '../lib/format.ts';
  import { restoreLast, tradeStore as ts } from '../lib/trade/store.svelte.ts';

  let { s, now }: { s: EdState; now: number } = $props();

  // --- filters, remembered per device ---
  type Filters = Pick<TradeQuery,
    'reference' | 'radius' | 'maxAgeH' | 'pad' | 'planetary' | 'carriers' | 'exportHere' | 'importHere' | 'maxLs' |
    'minSupply' | 'minDemand' | 'states' | 'hops'>;
  const DEFAULTS: Filters = {
    reference: '', radius: 25, maxAgeH: 24, pad: 'L', planetary: false, carriers: false, exportHere: false, importHere: false,
    maxLs: 5000, minSupply: 0, minDemand: 0, states: [], hops: 3,
  };
  let f = $state<Filters>(readFilters());
  $effect(() => {
    try { localStorage.setItem('et.trade.filters', JSON.stringify(f)); } catch {}
  });
  function readFilters(): Filters {
    try {
      const saved = JSON.parse(localStorage.getItem('et.trade.filters') ?? '{}');
      if (saved.fromHere) saved.exportHere = true; // the old "from here only" became EXPORT
      delete saved.fromHere;
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  const RADII = [10, 15, 25, 40, 80];
  const AGES: [number, string][] = [[1, '1h'], [3, '3h'], [12, '12h'], [24, '1d'], [72, '3d'], [168, '7d'], [720, '30d'], [0, 'any']];
  const LS: [number, string][] = [[1000, '1k'], [5000, '5k'], [20000, '20k'], [0, 'any']];
  const VOLUMES: [number, string][] = [[0, 'any'], [100, '100'], [500, '500'], [1000, '1k'], [5000, '5k'], [10000, '10k']];
  const STOPS: [number, string][] = [[2, '3'], [3, '4'], [4, '5']]; // legs → stops (max 5)
  const COMMON_STATES = ['Boom', 'Expansion', 'Investment', 'Public Holiday', 'Civil Liberty'];
  const states = $derived([...new Set([...COMMON_STATES, ...(ts.result?.states ?? [])])].filter((x) => x !== 'None'));

  function toggleState(x: string) {
    f.states = f.states.includes(x) ? f.states.filter((y) => y !== x) : [...f.states, x];
  }

  const query = $derived<TradeQuery>({
    ...f,
    cargo: s.ship.cargoCapacity || 1,
    capital: s.commander.credits,
    jumpRange: ladenJumpRange(s) || 15,
  });

  // --- scan ---
  let busy = $state(false);
  let error = $state('');
  void restoreLast();

  async function scan(force = false) {
    drawer = false;
    if (phone && page === 'scan') setPage('routes');
    busy = true;
    error = '';
    link.tradeProgress = null;
    try {
      const res = await fetch('/api/trade/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, force }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      ts.result = body as TradeResult;
      ts.selected = ts.result.routes[0]?.id ?? '';
      ts.selectedChain = ts.result.chains?.[0]?.id ?? '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function setStops(h: number) {
    f.hops = h;
    if (ts.result && !busy) void scan(false); // markets are cached: only the maths runs again
  }

  if (!['loop', 'linear', 'finder', 'local'].includes(ts.tab)) ts.tab = 'loop';
  type Tab = typeof ts.tab;
  const ALL_TABS: Tab[] = ['loop', 'linear', 'finder', 'local'];
  const TAB_LABELS: Record<Tab, string> = { loop: 'LOOP ROUTES', linear: 'LINEAR ROUTES', finder: 'COMMODITY', local: 'MARKET' };
  // ?view=linear (or loop, finder, local) opens that tab, for testing layouts
  const askedView = new URLSearchParams(location.search).get('view') as Tab | null;
  if (askedView && askedView in TAB_LABELS) ts.tab = askedView;

  // --- layout (docs/design/RESPONSIVE-TRADE.md) ---
  const vp = $derived(viewport.vp);
  const phone = $derived(viewport.device === 'phone');
  /** Tablets and portrait monitors: the filters live in a drawer. */
  let drawer = $state(new URLSearchParams(location.search).get('filters') === 'open');

  // Phones show one page at a time; the last page is remembered. Each page owns some of the tabs.
  type Page = 'scan' | 'routes' | 'route' | 'market';
  const PAGES: { id: Page; label: string; icon: string }[] = [
    { id: 'scan', label: 'SCAN', icon: '⚙' }, { id: 'routes', label: 'ROUTES', icon: '≡' },
    { id: 'route', label: 'ROUTE', icon: '⇄' }, { id: 'market', label: 'MARKET', icon: '▦' },
  ];
  let page = $state<Page>(readPage());
  function readPage(): Page {
    const asked = new URLSearchParams(location.search).get('page') as Page | null;
    if (asked && PAGES.some((p) => p.id === asked)) return asked;
    try {
      const saved = localStorage.getItem('et.trade.page') as Page | null;
      if (saved && PAGES.some((p) => p.id === saved)) return saved;
    } catch {}
    return 'routes';
  }
  function setPage(p: Page) {
    page = p;
    if (p === 'market' && (ts.tab === 'loop' || ts.tab === 'linear')) ts.tab = 'finder';
    if ((p === 'routes' || p === 'route') && (ts.tab === 'finder' || ts.tab === 'local')) ts.tab = 'loop';
    try { localStorage.setItem('et.trade.page', p); } catch {}
  }
  $effect(() => {
    if (phone) setPage(page);
  });
  const result = $derived(ts.result);
  // a pinned route the last scan left out still opens, at the figures it had when last seen
  const pins = $derived(s.tradePins ?? []);
  const pinCount = $derived(pins.filter((p) => p.kind === (ts.tab === 'linear' ? 'linear' : 'loop')).length);
  const route = $derived(result?.routes.find((r) => r.id === ts.selected)
    ?? pins.find((p) => p.kind === 'loop' && p.id === ts.selected)?.route ?? null);
  const chain = $derived(result?.chains?.find((c) => c.id === ts.selectedChain)
    ?? pins.find((p) => p.kind === 'linear' && p.id === ts.selectedChain)?.chain ?? null);
  const progress = $derived(link.tradeProgress);
  // the picked route goes to the server, which warns when new prices make it pay less
  const watchJson = $derived(JSON.stringify(toWatch(ts.tab === 'linear' ? null : route, ts.tab === 'linear' ? chain : null)));
  $effect(() => {
    const body = `{"watch":${watchJson}}`;
    void fetch('/api/trade/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  });
  const TITLES = { loop: 'Loop routes', linear: 'Linear routes', finder: 'Commodity finder', local: 'Market' };

  // --- session ---
  const sessionEnd = $derived(s.meta.online ? now : Date.parse(s.meta.lastEventAt) || now);
  const hours = $derived(s.session.startedAt ? Math.max((sessionEnd - Date.parse(s.session.startedAt)) / 3.6e6, 1 / 60) : 0);
  const crPerHour = $derived(hours ? s.session.tradeProfit / hours : 0);
</script>

{#snippet chips<T>(options: [T, string][], value: T, set: (v: T) => void)}
  <div class="chips">
    {#each options as [v, label] (label)}
      <button class:on={v === value} onclick={() => set(v)}>{label}</button>
    {/each}
  </div>
{/snippet}

{#snippet filters()}
  <ReferencePicker bind:value={f.reference} current={s.location.system} />
  <div class="group">
    <span class="k">RADIUS (ly)</span>
    {@render chips(RADII.map((r) => [r, `${r}`] as [number, string]), f.radius, (v) => (f.radius = v))}
  </div>
  <div class="group">
    <span class="k">MAX PRICE AGE</span>
    {@render chips(AGES, f.maxAgeH, (v) => (f.maxAgeH = v))}
  </div>
  <div class="pair">
    <div class="group">
      <span class="k">PAD</span>
      {@render chips([['S', 'S'], ['M', 'M'], ['L', 'L']] as ['S' | 'M' | 'L', string][], f.pad, (v) => (f.pad = v))}
    </div>
    <div class="group">
      <span class="k" title="Max distance from the arrival star">STAR DIST (ls)</span>
      {@render chips(LS, f.maxLs, (v) => (f.maxLs = v))}
    </div>
  </div>
  <div class="group">
    <span class="k">MIN SUPPLY (t)</span>
    {@render chips(VOLUMES, f.minSupply, (v) => (f.minSupply = v))}
  </div>
  <div class="group">
    <span class="k">MIN DEMAND (t)</span>
    {@render chips(VOLUMES, f.minDemand, (v) => (f.minDemand = v))}
  </div>
  <div class="group">
    <span class="k">FACTION STATE (A or B)</span>
    <div class="chips">
      {#each states as x (x)}
        <button class="state" class:on={f.states.includes(x)} onclick={() => toggleState(x)}>{x.toUpperCase()}</button>
      {/each}
    </div>
  </div>
  <div class="toggles">
    <button class:on={f.exportHere} title="Routes starting here (current station, or current system when in flight)"
      onclick={() => (f.exportHere = !f.exportHere)}>EXPORT</button>
    <button class:on={f.importHere} title="Routes ending here (current station, or current system when in flight)"
      onclick={() => (f.importHere = !f.importHere)}>IMPORT</button>
    <button class:on={f.planetary} onclick={() => (f.planetary = !f.planetary)}>PLANETARY</button>
    <button class:on={f.carriers} onclick={() => (f.carriers = !f.carriers)}>CARRIERS</button>
  </div>
{/snippet}

{#snippet scanButton()}
  <button class="scan" disabled={busy || !s.location.system} onclick={() => scan(false)}>
    {#if busy}
      SCANNING {progress ? `${progress.loaded}/${progress.total}` : '…'}
    {:else}
      SCAN · {(f.reference || s.location.system).toUpperCase() || '—'}
    {/if}
  </button>
  {#if busy && progress?.total}
    <div class="bar"><div style:width="{(progress.loaded / progress.total) * 100}%"></div></div>
  {/if}
{/snippet}

{#snippet hints()}
  <!-- two short lines: live prices, then jump range and data time (cargo is in SESSION) -->
  <div class="hint eddn" title="EDDN: live prices from other players' game clients · {cr(s.prices.heard)} markets heard since the server started">
    {#if s.prices.live}<span class="live">● EDDN LIVE</span>{:else}<span class="off">○ EDDN OFF</span>{/if}
    · {cr(s.prices.stored)} markets
  </div>
  <div class="hint dim" title="Laden jump range used for the time estimates (cargo {cr(query.cargo)}t)">
    {query.jumpRange.toFixed(1)}ly laden{#if result}&nbsp;· data {new Date(result.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      · <button class="link" disabled={busy} onclick={() => scan(true)} title="Fetch this region from Spansh again">reload</button>{/if}
  </div>
  {#if error}<div class="bad">{error}</div>{/if}
{/snippet}

{#snippet scanPanel(title: string)}
  <Panel class="scanp" {title} scroll={false} aside={result ? `${result.stations} markets` : ''}>
    <div class="filters">
      {@render filters()}
      <div class="go">
        {@render scanButton()}
        {@render hints()}
      </div>
    </div>
  </Panel>
{/snippet}

{#snippet session()}
  <Panel class="sess" title="Session" scroll={false} aside={s.session.startedAt ? `${hours.toFixed(1)}h` : 'no session'}>
    <div class="kpis">
      <div><span class="dim">PROFIT</span><b class="num ok">{short(s.session.tradeProfit)} Cr</b></div>
      <div><span class="dim">CR/H</span><b class="num tele">{short(crPerHour)}</b></div>
      <div><span class="dim">SOLD</span><b class="num">{cr(s.session.tonsSold)}t</b></div>
      <div><span class="dim">CARGO</span><b class="num">{cr(s.cargo.count)}/{cr(s.ship.cargoCapacity)}t</b></div>
    </div>
  </Panel>
{/snippet}

{#snippet sessionStrip()}
  <!-- phones: the session in one line under the routes -->
  <div class="strip" title="Trade session">
    <span><span class="dim">PROFIT</span> <b class="num ok">{short(s.session.tradeProfit)}</b></span>
    <span><span class="dim">CR/H</span> <b class="num tele">{short(crPerHour)}</b></span>
    <span><span class="dim">SOLD</span> <b class="num">{cr(s.session.tonsSold)}t</b></span>
    <span><span class="dim">CARGO</span> <b class="num">{cr(s.cargo.count)}/{cr(s.ship.cargoCapacity)}t</b></span>
  </div>
{/snippet}

{#snippet tabs(ids: Tab[])}
  <nav class="tabs">
    {#each ids as t (t)}
      <button class:on={ts.tab === t} onclick={() => (ts.tab = t)}>{TAB_LABELS[t]}</button>
    {/each}
    {#if ts.tab === 'loop' || ts.tab === 'linear'}
      <span class="tools">
        {#if ts.tab === 'linear'}
          <span class="stops">
            <span class="k">STOPS</span>
            {@render chips(STOPS, f.hops, setStops)}
          </span>
        {/if}
        <button class="pinf" class:on={ts.pinnedOnly} onclick={() => (ts.pinnedOnly = !ts.pinnedOnly)}
          title="List only the pinned routes">{ts.pinnedOnly ? '◆' : '◇'} PINNED <b class="num">{pinCount}</b></button>
      </span>
    {/if}
  </nav>
{/snippet}

{#snippet pane(compact: boolean, onpick?: () => void)}
  <div class="pane">
    {#if ts.tab === 'loop' || ts.tab === 'linear'}
      {#if ts.pinnedOnly && !pinCount}
        <p class="dim">No pinned {ts.tab === 'linear' ? 'linear' : 'loop'} routes. Tap ◇ on a route to pin it: later
          scans keep it marked, and this list keeps it even when a scan leaves it out.</p>
      {:else if ts.tab === 'loop' && (result?.routes.length || ts.pinnedOnly)}
        <RouteTable routes={result?.routes ?? []} bind:selected={ts.selected} {compact} {onpick} {pins} pinnedOnly={ts.pinnedOnly} />
      {:else if ts.tab === 'linear' && (result?.chains?.length || ts.pinnedOnly)}
        <ChainTable chains={result?.chains ?? []} bind:selected={ts.selectedChain} {compact} {onpick} {pins} pinnedOnly={ts.pinnedOnly} />
      {:else if result}
        <p class="dim">No route with these filters. Widen the radius or the max price age, or tap SCAN to apply
          the current filters.</p>
      {:else}
        <p class="dim">Set the filters and tap SCAN. The first scan of a region downloads its markets from Spansh
          (may take ~30s); then live prices keep them fresh.</p>
      {/if}
    {:else if ts.tab === 'finder'}
      <CommodityFinder names={result?.commodities ?? []} {query} />
    {:else}
      <LocalMarket {s} {now} />
    {/if}
  </div>
{/snippet}

{#snippet center(ids: Tab[], compact: boolean, onpick?: () => void)}
  <Panel class="center" title={TITLES[ts.tab]}
    aside={ts.tab === 'loop' && result ? `${result.routes.length} routes` : ts.tab === 'linear' && result ? `${result.chains?.length ?? 0} routes` : ''}>
    <div class="center-body">
      {@render tabs(ids)}
      {@render pane(compact, onpick)}
    </div>
  </Panel>
{/snippet}

{#snippet detail()}
  <Panel class="right" title={ts.tab === 'linear' ? 'Linear route' : 'Loop route'}>
    <WatchBanner watch={s.tradeWatch} id={(ts.tab === 'linear' ? chain?.id : route?.id) ?? ''} {now} />
    {#if ts.tab === 'linear'}
      <ChainDetail {chain} jumpRange={query.jumpRange} />
    {:else}
      <RouteDetail {route} jumpRange={query.jumpRange} split={vp === 'tablet-portrait' || vp === 'desktop-portrait'} />
    {/if}
  </Panel>
{/snippet}

{#if vp === 'desktop-landscape'}
  <div class="trade wide">
    <div class="left">
      {@render scanPanel('Scan')}
      {@render session()}
    </div>
    {@render center(ALL_TABS, false)}
    {@render detail()}
  </div>
{:else if phone}
  <!-- PHONES: one page at a time; tabs at the bottom (portrait) or down the left (landscape). Picking a route opens ROUTE. -->
  <div class="trade phone {viewport.orientation}">
    <nav class="pages" aria-label="Trade pages">
      {#each PAGES as p (p.id)}
        <button class:on={page === p.id} onclick={() => setPage(p.id)}><span class="pi">{p.icon}</span>{p.label}</button>
      {/each}
    </nav>
    <div class="page p-{page}">
      {#if page === 'scan'}
        {@render scanPanel('Scan')}
      {:else if page === 'routes'}
        {@render center(['loop', 'linear'], true, () => setPage('route'))}
        {@render sessionStrip()}
      {:else if page === 'route'}
        {@render detail()}
      {:else}
        {@render center(['finder', 'local'], true)}
      {/if}
    </div>
  </div>
{:else}
  <!-- TABLETS AND PORTRAIT MONITORS: a bar with FILTERS and SCAN; the filters open in a drawer -->
  <div class="trade mid {viewport.orientation}">
    <div class="topbar">
      <button class="filt" class:on={drawer} onclick={() => (drawer = !drawer)}>FILTERS {drawer ? '▴' : '▾'}</button>
      <div class="topscan">{@render scanButton()}</div>
      <div class="tophint">{@render hints()}</div>
    </div>
    {@render center(ALL_TABS, true)}
    {@render detail()}
    {#if drawer}
      <button class="shade" aria-label="Close filters" onclick={() => (drawer = false)}></button>
      <div class="drawer">
        {@render scanPanel('Filters')}
        {@render session()}
      </div>
    {/if}
  </div>
{/if}

<style>
  .trade {
    display: grid;
    gap: 8px;
    height: 100%;
    min-height: 0;
    position: relative;
  }
  .trade.wide { grid-template-columns: 272px minmax(0, 1fr) 290px; }
  .left { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .trade :global(.center .body) { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  /* SCAN takes the column height left by SESSION */
  .left > :global(.scanp), .page > :global(.scanp) { flex: 1 0 auto; }
  .trade :global(.scanp .body) { flex: 1; display: flex; flex-direction: column; }
  .filters { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; }
  .group { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  /* monitor on its side: the buttons grow into the height instead of leaving gaps between the groups */
  .wide .filters { justify-content: flex-start; gap: 10px; }
  .wide .filters > .group, .wide .filters > .pair, .wide .filters > .toggles { flex: 1 1 0; }
  .wide .pair .group, .wide .filters > .group { min-height: 0; }
  .wide .group .chips { flex: 1; align-content: stretch; }
  .wide .chips button { min-height: 30px; font-size: 12px; }
  .wide .chips button.state { font-size: 11px; }
  .wide .toggles { grid-auto-rows: 1fr; }
  .wide .toggles button { font-size: 12px; }
  .wide .scan { padding: 16px 12px; font-size: 14px; }
  .go { display: flex; flex-direction: column; gap: 3px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pair { display: grid; grid-template-columns: 3fr 4fr; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chips button, .toggles button {
    flex: 1; padding: 8px 4px; background: var(--steel); border: 1px solid var(--rule);
    color: var(--muted); font-size: 11px; font-weight: 700;
  }
  .chips button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .chips button.state { flex: 1 1 auto; font-size: 10px; }
  .chips button.state.on { background: var(--telemetry); border-color: var(--telemetry); }
  .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
  .toggles button.on { border-color: var(--telemetry); color: var(--telemetry); box-shadow: inset 0 2px var(--telemetry); }
  .scan {
    padding: 12px; background: var(--hud); color: var(--void); border: 0;
    font-weight: 800; letter-spacing: 0.1em; box-shadow: var(--glow);
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .scan:disabled { opacity: 0.6; cursor: progress; }
  .bar { height: 4px; background: var(--steel); }
  .bar div { height: 100%; background: var(--telemetry); transition: width 0.3s; }
  .hint { font-size: 10px; line-height: 1.5; white-space: nowrap; }
  .eddn { color: var(--muted); }
  .eddn .live { color: var(--ok); }
  .eddn .off { color: var(--dim); }
  .link { background: none; border: 0; padding: 0; color: var(--hud-hi); text-decoration: underline; font-size: 10px; }

  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
  .kpis div { display: flex; flex-direction: column; }
  .kpis span { font-size: 10px; letter-spacing: 0.08em; }
  .kpis b { font-size: 16px; }

  .center-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .tabs { display: flex; gap: 4px; margin-bottom: 6px; align-items: center; }
  .tabs > button {
    padding: 6px 14px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi);
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  }
  .tabs > button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .tools { margin-left: auto; display: flex; gap: 10px; align-items: center; }
  .stops { display: flex; gap: 6px; align-items: center; }
  .pinf {
    padding: 5px 10px; background: var(--steel); border: 1px solid var(--rule); color: var(--muted);
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em; white-space: nowrap;
  }
  .pinf b { color: var(--text); }
  .pinf.on { border-color: var(--telemetry); background: rgb(55 198 212 / 0.14); color: var(--telemetry); box-shadow: inset 0 2px var(--telemetry); }
  .stops .k { margin: 0; }
  .stops .chips button { padding: 5px 10px; }
  .pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  /* --- tablets and portrait monitors: bar on top, filters in a drawer --- */
  .trade.mid { grid-template-rows: auto minmax(0, 1fr); }
  .mid.landscape { grid-template-columns: minmax(0, 1fr) 300px; }
  .mid.portrait { grid-template-rows: auto minmax(0, 56fr) minmax(0, 44fr); }
  .topbar { grid-column: 1 / -1; display: flex; gap: 8px; align-items: stretch; }
  .filt {
    flex: none; padding: 0 16px; background: var(--steel); border: 1px solid var(--hud); color: var(--hud-hi);
    font-size: 12px; font-weight: 800; letter-spacing: 0.1em;
  }
  .filt.on { background: var(--hud); color: var(--void); }
  .topscan { flex: 0 1 360px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .topscan .scan { flex: 1; }
  .tophint { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  /* a portrait detail reads in two columns: A and the way out, B and the way back */
  .mid.portrait :global(.right .detail:not(.split)) { display: block; column-count: 2; column-gap: 14px; }
  .mid.portrait :global(.right .detail:not(.split) > *) { break-inside: avoid; margin-bottom: 6px; }
  /* the loop stands A | jump lane | B side by side and fills the panel top to bottom */
  .mid.portrait :global(.right > .body:has(.split)) { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .mid.portrait :global(.right .split) { flex: 1; min-height: 0; height: auto; }
  .shade { position: absolute; inset: 0; z-index: 30; background: rgb(0 0 0 / 0.55); border: 0; }
  .drawer {
    position: absolute; z-index: 31; top: 0; left: 0; bottom: 0; width: min(380px, 92%);
    display: flex; flex-direction: column; gap: 8px; padding: 8px; background: var(--void);
    border-right: 1px solid var(--hud); box-shadow: 8px 0 24px rgb(0 0 0 / 0.6); overflow-y: auto;
  }
  .drawer > :global(.scanp) { flex: 1 0 auto; }

  /* --- phones: pages; tabs at the bottom standing up, down the left on its side --- */
  .trade.phone { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 6px; }
  .trade.phone.landscape { grid-template-columns: 74px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .phone.portrait .pages { grid-row: 2; }
  .phone.portrait .page { grid-row: 1; }
  .pages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .landscape .pages { grid-template-columns: 1fr; grid-auto-rows: 1fr; }
  .pages button {
    min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted);
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule);
  }
  .pages .pi { font-size: 18px; line-height: 1; }
  .pages button.on { background: var(--hud); border-color: var(--hud); color: var(--void); box-shadow: var(--glow); }
  .page { min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
  .page > :global(.center), .page > :global(.right) { flex: 1; min-height: 0; }
  /* on its side the SCAN filters sit in three columns so they fit the short screen */
  .phone.landscape .p-scan .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 10px; align-content: start; }
  .phone.landscape .p-scan .go { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 10px; align-items: center; }
  .phone.landscape .p-scan .go .scan { grid-row: span 2; padding: 8px; }
  .phone.landscape .p-scan .chips button, .phone.landscape .p-scan .toggles button { padding: 6px 2px; }
  /* and the route reads in two columns, like a portrait tablet */
  .phone.landscape :global(.right .detail) { display: block; column-count: 2; column-gap: 12px; }
  .phone.landscape :global(.right .detail > *) { break-inside: avoid; margin-bottom: 6px; }
  .strip {
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; padding: 6px 8px; font-size: 11px;
    background: var(--panel); border: 1px solid var(--rule);
  }
  .strip .dim { font-size: 9px; letter-spacing: 0.08em; }
  .phone .tabs > button { padding: 8px 10px; flex: 1; }
</style>
