<script lang="ts">
  import type { TradeLeg, TradeRoute } from '@et/shared';
  import Name from '../Name.svelte';
  import Level from '../Level.svelte';
  import { ageLabel, ageTone, cr, short } from '../format.ts';

  // Sortable list of loop trades (A→B, then back B→A); the selected row drives the detail panel.
  // Every figure covers the whole loop (out + back); supply and demand show both loads, one line each,
  // lined up with the cargo lines.
  let { routes, selected = $bindable() }: { routes: TradeRoute[]; selected: string } = $props();

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
    { top: ['profit', 'Cr/t'], bottom: ['pct', '%'] },
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
</style>
