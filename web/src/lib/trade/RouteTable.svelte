<script lang="ts">
  import type { TradeRoute } from '@et/shared';
  import { ageLabel, ageTone, short } from '../format.ts';

  // Sortable list of A→B trades; the selected row drives the detail panel.
  // Metrics are stacked in pairs (two lines per row, like the route) so the table fits without side-scrolling.
  let { routes, selected = $bindable() }: { routes: TradeRoute[]; selected: string } = $props();

  type Key = 'profit' | 'pct' | 'total' | 'perHour' | 'loopPerHour' | 'hopLy' | 'fromMe' | 'age';
  const ASC: Key[] = ['hopLy', 'fromMe', 'age'];
  const TITLES: Record<Key, string> = {
    profit: 'Lucro por tonelada',
    pct: 'Margem sobre o preço de compra',
    total: 'Lucro da viagem (porão cheio, limitado por estoque, demanda e saldo)',
    perHour: 'Lucro por hora estimado, só ida',
    loopPerHour: 'Ida e volta com a melhor carga de retorno',
    hopLy: 'Distância A→B em ly',
    fromMe: 'Distância da sua posição até a origem, em ly',
    age: 'Preço mais antigo dos dois mercados',
  };
  const GROUPS: { top: [Key, string]; bottom?: [Key, string] }[] = [
    { top: ['profit', 'Cr/t'], bottom: ['pct', '%'] },
    { top: ['total', 'Total'] },
    { top: ['perHour', 'Cr/h'], bottom: ['loopPerHour', 'Loop/h'] },
    { top: ['hopLy', 'Salto'], bottom: ['fromMe', 'De mim'] },
    { top: ['age', 'Idade'] },
  ];

  let sortKey = $state<Key>(readSort());
  let sortDesc = $state(!ASC.includes(readSort()));

  function readSort(): Key {
    try {
      const k = localStorage.getItem('et.trade.sort') as Key | null;
      if (k && k in TITLES) return k;
    } catch {}
    return 'perHour';
  }

  const value = (r: TradeRoute, k: Key) =>
    k === 'profit' ? r.leg.profit : k === 'total' ? r.leg.total : k === 'fromMe' ? r.src.fromMe
    : k === 'age' ? Math.max(r.src.ageH, r.dst.ageH) : r[k];

  const sorted = $derived([...routes].sort((a, b) => (sortDesc ? -1 : 1) * (value(a, sortKey) - value(b, sortKey))));

  function sortBy(k: Key) {
    if (sortKey === k) sortDesc = !sortDesc;
    else {
      sortKey = k;
      sortDesc = !ASC.includes(k);
    }
    try { localStorage.setItem('et.trade.sort', k); } catch {}
  }

  const cell = (r: TradeRoute, k: Key) =>
    k === 'pct' ? `${r.pct.toFixed(0)}%`
    : k === 'hopLy' ? r.hopLy.toFixed(1)
    : k === 'fromMe' ? r.src.fromMe.toFixed(1)
    : k === 'age' ? ageLabel(value(r, k))
    : k === 'loopPerHour' && !r.loopPerHour ? '—'
    : short(value(r, k));
</script>

{#snippet head(k: Key, label: string)}
  <button class="sort" class:on={sortKey === k} title={TITLES[k]} onclick={() => sortBy(k)}>
    {label}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}
  </button>
{/snippet}

<div class="scroll">
  <table>
    <thead>
      <tr>
        <th>Rota</th>
        <th>Carga</th>
        {#each GROUPS as g (g.top[0])}
          <th class="r">
            {@render head(g.top[0], g.top[1])}
            {#if g.bottom}<br />{@render head(g.bottom[0], g.bottom[1])}{/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sorted as r (r.id)}
        {@const age = Math.max(r.src.ageH, r.dst.ageH)}
        <tr class:sel={selected === r.id} class={ageTone(age)} onclick={() => (selected = r.id)}>
          <td class="route">
            <div><span class="st">{r.src.station}</span> <span class="dim">{r.src.system}</span></div>
            <div><span class="arrow">→</span> <span class="st">{r.dst.station}</span> <span class="dim">{r.dst.system}</span></div>
          </td>
          <td class="cargo">
            <div>{r.leg.commodity}</div>
            <div class="dim">{r.back ? `← ${r.back.commodity}` : 'volta vazia'}</div>
          </td>
          {#each GROUPS as g (g.top[0])}
            <td class="r num {g.top[0]}">
              <div class:hl={sortKey === g.top[0]}>{cell(r, g.top[0])}</div>
              {#if g.bottom}<div class="sub" class:hl={sortKey === g.bottom[0]}>{cell(r, g.bottom[0])}</div>{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .scroll { height: 100%; overflow-y: auto; overflow-x: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
  th {
    position: sticky; top: 0; z-index: 1; padding: 3px 4px; background: var(--panel); color: var(--hud-hi);
    font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; text-align: left;
    border-bottom: 1px solid var(--hud); white-space: nowrap; vertical-align: bottom;
  }
  th:nth-child(1) { width: 36%; }
  th:nth-child(2) { width: 19%; }
  .sort {
    background: none; border: 0; padding: 0; color: inherit; font: inherit; letter-spacing: inherit;
    text-transform: inherit; cursor: pointer;
  }
  .sort.on { color: var(--hud); }
  td { padding: 3px 4px; border-bottom: 1px solid var(--rule); vertical-align: top; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  td div { overflow: hidden; text-overflow: ellipsis; }
  .r { text-align: right; }
  tr { cursor: pointer; }
  tr:hover td { background: rgb(255 122 24 / 0.05); }
  tr.sel td { background: rgb(255 122 24 / 0.14); }
  tr.sel td:first-child { box-shadow: inset 2px 0 var(--hud); }
  .st { color: var(--text); }
  .arrow { color: var(--hud); }
  .cargo div:first-child { color: var(--hud-hi); }
  .sub { color: var(--muted); }
  .hl { color: var(--telemetry); }
  /* price freshness: stale rows fade */
  tr.fresh .age div { color: var(--ok); }
  tr.ok .age div { color: var(--hud-hi); }
  tr.stale td { opacity: 0.55; }
</style>
