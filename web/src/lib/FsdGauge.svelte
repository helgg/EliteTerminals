<script lang="ts">
  import type { Flags } from '@et/shared';

  // Round FSD instrument: a segmented ring whose colour and motion follow the drive state.
  let { flags }: { flags: Flags } = $props();

  const SEGMENTS = 36;
  const state = $derived(
    flags.fsdJump ? { text: 'JUMPING', tone: 'tele', spin: true }
    : flags.fsdCharging ? { text: 'CHARGING', tone: 'tele', spin: true }
    : flags.fsdCooldown ? { text: 'COOLDOWN', tone: 'dim', spin: false }
    : flags.fsdMassLocked ? { text: 'MASS LOCKED', tone: 'bad', spin: false }
    : flags.supercruise ? { text: 'SUPERCRUISE', tone: 'tele', spin: false }
    : flags.docked ? { text: 'DOCKED', tone: 'dim', spin: false }
    : { text: 'READY', tone: 'ok', spin: false },
  );

  const segment = (i: number) => {
    const a0 = ((i / SEGMENTS) * 360 - 90 + 1.5) * (Math.PI / 180);
    const a1 = (((i + 1) / SEGMENTS) * 360 - 90 - 1.5) * (Math.PI / 180);
    const [r0, r1] = [78, 92];
    const p = (r: number, a: number) => `${100 + r * Math.cos(a)},${100 + r * Math.sin(a)}`;
    return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  const paths = Array.from({ length: SEGMENTS }, (_, i) => segment(i));
</script>

<svg viewBox="0 0 200 200" class="gauge {state.tone}" class:spin={state.spin} role="img" aria-label="FSD {state.text}">
  <g class="ring">
    {#each paths as d, i (i)}
      <path {d} style:animation-delay="{(i / SEGMENTS) * 1.2}s" />
    {/each}
  </g>
  <circle cx="100" cy="100" r="70" class="inner" />
  <line x1="40" y1="100" x2="58" y2="100" class="hair" />
  <line x1="142" y1="100" x2="160" y2="100" class="hair" />
  <text x="100" y="90" class="cap">FRAME SHIFT</text>
  <text x="100" y="114" class="state">{state.text}</text>
</svg>

<style>
  .gauge { width: 100%; max-width: 230px; display: block; margin: 0 auto; }
  path { fill: var(--steel); stroke: none; }
  .ok path { fill: rgb(53 208 127 / 0.55); }
  .tele path { fill: rgb(55 198 212 / 0.6); }
  .bad path { fill: rgb(209 72 58 / 0.65); }
  .dim path { fill: var(--rule); }
  .spin path { animation: chase 1.2s linear infinite; }
  @keyframes chase { 0% { fill: var(--telemetry); } 40%, 100% { fill: rgb(55 198 212 / 0.15); } }

  .inner { fill: var(--rail); stroke: var(--rule); }
  .hair { stroke: var(--hud); stroke-width: 1; }
  text { text-anchor: middle; font-family: var(--mono); font-weight: 700; }
  .cap { font-size: 9px; letter-spacing: 0.2em; fill: var(--dim); }
  .state { font-size: 15px; letter-spacing: 0.12em; }
  .ok .state { fill: var(--ok); }
  .tele .state { fill: var(--telemetry); }
  .bad .state { fill: var(--danger); }
  .dim .state { fill: var(--muted); }
</style>
