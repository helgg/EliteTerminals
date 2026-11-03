<script lang="ts">
  import { distance, landmarkDistances, regionAt, type ExploreSystem, type Pos } from '@et/shared';
  import { ageLabel } from '../format.ts';

  // Where the system is and what Spansh knows of it as a whole: region, coordinates, height over the galactic plane,
  // distances to the places everyone knows (and to you), who lives there, how complete the scan data is.
  let { sys, here = null, hereName = '' }: { sys: ExploreSystem; here?: Pos | null; hereName?: string } = $props();

  const pos = $derived(sys.pos as Pos);
  const region = $derived(regionAt(pos[0], pos[2]));
  const near = $derived(landmarkDistances(pos));
  const fromYou = $derived(here && distance(here, pos) > 0.5 ? distance(here, pos) : null);
  const info = $derived(sys.info);
  const ly = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 1 : 0 })} ly`;
  const c = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const plane = $derived(pos[1] === 0 ? 'on the plane' : `${ly(Math.abs(pos[1]))} ${pos[1] < 0 ? 'below' : 'above'} the plane`);
  const known = $derived(sys.bodies.length);
  const total = $derived(Math.max(sys.bodyCount, known));
  const pct = $derived(total ? Math.round((known / total) * 100) : 0);
  const days = $derived(info.updatedAt ? (Date.now() - Date.parse(info.updatedAt)) / 864e5 : Infinity);
  const people = $derived(info.population > 0);
  const abbr = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n.toLocaleString('en-US'));
</script>

<div class="loc">
  <div class="rows">
    <div class="r"><i>REGION</i><b class="hud">{region?.name ?? 'outside the region map'}</b></div>
    <div class="r"><i>COORDINATES</i><b class="num">{c(pos[0])} / {c(pos[1])} / {c(pos[2])}</b></div>
    <div class="r"><i>GALACTIC PLANE</i><b>{plane}</b></div>
    <div class="r"><i>ID64</i><b class="num">{sys.id64}</b></div>
    <div class="r"><i>PERMIT</i><b class:warn={info.permit}>{info.permit ? 'REQUIRED' : 'not needed'}</b></div>
    <div class="r" title="When Spansh last heard of the system"><i>DATA UPDATED</i><b class:warn={days > 30}>{Number.isFinite(days) ? `${ageLabel(days * 24)} ago` : 'unknown'}</b></div>
  </div>

  <div class="sec"><span>COMPLETENESS</span><i></i><em>{known} of {total} bodies with data</em></div>
  <div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Bodies Spansh has data for">
    <span class:part={pct < 100} style:width="{pct}%"></span><b>{pct}%</b>
  </div>

  <div class="sec"><span>DISTANCES</span><i></i></div>
  <div class="rows">
    {#each near as d (d.id)}<div class="r"><i>{d.name.toUpperCase()}</i><b class="num">{ly(d.ly)}</b></div>{/each}
    {#if fromYou !== null}<div class="r you"><i>{(hereName || 'YOU').toUpperCase()}</i><b class="num">{ly(fromYou)}</b></div>{/if}
  </div>

  {#if people || info.security || info.economy || info.government}
    <div class="sec"><span>{people ? 'INHABITED' : 'UNINHABITED'}</span><i></i></div>
    <div class="rows">
      {#if people}<div class="r"><i>POPULATION</i><b class="num">{abbr(info.population)}</b></div>{/if}
      {#if info.allegiance}<div class="r"><i>ALLEGIANCE</i><b>{info.allegiance}</b></div>{/if}
      {#if info.government}<div class="r"><i>GOVERNMENT</i><b>{info.government}</b></div>{/if}
      {#if info.economy}<div class="r"><i>ECONOMY</i><b>{info.economy}{info.secondaryEconomy ? ` / ${info.secondaryEconomy}` : ''}</b></div>{/if}
      {#if info.security}<div class="r"><i>SECURITY</i><b>{info.security}</b></div>{/if}
    </div>
  {/if}
</div>

<style>
  .loc { display: flex; flex-direction: column; gap: 4px; }
  .rows { display: flex; flex-direction: column; }
  .r { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 3px 2px; border-bottom: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); }
  .r i { flex: none; font-style: normal; font-size: 9px; letter-spacing: 0.14em; color: var(--dim); }
  .r b { font-size: 12px; font-weight: 700; text-align: right; min-width: 0; overflow-wrap: anywhere; }
  .r .hud { color: var(--hud-hi); }
  .r .warn { color: var(--danger); }
  .r.you b { color: var(--telemetry); }
  .num { font-variant-numeric: tabular-nums; }
  .sec { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 10px; letter-spacing: 0.14em; color: var(--hud); }
  .sec i { flex: 1; height: 1px; background: var(--rule); }
  .sec em { font-style: normal; font-size: 10px; letter-spacing: 0; color: var(--dim); }
  .bar { position: relative; height: 16px; background: var(--steel); border: 1px solid var(--rule); }
  .bar span { position: absolute; inset: 0 auto 0 0; background: var(--ok); opacity: 0.55; }
  .bar span.part { background: var(--hud); }
  .bar b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 10px; letter-spacing: 0.1em; }
</style>
