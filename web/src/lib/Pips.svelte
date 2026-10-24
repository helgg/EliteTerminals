<script lang="ts">
  import { sendCommand } from './link.svelte.ts';

  // Values are half-pips (0..8): the game moves power in half-pip steps.
  let { sys, eng, wep }: { sys: number; eng: number; wep: number } = $props();

  const channels = $derived([
    { key: 'SYS', value: sys, cmd: 'IncreaseSystemsPower' },
    { key: 'ENG', value: eng, cmd: 'IncreaseEnginesPower' },
    { key: 'WEP', value: wep, cmd: 'IncreaseWeaponsPower' },
  ]);
</script>

<div class="pips">
  {#each channels as ch (ch.key)}
    <button class="channel" onclick={() => sendCommand(ch.cmd)} title="+ {ch.key}">
      <svg viewBox="0 0 24 88" aria-hidden="true">
        {#each Array(8) as _, i}
          <!-- bottom-up; a full pip is two halves -->
          <rect x="2" y={78 - i * 10.5} width="20" height="8.5"
            class:on={i < ch.value} class:half={i % 2 === 0} />
        {/each}
      </svg>
      <span class="label">{ch.key}</span>
      <span class="num muted">{(ch.value / 2).toFixed(1)}</span>
    </button>
  {/each}
  <button class="reset chamfer" onclick={() => sendCommand('ResetPowerDistribution')}>RESET</button>
</div>

<style>
  .pips {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .channel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 0;
    background: var(--rail);
    border: 1px solid var(--rule);
  }
  .channel:active { border-color: var(--hud); }
  svg { width: 34px; height: 110px; }
  rect { fill: var(--steel); stroke: var(--rule); stroke-width: 0.6; }
  rect.on { fill: var(--telemetry); stroke: none; filter: drop-shadow(0 0 2px rgb(55 198 212 / 0.6)); }
  rect.on.half { opacity: 0.75; }
  .reset {
    grid-column: 1 / -1;
    padding: 6px;
    background: var(--hud);
    color: var(--void);
    font-weight: 700;
    letter-spacing: 0.1em;
    border: 0;
  }
</style>
