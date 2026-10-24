<script lang="ts">
  import { keyFor, link, sendCommand } from './link.svelte.ts';

  // Vertical throttle lever: forward detents on top, zero in the middle, reverse below.
  // The game does not report throttle position, so the lit detent is the last one we set.
  const DETENTS = [
    { pct: 100, cmd: 'SetSpeed100' },
    { pct: 75, cmd: 'SetSpeed75' },
    { pct: 50, cmd: 'SetSpeed50' },
    { pct: 25, cmd: 'SetSpeed25' },
    { pct: 0, cmd: 'SetSpeedZero' },
    { pct: -25, cmd: 'SetSpeedMinus25' },
    { pct: -50, cmd: 'SetSpeedMinus50' },
    { pct: -100, cmd: 'SetSpeedMinus100' },
  ];

  const set = $derived(DETENTS.find((d) => d.cmd === link.throttleCmd)?.pct ?? null);
</script>

<div class="throttle">
  <div class="scale" aria-hidden="true">
    <span class="fwd">FWD</span>
    <span class="rev">REV</span>
  </div>

  <div class="detents">
    {#each DETENTS as d (d.cmd)}
      {@const key = keyFor(d.cmd)}
      <button class="detent" class:rev={d.pct < 0} class:zero={d.pct === 0} class:set={set === d.pct}
        disabled={!key} title={key ?? 'no bind'} onclick={() => sendCommand(d.cmd)}>
        <span class="tick"></span>
        <span class="pct num">{d.pct > 0 ? d.pct : d.pct === 0 ? 'ZERO' : d.pct}</span>
        <span class="key">{key ?? '—'}</span>
      </button>
    {/each}
  </div>

  <button class="boost" disabled={!keyFor('UseBoostJuice')} onclick={() => sendCommand('UseBoostJuice')}
    title={keyFor('UseBoostJuice') ?? 'no bind'}>
    <span class="chev" aria-hidden="true">›››</span>
    <span class="word">BOOST</span>
    <span class="key">{keyFor('UseBoostJuice') ?? 'no bind'}</span>
  </button>
</div>

<style>
  .throttle {
    display: grid;
    grid-template-columns: 22px 1fr;
    grid-template-rows: 1fr auto;
    gap: 6px;
    height: 100%;
    min-height: 0;
  }

  /* zone rail: orange forward, red reverse, split at the zero detent */
  .scale {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    background: linear-gradient(to bottom, rgb(255 122 24 / 0.22) 0 56%, rgb(209 72 58 / 0.25) 56% 100%);
    border: 1px solid var(--rule);
  }
  .scale span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
  }
  .fwd { color: var(--hud); }
  .rev { color: var(--danger); }

  .detents {
    display: grid;
    grid-template-rows: repeat(4, 1fr) 1.25fr repeat(3, 1fr);
    gap: 3px;
    min-height: 0;
  }
  .detent {
    position: relative;
    display: grid;
    grid-template-columns: 14px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 6px;
    min-height: 34px;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--text);
  }
  .detent:active:not(:disabled) { background: var(--rule); }
  .detent:disabled { opacity: 0.35; cursor: not-allowed; }
  .tick { height: 2px; background: var(--hud); }
  .rev .tick { background: var(--danger); }
  .pct { font-size: 17px; font-weight: 700; text-align: left; }
  .rev .pct { color: var(--danger); }
  .key { font-size: 10px; color: var(--dim); }

  .zero {
    background: var(--rail);
    border-color: var(--hud-hi);
  }
  .zero .pct { color: var(--hud-hi); letter-spacing: 0.15em; }
  .zero .tick { height: 4px; background: var(--hud-hi); }

  /* last commanded detent: the lever sits here */
  .set {
    background: var(--hud);
    border-color: var(--hud);
    box-shadow: var(--glow);
  }
  .set .pct, .set .key { color: var(--void); }
  .set .tick { background: var(--void); }
  .set.rev { background: var(--danger); border-color: var(--danger); }

  .boost {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    min-height: 72px;
    padding: 0 14px;
    background: linear-gradient(to right, #ff8c33, var(--hud));
    border: 0;
    color: var(--void);
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.22em;
    clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
    box-shadow: var(--glow);
  }
  .boost .chev { font-size: 26px; line-height: 1; }
  .boost .key { color: rgb(11 7 5 / 0.65); font-size: 11px; letter-spacing: 0.02em; }
  .boost:active:not(:disabled) { filter: brightness(1.25); }
  .boost:active:not(:disabled) .chev { animation: surge 0.25s linear infinite; }
  .boost:disabled { opacity: 0.35; cursor: not-allowed; }
  @keyframes surge { 50% { transform: translateX(4px); } }
</style>
