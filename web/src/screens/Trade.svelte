<script lang="ts">
  import type { EdState, MarketItem } from '@et/shared';
  import Panel from '../lib/Panel.svelte';

  let { s, now }: { s: EdState; now: number } = $props();

  const cr = (n: number) => n.toLocaleString('pt-BR');
  // With the game closed the session ended at the last journal event, not now.
  const sessionEnd = $derived(s.meta.online ? now : Date.parse(s.meta.lastEventAt) || now);
  const hours = $derived(s.session.startedAt ? Math.max((sessionEnd - Date.parse(s.session.startedAt)) / 3.6e6, 1 / 60) : 0);
  const crPerHour = $derived(hours ? s.session.tradeProfit / hours : 0);

  const docked = $derived(s.flags.docked && s.market.station !== '' && s.market.station === s.location.station);
  const marketAge = $derived(s.market.updatedAt ? age(now - Date.parse(s.market.updatedAt)) : null);

  function age(ms: number) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    if (min < 48 * 60) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} d`;
  }

  // Market table: what this station sells and buys, sortable.
  type Key = 'label' | 'buy' | 'sell' | 'stock' | 'demand' | 'vsMean';
  let sortKey = $state<Key>('vsMean');
  let sortDesc = $state(true);
  let filter = $state('');
  let mode = $state<'sell' | 'buy'>('sell');

  type Row = MarketItem & { vsMean: number; held: number };
  const rows = $derived.by(() => {
    const held = new Map(s.cargo.items.map((c) => [c.name.toLowerCase(), c.count]));
    const q = filter.trim().toLowerCase();
    return s.market.items
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

  // Market.json names look like "$gold_name;", cargo uses "gold".
  function nameKey(name: string) {
    return name.replace(/^\$/, '').replace(/_name;$/i, '').toLowerCase();
  }

  function sortBy(key: Key) {
    if (sortKey === key) sortDesc = !sortDesc;
    else {
      sortKey = key;
      sortDesc = key !== 'label';
    }
  }

  const holdValue = $derived.by(() => {
    const sell = new Map(s.market.items.map((i) => [nameKey(i.name), i.sell]));
    return s.cargo.items.reduce((sum, c) => sum + (sell.get(c.name.toLowerCase()) ?? 0) * c.count, 0);
  });
</script>

<div class="trade">
  <Panel title="Session" aside={s.session.startedAt ? `${hours.toFixed(1)} h` : 'sem sessão'}>
    <div class="kpis">
      <div><span class="dim">LUCRO</span><b class="num ok">{cr(s.session.tradeProfit)}</b></div>
      <div><span class="dim">CR/H</span><b class="num tele">{cr(Math.round(crPerHour))}</b></div>
      <div><span class="dim">VENDIDO</span><b class="num">{cr(s.session.tonsSold)} t</b></div>
      <div><span class="dim">VENDAS</span><b class="num">{s.session.sales}</b></div>
    </div>
  </Panel>

  <Panel title="Hold" aside="{s.cargo.count}/{s.ship.cargoCapacity} t">
    {#if s.cargo.items.length}
      <table>
        <tbody>
          {#each s.cargo.items as c (c.name)}
            <tr><td>{c.label}</td><td class="r num">{c.count} t</td>{#if c.stolen}<td class="bad">roubado</td>{/if}</tr>
          {/each}
        </tbody>
      </table>
      {#if docked}<p class="dim">Valor aqui: <span class="tele num">{cr(holdValue)} Cr</span></p>{/if}
    {:else}
      <p class="dim">Porão vazio.</p>
    {/if}
  </Panel>

  <Panel class="market" title="Market · {s.market.station || '—'}"
    aside={marketAge === null ? 'sem dados' : docked ? 'docado · ao vivo' : `${marketAge} atrás`}>
    <div class="tools">
      <button class:active={mode === 'sell'} onclick={() => (mode = 'sell')}>VENDER AQUI</button>
      <button class:active={mode === 'buy'} onclick={() => (mode = 'buy')}>COMPRAR AQUI</button>
      <input placeholder="filtrar commodity / categoria" bind:value={filter} />
    </div>
    <table class="grid">
      <thead>
        <tr>
          <th onclick={() => sortBy('label')}>Commodity</th>
          <th class="r" onclick={() => sortBy(mode === 'sell' ? 'sell' : 'buy')}>{mode === 'sell' ? 'Venda' : 'Compra'}</th>
          <th class="r" onclick={() => sortBy('vsMean')}>vs média</th>
          <th class="r" onclick={() => sortBy(mode === 'sell' ? 'demand' : 'stock')}>{mode === 'sell' ? 'Demanda' : 'Estoque'}</th>
          <th class="r">No porão</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.name)}
          <tr class:held={r.held > 0}>
            <td>{r.label} <span class="faint">{r.category}</span></td>
            <td class="r num">{cr(mode === 'sell' ? r.sell : r.buy)}</td>
            <td class="r num" class:ok={r.vsMean > 0} class:bad={r.vsMean < 0}>{r.vsMean > 0 ? '+' : ''}{r.vsMean.toFixed(0)}%</td>
            <td class="r num muted">{cr(mode === 'sell' ? r.demand : r.stock)}</td>
            <td class="r num">{r.held || ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Panel>

  <Panel class="routes" title="Trade routes" aside="M3">
    <p class="dim">
      Rotas a partir de <span class="tele">{s.location.system || '—'}</span>, ordenáveis por distância, lucro/t,
      lucro total, lucro/h e % de lucro; busca de onde comprar/vender cada commodity.
      Fonte de preços da galáxia (Spansh / EDDN) entra no marco M3.
    </p>
  </Panel>
</div>

<style>
  .trade {
    display: grid;
    grid-template-columns: 1fr 1fr 1.6fr;
    grid-template-rows: auto 1fr;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .trade > :global(.market) { grid-column: 3; grid-row: 1 / span 2; }
  .trade > :global(.routes) { grid-column: 1 / span 2; }

  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
  .kpis div { display: flex; flex-direction: column; }
  .kpis span { font-size: 11px; letter-spacing: 0.08em; }
  .kpis b { font-size: 18px; }

  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 4px; border-bottom: 1px solid var(--rule); text-align: left; white-space: nowrap; }
  th {
    position: sticky;
    top: 0;
    background: var(--panel);
    color: var(--hud-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .r { text-align: right; }
  .faint { color: var(--faint); font-size: 11px; }
  tr.held td:first-child { color: var(--hud); }

  .tools { display: flex; gap: 6px; margin-bottom: 6px; }
  .tools button {
    padding: 6px 10px;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--muted);
    font-weight: 700;
    font-size: 11px;
  }
  .tools button.active { background: var(--hud); color: var(--void); border-color: var(--hud); }
  .tools input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    background: var(--void);
    border: 1px solid var(--rule);
    color: var(--text);
    font: inherit;
  }
</style>
