<script lang="ts">
  // The hologram: a 3D wireframe of the hull seen from above at an angle (the way the game's ship blueprints show it),
  // swaying slowly like a projection. The mesh is built here from each ship's top-view outline and its real length, width
  // and height (the in-game dimensions): cross-section rings and rails give the body its thickness, the panel lines, canopy
  // and turrets sit on the upper surface, the engines glow at the stern and the weapons really fitted are dots on the hull.
  // Drawn by hand, not taken from the game's art. Models without a drawing yet use a generic hull stretched to their real
  // proportions.
  import { OUTLINES, SIZES } from './hulls.ts';
  let { type, hardpoints = null }: { type: string; hardpoints?: number[] | null } = $props();

  interface Hull {
    hull: string;
    /** Panel lines and ribs. */
    lines: string[];
    /** The canopy (filled). */
    canopy: string;
    /** Turret rings: [x, y, r]. */
    rings: [number, number, number][];
    /** Engine nozzles: [x, y, half width]. */
    engines: [number, number, number][];
    /** Where the weapons sit, in the order they are filled. */
    mounts: [number, number][];
  }
  const HULLS: Record<string, Hull> = {
    panthermkii: {
      hull: 'M100 6 L107 40 L111 96 L120 126 L170 150 L196 190 L190 202 L150 196 L124 192 L118 236 L104 250 L100 252',
      lines: [
        'M100 34 L104 66 L107 120 L110 196', 'M120 126 L128 190', 'M170 150 L160 196', 'M107 40 L113 100 L120 126', 'M196 190 L150 190',
        'M146 142 L154 192', 'M118 236 L128 192', 'M110 100 L130 108 L170 150', 'M130 170 L180 176',
      ],
      canopy: 'M100 34 L105 52 L103 68 L100 72',
      rings: [[113, 112, 6], [116, 168, 6]],
      engines: [[110, 248, 5], [120, 232, 5]],
      mounts: [[110, 60], [116, 100], [150, 140], [178, 166], [192, 190], [170, 198]],
    },
  };
  const GENERIC: Hull = {
    hull: 'M100 14 L114 70 L120 140 L150 186 L122 194 L100 226',
    lines: ['M100 44 L106 62 L100 70', 'M120 140 L122 194', 'M100 96 L112 112 L112 160', 'M114 70 L130 110 L150 186'],
    canopy: 'M100 40 L105 56 L103 70 L100 74',
    rings: [],
    engines: [[110, 224, 5]],
    mounts: [[112, 80], [128, 130], [140, 170]],
  };

  /** The in-game size in metres: length, width, height (the game's own ship data). */
  const LOCAL_SIZE: Record<string, [number, number, number]> = {
    federation_corvette: [167.8, 87.2, 28.3], panthermkii: [146.86, 117.09, 33.8], diamondbackxl: [45, 27.3, 13.6],
    lakonminer: [78.6, 78.3, 28.7], type8: [99.34, 59.96, 25.63], python: [87.9, 58.1, 18], type9: [117.4, 115.3, 33.2],
    mamba: [72.2, 50.1, 11.4], krait_mkii: [73.3, 72, 13.5], typex: [68.1, 58.5, 19.9], mandalay: [49.6, 74.4, 14.9],
    cobramkv: [41.2, 55.1, 9.47], smallcombat01_nx: [49.4, 40.01, 9.07], empire_courier: [42.1, 27.4, 7.1],
    mediumtransport01: [89.3, 45.2, 18.8],
  };

  const SIZE: Record<string, [number, number, number]> = { ...SIZES, ...LOCAL_SIZE };

  type P2 = [number, number];
  type P3 = [number, number, number];

  /** M/L/H/V/Z path → polylines. */
  function polylines(d: string): P2[][] {
    const out: P2[][] = [];
    let cur: P2[] = [];
    let x = 0;
    let y = 0;
    for (const m of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
      const n = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (m[1] === 'M') {
        if (cur.length > 1) out.push(cur);
        [x, y] = n;
        cur = [[x, y]];
      } else if (m[1] === 'L') {
        for (let i = 0; i + 1 < n.length; i += 2) cur.push([(x = n[i]), (y = n[i + 1])]);
      } else if (m[1] === 'H') cur.push([(x = n[0]), y]);
      else if (m[1] === 'V') cur.push([x, (y = n[0])]);
      else if (m[1] === 'Z' && cur.length) cur.push(cur[0]);
    }
    if (cur.length > 1) out.push(cur);
    return out;
  }

  /** A hull measured from the ship's plan (hulls.ts) gets its details worked out from the outline: panel lines along the
   * body, a canopy behind the nose, two turrets, the engines at the stern and places for the weapons. */
  function autoModel(d: string): Hull {
    const pts = polylines(d)[0];
    const y0 = Math.min(...pts.map((p) => p[1]));
    const y1 = Math.max(...pts.map((p) => p[1]));
    const len = y1 - y0;
    const at = (f: number) => y0 + len * f;
    const hw = (y: number) => {
      let w = 0;
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        if (a[1] === b[1] || y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue;
        w = Math.max(w, a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) - 100);
      }
      return Math.max(w, 1);
    };
    const n = (v: number) => v.toFixed(1);
    const lines: string[] = [];
    for (const k of [0.25, 0.6]) {
      const seg: string[] = [];
      for (let f = 0.08; f <= 0.95; f += 0.07) seg.push(`${n(100 + hw(at(f)) * k)} ${n(at(f))}`);
      lines.push('M' + seg.join(' L'));
    }
    for (const f of [0.3, 0.5, 0.7]) lines.push(`M${n(100 + hw(at(f)) * 0.25)} ${n(at(f))} L${n(100 + hw(at(f)) * 0.9)} ${n(at(f))}`);
    const cw = Math.min(6, hw(at(0.25)) * 0.2);
    const tail = hw(y1 - 3);
    return {
      hull: d,
      lines,
      canopy: `M100 ${n(at(0.16))} L${n(100 + cw)} ${n(at(0.22))} L${n(100 + cw * 0.8)} ${n(at(0.3))} L100 ${n(at(0.33))}`,
      rings: [[100 + hw(at(0.42)) * 0.32, at(0.42), 3], [100 + hw(at(0.66)) * 0.32, at(0.66), 3]],
      engines: [[100 + tail * 0.3, y1, 4], [100 + tail * 0.68, y1 - 1, 3.5]],
      mounts: Array.from({ length: 8 }, (_, i): [number, number] => {
        const y = at(0.2 + i * 0.09);
        return [100 + hw(y) * 0.62, y];
      }),
    };
  }

  const key = $derived(type.toLowerCase());
  const known = $derived(key in HULLS || key in OUTLINES);
  const model = $derived(HULLS[key] ?? (OUTLINES[key] ? autoModel(OUTLINES[key]) : GENERIC));
  const size = $derived(SIZE[key] ?? null);
  // an undrawn model keeps the generic hull but takes the real width-to-length ratio (the generic one is 0.55)
  const stretch = $derived(!known && size ? Math.min(1.7, Math.max(0.65, size[1] / size[0] / 0.55)) : 1);

  const ELEV = (52 * Math.PI) / 180;
  const SIN = Math.sin(ELEV);
  const COS = Math.cos(ELEV);
  const CY = 124; // where the hull's centre sits on the screen

  /** Everything that does not move: the mesh in model space (x across, y along from the nose, z up). */
  const geo = $derived.by(() => {
    const hull = polylines(model.hull)[0].map(([x, y]): P2 => [(x - 100) * stretch, y]);
    const ys = hull.map((p) => p[1]);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const len = yMax - yMin;
    const height = size ? (size[2] / size[0]) * len : 24;
    const cy = (yMin + yMax) / 2;
    const hwAt = (y: number) => {
      let w = 0;
      for (let i = 1; i < hull.length; i++) {
        const [a, b] = [hull[i - 1], hull[i]];
        if (a[1] === b[1] || y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue;
        w = Math.max(w, a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      return Math.max(w, 0.5);
    };
    // the body is thickest near the stern and tapers to the nose; the flanks are thinner than the spine
    const sOf = (y: number) => Math.min(1, Math.max(0, (y - yMin) / len));
    const top = (y: number, f: number) => height * (0.14 + 0.5 * sOf(y)) * (1 - 0.72 * Math.min(1, f) ** 1.4);
    const bottom = (y: number, f: number) => -height * (0.1 + 0.2 * sOf(y)) * (1 - 0.6 * Math.min(1, f) ** 1.4);
    const onTop = ([x, y]: P2, lift = 0.5): P3 => [(x - 100) * stretch, y, top(y, Math.abs((x - 100) * stretch) / hwAt(y)) + lift];

    // cross-section rings at every outline vertex, and the rails that join them
    const FRACS = [-1, -0.5, 0, 0.5, 1];
    const rings: P3[][] = hull.map(([hw, y]) => {
      const up = FRACS.map((f): P3 => [f * hw, y, top(y, Math.abs(f))]);
      const down = [1, 0, -1].map((f): P3 => [f * hw, y, bottom(y, Math.abs(f))]);
      return [...up, ...down];
    });
    const rails = Array.from({ length: 8 }, (_, k) => rings.map((r) => r[k]));
    const edge = [rings.map((r) => r[4]), rings.map((r) => r[0])];

    const side = (pts: P2[], mirror: boolean): P3[] => pts.map(([x, y]) => onTop(mirror ? [200 - x, y] : [x, y]));
    const details = model.lines.flatMap((d) => polylines(d)).flatMap((pl) => [side(pl, false), side(pl, true)]);
    const canopy = polylines(model.canopy)[0] ?? [];
    const canopyShape = [side(canopy, false), side(canopy, true)].map((c) => [...c, c[0]]);
    const turrets = model.rings.flatMap(([x, y, r]) => [onTop([x, y], 0.8), onTop([200 - x, y], 0.8)].map((p): [P3, number] => [p, r]));
    const mounts = model.mounts.map(([x, y]) => [onTop([x, y], 1.2), onTop([200 - x, y], 1.2)] as [P3, P3]);
    const engines = model.engines.flatMap(([x, y, w]) => {
      const z = (top(y, 0.5) + bottom(y, 0.5)) / 2;
      return [[(x - 100) * stretch, y, z], [(100 - x) * stretch, y, z]].map((p): [P3, number] => [p as P3, w]);
    });
    const radius = Math.max(...hull.map(([hw, y]) => Math.hypot(hw, y - cy)));
    return { rings, rails, edge, details, canopyShape, turrets, mounts, engines, cy, k: Math.min(1, 94 / radius) };
  });

  // the projection sways around a diagonal view, like a hologram turning slowly
  let yaw = $state(140);
  $effect(() => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return;
      last = t;
      yaw = 140 + 24 * Math.sin(t / 3200);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  const view = $derived.by(() => {
    const a = (yaw * Math.PI) / 180;
    const [ca, sa, k] = [Math.cos(a), Math.sin(a), geo.k];
    const proj = (p: P3): P2 => {
      const y = p[1] - geo.cy;
      return [100 + k * (p[0] * ca - y * sa), CY + k * ((p[0] * sa + y * ca) * SIN - p[2] * COS)];
    };
    const f = (n: number) => n.toFixed(1);
    const d = (pl: P3[]) => 'M' + pl.map((p) => proj(p).map(f).join(' ')).join(' L');
    const ticks = Array.from({ length: 12 }, (_, n) => {
      const t = ((n * 30 + yaw) * Math.PI) / 180;
      return `M${f(100 + 98 * Math.cos(t))} ${f(CY + 98 * SIN * Math.sin(t))} L${f(100 + 92 * Math.cos(t))} ${f(CY + 92 * SIN * Math.sin(t))}`;
    }).join(' ');
    return {
      ring: geo.rings.map((r) => d([...r, r[0]])).join(' '),
      rail: geo.rails.map(d).join(' '),
      edge: geo.edge.map(d).join(' '),
      detail: geo.details.map(d).join(' '),
      canopy: geo.canopyShape.map((c) => d(c) + ' Z').join(' '),
      turrets: geo.turrets.map(([p, r]) => ({ at: proj(p), rx: r * k, ry: r * k * SIN })),
      // fit known: one dot per weapon, on alternate sides; unknown: every possible place as a faint ring
      guns: hardpoints
        ? hardpoints.slice(0, geo.mounts.length).map((size, i) => ({ at: proj(geo.mounts[i][i % 2]), size }))
        : geo.mounts.flatMap((pair) => pair.map((p) => ({ at: proj(p), size: null as number | null }))),
      engines: geo.engines.map(([p, w]) => ({ at: proj(p), r: w * k })),
      ticks,
    };
  });

  const metres = (v: number) => (v >= 100 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0));
</script>

<svg viewBox="0 0 200 276" class="holo" class:generic={!known} role="img" aria-label="Ship hologram">
  <!-- the projector's floor: the shield halo and a turning scale -->
  <g class="floor">
    <ellipse class="shield" cx="100" cy={CY} rx="98" ry={98 * SIN} />
    <ellipse class="shield b" cx="100" cy={CY} rx="92" ry={92 * SIN} />
    <ellipse cx="100" cy={CY} rx="62" ry={62 * SIN} />
    <path class="ticks" d={view.ticks} />
  </g>

  <g class="ship">
    <path class="rail back" d={view.rail} />
    <path class="ring" d={view.ring} />
    <path class="glow" d={view.edge} />
    <path class="edge" d={view.edge} />
    <path class="detail" d={view.detail} />
    <path class="canopy" d={view.canopy} />
    {#each view.turrets as t, i (i)}<ellipse class="turret" cx={t.at[0]} cy={t.at[1]} rx={t.rx} ry={t.ry} />{/each}
    {#each view.engines as e, i (i)}
      <circle class="flame" cx={e.at[0]} cy={e.at[1]} r={e.r} />
      <circle class="nozzle" cx={e.at[0]} cy={e.at[1]} r={e.r * 0.55} />
    {/each}
    {#each view.guns as g, i (i)}
      {#if g.size}
        <circle class="gun" cx={g.at[0]} cy={g.at[1]} r={1.6 + g.size * 0.5} />
      {:else}
        <circle class="anchor" cx={g.at[0]} cy={g.at[1]} r="1.8" />
      {/if}
    {/each}
  </g>

  {#if size}
    <text class="dims" x="100" y="266" text-anchor="middle">{metres(size[0])} × {metres(size[1])} × {metres(size[2])} m</text>
  {/if}
  <rect class="sweep" x="0" y="0" width="200" height="3" />
</svg>

<style>
  .holo { width: 100%; height: 100%; display: block; overflow: visible; }
  .floor { fill: none; stroke: color-mix(in srgb, var(--telemetry) 26%, transparent); stroke-width: 0.6; stroke-dasharray: 2 4; }
  .floor .shield { stroke: color-mix(in srgb, var(--telemetry) 55%, transparent); stroke-dasharray: none; stroke-width: 0.9; }
  .floor .shield.b { stroke-width: 0.4; stroke-dasharray: 1 3; }
  .floor .ticks { stroke-dasharray: none; stroke: color-mix(in srgb, var(--telemetry) 60%, transparent); stroke-width: 0.8; }
  path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
  .rail { stroke: color-mix(in srgb, var(--telemetry) 55%, transparent); stroke-width: 0.5; }
  .rail.back { stroke: color-mix(in srgb, var(--telemetry) 38%, transparent); }
  .ring { stroke: color-mix(in srgb, var(--telemetry) 62%, transparent); stroke-width: 0.55; }
  .glow { stroke: color-mix(in srgb, var(--telemetry) 30%, transparent); stroke-width: 3.2; }
  .edge { stroke: var(--telemetry); stroke-width: 1.2; }
  .detail { stroke: color-mix(in srgb, var(--hud-hi) 55%, var(--telemetry)); stroke-width: 0.6; }
  .canopy { fill: color-mix(in srgb, var(--telemetry) 35%, transparent); stroke: var(--hud-hi); stroke-width: 0.8; }
  .turret { fill: none; stroke: var(--telemetry); stroke-width: 0.7; }
  .nozzle { fill: color-mix(in srgb, var(--telemetry) 20%, transparent); stroke: var(--telemetry); stroke-width: 0.7; }
  .flame { fill: color-mix(in srgb, var(--hud) 55%, transparent); animation: flick 1.6s ease-in-out infinite alternate; }
  .anchor { fill: none; stroke: color-mix(in srgb, var(--telemetry) 55%, transparent); stroke-width: 0.6; }
  .gun { fill: color-mix(in srgb, var(--hud) 60%, transparent); stroke: var(--hud-hi); stroke-width: 0.8; }
  .generic .edge { stroke-dasharray: 5 3; opacity: 0.85; }
  .dims { font: 700 7px var(--mono); letter-spacing: 0.1em; fill: var(--muted); }
  .sweep { fill: var(--telemetry); opacity: 0.3; animation: sweep 4.5s linear infinite; }
  @keyframes sweep { from { transform: translateY(0); opacity: 0; } 10% { opacity: 0.3; } 90% { opacity: 0.3; } to { transform: translateY(270px); opacity: 0; } }
  @keyframes flick { from { opacity: 0.5; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .sweep, .flame { animation: none; } .sweep { opacity: 0; } }
</style>
