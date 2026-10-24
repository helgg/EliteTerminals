<script lang="ts">
  import type { TradeChain } from '@et/shared';
  import { ageLabel, ageTone, duration, short } from '../format.ts';

  // Sortable list of linear routes (A→B→C…, no return); the selected row drives the detail panel.
  let { chains, selected = $bindable() }: { chains: TradeChain[]; selected: string } = $props();

  type Key = 'perHour' | 'total' | 'seconds' | 'ly' | 'fromMe' | 'age';
  const ASC: Key[] = ['seconds', 'ly', 'fromMe', 'age'];
  const TITLES: Record<Key, string> = {
    perHour: 'Lucro por hora da rota inteira',
    total: 'Lucro somado de todas as pernas',
    seconds: 'Tempo estimado da rota inteira',
    ly: 'Distância total percorrida, em ly',
    fromMe: 'Distância da sua posição até a primeira parada, em ly',
    age: 'Preço mais antigo entre as paradas',
  };
  const COLS: [Key, string][] = [['perHour', 'Cr/h'], ['total', 'Total'], ['seconds', 'Tempo'], ['ly', 'Ly'], ['fromMe', '⌖Ly'], ['age', 'Idade']];

  let sortKey = $state<Key>('perHour');
  let sortDesc = $state(true);

  const value = (c: TradeChain, k: Key) =>
    k === 'ly' ? c.legs.reduce((t, l) => t + l.hopLy, 0)
    : k === 'fromMe' ? c.legs[0].src.fromMe
    : k === 'age' ? Math.max(...c.legs.flatMap((l) => [l.src.ageH, l.dst.ageH]))
    : c[k];

  const sorted = $derived([...chains].sort((a, b) => (sortDesc ? -1 : 1) * (value(a, sortKey) - value(b, sortKey))));

  function sortBy(k: Key) {
    if (sortKey === k) sortDesc = !sortDesc;
    else {
      sortKey = k;
      sortDesc = !ASC.includes(k);
    }
  }

  const cell = (c: TradeChain, k: Key) =>
    k === 'seconds' ? duration(c.seconds)
    : k === 'ly' || k === 'fromMe' ? value(c, k).toFixed(0)
    : k === 'age' ? ageLabel(value(c, k))
    : short(value(c, k));
  const stops = (c: TradeChain) => [c.legs[0].src, ...c.legs.map((l) => l.dst)];
</script>

<div class="scroll">
  <table>
    <thead>
      <tr>
        <th>Paradas</th>
        {#each COLS as [k, label] (k)}
          <th class="r">
            <button class="sort" class:on={sortKey === k} title={TITLES[k]} onclick={() => sortBy(k)}>
              {label}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}
            </button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sorted as c (c.id)}
        {@const age = value(c, 'age')}
        <tr class:sel={selected === c.id} class={ageTone(age)} onclick={() => (selected = c.id)}>
          <td class="route">
            <div title={stops(c).map((e) => `${e.station} (${e.system})`).join(' → ')}>
              {#each stops(c) as e, k (k)}{#if k}<span class="arrow">&nbsp;→&nbsp;</span>{/if}<span class="st">{e.station}</span>{/each}
            </div>
            <div class="dim" title={c.legs.map((l) => l.leg.commodity).join(' → ')}>
              {#each c.legs as l, k (k)}{#if k}<span class="sep">&nbsp;·&nbsp;</span>{/if}{l.leg.commodity}{#if (l.leg.items?.length ?? 1) > 1}<span class="plus">+{l.leg.items.length - 1}</span>{/if}{/each}
            </div>
          </td>
          {#each COLS as [k] (k)}
            <td class="r num {k}" class:hl={sortKey === k}>{cell(c, k)}</td>
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
    border-bottom: 1px solid var(--hud); white-space: nowrap;
  }
  th:nth-child(1) { width: 52%; }
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
  .plus { margin-left: 2px; color: var(--telemetry); font-size: 10px; }
  .sep { color: var(--faint); }
  .hl { color: var(--telemetry); }
  tr.fresh td.age { color: var(--ok); }
  tr.stale td { opacity: 0.55; }
</style>
