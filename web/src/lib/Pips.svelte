<script lang="ts">
  import { keyFor, link, sendCommand } from './link.svelte.ts';

  // Power distributor for touch: each channel is one tall button (tap = +1 pip there), plus one-tap presets.
  // Values are half-pips (0..8): the game moves power in half-pip steps.
  let { sys, eng, wep }: { sys: number; eng: number; wep: number } = $props();

  const CMDS = ['IncreaseSystemsPower', 'IncreaseEnginesPower', 'IncreaseWeaponsPower'];
  const channels = $derived([
    { key: 'SYS', value: sys, cmd: CMDS[0] },
    { key: 'ENG', value: eng, cmd: CMDS[1] },
    { key: 'WEP', value: wep, cmd: CMDS[2] },
  ]);

  // Targets in half-pips (SYS, ENG, WEP); the label is in pips, the way players say it.
  const PRESETS: { label: string; target: [number, number, number] }[] = [
    { label: 'DEF', target: [8, 4, 0] },
    { label: 'RUN', target: [4, 8, 0] },
    { label: 'ATK', target: [4, 0, 8] },
  ];
  const pipsLabel = (t: number[]) => t.map((h) => h / 2).join('·');
  const isAt = (t: number[]) => t[0] === sys && t[1] === eng && t[2] === wep;
  const canPreset = $derived(CMDS.every((c) => keyFor(c)) && !!keyFor('ResetPowerDistribution'));

  // Presets are closed-loop: reset, then press the channel furthest below its target and wait for the
  // game to report the new pips, until they match (or stop moving: game closed, or out of reach).
  let running = $state('');
  async function apply(label: string, target: [number, number, number]) {
    if (running) return;
    running = label;
    try {
      sendCommand('ResetPowerDistribution');
      await settle(current());
      for (let n = 0; n < 10; n++) {
        const now = current();
        const gap = target.map((t, k) => t - now[k]);
        const k = gap.indexOf(Math.max(...gap));
        if (gap[k] <= 0) break;
        sendCommand(CMDS[k]);
        if (!(await settle(now))) break;
      }
    } finally {
      running = '';
    }
  }
  const current = () => [link.state.pips.sys, link.state.pips.eng, link.state.pips.wep];
  /** Resolves true once the pips differ from `before`, false after ~0.7s without change. */
  async function settle(before: number[]): Promise<boolean> {
    for (let t = 0; t < 14; t++) {
      await new Promise((r) => setTimeout(r, 50));
      if (current().some((v, k) => v !== before[k])) return true;
    }
    return false;
  }
</script>

<div class="power">
  <div class="channels">
    {#each channels as ch (ch.key)}
      <button class="channel" disabled={!keyFor(ch.cmd)} onclick={() => sendCommand(ch.cmd)}
        title={keyFor(ch.cmd) ? `+1 pip to ${ch.key} · ${keyFor(ch.cmd)}` : 'no bind'}>
        <span class="value num">{(ch.value / 2).toFixed(1)}</span>
        <span class="bar" aria-hidden="true">
          {#each Array(8) as _, i}
            <!-- bottom-up; a full pip is two halves -->
            <span class="cell" class:on={7 - i < ch.value} class:half={(7 - i) % 2 === 0}></span>
          {/each}
        </span>
        <span class="label">{ch.key}</span>
        <span class="plus">+</span>
      </button>
    {/each}
  </div>
  <div class="presets">
    {#each PRESETS as p (p.label)}
      <button class="preset chamfer" class:at={isAt(p.target)} class:busy={running === p.label}
        disabled={!canPreset || (!!running && running !== p.label)} onclick={() => apply(p.label, p.target)}
        title="SYS·ENG·WEP {pipsLabel(p.target)}">
        <b>{p.label}</b><span class="num">{pipsLabel(p.target)}</span>
      </button>
    {/each}
    <button class="reset chamfer" disabled={!keyFor('ResetPowerDistribution') || !!running}
      onclick={() => sendCommand('ResetPowerDistribution')} title={keyFor('ResetPowerDistribution') ?? 'no bind'}>
      <b>RESET</b><span class="num">2·2·2</span>
    </button>
  </div>
</div>

<style>
  /* fills its panel when the panel is given height; bars never shorter than --bar-min */
  .power { flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .channels { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; min-height: 0; }
  .channel {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 6px 8px 5px;
    background: linear-gradient(to bottom, var(--rail), var(--steel));
    border: 1px solid var(--rule);
  }
  .channel:active:not(:disabled) { border-color: var(--telemetry); background: var(--rule); transform: translateY(1px); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .value { color: var(--text); font-size: 15px; font-weight: 700; text-align: center; }
  .bar { flex: 1; display: flex; flex-direction: column; gap: 2px; min-height: var(--bar-min, 128px); }
  .cell { flex: 1; background: var(--steel); border: 1px solid var(--rule); }
  .cell.half { margin-bottom: 2px; }
  .cell.on { background: var(--telemetry); border-color: var(--telemetry); box-shadow: 0 0 6px rgb(55 198 212 / 0.55); }
  .cell.on:not(.half) { opacity: 0.8; }
  .label { color: var(--hud-hi); font-size: 12px; font-weight: 800; letter-spacing: 0.15em; text-align: center; }
  .plus { position: absolute; top: 3px; right: 6px; color: var(--faint); font-size: 13px; font-weight: 700; }

  .presets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .preset, .reset {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 7px 2px;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--hud-hi);
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  .preset span, .reset span { color: var(--dim); font-size: 10px; letter-spacing: 0; }
  .preset.at { border-color: var(--telemetry); color: var(--telemetry); box-shadow: inset 0 2px var(--telemetry); }
  .preset.busy { animation: busy 0.5s linear infinite alternate; }
  @keyframes busy { to { background: rgb(55 198 212 / 0.25); } }
  .reset { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .reset span { color: rgb(11 7 5 / 0.6); }
  .preset:active:not(:disabled), .reset:active:not(:disabled) { filter: brightness(1.3); transform: translateY(1px); }
</style>
