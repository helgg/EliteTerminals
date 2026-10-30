<script lang="ts">
  import type { ExploreBody, OwnBody } from '@et/shared';
  import { beltId, distanceLabel, hasRings, look, orbSize, ringTone, shortName, type TreeNode } from './explore.ts';

  // The system as an orbit tree: each star with its planets along a line by distance, moons hung under their planet.
  // Spheres are shaded by the kind of body, sized on a log scale, and marked by what you have scanned of them.
  let { tree, system, own, selected, onpick, dim, focus = '' }: {
    tree: TreeNode[];
    system: string;
    own: Map<number, OwnBody>;
    selected: number;
    onpick: (id: number) => void;
    /** Bodies this returns true for are dimmed (a filter the screen applies). */
    dim: (b: ExploreBody) => boolean;
    /** The highlight chosen on the screen ('' or 'ALL' = none): belts count as rings. */
    focus?: string;
  } = $props();

  /** What lies along a star's line, by distance: its planets and its belts. */
  function lane(root: TreeNode) {
    // the planets keep the game's order; each belt goes before the first planet that is farther than its inner edge
    type Item = { key: string; node: TreeNode | null; index?: number };
    const items: Item[] = root.kids.map((n) => ({ key: `b${n.body.id}`, node: n }));
    root.body.belts.forEach((b, i) => {
      const at = root.kids.findIndex((n) => n.body.ls > b.innerLs);
      items.splice(at < 0 ? items.length : at + items.slice(0, at).filter((x) => !x.node).length, 0, { key: `r${i}`, node: null, index: i });
    });
    return items;
  }

  // The map keeps its size and scrolls sideways: a system can run to 60 bodies. With nothing to scroll vertically, the wheel
  // moves it sideways too (a trackpad or Shift + wheel already does).
  let wrap = $state<HTMLDivElement>();
  $effect(() => {
    const el = wrap;
    const box = el?.closest('.body') as HTMLElement | null;
    if (!el || !box) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth <= box.clientWidth) return;
      e.preventDefault();
      box.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    // drag the background to move around (a click on a body still picks it)
    let drag: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      drag = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      el.classList.add('grabbing');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      box.scrollLeft = drag.left - (e.clientX - drag.x);
      box.scrollTop = drag.top - (e.clientY - drag.y);
    };
    const onUp = () => {
      drag = null;
      el.classList.remove('grabbing');
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  });

  const scanned = (id: number) => own.get(id)?.scan ?? '';
  const mine = (id: number) => own.get(id);
  const bioOf = (b: ExploreBody) => mine(b.id)?.bio ?? b.bio;
  const geoOf = (b: ExploreBody) => mine(b.id)?.geo ?? b.geo;
  const sky = (b: ExploreBody) =>
    `radial-gradient(circle at 32% 28%, ${look(b).hi} 0%, ${look(b).base} 46%, ${look(b).lo} 100%)`;
</script>

