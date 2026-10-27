<script lang="ts">
  import type { GeoPoint, Prospect } from '@et/shared';

  // Plan view around the ship: where it has been (the trail, drawn as the swept band) and the asteroids it
  // prospected, coloured by verdict, so the same patch is not worked twice. Positions come from Status.json,
  // which gives latitude/longitude only near a body; without them the radar says so.
  type Kind = 'core' | 'mine' | 'low' | 'skip';
  let { me, heading, radius, trail, prospects, kindOf }: {
    me: GeoPoint | null;
    heading: number | null;
    radius: number;
    trail: GeoPoint[];
    prospects: Prospect[];
    kindOf: (p: Prospect) => Kind;
  } = $props();

  const RANGES = [250, 500, 1000, 1500, 2500, 5000, 10000];
  let pick = $state<number>(readRange());
  let headingUp = $state(readHeadingUp());
  function readRange(): number {
    try { return Number(localStorage.getItem('et.radar.range')) || 0; } catch { return 0; }
  }
  function readHeadingUp(): boolean {
    try { return localStorage.getItem('et.radar.headingUp') === '1'; } catch { return false; }
  }
  function setRange(r: number) {
    pick = r;
    try { localStorage.setItem('et.radar.range', String(r)); } catch {}
  }
  function toggleUp() {
    headingUp = !headingUp;
    try { localStorage.setItem('et.radar.headingUp', headingUp ? '1' : '0'); } catch {}
  }

  /** East/north metres from the ship. */
  function local(p: GeoPoint): { x: number; y: number; d: number; up: number } {
    const k = (Math.PI / 180) * radius;
    const x = (p.lon - me!.lon) * Math.cos((me!.lat * Math.PI) / 180) * k;
    const y = (p.lat - me!.lat) * k;
    return { x, y, d: Math.hypot(x, y), up: p.alt - me!.alt };
  }
  const located = $derived(me && radius ? prospects.filter((p) => p.pos).map((p, i) => ({ p, i, at: local(p.pos!) })) : []);
  const path = $derived(me && radius ? trail.map(local) : []);
  /** AUTO: the smallest range holding the nearest dozen asteroids and the last stretch of trail. */
  const auto = $derived.by(() => {
    const far = Math.max(150, ...located.slice(0, 12).map((x) => x.at.d), ...path.slice(-15).map((x) => x.d));
    return RANGES.find((r) => r >= far * 1.05) ?? RANGES.at(-1)!;
  });
  const range = $derived(pick || auto);
  const S = 100;
  const rot = $derived(headingUp && heading !== null ? -heading : 0);
  /** Screen position (SVG units, y down) of a local point; the view turns with the heading when asked. */
  function screen(x: number, y: number) {
    const a = (rot * Math.PI) / 180;
    const rx = x * Math.cos(a) - y * Math.sin(a);
    const ry = x * Math.sin(a) + y * Math.cos(a);
    return { sx: (rx / range) * S, sy: (-ry / range) * S };
  }
  /** Which asteroids get a label: the latest, then cores and good ones nearest first, never over another label. */
  const labelled = $derived.by(() => {
    const taken: { sx: number; sy: number }[] = [];
    const out = new Set<number>();
    const order = located.filter((x) => x.at.d <= range && (x.i === 0 || ['core', 'mine'].includes(kindOf(x.p))))
      .sort((a, b) => (a.i === 0 ? -1 : b.i === 0 ? 1 : a.at.d - b.at.d));
    for (const x of order) {
      const q = screen(x.at.x, x.at.y);
      if (taken.some((t) => Math.abs(t.sy - q.sy) < 7 && Math.abs(t.sx - q.sx) < 46)) continue;
      taken.push(q);
      out.add(x.i);
    }
    return out;
  });
  const trailPts = $derived(path.map((q) => screen(q.x, q.y)).map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' '));
  /** The swept band: as wide as a collector works around the ship (~500 m), at this scale. */
  const band = $derived((500 / range) * S);
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}km` : `${Math.round(m)}m`);
  const shipAngle = $derived(headingUp || heading === null ? 0 : heading);
  const northAngle = $derived(rot);
</script>

<div class="radar">
  <div class="bar">
    <span class="seg">
      <button class:on={!pick} onclick={() => setRange(0)}>AUTO</button>
      {#each RANGES as r (r)}<button class:on={pick === r} onclick={() => setRange(r)}>{fmt(r)}</button>{/each}
    </span>
    <button class="up" class:on={headingUp} onclick={toggleUp}>{headingUp ? 'HDG UP' : 'N UP'}</button>
  </div>
  {#if !me || !radius}
    <div class="nopos">
      <b>NO POSITION</b>
      <span>The game reports latitude and longitude only near a body (surface, SRV, Rhino). Out in a ring
        it gives none, so asteroids are listed without a place.</span>
    </div>
  {:else}
    <svg viewBox="-110 -110 220 220" preserveAspectRatio="xMidYMid meet" aria-label="Radar">
      <defs>
        <clipPath id="scope"><circle r={S} /></clipPath>
      </defs>
      <circle class="disc" r={S} />
      {#each [0.25, 0.5, 0.75] as f (f)}
        <circle class="ring" r={S * f} />
        <text class="rl" x={3} y={-S * f - 2}>{fmt(range * f)}</text>
      {/each}
      <line class="axis" x1={-S} y1="0" x2={S} y2="0" />
      <line class="axis" x1="0" y1={-S} x2="0" y2={S} />
      <g transform="rotate({northAngle})"><text class="north" x="0" y={-S - 3} text-anchor="middle">N</text></g>
      <g clip-path="url(#scope)">
        {#if path.length > 1}
          <polyline class="swept" points={trailPts} stroke-width={band} />
          <polyline class="trail" points={trailPts} />
        {/if}
        {#each located as { p, i, at } (p.at + i)}
          {@const q = screen(at.x, at.y)}
          {@const k = kindOf(p)}
          {#if at.d <= range}
            <circle class="ast k-{k}" class:latest={i === 0} cx={q.sx} cy={q.sy} r={k === 'core' || k === 'mine' ? 3.6 : 2.4} />
            {#if labelled.has(i)}
              <text class="al k-{k}" x={q.sx + 5} y={q.sy + 2.5}>{k === 'core' ? `◆ ${p.motherlode}` : (p.materials[0]?.label ?? '')} {fmt(at.d)}</text>
            {/if}
          {/if}
        {/each}
      </g>
      <!-- asteroids worth it beyond the edge: an arrow on the rim with the distance -->
      {#each located.filter((x) => x.at.d > range && ['core', 'mine'].includes(kindOf(x.p))) as { p, i, at } (p.at + i)}
        {@const q = screen(at.x, at.y)}
        {@const a = Math.atan2(q.sy, q.sx)}
        <g transform="translate({Math.cos(a) * (S - 4)},{Math.sin(a) * (S - 4)}) rotate({(a * 180) / Math.PI + 90})">
          <path class="edge k-{kindOf(p)}" d="M0,-4 L3,2 L-3,2 Z" />
        </g>
        <text class="al k-{kindOf(p)}" x={Math.cos(a) * (S - 12)} y={Math.sin(a) * (S - 12)} text-anchor="middle">{fmt(at.d)}</text>
      {/each}
      <g transform="rotate({shipAngle})"><path class="ship" d="M0,-6 L4,4 L0,2 L-4,4 Z" /></g>
    </svg>
    <div class="legend">
      <span><i class="k-mine"></i>MINE</span><span><i class="k-core"></i>CORE</span>
      <span><i class="k-low"></i>LOW</span><span><i class="k-skip"></i>SKIP</span>
      <span><i class="sw"></i>swept</span>
      <span class="dim">{located.length}/{prospects.length} placed · {trail.length} pts</span>
    </div>
  {/if}
</div>

<style>
  .radar { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  .bar { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 4px; }
  .seg { display: inline-flex; }
  .seg button, .up {
    min-height: 30px; padding: 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .05em; color: var(--dim);
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule);
  }
  .seg button + button { border-left: 0; }
  .seg button.on, .up.on { color: var(--void); background: var(--telemetry); border-color: var(--telemetry); }
  svg { flex: 1; min-height: 0; width: 100%; }
  .disc { fill: rgb(55 198 212 / .05); stroke: var(--hud-hi); stroke-width: .6; }
  .ring { fill: none; stroke: var(--faint); stroke-width: .3; stroke-dasharray: 1.5 1.5; }
  .axis { stroke: var(--faint); stroke-width: .25; }
  .rl { fill: var(--dim); font-size: 5px; }
  .north { fill: var(--hud); font-size: 7px; font-weight: 700; }
  .swept { fill: none; stroke: rgb(55 198 212 / .13); stroke-linecap: round; stroke-linejoin: round; }
  .trail { fill: none; stroke: var(--telemetry); stroke-width: .6; opacity: .8; }
  .ast { stroke: #0006; stroke-width: .4; }
  .ast.latest { stroke: var(--text); stroke-width: .8; }
  .k-mine { fill: var(--ok); background: var(--ok); }
  .k-core { fill: var(--macro); background: var(--macro); }
  .k-low { fill: var(--hud-hi); background: var(--hud-hi); }
  .k-skip { fill: var(--danger); background: var(--danger); opacity: .7; }
  .al { font-size: 5.2px; stroke: none; }
  .edge { stroke: none; }
  .ship { fill: var(--text); stroke: var(--void); stroke-width: .5; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 10.5px; color: var(--muted); letter-spacing: .06em; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  .legend i.sw { border-radius: 0; width: 14px; height: 6px; background: rgb(55 198 212 / .35); }
  .legend .dim { margin-left: auto; color: var(--dim); }
  .nopos { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; text-align: center;
    padding: 0 20px; color: var(--dim); font-size: 12px; border: 1px dashed var(--rule); }
  .nopos b { color: var(--hud-hi); letter-spacing: .14em; font-size: 14px; }
</style>
