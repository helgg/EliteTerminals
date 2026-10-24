<script lang="ts">
  import type { TradeEnd, TradeRoute } from '@et/shared';
  import Hologram from '../Hologram.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected trade, cockpit style: both stations as holograms, what to carry, what it pays.
  let { route }: { route: TradeRoute | null } = $props();
</script>

{#snippet station(e: TradeEnd, role: string)}
  <div class="end">
    <div class="holo"><Hologram target={{ kind: 'station', stationType: e.type }} /></div>
    <div class="info">
      <div class="role">{role}</div>
      <div class="name" title={e.station}>{e.station}</div>
      <div class="sys" title={e.system}>{e.system}</div>
      <div class="meta">
        <span>{Math.round(e.ls).toLocaleString('pt-BR')} ls</span>
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
      <div class="cargo">{route.leg.commodity}</div>
      <div class="nums">
        <span class="dim">{cr(route.leg.amount)} t × </span>{cr(route.leg.buy)} → {cr(route.leg.sell)}
      </div>
      <div class="profit">+{cr(route.leg.total)} Cr <span class="dim">({cr(route.leg.profit)}/t · {route.pct.toFixed(0)}%)</span></div>
    </div>
    {@render station(route.dst, 'VENDER EM')}

    <dl class="facts">
      <dt>SALTO</dt><dd>{route.hopLy.toFixed(1)} ly · {route.jumps} {route.jumps === 1 ? 'salto' : 'saltos'}</dd>
      <dt>TEMPO</dt><dd>≈ {duration(route.legSeconds)} por perna</dd>
      <dt>CR/H</dt><dd class="tele">{short(route.perHour)}</dd>
      <dt>ESTOQUE</dt><dd>{cr(route.leg.supply)} <span class="dim">· demanda {cr(route.leg.demand)}</span></dd>
      {#if route.back}
        <dt>VOLTA</dt>
        <dd>{route.back.commodity} <span class="dim">+{short(route.back.total)}</span></dd>
        <dt>LOOP/H</dt><dd class="tele">{short(route.loopPerHour)}</dd>
      {/if}
      <dt>DE MIM</dt><dd>{route.src.fromMe.toFixed(1)} ly até a origem</dd>
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
    padding: 6px 8px; text-align: center; border: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgb(255 122 24 / 0.08), transparent), var(--rail);
  }
  .cargo { color: var(--hud); font-weight: 700; font-size: 15px; letter-spacing: 0.04em; }
  .nums { font-size: 12px; }
  .profit { color: var(--ok); font-weight: 700; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 4px 0 0; font-size: 12px; }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