{#snippet orb(b: ExploreBody, lane = false)}
  {@const size = orbSize(b)}
  {@const o = mine(b.id)}
  {@const wide = hasRings(b) ? size * (b.rings.length > 1 ? 2.5 : 2) + 12 : size + 20}
  <button
    class="orb"
    class:sel={selected === b.id}
    class:dim={dim(b)}
    class:seen={scanned(b.id) === 'detailed'}
    class:auto={scanned(b.id) === 'auto'}
    style:--glow={look(b).glow}
    style:min-width="{Math.max(96, wide)}px"
    onclick={() => onpick(b.id)}
    title={b.name}
  >
    <span class="stage" class:lane style:min-width="{size}px" style:min-height="{lane ? 150 : size}px">
      {#if hasRings(b)}
        <i class="ring r1" style:width="{size * 2}px" style:height="{size * 0.56}px" style:--rc={ringTone(b.rings[0].type)}></i>
        {#if b.rings.length > 1}<i class="ring r2" style:width="{size * 2.5}px" style:height="{size * 0.7}px" style:--rc={ringTone(b.rings[1].type)}></i>{/if}
      {/if}
      <span class="ball" class:star={b.type === 'Star'} style:background={sky(b)} style:width="{size}px" style:height="{size}px"></span>
      {#if o?.mapped}<b class="mark mapped" title="mapped">✓</b>{/if}
      {#if o && !o.wasDiscovered && o.scan}<b class="mark first" title="first discovery">★</b>{/if}
    </span>
    <span class="nm">{shortName(b.name, system)}</span>
    <span class="ls">{distanceLabel(b.ls)}</span>
    <span class="tags">
      {#if b.landable}<em class="t land">LAND</em>{/if}
      {#if b.subType.includes('Earth-like')}<em class="t elw">ELW</em>
      {:else if b.subType.includes('Water world')}<em class="t ww">WW</em>
      {:else if b.subType.includes('Ammonia world')}<em class="t aw">AW</em>{/if}
      {#if b.terraformable}<em class="t terra">TERRA</em>{/if}
      {#if b.rings.length}<em class="t rng" title={b.rings.map((r) => r.type).join(' · ')}>RING {b.rings.length}</em>{/if}
      {#if bioOf(b)}<em class="t bio">BIO {bioOf(b)}</em>{/if}
      {#if geoOf(b)}<em class="t geo">GEO {geoOf(b)}</em>{/if}
      {#if b.stations.length}<em class="t st">STN</em>{/if}
      {#if b.guardian || b.thargoid}<em class="t warn">{b.thargoid ? 'THARGOID' : 'GUARDIAN'}</em>{/if}
    </span>
  </button>
{/snippet}

{#snippet belt(star: number, index: number, owner: ExploreBody)}
  {@const bt = owner.belts[index]}
  {@const id = beltId(star, index)}
  <div class="node">
    <button class="orb belt" class:sel={selected === id} class:dim={!!focus && focus !== 'ALL' && focus !== 'RINGS'} onclick={() => onpick(id)} title={bt.name} style:--rc={ringTone(bt.type)} style:min-width="150px">
      <span class="stage lane" style:min-height="150px">
        <span class="field"><i></i><i></i><i></i></span>
      </span>
      <span class="nm">{shortName(bt.name, system)}</span>
      <span class="ls">{distanceLabel(bt.innerLs)} – {distanceLabel(bt.outerLs)}</span>
      <span class="tags"><em class="t belt">BELT</em><em class="t rng">{bt.type.toUpperCase()}</em></span>
    </button>
  </div>
{/snippet}

{#snippet branch(n: TreeNode, top = false)}
  <div class="node">
    {@render orb(n.body, top)}
    {#if n.kids.length}
      <div class="moons">
        {#each n.kids as k (k.body.id)}{@render branch(k)}{/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="wrap" bind:this={wrap}>
<div class="map" style:--sun={tree[0] ? look(tree[0].body).glow : '#ff7a18'}>
  {#each tree as root (root.body.id)}
    <section class="system">
      <div class="centre">{@render orb(root.body, true)}</div>
      <div class="orbits">
        <div class="axis" aria-hidden="true"></div>
        {#each lane(root) as item (item.key)}
          {#if item.node}{@render branch(item.node, true)}{:else}{@render belt(root.body.id, item.index!, root.body)}{/if}
        {/each}
        {#if !root.kids.length && !root.body.belts.length}<p class="none">Nothing orbits this star in Spansh's data.</p>{/if}
      </div>
    </section>
  {/each}
  {#if !tree.length}<p class="none">No bodies yet.</p>{/if}
</div>
</div>

<style>
  .wrap { position: relative; cursor: grab; }
  .wrap :global(button) { cursor: pointer; }
  .wrap:global(.grabbing) { cursor: grabbing; user-select: none; }
  .map {
    display: flex; flex-direction: column; gap: 26px; padding: 10px 14px 18px;
    /* as wide as its widest line, so the panel scrolls sideways instead of wrapping the planets */
    width: max-content; min-width: 100%; box-sizing: border-box;
    background:
      radial-gradient(ellipse 38% 60% at 0% 12%, color-mix(in srgb, var(--sun) 16%, transparent), transparent 70%),
      radial-gradient(1.5px 1.5px at 336px 82px, rgb(255 255 255 / 0.25) 50%, transparent 51%),
      radial-gradient(1px 1px at 553px 53px, rgb(195 215 255 / 0.25) 50%, transparent 51%),
      radial-gradient(1px 1px at 224px 24px, rgb(255 225 190 / 0.6) 50%, transparent 51%),
      radial-gradient(1px 1px at 76px 128px, rgb(255 255 255 / 0.6) 50%, transparent 51%),
      radial-gradient(1px 1px at 584px 68px, rgb(195 215 255 / 0.25) 50%, transparent 51%),
      radial-gradient(1px 1px at 604px 208px, rgb(255 255 255 / 0.35) 50%, transparent 51%),
      radial-gradient(1px 1px at 575px 444px, rgb(255 225 190 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 152px 281px, rgb(195 215 255 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 190px 57px, rgb(255 255 255 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 565px 369px, rgb(195 215 255 / 0.25) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 215px 259px, rgb(255 225 190 / 0.5) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 604px 477px, rgb(255 225 190 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 259px 411px, rgb(255 255 255 / 0.35) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 593px 158px, rgb(195 215 255 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 464px 152px, rgb(195 215 255 / 0.25) 50%, transparent 51%),
      radial-gradient(1px 1px at 433px 89px, rgb(255 225 190 / 0.35) 50%, transparent 51%),
      radial-gradient(1px 1px at 436px 25px, rgb(255 225 190 / 0.5) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 363px 309px, rgb(255 255 255 / 0.6) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 100px 143px, rgb(255 255 255 / 0.25) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 322px 336px, rgb(195 215 255 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 400px 459px, rgb(255 225 190 / 0.25) 50%, transparent 51%),
      radial-gradient(1px 1px at 368px 91px, rgb(255 255 255 / 0.6) 50%, transparent 51%),
      radial-gradient(1px 1px at 228px 398px, rgb(195 215 255 / 0.35) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 258px 208px, rgb(255 255 255 / 0.6) 50%, transparent 51%),
      radial-gradient(1.5px 1.5px at 175px 234px, rgb(255 255 255 / 0.5) 50%, transparent 51%),
      radial-gradient(1px 1px at 445px 447px, rgb(255 225 190 / 0.6) 50%, transparent 51%);
    background-size: auto, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px, 613px 487px;
  }
  .system { display: flex; gap: 18px; align-items: flex-start; }
  .centre { flex: none; width: 176px; display: flex; justify-content: center; }
  .orbits {
    position: relative; flex: none; display: flex; flex-wrap: nowrap; gap: 10px 22px; align-items: flex-start; padding-right: 30px;
    padding-top: 2px;
  }
  /* the line the planets sit on */
  .axis {
    position: absolute; left: 0; right: 0; top: 81px; height: 1px; pointer-events: none;
    background: linear-gradient(to right, transparent, color-mix(in srgb, var(--hud) 55%, transparent) 12%, color-mix(in srgb, var(--hud) 30%, transparent) 88%, transparent);
  }
  .node { display: flex; flex-direction: column; align-items: center; position: relative; }
  .moons {
    display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 2px; padding-top: 6px; position: relative;
  }
  .moons::before {
    content: ''; position: absolute; top: 0; bottom: 14px; left: 50%; width: 1px;
    background: repeating-linear-gradient(to bottom, color-mix(in srgb, var(--hud) 45%, transparent) 0 3px, transparent 3px 6px);
  }
  .moons > .node { background: color-mix(in srgb, var(--panel) 88%, transparent); }

  .orb {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 6px 8px 6px; background: transparent; border: 1px solid transparent; color: var(--text); font: inherit; cursor: pointer;
    transition: opacity 0.2s, border-color 0.15s, background 0.15s;
  }
  .orb:hover { border-color: var(--rule); background: color-mix(in srgb, var(--hud) 6%, transparent); }
  .orb.sel { border-color: var(--hud); background: color-mix(in srgb, var(--hud) 10%, transparent); box-shadow: inset 0 0 14px rgb(255 122 24 / 0.12); }
  .orb.dim { opacity: 0.22; }

  .stage { position: relative; display: grid; place-items: center; margin-bottom: 4px; }
  .stage.lane { align-content: center; }
  .ball {
    display: block; border-radius: 50%; box-shadow: 0 0 14px -2px var(--glow), inset -5px -6px 12px rgb(0 0 0 / 0.55);
    outline: 1px dashed color-mix(in srgb, var(--muted) 55%, transparent); outline-offset: 3px;
  }
  .ball.star { box-shadow: 0 0 26px 4px color-mix(in srgb, var(--glow) 55%, transparent), 0 0 4px var(--glow), inset -4px -5px 10px rgb(0 0 0 / 0.35); }
  .orb.auto .ball { outline: 1px solid color-mix(in srgb, var(--telemetry) 55%, transparent); }
  .orb.seen .ball { outline: 1px solid var(--telemetry); }
  .ring {
    position: absolute; left: 50%; top: 50%; border-radius: 50%; pointer-events: none;
    border: 2px solid color-mix(in srgb, var(--hud-hi) 55%, transparent); transform: translate(-50%, -50%) rotate(-18deg);
    box-shadow: 0 0 6px color-mix(in srgb, var(--hud-hi) 30%, transparent);
  }
  .ring { border-color: color-mix(in srgb, var(--rc, var(--hud-hi)) 65%, transparent); box-shadow: 0 0 6px color-mix(in srgb, var(--rc, var(--hud-hi)) 30%, transparent); }
  .ring.r2 { border-width: 1px; box-shadow: none; }
  /* an asteroid belt: a band of rocks across the line */
  .orb.belt { min-width: 150px; }
  .field { position: relative; display: block; width: 130px; height: 44px; transform: rotate(-12deg); }
  .field i {
    position: absolute; inset: 0; border-radius: 50%; border: 4px dotted color-mix(in srgb, var(--rc) 75%, transparent);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--rc) 55%, transparent));
  }
  .field i:nth-child(2) { inset: 6px 8px; border-width: 3px; border-style: dashed; opacity: 0.7; }
  .field i:nth-child(3) { inset: 12px 18px; border-width: 2px; border-style: dotted; opacity: 0.5; }
  .t.belt { color: var(--rc); border-color: color-mix(in srgb, var(--rc) 55%, transparent); }
  .t.rng { color: var(--muted); }
  .mark { position: absolute; font-size: 11px; line-height: 1; }
  .mark.mapped { right: -8px; bottom: -4px; color: var(--ok); }
  .mark.first { left: -8px; top: -4px; color: var(--hud-hi); text-shadow: 0 0 6px var(--hud-hi); }

  .nm { font-size: 14px; font-weight: 800; letter-spacing: 0.05em; max-width: 138px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ls { font-size: 11px; color: var(--dim); }
  .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; margin-top: 3px; max-width: 138px; }
  .t {
    font-style: normal; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; padding: 0 4px; line-height: 16px;
    border: 1px solid var(--rule); color: var(--muted);
  }
  .t.land { color: var(--text); }
  .t.elw { color: #7af0c0; border-color: #2f9a6a; }
  .t.ww { color: #8ac8ff; border-color: #2f6fc4; }
  .t.aw { color: #e8e070; border-color: #a8a030; }
  .t.terra { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .t.bio { color: #9af070; border-color: #4a9a2a; }
  .t.geo { color: #ff9a5a; border-color: #b8501a; }
  .t.st { color: var(--telemetry); border-color: color-mix(in srgb, var(--telemetry) 50%, transparent); }
  .t.warn { color: var(--danger); border-color: var(--danger); }
  .none { color: var(--dim); font-size: 12px; margin: 14px 0; }
</style>
