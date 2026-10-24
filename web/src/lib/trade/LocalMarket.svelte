<script lang="ts">
  import type { EdState, MarketItem } from '@et/shared';
  import { cr } from '../format.ts';

  // The last station the player docked at (Market.json): sell/buy here, compared with the galactic mean.
  let { s }: { s: EdState } = $props();

  type Key = 'label' | 'buy' | 'sell' | 'stock' | 'demand' | 'vsMean';
  let sortKey = $state<Key>('vsMean');
  let sortDesc = $state(true);
  let filter = $state('');
  let mode = $state<'sell' | 'buy'>('sell');

  // Market.json names look like "$gold_name;", cargo uses "gold".
  const nameKey = (name: string) => name.replace(/^\$/, '').replace(/_name;$/i, '').toLowerCase();

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

  function sortBy(key: Key) {
    if (sortKey === key) sortDesc = !sortDesc;
    else {
      sortKey = key;
      sortDesc = key !== 'label';
    }
  }
</script>

<div class="local">
  <div class="tools">
    <button class:active={mode === 'sell'} onclick={() => (mode = 'sell')}>VENDER AQUI</button>
    <button class:active={mode === 'buy'} onclick={() => (mode = 'buy')}>COMPRAR AQUI</button>
    <input placeholder="filtrar commodity / categoria" bind:value={filter} />
  </div>
  {#if s.market.items.length}
    <div class="scroll">
      <table>
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
    </div>
  {:else}
    <p class="dim">Doque numa estação para ver o mercado.</p>
  {/if}
</div>

<style>
  .local { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .scroll { flex: 1; min-height: 0; overflow: auto; }
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
</style>
