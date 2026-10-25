<script lang="ts">
  import type { Flags } from '@et/shared';

  // Round FSD instrument. Each drive state has its own motion, so it reads from across the cockpit:
  // ready breathes green, charging pulls energy inward, the jump bursts outward, supercruise turns
  // the outer bezel, mass lock blinks red, cooldown sweeps amber.
  let { flags, caption = '' }: { flags: Flags; caption?: string } = $props();

  const SEGMENTS = 40;
  const TICKS = 72;
  const STREAKS = 18;
  const C = 120;

  const state = $derived(
    flags.fsdJump ? { text: 'JUMPING', mode: 'jump' }
    : flags.fsdCharging ? { text: 'CHARGING', mode: 'charge' }
    : flags.fsdCooldown ? { text: 'COOLDOWN', mode: 'cool' }
    : flags.fsdMassLocked ? { text: 'MASS LOCKED', mode: 'lock' }
    : flags.supercruise ? { text: 'SUPERCRUISE', mode: 'cruise' }
    : flags.docked ? { text: 'DOCKED', mode: 'dock' }
    : { text: 'READY', mode: 'ready' },
  );

  const polar = (r: number, deg: number) => {
    const a = (deg - 90) * (Math.PI / 180);
    return `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  };
  const segment = (i: number) => {
    const [a0, a1] = [(i / SEGMENTS) * 360 + 1.4, ((i + 1) / SEGMENTS) * 360 - 1.4];
    const [r0, r1] = [86, 104];
    return `M${polar(r0, a0)} L${polar(r1, a0)} A${r1},${r1} 0 0 1 ${polar(r1, a1)} L${polar(r0, a1)} A${r0},${r0} 0 0 0 ${polar(r0, a0)} Z`;
  };
  const paths = Array.from({ length: SEGMENTS }, (_, i) => segment(i));
  const ticks = Array.from({ length: TICKS }, (_, i) => ({ deg: (i / TICKS) * 360, major: i % 6 === 0 }));
  const streaks = Array.from({ length: STREAKS }, (_, i) => (i / STREAKS) * 360);
  // A quarter arc that sweeps round during cooldown.
  const sweep = `M${polar(95, 0)} A95,95 0 0 1 ${polar(95, 90)}`;
</script>

<svg viewBox="0 0 240 240" class="gauge {state.mode}" role="img" aria-label="FSD {state.text}">
  <defs>
    <radialGradient id="fsd-core">
      <stop offset="0%" class="core-hi" />
      <stop offset="100%" class="core-lo" />
    </radialGradient>
  </defs>

  <circle cx={C} cy={C} r="117" class="halo" />
  <g class="ticks">
    {#each ticks as t (t.deg)}
      <line x1={C} y1={C - 109} x2={C} y2={C - (t.major ? 117 : 113)} class:major={t.major}
        transform="rotate({t.deg} {C} {C})" />
    {/each}
  </g>
  <g class="ring">
    {#each paths as d, i (i)}
      <path {d} style:animation-delay="{(i / SEGMENTS) * 0.9}s" />
    {/each}
  </g>
  <path d={sweep} class="sweep" />

  <circle cx={C} cy={C} r="80" class="core" fill="url(#fsd-core)" />
  <g class="streaks">
    {#each streaks as deg, i (deg)}
      <g transform="rotate({deg} {C} {C})">
        <line x1={C} y1={C - 34} x2={C} y2={C - 52} style:animation-delay="{(i % 6) * 0.11}s" />
      </g>
    {/each}
  </g>
  <line x1="48" y1={C} x2="64" y2={C} class="hair" />
  <line x1="176" y1={C} x2="192" y2={C} class="hair" />
  <text x={C} y="100" class="cap">FRAME SHIFT</text>
  <text x={C} y="127" class="state">{state.text}</text>
  {#if caption}<text x={C} y="148" class="sub">{caption}</text>{/if}
</svg>

<style>
  .gauge { width: 100%; max-width: 300px; display: block; margin: 0 auto; overflow: visible; }
  /* only the groups that turn; the per-tick rotate() attributes carry their own centre */
  .ticks, .ring, .sweep { transform-origin: 120px 120px; }

  /* palette per state: --c is the ring colour, --g the glow */
  .gauge { --c: var(--steel); --g: transparent; }
  .ready { --c: rgb(53 208 127 / 0.7); --g: rgb(53 208 127 / 0.25); }
  .cruise, .charge, .jump { --c: rgb(55 198 212 / 0.75); --g: rgb(55 198 212 / 0.3); }
  .lock { --c: rgb(209 72 58 / 0.8); --g: rgb(209 72 58 / 0.3); }
  .cool { --c: rgb(255 181 69 / 0.35); --g: rgb(255 181 69 / 0.15); }
  .dock { --c: var(--rule); --g: transparent; }

  .halo { fill: none; stroke: var(--g); stroke-width: 10; filter: blur(6px); }
  .ticks line { stroke: var(--faint); stroke-width: 1; }
  .ticks line.major { stroke: var(--hud); stroke-width: 1.6; }
  .ring path { fill: var(--c); filter: drop-shadow(0 0 3px var(--g)); }
  .sweep { fill: none; stroke: transparent; stroke-width: 22; }
  .core { stroke: var(--rule); }
  .core-hi { stop-color: var(--g); }
  .core-lo { stop-color: var(--rail); }
  .streaks line { stroke: var(--telemetry); stroke-width: 2; stroke-linecap: round; opacity: 0; }
  .hair { stroke: var(--hud); stroke-width: 1; }

  text { text-anchor: middle; font-family: var(--mono); font-weight: 700; }
  .cap { font-size: 9px; letter-spacing: 0.25em; fill: var(--dim); }
  .state { font-size: 17px; letter-spacing: 0.1em; fill: var(--text); }
  .sub { font-size: 11px; fill: var(--muted); letter-spacing: 0.05em; }
  .ready .state { fill: var(--ok); }
  .cruise .state, .charge .state, .jump .state { fill: var(--telemetry); }
  .lock .state { fill: var(--danger); }
  .cool .state { fill: var(--hud-hi); }
  .dock .state { fill: var(--muted); }

  /* READY: slow breathing */
  .ready .ring { animation: breathe 3s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: 0.55; } }

  /* SUPERCRUISE: the bezel turns */
  .cruise .ticks { animation: turn 24s linear infinite; }
  @keyframes turn { to { transform: rotate(360deg); } }

  /* CHARGING: segments chase, energy pulled to the core, halo swells */
  .charge .ring path { animation: chase 0.9s linear infinite; }
  @keyframes chase { 0% { fill: #9ff3fa; } 45%, 100% { fill: rgb(55 198 212 / 0.15); } }
  .charge .streaks line { animation: inward 0.66s ease-in infinite; }
  @keyframes inward {
    0% { opacity: 0; transform: translateY(-34px); }
    40% { opacity: 0.9; }
    100% { opacity: 0; transform: translateY(14px); }
  }
  .charge .halo, .jump .halo { animation: swell 0.9s ease-in-out infinite alternate; }
  @keyframes swell { to { stroke-width: 22; opacity: 0.9; } }
  .charge .ticks { animation: turn 3s linear infinite; }

  /* JUMPING: everything lit, streaks burst outward, bezel spins */
  .jump .ring path { fill: #9ff3fa; }
  .jump .streaks line { animation: outward 0.45s ease-out infinite; }
  @keyframes outward {
    0% { opacity: 0; transform: translateY(10px); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-46px); }
  }
  .jump .ticks { animation: turn 1s linear infinite; }

  /* MASS LOCKED: red blink */
  .lock .ring { animation: blink 1.1s steps(2, jump-none) infinite; }
  @keyframes blink { 50% { opacity: 0.35; } }

  /* COOLDOWN: an amber arc sweeps round */
  .cool .sweep { stroke: rgb(255 181 69 / 0.5); animation: turn 1.6s linear infinite; }

  @media (prefers-reduced-motion: reduce) {
    .gauge * { animation: none !important; }
  }
</style>
