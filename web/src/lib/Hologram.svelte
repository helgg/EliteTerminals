<script lang="ts" module>
  export type HoloTarget =
    | { kind: 'star'; cls: string }
    | { kind: 'planet'; subType: string; rings?: boolean }
    | { kind: 'station'; stationType: string }
    /** Destinations Spansh doesn't list: nav beacon, extraction site, conflict zone, other signals. */
    | { kind: 'poi'; poi: 'beacon' | 'res' | 'cz' | 'signal' }
    | { kind: 'unknown' }
    | { kind: 'none' };
</script>

<script lang="ts">
  import { PLANET_COLOR, planetKind, starColor, starKind } from './astro.ts';
  import { placeKind } from './PlaceIcon.svelte';

  // Holographic projection of the current destination, drawn entirely in SVG.
  let { target }: { target: HoloTarget } = $props();

  const C = 100; // centre of the 200×200 view
  const meridians = [0, 1, 2, 3, 4, 5];
  /** Point at angle a (degrees) and radius r around the centre. */
  const pt = (a: number, r: number) => [C + r * Math.cos((a * Math.PI) / 180), 88 + r * Math.sin((a * Math.PI) / 180)];
  /** n-sided polygon of radius r, turned by a0 degrees. */
  const ring = (n: number, r: number, a0: number) =>
    Array.from({ length: n }, (_, i) => pt(a0 + (i * 360) / n, r).join(',')).join(' ');
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
        {#if target.rings}
          <!-- far half of the rings, behind the sphere -->
          <g transform="rotate(-14 100 88)">
            <path d="M22 88 A78 18 0 0 1 178 88" class="ring" />
            <path d="M34 88 A66 14 0 0 1 166 88" class="ring faint" />
          </g>
        {/if}
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
        {#if target.rings}
          <!-- near half, over the sphere -->
          <g transform="rotate(-14 100 88)">
            <path d="M22 88 A78 18 0 0 0 178 88" class="ring" />
            <path d="M34 88 A66 14 0 0 0 166 88" class="ring faint" />
          </g>
        {/if}
      </g>
    {:else if target.kind === 'station'}
      {@const sk = placeKind(target.stationType)}
      <g class="station">
        {#if sk === 'coriolis' || sk === 'dodec'}
          <!-- the whole station turns, docking slot included -->
          <g class="spin">
            {#if sk === 'coriolis'}
              <rect x="62" y="50" width="76" height="76" class="wire-hud" transform="rotate(45 100 88)" />
              <rect x="72" y="60" width="56" height="56" class="wire-hud" />
              <path d="M100 34 V142 M46 88 H154 M62 50 L138 126 M138 50 L62 126" class="wire-faint" />
            {:else}
              <polygon points={ring(12, 56, 0)} class="wire-hud" />
              <polygon points={ring(12, 40, 15)} class="wire-faint" />
              {#each Array(12) as _, i (i)}
                <line x1={pt(i * 30, 40)[0]} y1={pt(i * 30, 40)[1]} x2={pt(i * 30 + 15, 56)[0]} y2={pt(i * 30 + 15, 56)[1]} class="wire-faint" />
              {/each}
            {/if}
            <rect x="90" y="84" width="20" height="8" class="slot" />
          </g>
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
        {:else if sk === 'ocellus'}
          <!-- a sphere on the spin axis inside a ring; the slot sits on the axis, so it stays put -->
          <ellipse cx={C} cy="88" rx="68" ry="20" class="wire-faint" />
          <circle cx={C} cy="88" r="40" class="wire-hud" />
          <g transform="translate(100 88) scale(1 0.3) translate(-100 -88)">
            <g class="spin">
              {#each [0, 45, 90, 135] as a (a)}
                <line x1="32" y1="88" x2="168" y2="88" class="wire-faint" transform="rotate({a} 100 88)" />
              {/each}
            </g>
          </g>
          {#each [0, 1, 2] as m (m)}
            <ellipse cx={C} cy="88" rx="40" ry="40" class="wire-faint">
              <animate attributeName="rx" values="40;0;40" dur="12s" begin="{-m * 4}s" repeatCount="indefinite" />
            </ellipse>
          {/each}
          <path d="M100 48 V20 M100 128 V156" class="wire-hud" />
          <rect x="92" y="84" width="16" height="8" class="slot" />
        {:else if sk === 'outpost'}
          <path d="M100 30 V150 M82 50 H118 M78 82 H122 M84 116 H116 M86 50 L114 82 L86 116 M114 50 L86 82 L114 116" class="wire-hud" />
          <rect x="92" y="138" width="16" height="12" class="wire-hud" />
        {:else if sk === 'asteroid'}
          <g class="spin-slow">
            <path d="M52 70 L76 44 L118 38 L150 58 L156 96 L136 128 L96 138 L60 122 L44 96 Z" class="wire-hud" />
            <path d="M76 44 L88 76 L118 38 M150 58 L120 84 L156 96 M60 122 L88 100 L96 138 M44 96 L88 76 M120 84 L136 128" class="wire-faint" />
            <ellipse cx="72" cy="66" rx="7" ry="5" class="wire-faint" />
            <ellipse cx="128" cy="110" rx="6" ry="4" class="wire-faint" />
            <rect x="92" y="84" width="18" height="8" class="slot" />
          </g>
        {:else if sk === 'planetary'}
          <path d="M30 140 H170" class="wire-hud" />
          <path d="M52 140 A48 48 0 0 1 148 140" class="wire-hud" />
          <path d="M70 140 A30 30 0 0 1 130 140 M100 92 V140" class="wire-faint" />
          <rect x="88" y="126" width="24" height="14" class="slot" />
        {:else if sk === 'settlement'}
          <path d="M24 140 H176" class="wire-hud" />
          <path d="M34 140 V104 L50 92 L66 104 V140 M76 140 V70 H104 V140 M114 140 V112 A14 14 0 0 1 142 112 V140" class="wire-hud" />
          <path d="M90 70 V52 M84 58 H96 M82 86 H98 M82 100 H98 M82 114 H98 M42 112 H58 M150 140 L160 124 L170 140" class="wire-faint" />
          <ellipse cx="160" cy="140" rx="14" ry="3" class="slot" />
        {:else}
          <!-- carriers and megaships seen from above, climbing to the right, engines burning aft -->
          <g class="drift">
            <g transform="rotate(-22 100 88)">
              {#if sk === 'carrier'}
                <!-- broad faceted hull, flight deck with pads, command block aft, four drives -->
                {#each [76, 84, 92, 100] as y (y)}<path d="M28 {y - 2} L6 {y} L28 {y + 2} Z" class="plume" />{/each}
                <path d="M30 70 L58 60 H140 L172 76 L184 88 L172 100 L140 116 H58 L30 106 Z" class="wire-hud" />
                <path d="M30 88 H184 M58 60 L70 88 L58 116 M140 60 L128 88 L140 116 M30 70 L58 76 M30 106 L58 100" class="wire-faint" />
                <path d="M72 76 H150 L160 88 L150 100 H72 Z" class="wire-faint" />
                {#each [[88, 82], [106, 82], [124, 82], [88, 94], [106, 94], [124, 94], [142, 88]] as [x, y] (`${x}-${y}`)}
                  <path d="M{x - 5} {y} L{x} {y - 3} L{x + 5} {y} L{x} {y + 3} Z" class="slot" />
                {/each}
                <path d="M40 62 H60 V80 H40 Z M40 62 L46 54 H66 L60 62 M66 54 V72 L60 80" class="wire-hud" />
                <rect x="44" y="66" width="12" height="4" class="slot" />
                {#each [74, 82, 94, 102] as y (y)}<rect x="24" y={y - 2.5} width="6" height="5" class="wire-faint" />{/each}
              {:else}
                <!-- slender spine carrying pairs of cargo modules, faceted command section forward -->
                {#each [80, 88, 96] as y (y)}<path d="M26 {y - 2} L4 {y} L26 {y + 2} Z" class="plume" />{/each}
                <path d="M28 76 L44 72 V104 L28 100 Z" class="wire-hud" />
                <path d="M44 85 H150 V91 H44 Z" class="wire-hud" />
                {#each [54, 78, 102, 126] as x (x)}
                  <rect {x} y="70" width="20" height="14" class="wire-hud" />
                  <rect {x} y="92" width="20" height="14" class="wire-hud" />
                  <path d="M{x} 70 L{x + 20} 84 M{x} 106 L{x + 20} 92" class="wire-faint" />
                {/each}
                <path d="M150 76 L168 80 L184 88 L168 96 L150 100 Z" class="wire-hud" />
                <path d="M150 88 H184 M168 80 V96" class="wire-faint" />
                <path d="M160 84 L170 86 V90 L160 92 Z" class="slot" />
                <path d="M36 72 L30 62 M36 104 L30 114" class="wire-hud" />
              {/if}
            </g>
          </g>
        {/if}
      </g>
    {:else if target.kind === 'poi'}
      <g class="station">
        {#if target.poi === 'beacon'}
          <!-- nav beacon: a mast sending rings out -->
          <path d="M100 30 V140 M84 140 L100 112 L116 140 M90 56 H110" class="wire-hud" />
          <circle cx={C} cy="40" r="6" class="slot" />
          {#each [0, 1, 2] as m (m)}
            <circle cx={C} cy="40" r="8" class="wire-faint pulse" style:animation-delay="{-m}s" />
          {/each}
        {:else if target.poi === 'res'}
          <!-- resource extraction site: a field of rocks inside a dashed ring -->
          <ellipse cx={C} cy="92" rx="70" ry="24" class="wire-faint dashed" />
          <path d="M84 70 L98 58 L116 64 L120 82 L104 94 L86 88 Z" class="wire-hud" />
          <path d="M40 92 L52 84 L62 92 L56 102 L44 102 Z M140 98 L152 88 L166 94 L160 108 L146 108 Z M70 110 L78 104 L86 110 L80 118 Z M124 54 L132 48 L140 54 L134 62 Z" class="wire-hud" />
          <path d="M98 58 L104 94 M84 70 L120 82" class="wire-faint" />
        {:else if target.poi === 'cz'}
          <!-- conflict zone: two ships facing off across crossfire -->
          <path d="M30 70 L66 80 L30 90 L40 80 Z M170 96 L134 106 L170 116 L160 106 Z" class="wire-hud" />
          <path d="M70 80 L130 106 M70 84 L126 100" class="wire-faint dashed" />
          <path d="M100 74 L106 88 L120 86 L108 96 L114 110 L100 100 L86 110 L92 96 L80 86 L94 88 Z" class="flash" />
        {:else}
          <!-- any other signal source: a contact with radar waves -->
          <circle cx={C} cy="96" r="6" class="slot" />
          {#each [0, 1, 2] as m (m)}
            <circle cx={C} cy="96" r="8" class="wire-faint pulse" style:animation-delay="{-m}s" />
          {/each}
          <path d="M100 96 L148 60" class="wire-hud sweep" />
          <circle cx={C} cy="96" r="58" class="wire-faint dashed" />
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
  .ring { fill: none; stroke: var(--hud-hi); stroke-width: 3; stroke-opacity: 0.7; }
  .ring.faint { stroke-width: 1.5; stroke-opacity: 0.4; }

  .wire-hud { fill: none; stroke: var(--hud); stroke-width: 1.4; filter: drop-shadow(0 0 3px rgb(255 122 24 / 0.6)); }
  .wire-faint { fill: none; stroke: var(--hud); stroke-width: 0.8; stroke-opacity: 0.45; }
  .slot { fill: rgb(55 198 212 / 0.25); stroke: var(--telemetry); stroke-width: 1; }
  .dashed { stroke-dasharray: 4 5; }
  .plume { fill: var(--telemetry); fill-opacity: 0.45; filter: drop-shadow(0 0 3px var(--telemetry)); animation: flash 0.9s ease-in-out infinite; }
  .flash { fill: rgb(255 181 69 / 0.25); stroke: var(--hud-hi); stroke-width: 1.2; animation: flash 1.6s ease-in-out infinite; }
  .pulse { transform-box: fill-box; transform-origin: center; animation: pulse 3s ease-out infinite; }
  .sweep { transform-box: view-box; transform-origin: 100px 96px; animation: spin 4s linear infinite; }
  @keyframes pulse { from { transform: scale(1); opacity: 0.9; } to { transform: scale(6); opacity: 0; } }
  @keyframes flash { 50% { opacity: 0.35; } }
  .q { fill: var(--hud); font: 700 28px var(--mono); text-anchor: middle; }

  .spin, .spin-slow, .drift { transform-box: view-box; transform-origin: 100px 88px; }
  .spin { animation: spin 24s linear infinite; }
  .spin-slow { animation: spin 60s linear infinite; }
  .drift { animation: drift 8s ease-in-out infinite alternate; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes drift { to { transform: translateY(-6px); } }
</style>
