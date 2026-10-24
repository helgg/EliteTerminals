<script lang="ts">
  import type { TradeEnd, TradeRoute } from '@et/shared';
  import Hologram from '../Hologram.svelte';
  import LoadList from './LoadList.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected loop, cockpit style: buy at A, sell at B, buy the way-back load at B, sell it at A.
  let { route }: { route: TradeRoute | null } = $props();
</script>

{#snippet station(e: TradeEnd, step: string)}
  <div class="end">
    <div class="holo"><Hologram target={{ kind: 'station', stationType: e.type }} /></div>
    <div class="info">
      <div class="role">{step}</div>
      <div class="name" title={e.station}>{e.station}</div>
      <div class="sys" title={e.system}>{e.system}</div>
      <div class="meta">
        <span>{cr(e.ls)}ls</span>
        <span>PAD {e.pad}</span>
        <span class={ageTone(e.ageH)}>{ageLabel(e.ageH)}</span>
        {#if e.state && e.state !== 'None'}<span class="state">{e.state.toUpperCase()}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

{#if route}
  <div class="detail">
    {@render station(route.src, 'A · COMPRAR')}
    <LoadList leg={route.leg} title="IDA A→B" />
    <div class="hop dim">▼ {route.hopLy.toFixed(1)}ly · {route.jumps} {route.jumps === 1 ? 'salto' : 'saltos'} · ≈{duration(route.legSeconds)}</div>
    {@render station(route.dst, 'B · VENDER TUDO E COMPRAR')}
    <LoadList leg={route.back} title="VOLTA B→A" />
    <div class="hop dim">▲ volta para A e vende tudo</div>

    <dl class="facts">
      <dt>LOOP/H</dt><dd class="tele">{short(route.loopPerHour)}Cr</dd>
      <dt>LOOP</dt><dd>+{short(route.leg.total + (route.back?.total ?? 0))}Cr por volta</dd>
      <dt>SÓ IDA</dt><dd>{short(route.perHour)}Cr/h · {route.pct.toFixed(0)}%</dd>
      <dt>⌖ORIGEM</dt><dd>{route.src.fromMe.toFixed(1)}ly até A</dd>
    </dl>
  </div>
{:else}
  <p class="dim">Selecione uma rota na tabela.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 5px; }
  .end { display: grid; grid-template-columns: 56px 1fr; gap: 8px; align-items: center; }
  .holo :global(.holo) { max-width: 56px; }
  .info { min-width: 0; }
  .role { color: var(--hud-hi); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sys { color: var(--telemetry); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 8px; font-size: 10px; color: var(--muted); }
  .fresh { color: var(--ok); }
  .ok { color: var(--hud-hi); }
  .stale { color: var(--danger); }
  .state { color: var(--telemetry); font-weight: 700; }
  .hop { font-size: 10px; text-align: center; letter-spacing: 0.05em; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 2px 0 0; font-size: 12px; }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
