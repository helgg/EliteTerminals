<script lang="ts">
  import type { EdState, MarketItem, MarketSnapshot } from '@et/shared';
  import Name from '../Name.svelte';
  import Level from '../Level.svelte';
  import PlaceIcon, { placeKind } from '../PlaceIcon.svelte';
  import { ageLabel, cr } from '../format.ts';

  // Markets the player docked at (Market.json, kept by the server): the current one when docked,
  // otherwise the last one visited; any earlier one can be picked from the list.
  let { s, now }: { s: EdState; now: number } = $props();

  type Key = 'label' | 'buy' | 'sell' | 'stock' | 'demand' | 'vsMean';
  let sortKey = $state<Key>('vsMean');
  let sortDesc = $state(true);
  let filter = $state('');
  let mode = $state<'sell' | 'buy'>('sell');
  let picked = $state(0);
  let open = $state(false);
  let visited = $state<MarketSnapshot[]>([]);

  // Ask again whenever the game writes a new Market.json (derived: state pushes arrive several times a second).
  const marketAt = $derived(s.market.updatedAt);
  $effect(() => {
    void marketAt;
    fetch('/api/market/history')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: MarketSnapshot[]) => (visited = list))
      .catch(() => {});
  });

  const markets = $derived.by(() => {
    const list = visited.filter((m) => m.marketId !== s.market.marketId);
    return s.market.marketId && s.market.items.length ? [s.market, ...list] : list;
  });
  const dockedHere = $derived(s.flags.docked && !!s.market.marketId && s.location.station === s.market.station);
  const market = $derived(markets.find((m) => m.marketId === picked) ?? markets[0] ?? null);
  const live = $derived(dockedHere && market?.marketId === s.market.marketId);
  const ageH = (m: MarketSnapshot) => Math.max(0, (now - Date.parse(m.updatedAt)) / 3.6e6);

  // Docking somewhere new shows that market.
  const dockedId = $derived(dockedHere ? s.market.marketId : 0);
  $effect(() => {
    if (dockedId) picked = dockedId;
  });

  // Market.json names look like "$gold_name;", cargo uses "gold".
  const nameKey = (name: string) => name.replace(/^\$/, '').replace(/_name;$/i, '').toLowerCase();

  type Row = MarketItem & { vsMean: number; held: number };
  const rows = $derived.by(() => {
    if (!market) return [];
    const held = new Map(s.cargo.items.map((c) => [c.name.toLowerCase(), c.count]));
    const q = filter.trim().toLowerCase();
    return market.items
      .filter((i) => (mode === 'sell' ? i.demand > 0 && i.sell > 0 : i.stock > 0 && i.buy > 0))
      .filter((i) => !q || i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .map((i): Row => {
        const price = mode === 'sell' ? i.sell : i.buy;
        const vsMean = i.meanPrice ? ((price - i.meanPrice) / i.meanPrice) * 100 : 0;
        return { ...i, vsMean: mode === 'sell' ? vsMean : -vsMean, held: held.get(nameKey(i.name)) ?? 0 };
      })
      .sort((a, b) => {
        const d = sortKey === 'label' ? a.label.localeCompare(b.label) : a[sortKey] - b[sortKey];
        return sortDesc ? -d : d;
      });
  });

  function sortBy(key: Key) {
    if (sortKey === key) sortDesc = !sortDesc;
    else {
      sortKey = key;
      sortDesc = key !== 'label';
    }
  }

  function pick(id: number) {
    picked = id;
    open = false;
  }
</script>

<div class="local">
  {#if market}
    <div class="which">
      <span class="tag" class:live>{live ? 'DOCKED' : market.marketId === markets[0]?.marketId ? 'LAST MARKET' : 'VISITED'}</span>
      <span class="st"><Name value={market.station} stationType={market.stationType} icon /></span>
      <span class="sys"><Name value={market.system} system /></span>
      <span class="age dim">{live ? 'live' : `${ageLabel(ageH(market))} ago`}</span>
      <button class="pick" class:on={open} onclick={() => (open = !open)}>VISITED · {markets.length} ▾</button>
    </div>
    {#if open}
      <ul class="visited">
        {#each markets as m (m.marketId)}
          <li>
            <button class:on={m.marketId === market.marketId} onclick={() => pick(m.marketId)}>
              <PlaceIcon kind={placeKind(m.stationType)} />
              <span class="st">{m.station}</span>
              <span class="sys">{m.system.toUpperCase()}</span>
              <span class="age">{ageLabel(ageH(m))} ago</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  <div class="tools">
    <button class:active={mode === 'sell'} onclick={() => (mode = 'sell')}>SELL HERE</button>
    <button class:active={mode === 'buy'} onclick={() => (mode = 'buy')}>BUY HERE</button>
    <input placeholder="filter" bind:value={filter} />
  </div>
  {#if market}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th onclick={() => sortBy('label')}>Commodity</th>
            <th class="r" onclick={() => sortBy(mode === 'sell' ? 'sell' : 'buy')}>{mode === 'sell' ? 'Sell' : 'Buy'}</th>
            <th class="r vs" onclick={() => sortBy('vsMean')}>vs avg</th>
            <th class="r" onclick={() => sortBy(mode === 'sell' ? 'demand' : 'stock')}>{mode === 'sell' ? 'Demand' : 'Supply'}</th>
            <th class="r">Cargo</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.name)}
            <tr class:held={r.held > 0}>
              <td>{r.label} <span class="faint">{r.category}</span></td>
              <td class="r num">{cr(mode === 'sell' ? r.sell : r.buy)}</td>
              <td class="r num vs" class:ok={r.vsMean > 0} class:bad={r.vsMean < 0}>{r.vsMean > 0 ? '+' : ''}{r.vsMean.toFixed(0)}%</td>
              <td class="r num muted">
                <Level level={(mode === 'sell' ? r.demandBracket : r.stockBracket) ?? 0} />
                {cr(mode === 'sell' ? r.demand : r.stock)}
              </td>
              <td class="r num">{r.held || ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="dim">Dock at a station to see its market. Every market you dock at is kept here.</p>
  {/if}
</div>

<style>
  .local { display: flex; flex-direction: column; height: 100%; min-height: 0; position: relative; }
  .scroll { flex: 1; min-height: 0; overflow: auto; }
  .which {
    display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; padding: 4px 6px; white-space: nowrap;
    border: 1px solid var(--rule); background: var(--rail); min-width: 0;
  }
  .tag { color: var(--void); background: var(--hud-hi); padding: 1px 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; }
  .tag.live { background: var(--ok); }
  .which .st { font-weight: 700; min-width: 0; overflow: hidden; }
  .which .sys { color: var(--telemetry); font-size: 11px; min-width: 0; overflow: hidden; }
  .age { font-size: 10px; }
  .pick {
    margin-left: auto; padding: 4px 8px; background: var(--steel); border: 1px solid var(--rule);
    color: var(--hud-hi); font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  }
  .pick.on { border-color: var(--hud); color: var(--hud); }
  .visited {
    list-style: none; margin: 0 0 6px; padding: 0; max-height: 45%; overflow-y: auto;
    border: 1px solid var(--hud); background: var(--panel);
  }
  .visited button {
    display: grid; grid-template-columns: 16px minmax(0, 1fr) minmax(0, 0.8fr) auto; gap: 6px; align-items: baseline;
    width: 100%; padding: 5px 6px; background: none; border: 0; border-bottom: 1px solid var(--rule);
    color: var(--text); font: inherit; font-size: 12px; text-align: left;
  }
  .visited button.on { background: rgb(255 122 24 / 0.14); box-shadow: inset 2px 0 var(--hud); }
  .visited .st, .visited .sys { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .visited .sys { color: var(--telemetry); font-size: 11px; }
  .visited .age { color: var(--dim); font-size: 10px; }
  .tools { display: flex; gap: 6px; margin-bottom: 6px; }
  .tools button {
    padding: 6px 10px; background: var(--steel); border: 1px solid var(--rule); color: var(--muted);
    font-weight: 700; font-size: 11px;
  }
  .tools button.active { background: var(--hud); color: var(--void); border-color: var(--hud); }
  .tools input {
    flex: 1; min-width: 0; padding: 6px 8px; background: var(--void); border: 1px solid var(--rule);
    color: var(--text); font: inherit;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 4px; border-bottom: 1px solid var(--rule); text-align: left; white-space: nowrap; }
  th {
    position: sticky; top: 0; background: var(--panel); color: var(--hud-hi); font-size: 11px;
    letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
  }
  .r { text-align: right; }
  .faint { color: var(--faint); font-size: 11px; }
  tr.held td:first-child { color: var(--hud); }

  /* phones: names wrap, the price comparison and categories step aside */
  .local { container-type: inline-size; }
  @container (max-width: 480px) {
    .which { flex-wrap: wrap; white-space: normal; }
    .which :global(.name .text) { white-space: normal; overflow-wrap: anywhere; }
    .vs, .faint { display: none; }
    td:first-child { white-space: normal; overflow-wrap: anywhere; }
    .tools button { padding: 6px 8px; }
  }
</style>
