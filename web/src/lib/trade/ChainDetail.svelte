<script lang="ts">
  import type { TradeChain, TradeEnd } from '@et/shared';
  import LoadList from './LoadList.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';

  // The selected linear route as a checklist: at each stop sell everything, then buy the listed load.
  let { chain }: { chain: TradeChain | null } = $props();
  const letter = (k: number) => String.fromCharCode(65 + k);
</script>

{#snippet stop(e: TradeEnd, k: number, what: string)}
  <div class="stop">
    <span class="badge">{letter(k)}</span>
    <div class="info">
      <div class="name" title={e.station}>{e.station} <span class="role">{what}</span></div>
      <div class="meta">
        <span class="sys">{e.system}</span>
        <span>{cr(e.ls)}ls</span>
        <span>PAD {e.pad}</span>
        <span class={ageTone(e.ageH)}>{ageLabel(e.ageH)}</span>
        {#if e.state && e.state !== 'None'}<span class="state">{e.state.toUpperCase()}</span>{/if}
      </div>
    </div>
  </div>
{/snippet}

{#if chain}
  <div class="detail">
    <div class="totals">
      <span class="ok">+{short(chain.total)}Cr</span>
      <span class="tele">{short(chain.perHour)}Cr/h</span>
      <span class="dim">≈{duration(chain.seconds)} · {chain.legs.length + 1} paradas</span>
    </div>
    {#each chain.legs as l, k (k)}
      {@render stop(l.src, k, k ? 'VENDER TUDO · COMPRAR' : 'COMPRAR')}
      <LoadList leg={l.leg} title="{letter(k)}→{letter(k + 1)}" />
      <div class="hop dim">▼ {l.hopLy.toFixed(1)}ly · {l.jumps} {l.jumps === 1 ? 'salto' : 'saltos'} · ≈{duration(l.legSeconds)}</div>
    {/each}
    {@render stop(chain.legs[chain.legs.length - 1].dst, chain.legs.length, 'VENDER TUDO · FIM')}
    <div class="dim sub">⌖ {chain.legs[0].src.fromMe.toFixed(1)}ly até A</div>
  </div>
{:else}
  <p class="dim">Selecione uma rota na tabela.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 5px; }
  .totals { display: flex; gap: 10px; align-items: baseline; font-weight: 700; white-space: nowrap; }
  .totals .dim { font-size: 10px; font-weight: 400; margin-left: auto; }
  .stop { display: grid; grid-template-columns: 22px 1fr; gap: 6px; align-items: center; }
  .badge {
    display: grid; place-items: center; height: 22px; background: var(--hud); color: var(--void); font-weight: 800;
    clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px);
  }
  .info { min-width: 0; }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .role { color: var(--hud-hi); font-size: 9px; letter-spacing: 0.1em; }
  .meta { display: flex; gap: 7px; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; }
  .sys { color: var(--telemetry); overflow: hidden; text-overflow: ellipsis; }
  .fresh { color: var(--ok); }
  .ok { color: var(--ok); }
  .stale { color: var(--danger); }
  .state { color: var(--telemetry); font-weight: 700; }
  .hop { font-size: 10px; text-align: center; }
  .sub { font-size: 10px; }
</style>
