<script lang="ts" module>
  export type HoloTarget =
    | { kind: 'star'; cls: string }
    | { kind: 'planet'; subType: string }
    | { kind: 'station'; stationType: string }
    | { kind: 'unknown' }
    | { kind: 'none' };
</script>

<script lang="ts">
  import { PLANET_COLOR, planetKind, starColor, starKind, stationKind } from './astro.ts';

  // Holographic projection of the current destination, drawn entirely in SVG.
  let { target }: { target: HoloTarget } = $props();

  const C = 100; // centre of the 200×200 view
  const meridians = [0, 1, 2, 3, 4, 5];
</script>

<div class="holo">
  <svg viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <radialGradient id="holo-glow">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.55" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0" />
      </radialGradient>
      <pattern id="holo-scan" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="1.3" fill="rgb(255 255 255 / 0.09)" />
      </pattern>
    </defs>

    <!-- projector base and beam -->
    <ellipse cx={C} cy="182" rx="46" ry="7" class="base" />
    <path d="M58 182 L80 150 M142 182 L120 150" class="beam" />

    {#if target.kind === 'star'}
      {@const k = starKind(target.cls)}
      <g class="star" style:color={starColor(target.cls)}>
        <circle cx={C} cy="88" r="62" fill="url(#holo-glow)" />
        {#if k === 'blackHole'}
          <ellipse cx={C} cy="88" rx="58" ry="14" class="disk spin-slow" />
          <circle cx={C} cy="88" r="20" class="hole" />
        {:else}
          {@const r = k === 'main' ? 36 : 14}
          <g class="rays spin-slow">
            {#each Array(16) as _, i (i)}
              <line x1={C} y1={88 - r - 4} x2={C} y2={88 - r - (i % 2 ? 10 : 18)}
                transform="rotate({i * 22.5} {C} 88)" />
            {/each}
          </g>
          <circle cx={C} cy="88" r={r} class="core" />
          {#if k === 'neutron' || k === 'whiteDwarf'}
            <path d="M{C} {88 - r} L{C - 6} 8 L{C + 6} 8 Z M{C} {88 + r} L{C - 6} 168 L{C + 6} 168 Z" class="jets" />
          {/if}
        {/if}
      </g>
    {:else if target.kind === 'planet'}
      {@const pk = planetKind(target.subType)}
      <g class="planet" style:color={PLANET_COLOR[pk]}>
        <circle cx={C} cy="88" r="58" fill="url(#holo-glow)" />
        <circle cx={C} cy="88" r="44" class="sphere" />
        {#if pk === 'gas'}
          {#each [-26, -12, 2, 16, 30] as y, i (i)}
            <ellipse cx={C} cy={88 + y} rx={Math.sqrt(44 * 44 - y * y)} ry="3" class="band" />
          {/each}
        {:else}
          {#each [-30, -15, 0, 15, 30] as y, i (i)}
            <ellipse cx={C} cy={88 + y} rx={Math.sqrt(44 * 44 - y * y)} ry={Math.sqrt(44 * 44 - y * y) * 0.18} class="wire" />
          {/each}
        {/if}
        {#each meridians as m (m)}
          <ellipse cx={C} cy="88" rx="44" ry="44" class="wire meridian">
            <animate attributeName="rx" values="44;0;44" dur="9s" begin="{-m * 1.5}s" repeatCount="indefinite" />
          </ellipse>
        {/each}
      </g>
    {:else if target.kind === 'station'}
      {@const sk = stationKind(target.stationType)}
      <g class="station">
        {#if sk === 'coriolis'}
          <g class="spin">
            <rect x="62" y="50" width="76" height="76" class="wire-hud" transform="rotate(45 100 88)" />
            <rect x="72" y="60" width="56" height="56" class="wire-hud" />
            <path d="M100 34 V142 M46 88 H154 M62 50 L138 126 M138 50 L62 126" class="wire-faint" />
          </g>
          <rect x="90" y="84" width="20" height="8" class="slot" />
        {:else if sk === 'orbis'}
          <ellipse cx={C} cy="88" rx="66" ry="22" class="wire-hud" />
          <ellipse cx={C} cy="88" rx="54" ry="16" class="wire-faint" />
          <path d="M100 30 V146" class="wire-hud" />
          <!-- spokes turn in the ring's plane: squash the spinning group into the ellipse -->
          <g transform="translate(100 88) scale(1 0.33) translate(-100 -88)">
            <g class="spin">
              {#each [0, 60, 120] as a (a)}
                <line x1="34" y1="88" x2="166" y2="88" class="wire-faint" transform="rotate({a} 100 88)" />
              {/each}
            </g>
          </g>
          <circle cx={C} cy="88" r="10" class="wire-hud" />
        {:else if sk === 'outpost'}
          <path d="M100 30 V150 M82 50 H118 M78 82 H122 M84 116 H116 M86 50 L114 82 L86 116 M114 50 L86 82 L114 116" class="wire-hud" />
          <rect x="92" y="138" width="16" height="12" class="wire-hud" />
        {:else if sk === 'planetary' || sk === 'settlement'}
          <path d="M30 140 H170" class="wire-hud" />
          <path d="M52 140 A48 48 0 0 1 148 140" class="wire-hud" />
          <path d="M70 140 A30 30 0 0 1 130 140 M100 92 V140" class="wire-faint" />
          <rect x="88" y="126" width="24" height="14" class="slot" />
        {:else if sk === 'carrier'}
          <g class="drift">
            <path d="M30 98 L60 78 H150 L172 88 L150 102 H60 Z" class="wire-hud" />
            <path d="M74 78 V64 H96 V78 M120 102 V112 M60 90 H150" class="wire-faint" />
          </g>
        {:else}
          <path d="M40 92 Q100 60 160 92 Q100 120 40 92 Z" class="wire-hud" />
        {/if}
      </g>
    {:else if target.kind === 'unknown'}
      <g class="unknown">
        <circle cx={C} cy="88" r="40" class="wire-faint dashed spin-slow" />
        <text x={C} y="96" class="q">?</text>
      </g>
    {:else}
      <g class="idle">
        <circle cx={C} cy="88" r="26" class="wire-faint dashed spin-slow" />
        <path d="M100 52 V70 M100 106 V124 M64 88 H82 M118 88 H136" class="wire-faint" />
      </g>
    {/if}

    <rect width="200" height="170" fill="url(#holo-scan)" class="scan" />
  </svg>
</div>

<style>
  .holo { width: 100%; max-width: 150px; margin: 0 auto; animation: flicker 6s infinite; }
  svg { display: block; width: 100%; overflow: visible; }
  @keyframes flicker { 0%, 97%, 100% { opacity: 1; } 98% { opacity: 0.7; } }

  .base { fill: rgb(255 122 24 / 0.15); stroke: var(--hud); stroke-width: 1; }
  .beam { stroke: rgb(255 122 24 / 0.35); stroke-width: 1; fill: none; }
  .scan { pointer-events: none; animation: scroll 3s linear infinite; }
  @keyframes scroll { to { transform: translateY(4px); } }

  .core { fill: currentColor; fill-opacity: 0.8; stroke: currentColor; stroke-width: 1.5; filter: drop-shadow(0 0 8px currentColor); }
  .rays line { stroke: currentColor; stroke-width: 1.4; stroke-opacity: 0.7; }
  .jets { fill: currentColor; fill-opacity: 0.35; }
  .disk { fill: none; stroke: #c58af9; stroke-width: 3; stroke-dasharray: 6 4; }
  .hole { fill: #000; stroke: #c58af9; stroke-width: 1; }

  .sphere { fill: currentColor; fill-opacity: 0.18; stroke: currentColor; stroke-width: 1.5; }
  .wire { fill: none; stroke: currentColor; stroke-width: 0.8; stroke-opacity: 0.75; }
  .band { fill: currentColor; fill-opacity: 0.25; stroke: none; }

  .wire-hud { fill: none; stroke: var(--hud); stroke-width: 1.4; filter: drop-shadow(0 0 3px rgb(255 122 24 / 0.6)); }
  .wire-faint { fill: none; stroke: var(--hud); stroke-width: 0.8; stroke-opacity: 0.45; }
  .slot { fill: rgb(55 198 212 / 0.25); stroke: var(--telemetry); stroke-width: 1; }
  .dashed { stroke-dasharray: 4 5; }
  .q { fill: var(--hud); font: 700 28px var(--mono); text-anchor: middle; }

  .spin, .spin-slow, .drift { transform-box: view-box; transform-origin: 100px 88px; }
  .spin { animation: spin 24s linear infinite; }
  .spin-slow { animation: spin 60s linear infinite; }
  .drift { animation: drift 8s ease-in-out infinite alternate; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes drift { to { transform: translateY(-6px); } }
</style>
