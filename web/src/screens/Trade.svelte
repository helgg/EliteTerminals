<script lang="ts">
  import type { EdState, TradeQuery, TradeResult } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import RouteTable from '../lib/trade/RouteTable.svelte';
  import RouteDetail from '../lib/trade/RouteDetail.svelte';
  import ChainTable from '../lib/trade/ChainTable.svelte';
  import ChainDetail from '../lib/trade/ChainDetail.svelte';
  import CommodityFinder from '../lib/trade/CommodityFinder.svelte';
  import LocalMarket from '../lib/trade/LocalMarket.svelte';
  import { link } from '../lib/link.svelte.ts';
  import { ladenJumpRange } from '../lib/jump.ts';
  import { cr, short } from '../lib/format.ts';
  import { restoreLast, tradeStore as ts } from '../lib/trade/store.svelte.ts';

  let { s, now }: { s: EdState; now: number } = $props();

  // --- filters, remembered per device ---
  type Filters = Pick<TradeQuery,
    'radius' | 'maxAgeH' | 'pad' | 'planetary' | 'carriers' | 'exportHere' | 'importHere' | 'maxLs' |
    'minSupply' | 'minDemand' | 'states' | 'hops'>;
  const DEFAULTS: Filters = {
    radius: 25, maxAgeH: 24, pad: 'L', planetary: false, carriers: false, exportHere: false, importHere: false,
    maxLs: 5000, minSupply: 0, minDemand: 0, states: [], hops: 3,
  };
  let f = $state<Filters>(readFilters());
  $effect(() => {
    try { localStorage.setItem('et.trade.filters', JSON.stringify(f)); } catch {}
  });
  function readFilters(): Filters {
    try {
      const saved = JSON.parse(localStorage.getItem('et.trade.filters') ?? '{}');
      if (saved.fromHere) saved.exportHere = true; // "só daqui" became "exportar"
      delete saved.fromHere;
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  const RADII = [10, 15, 25, 40];
  const AGES: [number, string][] = [[1, '1h'], [3, '3h'], [12, '12h'], [24, '1d'], [72, '3d'], [168, '7d'], [720, '30d'], [0, 'todas']];
  const LS: [number, string][] = [[1000, '1k'], [5000, '5k'], [20000, '20k'], [0, '∞']];
  const VOLUMES: [number, string][] = [[0, '—'], [100, '100'], [500, '500'], [1000, '1k'], [5000, '5k'], [10000, '10k']];
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
  const result = $derived(ts.result);
  const route = $derived(result?.routes.find((r) => r.id === ts.selected) ?? null);
  const chain = $derived(result?.chains?.find((c) => c.id === ts.selectedChain) ?? null);
  const progress = $derived(link.tradeProgress);
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

<div class="trade">
  <div class="left">
    <Panel title="Scan" scroll={false} aside={result ? `${result.stations} mercados` : ''}>
      <div class="filters">
        <span class="k">RAIO</span>
        {@render chips(RADII.map((r) => [r, `${r}ly`] as [number, string]), f.radius, (v) => (f.radius = v))}
        <span class="k">PREÇO ATUALIZADO HÁ NO MÁXIMO</span>
        {@render chips(AGES, f.maxAgeH, (v) => (f.maxAgeH = v))}
        <div class="pair">
          <div>
            <span class="k">PAD</span>
            {@render chips([['S', 'S'], ['M', 'M'], ['L', 'L']] as ['S' | 'M' | 'L', string][], f.pad, (v) => (f.pad = v))}
          </div>
          <div>
            <span class="k">DIST. ESTRELA (ls)</span>
            {@render chips(LS, f.maxLs, (v) => (f.maxLs = v))}
          </div>
        </div>
        <span class="k">OFERTA MÍN. (t)</span>
        {@render chips(VOLUMES, f.minSupply, (v) => (f.minSupply = v))}
        <span class="k">DEMANDA MÍN. (t)</span>
        {@render chips(VOLUMES, f.minDemand, (v) => (f.minDemand = v))}
        <span class="k">ESTADO DA FACÇÃO (A ou B)</span>
        <div class="chips">
          {#each states as x (x)}
            <button class="state" class:on={f.states.includes(x)} onclick={() => toggleState(x)}>{x.toUpperCase()}</button>
          {/each}
        </div>
        <div class="toggles">
          <button class:on={f.exportHere} title="Rotas que saem daqui (estação atual, ou sistema atual em voo)"
            onclick={() => (f.exportHere = !f.exportHere)}>EXPORTAR</button>
          <button class:on={f.importHere} title="Rotas que chegam aqui (estação atual, ou sistema atual em voo)"
            onclick={() => (f.importHere = !f.importHere)}>IMPORTAR</button>
          <button class:on={f.planetary} onclick={() => (f.planetary = !f.planetary)}>PLANETÁRIAS</button>
          <button class:on={f.carriers} onclick={() => (f.carriers = !f.carriers)}>CARRIERS</button>
        </div>
        <button class="scan" disabled={busy || !s.location.system} onclick={() => scan(false)}>
          {#if busy}
            ESCANEANDO {progress ? `${progress.loaded}/${progress.total}` : '…'}
          {:else}
            SCAN · {s.location.system || '—'}
          {/if}
        </button>
        {#if busy && progress?.total}
          <div class="bar"><div style:width="{(progress.loaded / progress.total) * 100}%"></div></div>
        {/if}
        <div class="hint dim">
          cargo {cr(query.cargo)}t · alcance carregado ≈{query.jumpRange.toFixed(1)}ly
          {#if result}<br />dados {new Date(result.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            · <button class="link" disabled={busy} onclick={() => scan(true)}>recarregar</button>{/if}
        </div>
        {#if error}<div class="bad">{error}</div>{/if}
      </div>
    </Panel>

    <Panel title="Session" scroll={false} aside={s.session.startedAt ? `${hours.toFixed(1)}h` : 'sem sessão'}>
      <div class="kpis">
        <div><span class="dim">LUCRO</span><b class="num ok">{short(s.session.tradeProfit)}Cr</b></div>
        <div><span class="dim">CR/H</span><b class="num tele">{short(crPerHour)}</b></div>
        <div><span class="dim">VENDIDO</span><b class="num">{cr(s.session.tonsSold)}t</b></div>
        <div><span class="dim">CARGO</span><b class="num">{cr(s.cargo.count)}/{cr(s.ship.cargoCapacity)}t</b></div>
      </div>
    </Panel>
  </div>

  <Panel class="center" title={ts.tab === 'local' ? `Market · ${s.market.station || '—'}` : TITLES[ts.tab]}
    aside={ts.tab === 'loop' && result ? `${result.routes.length} rotas` : ts.tab === 'linear' && result ? `${result.chains?.length ?? 0} rotas` : ''}>
    <div class="center-body">
      <nav class="tabs">
        <button class:on={ts.tab === 'loop'} onclick={() => (ts.tab = 'loop')}>ROTAS LOOP</button>
        <button class:on={ts.tab === 'linear'} onclick={() => (ts.tab = 'linear')}>ROTAS LINEARES</button>
        <button class:on={ts.tab === 'finder'} onclick={() => (ts.tab = 'finder')}>COMMODITY</button>
        <button class:on={ts.tab === 'local'} onclick={() => (ts.tab = 'local')}>MERCADO LOCAL</button>
        {#if ts.tab === 'linear'}
          <span class="stops">
            <span class="k">PARADAS</span>
            {@render chips(STOPS, f.hops, setStops)}
          </span>
        {/if}
      </nav>
      <div class="pane">
        {#if ts.tab === 'loop' || ts.tab === 'linear'}
          {#if ts.tab === 'loop' && result?.routes.length}
            <RouteTable routes={result.routes} bind:selected={ts.selected} />
          {:else if ts.tab === 'linear' && result?.chains?.length}
            <ChainTable chains={result.chains} bind:selected={ts.selectedChain} />
          {:else if result}
            <p class="dim">Nenhuma rota com esses filtros. Aumente o raio ou a idade máxima do preço, ou toque em SCAN
              para aplicar os filtros atuais.</p>
          {:else}
            <p class="dim">Ajuste os filtros e toque em SCAN. A primeira busca baixa os mercados próximos do Spansh
              (pode levar ~30s); depois fica em cache por 30min.</p>
          {/if}
        {:else if ts.tab === 'finder'}
          <CommodityFinder names={result?.commodities ?? []} {query} />
        {:else}
          <LocalMarket {s} />
        {/if}
      </div>
    </div>
  </Panel>

  <Panel class="right" title={ts.tab === 'linear' ? 'Linear route' : 'Loop route'}>
    {#if ts.tab === 'linear'}
      <ChainDetail {chain} />
    {:else}
      <RouteDetail {route} />
    {/if}
  </Panel>
</div>

<style>
  .trade {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr) 290px;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .left { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .trade :global(.center .body) { flex: 1; display: flex; flex-direction: column; min-height: 0; }

  .filters { display: flex; flex-direction: column; gap: 3px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; margin-top: 3px; }
  .pair { display: grid; grid-template-columns: 3fr 4fr; gap: 6px; }
  .pair > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chips button, .toggles button {
    flex: 1; padding: 5px 4px; background: var(--steel); border: 1px solid var(--rule);
    color: var(--muted); font-size: 11px; font-weight: 700;
  }
  .chips button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .chips button.state { flex: 1 1 auto; font-size: 10px; }
  .chips button.state.on { background: var(--telemetry); border-color: var(--telemetry); }
  .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin-top: 6px; }
  .toggles button.on { border-color: var(--telemetry); color: var(--telemetry); box-shadow: inset 0 2px var(--telemetry); }
  .scan {
    margin-top: 8px; padding: 12px; background: var(--hud); color: var(--void); border: 0;
    font-weight: 800; letter-spacing: 0.1em; box-shadow: var(--glow);
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .scan:disabled { opacity: 0.6; cursor: progress; }
  .bar { height: 4px; background: var(--steel); }
  .bar div { height: 100%; background: var(--telemetry); transition: width 0.3s; }
  .hint { font-size: 10px; line-height: 1.5; }
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
  .stops { margin-left: auto; display: flex; gap: 6px; align-items: center; }
  .stops .k { margin: 0; }
  .stops .chips button { padding: 5px 10px; }
  .pane { flex: 1; min-height: 0; }
</style>
