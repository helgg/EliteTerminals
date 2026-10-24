<script lang="ts">
  import type { LegItem, TradeLeg } from '@et/shared';
  import Level from '../Level.svelte';
  import { cr, short } from '../format.ts';

  // What to buy at one station, line by line: the shopping list for the commodities market.
  let { leg, title }: { leg: TradeLeg | null; title: string } = $props();

  // Results from before mixed loads carried a single commodity on the leg itself.
  const items = $derived<LegItem[]>(leg ? (leg.items ?? [leg as unknown as LegItem]) : []);
  const cost = $derived(leg ? (leg.cost ?? items.reduce((t, i) => t + i.buy * i.amount, 0)) : 0);
</script>

<div class="load">
  <div class="head">
    <span class="title">{title}</span>
    {#if items.length > 1}<span class="mix">MIXED LOAD · {items.length}</span>{/if}
  </div>
  {#if leg}
    {#each items as i (i.commodity)}
      <div class="item">
        <div class="line">
          <span class="amt num">{cr(i.amount)}t</span>
          <span class="cargo" title={i.commodity}>{i.commodity}</span>
          <span class="gain num">+{short(i.profit * i.amount)}</span>
        </div>
        <div class="line dim sub">
          <span class="num">{cr(i.buy)}→{cr(i.sell)}Cr</span>
          <span class="num vol">SUP <Level level={i.supplyLevel ?? 0} exact={i.supplyExact} />{short(i.supply)}t
            · DEM <Level level={i.demandLevel ?? 0} exact={i.demandExact} />{short(i.demand)}t</span>
        </div>
      </div>
    {/each}
    <div class="sum">
      <span class="ok">+{cr(leg.total)}Cr</span>
      <span class="dim">{cr(leg.amount)}t · cost {short(cost)}Cr</span>
    </div>
  {:else}
    <div class="dim sub">nothing profitable · fly empty</div>
  {/if}
</div>

<style>
  .load {
    display: flex; flex-direction: column; gap: 3px; padding: 5px 8px; border: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgb(255 122 24 / 0.08), transparent), var(--rail);
  }
  .head { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  .title { color: var(--hud-hi); }
  .mix { color: var(--telemetry); }
  .item { padding-bottom: 3px; border-bottom: 1px solid var(--rule); }
  .line { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; }
  .line > :last-child { margin-left: auto; }
  .amt { color: var(--text); font-weight: 700; }
  .cargo { color: var(--hud); font-weight: 700; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .gain { color: var(--ok); }
  .sub { font-size: 10px; }
  .vol { display: inline-flex; gap: 3px; align-items: baseline; }
  .sum { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .sum .dim { font-size: 10px; font-weight: 400; align-self: center; }
</style>
