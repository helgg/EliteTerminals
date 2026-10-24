<script lang="ts">
  import type { LegItem, TradeEnd, TradeRoute } from '@et/shared';
  import Hologram from '../Hologram.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected trade, cockpit style: both stations as holograms, the load to buy, what it pays.
  let { route }: { route: TradeRoute | null } = $props();

  // Results from before mixed loads carried a single commodity on the leg itself.
  const load = $derived<LegItem[]>(route ? (route.leg.items ?? [route.leg as unknown as LegItem]) : []);
  const cost = $derived(route ? (route.leg.cost ?? load.reduce((t, i) => t + i.buy * i.amount, 0)) : 0);
</script>

{#snippet station(e: TradeEnd, role: string)}
  <div class="end">
    <div class="holo"><Hologram target={{ kind: 'station', stationType: e.type }} /></div>
    <div class="info">
      <div class="role">{role}</div>
      <div class="name" title={e.station}>{e.station}</div>
      <div class="sys" title={e.system}>{e.system}</div>
      <div class="meta">
        <span>{cr(e.ls)}ls</span>
        <span>PAD {e.pad}</span>
        <span class={ageTone(e.ageH)}>{ageLabel(e.ageH)}</span>
      </div>
    </div>
  </div>
{/snippet}

{#if route}
  <div class="detail">
    {@render station(route.src, 'COMPRAR EM')}
    <div class="leg">
      {#each load as i (i.commodity)}
        <div class="item">
          <div class="line">
            <span class="amt num">{cr(i.amount)}t</span>
            <span class="cargo" title={i.commodity}>{i.commodity}</span>
            <span class="gain num">+{short(i.profit * i.amount)}</span>
          </div>
          <div class="line dim sub">
            <span class="num">{cr(i.buy)}→{cr(i.sell)}Cr</span>
            <span class="num">of {short(i.supply)}t · dem {short(i.demand)}t</span>
          </div>
        </div>
      {/each}
      <div class="profit">+{cr(route.leg.total)}Cr <span class="dim">{cr(route.leg.profit)}/t · {route.pct.toFixed(0)}%</span></div>
      <div class="dim sub">{cr(route.leg.amount)}t · custo {cr(cost)}Cr</div>
    </div>
    {@render station(route.dst, 'VENDER EM')}

    <dl class="facts">
      <dt>SALTO</dt><dd>{route.hopLy.toFixed(1)}ly · {route.jumps} {route.jumps === 1 ? 'salto' : 'saltos'}</dd>
      <dt>TEMPO</dt><dd>≈{duration(route.legSeconds)} por perna</dd>
      <dt>CR/H</dt><dd class="tele">{short(route.perHour)}</dd>
      {#if route.back}
        <dt>VOLTA</dt>
        <dd title={(route.back.items ?? []).map((i) => `${i.amount}t ${i.commodity}`).join(' + ')}>
          {route.back.commodity}{#if (route.back.items?.length ?? 1) > 1} +{route.back.items.length - 1}{/if}
          <span class="dim">+{short(route.back.total)}</span>
        </dd>
        <dt>LOOP/H</dt><dd class="tele">{short(route.loopPerHour)}</dd>
      {/if}
      <dt>⌖ORIGEM</dt><dd>{route.src.fromMe.toFixed(1)}ly</dd>
    </dl>
  </div>
{:else}
  <p class="dim">Selecione uma rota na tabela.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 6px; }
  .end { display: grid; grid-template-columns: 72px 1fr; gap: 8px; align-items: center; }
  .holo :global(.holo) { max-width: 72px; }
  .info { min-width: 0; }
  .role { color: var(--hud-hi); font-size: 10px; font-weight: 700; letter-spacing: 0.15em; }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sys { color: var(--telemetry); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 8px; font-size: 10px; color: var(--muted); }
  .fresh { color: var(--ok); }
  .ok { color: var(--hud-hi); }
  .stale { color: var(--danger); }
  .leg {
    display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; border: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgb(255 122 24 / 0.08), transparent), var(--rail);
  }
  .item { padding-bottom: 3px; border-bottom: 1px solid var(--rule); }
  .line { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; }
  .line > :last-child { margin-left: auto; }
  .amt { color: var(--text); font-weight: 700; }
  .cargo { color: var(--hud); font-weight: 700; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .gain { color: var(--ok); }
  .sub { font-size: 10px; }
  .profit { color: var(--ok); font-weight: 700; text-align: center; margin-top: 2px; }
  .leg > .sub { text-align: center; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 4px 0 0; font-size: 12px; }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
