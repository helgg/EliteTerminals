<script lang="ts">
  import type { TradeLeg, TradeRoute } from '@et/shared';
  import Name from '../Name.svelte';
  import Level from '../Level.svelte';
  import { ageLabel, ageTone, cr, short } from '../format.ts';

  // Sortable list of loop trades (A→B, then back B→A); the selected row drives the detail panel.
  // Every figure covers the whole loop (out + back); supply and demand show both loads, one line each,
  // lined up with the cargo lines.
  // `compact`: one card per route (narrow screens), sorting by a row of chips instead of column headers.
  let { routes, selected = $bindable(), compact = false, onpick }:
    { routes: TradeRoute[]; selected: string; compact?: boolean; onpick?: () => void } = $props();
  const CHIPS: [Key, string][] = [['loopPerHour', 'CR/H'], ['total', 'TOTAL'], ['profit', 'CR/T'], ['pct', '%'], ['hopLy', 'LY'], ['fromMe', '⌖LY'], ['age', 'AGE']];
  function pick(id: string) {
    selected = id;
    onpick?.();
  }

  type Key = 'profit' | 'pct' | 'total' | 'loopPerHour' | 'hopLy' | 'fromMe' | 'supply' | 'demand' | 'age';
  const ASC: Key[] = ['hopLy', 'fromMe', 'age'];
  // "98t Silver + 2t Gold": exactly what to buy, so a mixed load reads as one at a glance.
  const load = (leg: TradeLeg) => (leg.items ?? [leg]).map((i) => `${cr(i.amount)}t ${i.commodity}`).join(' + ');
  const tag = (state: string) => (state && state !== 'None' ? state.toUpperCase() : '');
  const TITLES: Record<Key, string> = {
    profit: 'Average profit per ton over the loop (out + back)',
    pct: 'Loop profit over what both loads cost',
    total: 'Profit of one loop: out A→B plus back B→A, each a full hold of the best commodity mix',
    loopPerHour: 'Estimated profit per hour running the loop',
    hopLy: 'Distance A→B, in ly',
    fromMe: 'Distance from you to the start (A), in ly',
    supply: 'Supply of the main commodity where it is bought: ▸ at A, ◂ at B',
    demand: 'Demand for the main commodity where it is sold: ▸ at B, ◂ at A',
    age: 'Oldest price of the two markets',
  };
  const GROUPS: { top: [Key, string]; bottom?: [Key, string] }[] = [
    { top: ['profit', 'Loop Cr/t'], bottom: ['pct', 'Loop %'] },
    { top: ['total', 'Total'] },
    { top: ['loopPerHour', 'Cr/h'] },
    { top: ['hopLy', 'Ly'], bottom: ['fromMe', '⌖Ly'] },
  ];

  let sortKey = $state<Key>(readSort());
  let sortDesc = $state(!ASC.includes(readSort()));

  function readSort(): Key {
    try {
      const k = localStorage.getItem('et.trade.sort') as Key | null;
      if (k && k in TITLES) return k;
    } catch {}
    return 'loopPerHour';
  }

  const loopTotal = (r: TradeRoute) => r.leg.total + (r.back?.total ?? 0);
  const main = (leg: TradeLeg | null) => leg?.items?.[0] ?? null;
  // Sorting by supply/demand favours loops where both loads are plentiful: the weaker side counts.
  const weakest = (r: TradeRoute, side: 'supply' | 'demand') =>
    Math.min(r.leg[side], r.back ? r.back[side] : r.leg[side]);

  const value = (r: TradeRoute, k: Key): number =>
    k === 'profit' ? loopTotal(r) / (r.leg.amount + (r.back?.amount ?? 0))
    : k === 'pct' ? (loopTotal(r) / (r.leg.cost + (r.back?.cost ?? 0))) * 100
    : k === 'total' ? loopTotal(r)
    : k === 'fromMe' ? r.src.fromMe
    : k === 'supply' || k === 'demand' ? weakest(r, k)
    : k === 'age' ? Math.max(r.src.ageH, r.dst.ageH)
    : r[k];

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
    k === 'pct' ? `${value(r, k).toFixed(0)}%`
    : k === 'hopLy' || k === 'fromMe' ? value(r, k).toFixed(1)
    : k === 'age' ? ageLabel(value(r, k))
    : k === 'loopPerHour' && !r.loopPerHour ? '—'
    : short(value(r, k));
</script>

{#snippet head(k: Key, label: string)}
  <button class="sort" class:on={sortKey === k} title={TITLES[k]} onclick={() => sortBy(k)}>
    {label}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}
  </button>
{/snippet}

