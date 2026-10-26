<script lang="ts">
  import type { TradeChain } from '@et/shared';
  import Name from '../Name.svelte';
  import { ageLabel, ageTone, duration, short } from '../format.ts';

  // Sortable list of linear routes (A→B→C…, no return); the selected row drives the detail panel.
  // `compact`: one card per route (narrow screens), sorting by a row of chips.
  let { chains, selected = $bindable(), compact = false, onpick }:
    { chains: TradeChain[]; selected: string; compact?: boolean; onpick?: () => void } = $props();
  function pick(id: string) {
    selected = id;
    onpick?.();
  }

  type Key = 'perHour' | 'total' | 'seconds' | 'ly' | 'fromMe' | 'age';
  const ASC: Key[] = ['seconds', 'ly', 'fromMe', 'age'];
  const TITLES: Record<Key, string> = {
    perHour: 'Profit per hour over the whole route',
    total: 'Profit of all legs added up',
    seconds: 'Estimated time for the whole route',
    ly: 'Total distance flown, in ly',
    fromMe: 'Distance from you to the first stop, in ly',
    age: 'Oldest price among the stops',
  };
  const COLS: [Key, string][] = [['perHour', 'Cr/h'], ['total', 'Total'], ['seconds', 'Time'], ['ly', 'Ly'], ['fromMe', '⌖Ly'], ['age', 'Age']];

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

{#if compact}
  <div class="sortbar" role="group" aria-label="Sort routes">
    <span class="k">SORT</span>
    {#each COLS as [k, label] (k)}
      <button class:on={sortKey === k} title={TITLES[k]} onclick={() => sortBy(k)}>{label.toUpperCase()}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}</button>
    {/each}
  </div>
  <div class="scroll cards">
    {#each sorted as c (c.id)}
      {@const age = value(c, 'age')}
      <button class="card {ageTone(age)}" class:sel={selected === c.id} onclick={() => pick(c.id)}>
        <span class="stops">
          {#each stops(c) as e, k (k)}{#if k}<span class="arrow"> → </span>{/if}<span class="st"><Name value={e.station} stationType={e.type} icon /></span>{/each}
        </span>
        <span class="figs num">
          <b class:hl={sortKey === 'perHour'}>{cell(c, 'perHour')}/h</b>
          <span class:hl={sortKey === 'total'}>{cell(c, 'total')}</span>
        </span>
        <span class="goods dim">
          {#each c.legs as l, k (k)}{#if k}<span class="sep"> · </span>{/if}{l.leg.commodity}{#if (l.leg.items?.length ?? 1) > 1}<span class="plus">+{l.leg.items.length - 1}</span>{/if}{/each}
        </span>
        <span class="meta num">
          <span class:hl={sortKey === 'seconds'}>{cell(c, 'seconds')}</span>
          <span><span class:hl={sortKey === 'ly'}>{cell(c, 'ly')}ly</span> · <span class:hl={sortKey === 'fromMe'}>⌖{cell(c, 'fromMe')}</span></span>
          <span class="age" class:hl={sortKey === 'age'}>{cell(c, 'age')}</span>
        </span>
      </button>
    {/each}
  </div>
{:else}
<div class="scroll">
  <table>
    <thead>
      <tr>
        <th>Stops</th>
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
              {#each stops(c) as e, k (k)}{#if k}<span class="arrow">&nbsp;→&nbsp;</span>{/if}<span class="st"><Name value={e.station} stationType={e.type} icon /></span>{/each}
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
{/if}

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

  /* compact: cards, nothing cut; names wrap */
  .sortbar { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-bottom: 4px; }
  .sortbar .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; margin-right: 2px; }
  .sortbar button {
    padding: 6px 8px; background: var(--steel); border: 1px solid var(--rule); color: var(--muted);
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  }
  .sortbar button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .cards { display: flex; flex-direction: column; gap: 4px; }
  .scroll.cards { height: auto; flex: 1; min-height: 0; }
  /* with room a card reads across: stops · goods · money · time and distance */
  .cards { container-type: inline-size; }
  @container (min-width: 560px) {
    .card { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto auto; gap: 2px 14px; }
    .card .stops { grid-area: 1 / 1; }
    .card .goods { grid-area: 1 / 2; }
    .card .figs { grid-area: 1 / 3; }
    .card .meta { grid-area: 1 / 4; min-width: 46px; }
  }
  .card :global(.name .text) { white-space: normal; overflow-wrap: anywhere; }
  .card {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 10px; width: 100%; padding: 6px 8px;
    text-align: left; font-size: 12px; color: var(--text); background: rgb(36 26 16 / 0.6); border: 1px solid var(--rule);
  }
  .card.sel { background: rgb(255 122 24 / 0.14); border-color: var(--hud); box-shadow: inset 2px 0 var(--hud); }
  .card.stale { opacity: 0.55; }
  .card .figs, .card .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .card .figs b { color: var(--ok); font-size: 13px; }
  .card .meta { color: var(--muted); }
  .card.fresh .age { color: var(--ok); }
  .card.ok .age { color: var(--hud-hi); }
  .card .hl { color: var(--telemetry); }
  .card .stops, .card .goods { min-width: 0; overflow-wrap: anywhere; line-height: 1.35; }
</style>
