<script lang="ts">
  import type { CommodityQuote, TradeQuery } from '@et/shared';
  import Name from '../Name.svelte';
  import PadBadge from '../PadBadge.svelte';
  import { ageLabel, ageTone, cr, short } from '../format.ts';

  // Where to buy a commodity cheapest and where to sell it dearest, within the scanned area.
  let { names, query }: { names: string[]; query: TradeQuery } = $props();

  let name = $state('');
  let result = $state<{ buy: CommodityQuote[]; sell: CommodityQuote[] } | null>(null);
  let error = $state('');

  async function look() {
    const match = names.find((n) => n.toLowerCase() === name.trim().toLowerCase());
    if (!match) {
      error = 'commodity not found in the scanned area';
      result = null;
      return;
    }
    error = '';
    const res = await fetch('/api/trade/commodity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: match, query }),
    });
    result = await res.json();
  }
</script>

{#snippet list(title: string, rows: CommodityQuote[], vol: string)}
  <div class="side">
    <div class="label">{title}</div>
    <table>
      <thead><tr><th class="c-st">Station</th><th class="r">Price</th><th class="r">{vol}</th><th class="r">Ly</th><th class="r">Age</th></tr></thead>
      <tbody>
        {#each rows as q (q.end.marketId)}
          <tr class={ageTone(q.end.ageH)}>
            <td class="c-st">
              <div class="st"><Name value={q.end.station} stationType={q.end.type} icon /></div>
              <div class="dim sub"><Name value={q.end.system} system /> <PadBadge pad={q.end.pad} size={11} /> {short(q.end.ls)}ls</div>
            </td>
            <td class="r num price">{cr(q.price)}</td>
            <td class="r num muted">{short(q.volume)}</td>
            <td class="r num">{q.end.fromMe.toFixed(1)}</td>
            <td class="r num age">{ageLabel(q.end.ageH)}</td>
          </tr>
        {:else}
          <tr><td colspan="5" class="dim">none</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<div class="finder">
  <form class="search" onsubmit={(e) => { e.preventDefault(); look(); }}>
    <input list="et-commodities" placeholder="commodity (e.g. Gold, Tritium, Basic Medicines)" bind:value={name} />
    <datalist id="et-commodities">
      {#each names as n (n)}<option value={n}></option>{/each}
    </datalist>
    <button type="submit">SEARCH</button>
  </form>
  {#if error}<p class="bad">{error}</p>{/if}
  {#if result}
    <div class="cols">
      {@render list('CHEAPEST TO BUY', result.buy, 'Supply')}
      {@render list('BEST TO SELL', result.sell, 'Demand')}
    </div>
  {:else if !names.length}
    <p class="dim">Scan the area (SCAN button) to search commodities.</p>
  {/if}
</div>

<style>
  .finder { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 6px; }
  .search { display: flex; gap: 6px; }
  input {
    flex: 1; min-width: 0; padding: 7px 8px; background: var(--void); border: 1px solid var(--rule);
    color: var(--text); font: inherit;
  }
  .search button { padding: 0 14px; background: var(--hud); color: var(--void); border: 0; font-weight: 700; letter-spacing: 0.08em; }
  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; overflow-y: auto; overflow-x: hidden; }
  .side { min-width: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
  .c-st { width: 38%; }
  .sub { font-size: 10px; }
  th { padding: 3px 4px; color: var(--hud-hi); font-size: 10px; text-transform: uppercase; text-align: left; border-bottom: 1px solid var(--hud); }
  td { padding: 3px 4px; border-bottom: 1px solid var(--rule); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  td div { overflow: hidden; text-overflow: ellipsis; }
  .r { text-align: right; }

  .price { color: var(--hud-hi); }
  tr.fresh .age { color: var(--ok); }
  tr.stale td { opacity: 0.55; }
</style>