{#snippet volume(leg: TradeLeg | null, side: 'supply' | 'demand')}
  {@const i = main(leg)}
  {#if i}
    <Level level={side === 'supply' ? i.supplyLevel : i.demandLevel}
      exact={side === 'supply' ? i.supplyExact : i.demandExact} />
    {short(side === 'supply' ? i.supply : i.demand)}
  {:else}—{/if}
{/snippet}

{#if compact}
  <div class="sortbar" role="group" aria-label="Sort routes">
    <span class="k">SORT</span>
    {#each CHIPS as [k, label] (k)}
      <button class:on={sortKey === k} title={TITLES[k]} onclick={() => sortBy(k)}>{label}{sortKey === k ? (sortDesc ? '▾' : '▴') : ''}</button>
    {/each}
  </div>
  <div class="scroll cards">
    {#each sorted as r (r.id)}
      {@const age = Math.max(r.src.ageH, r.dst.ageH)}
      <button class="card {ageTone(age)}" class:sel={selected === r.id} onclick={() => pick(r.id)}>
        <span class="ends">
          {#each [r.src, r.dst] as e, k (k)}
            <span class="end">
              <span class="arrow">{k ? 'B' : 'A'}</span>
              <span class="st"><Name value={e.station} stationType={e.type} icon /></span>
              <span class="sys"><Name value={e.system} system /></span>
              {#if tag(e.state)}<span class="state">{tag(e.state)}</span>{/if}
            </span>
          {/each}
        </span>
        <span class="figs num">
          <b class:hl={sortKey === 'loopPerHour'}>{cell(r, 'loopPerHour')}/h</b>
          <span class:hl={sortKey === 'total'}>{cell(r, 'total')}</span>
          <span class="sub"><span class:hl={sortKey === 'profit'}>{cell(r, 'profit')}/t</span> · <span class:hl={sortKey === 'pct'}>{cell(r, 'pct')}</span></span>
        </span>
        <span class="loads">
          <span class="out"><span class="arrow">▸</span> {load(r.leg)}</span>
          <span class="back"><span class="arrow">◂</span> {r.back ? load(r.back) : 'empty way back'}</span>
        </span>
        <span class="meta num">
          <span class:hl={sortKey === 'hopLy'}>{cell(r, 'hopLy')}ly</span>
          <span class:hl={sortKey === 'fromMe'}>⌖{cell(r, 'fromMe')}</span>
          <span class="age" class:hl={sortKey === 'age'}>{ageLabel(age)}</span>
        </span>
      </button>
    {/each}
  </div>
{:else}
<div class="scroll">
  <table>
    <thead>
      <tr>
        <th>Route</th>
        <th>Cargo</th>
        {#each GROUPS as g (g.top[0])}
          <th class="r">
            {@render head(g.top[0], g.top[1])}
            {#if g.bottom}<br />{@render head(g.bottom[0], g.bottom[1])}{/if}
          </th>
        {/each}
        <th class="r">{@render head('supply', 'Supply')}</th>
        <th class="r">{@render head('demand', 'Demand')}</th>
        <th class="r">{@render head('age', 'Age')}</th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as r (r.id)}
        {@const age = Math.max(r.src.ageH, r.dst.ageH)}
        <tr class:sel={selected === r.id} class={ageTone(age)} onclick={() => (selected = r.id)}>
          <td class="route">
            {#each [r.src, r.dst] as e, k (k)}
              <div class="end">
                <span class="arrow">{k ? 'B' : 'A'}</span>
                <span class="st"><Name value={e.station} stationType={e.type} icon /></span>
                <span class="sys"><Name value={e.system} system /></span>
                {#if tag(e.state)}<span class="state">{tag(e.state)}</span>{/if}
              </div>
            {/each}
          </td>
          <td class="cargo">
            <div title={load(r.leg)}><span class="arrow">▸</span> {load(r.leg)}</div>
            <div class="back" title={r.back ? load(r.back) : ''}><span class="arrow">◂</span> {r.back ? load(r.back) : 'empty way back'}</div>
          </td>
          {#each GROUPS as g (g.top[0])}
            <td class="r num {g.top[0]}">
              <div class:hl={sortKey === g.top[0]}>{cell(r, g.top[0])}</div>
              {#if g.bottom}<div class="sub" class:hl={sortKey === g.bottom[0]}>{cell(r, g.bottom[0])}</div>{/if}
            </td>
          {/each}
          {#each ['supply', 'demand'] as const as side (side)}
            <td class="r num vol" class:hl={sortKey === side}>
              <div>{@render volume(r.leg, side)}</div>
              <div class="sub">{@render volume(r.back, side)}</div>
            </td>
          {/each}
          <td class="r num age"><div class:hl={sortKey === 'age'}>{ageLabel(age)}</div></td>
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
    border-bottom: 1px solid var(--hud); white-space: nowrap; vertical-align: bottom;
  }
  th:nth-child(1) { width: 31%; }
  th:nth-child(2) { width: 22%; }
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
  .end { display: flex; gap: 5px; align-items: baseline; min-width: 0; }
  .end > * { flex: none; }
  .st { color: var(--text); flex: 0 1 auto; min-width: 0; overflow: hidden; }
  .sys { color: var(--dim); font-size: 11px; flex: 0 1 auto; min-width: 0; overflow: hidden; }
  .arrow { color: var(--hud); }
  .cargo div:first-child { color: var(--hud-hi); }
  .sub { color: var(--muted); }
  .vol div { display: flex; justify-content: flex-end; gap: 3px; align-items: baseline; }
  .state { color: var(--telemetry); font-size: 9px; font-weight: 700; letter-spacing: 0.06em; }
  .back { color: var(--muted); }
  .hl, .hl .sub, td.hl div { color: var(--telemetry); }
  /* price freshness: stale rows fade */
  tr.fresh .age div { color: var(--ok); }
  tr.ok .age div { color: var(--hud-hi); }
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
  /* with room (tablets, phones on their side) a card reads across: names · loads · money · distance */
  .cards { container-type: inline-size; }
  @container (min-width: 560px) {
    .card { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) auto auto; gap: 2px 14px; }
    .card .ends { grid-area: 1 / 1; }
    .card .loads { grid-area: 1 / 2; }
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
  .card .ends, .card .loads { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .card .end { display: flex; flex-wrap: wrap; gap: 0 5px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
  .card .end > * { flex: 0 1 auto; overflow: visible; }
  .card .loads { overflow-wrap: anywhere; }
  .card .out { color: var(--hud-hi); }
</style>
