<script lang="ts">
  import type { ExploreBody, MaterialStock, OrganicScan, OwnBody } from '@et/shared';
  import { credits, distanceLabel, gravityLabel, look, shortName } from './explore.ts';

  // One body in detail: size and surface, the atmosphere, what lies on it (materials with what you hold, biology, rings,
  // stations) and what you have done there.
  let { body, system, own, organics, held }: {
    body: ExploreBody;
    system: string;
    own: OwnBody | undefined;
    organics: OrganicScan[];
    held: Map<string, MaterialStock>;
  } = $props();

  const star = $derived(body.type === 'Star');
  const bio = $derived(own?.bio ?? body.bio);
  const geo = $derived(own?.geo ?? body.geo);
  const genuses = $derived(own?.genuses.length ? own.genuses : body.genuses);
  const k = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const mass = $derived(
    star ? `${(body.earthMasses / 332946).toFixed(2)} M☉` : `${body.earthMasses >= 1 ? body.earthMasses.toFixed(2) : body.earthMasses.toFixed(3)} M⊕`,
  );
  const grav = $derived(body.gravity);
  const hot = $derived(grav !== null && grav > 2);
  const status = $derived(
    own?.mapped ? 'MAPPED' : own?.scan === 'detailed' ? 'SCANNED' : own?.scan === 'auto' ? 'SEEN ON ARRIVAL' : 'NOT SCANNED YET',
  );
</script>

<div class="insp">
  <header>
    <span class="orbit-ball" style:background="radial-gradient(circle at 32% 28%, {look(body).hi}, {look(body).base} 50%, {look(body).lo})" style:box-shadow="0 0 14px {look(body).glow}"></span>
    <div>
      <h3>{body.name.toUpperCase()}</h3>
      <div class="sub">{body.subType || body.type}{body.terraformable ? ' · TERRAFORMABLE' : ''}</div>
    </div>
  </header>

  <div class="state" class:done={own?.scan} class:first={own && !own.wasDiscovered && !!own.scan}>
    <span>{status}</span>
    {#if own && !own.wasDiscovered && own.scan}<span class="gold">★ FIRST DISCOVERY</span>
    {:else if own?.scan && own.wasDiscovered}<span class="dim">found before you</span>{/if}
    {#if own?.scan && !star && own.wasMapped && !own.mapped}<span class="dim">mapped before you</span>{/if}
  </div>

  <div class="grid">
    <div><i>DISTANCE</i><b>{distanceLabel(body.ls)}</b></div>
    <div><i>RADIUS</i><b>{k(body.radius)} km</b></div>
    <div><i>MASS</i><b>{mass}</b></div>
    {#if !star}<div><i>GRAVITY</i><b class:warn={hot}>{gravityLabel(grav)}</b></div>{/if}
    <div><i>TEMPERATURE</i><b>{k(body.temperature)} K</b></div>
    {#if !star && body.pressure !== null && body.pressure > 0}<div><i>PRESSURE</i><b>{body.pressure.toFixed(2)} atm</b></div>{/if}
    {#if body.volcanism}<div class="wide"><i>VOLCANISM</i><b>{body.volcanism}</b></div>{/if}
    {#if body.scanValue || body.mapValue}
      <div><i>SCAN WORTH</i><b class="gold">{credits(body.scanValue)} Cr</b></div>
      {#if !star}<div><i>MAP WORTH</i><b class="gold">{credits(body.mapValue)} Cr</b></div>{/if}
    {/if}
  </div>

  {#if body.atmosphere}
    <section class="sec">
      <header><span>ATMOSPHERE</span><i></i><em>{body.atmosphere}</em></header>
      {#each body.atmosphereMix as a (a.name)}
        <div class="row"><span class="label">{a.name}</span><span class="bar"><s style:width="{a.share}%"></s></span><span class="v">{a.share.toFixed(1)}%</span></div>
      {/each}
    </section>
  {/if}

  {#if bio || geo || genuses.length}
    <section class="sec">
      <header><span>SIGNALS</span><i></i></header>
      <div class="chips">
        {#if bio}<span class="chip bio">BIOLOGICAL {bio}</span>{/if}
        {#if geo}<span class="chip geo">GEOLOGICAL {geo}</span>{/if}
        {#if body.human}<span class="chip">HUMAN {body.human}</span>{/if}
        {#if body.guardian}<span class="chip warn">GUARDIAN {body.guardian}</span>{/if}
        {#if body.thargoid}<span class="chip warn">THARGOID {body.thargoid}</span>{/if}
      </div>
      {#if genuses.length}
        <div class="chips"><span class="dim small">GENERA</span>{#each genuses as g (g)}<span class="chip">{g}</span>{/each}</div>
      {/if}
      {#each organics as o (o.species)}
        <div class="org">
          <span class="pips">{#each [1, 2, 3] as n (n)}<b class:on={o.stage >= n}></b>{/each}</span>
          <span class="nm">{o.species}</span>
          <span class="dim small">{o.stage === 3 ? 'ANALYSED' : `SAMPLE ${o.stage} OF 3`}</span>
        </div>
      {/each}
    </section>
  {/if}

  {#if body.rings.length}
    <section class="sec">
      <header><span>RINGS</span><i></i><em>{body.reserve ? `${body.reserve} reserves` : ''}</em></header>
      {#each body.rings as r (r.name)}
        <div class="ring">
          <span class="nm">{shortName(r.name, system)}</span><span class="dim small">{r.type}</span>
          {#each r.hotspots as h (h.name)}<span class="chip">{h.name} ×{h.count}</span>{/each}
        </div>
      {/each}
    </section>
  {/if}

  {#if body.materials.length}
    <section class="sec">
      <header><span>MATERIALS</span><i></i><em>and what you hold</em></header>
      {#each body.materials as m (m.name)}
        {@const h = held.get(m.name.toLowerCase())}
        <div class="row" class:low={m.grade >= 3}>
          <span class="g g{m.grade}">{m.grade ? `G${m.grade}` : '·'}</span>
          <span class="label">{m.name}</span>
          <span class="bar"><s style:width="{Math.min(100, m.pct * 3)}%"></s></span>
          <span class="v">{m.pct.toFixed(1)}%</span>
          <span class="held" class:none={!h} class:full={h && h.max > 0 && h.count >= h.max}>{h ? `${h.count}/${h.max}` : '0'}</span>
        </div>
      {/each}
    </section>
  {/if}

  {#if body.stations.length}
    <section class="sec">
      <header><span>STATIONS</span><i></i></header>
      {#each body.stations as st (st.name)}<div class="row"><span class="label">{st.name}</span><span class="dim small">{st.type}</span></div>{/each}
    </section>
  {/if}
</div>

<style>
  .insp { display: flex; flex-direction: column; gap: 4px; }
  header { display: flex; align-items: center; gap: 10px; }
  .orbit-ball { flex: none; width: 34px; height: 34px; border-radius: 50%; }
  h3 { margin: 0; font-size: 14px; letter-spacing: 0.06em; }
  .sub { color: var(--muted); font-size: 11px; letter-spacing: 0.06em; }
  .state {
    display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; margin: 8px 0 4px; padding: 5px 8px;
    font-size: 10px; font-weight: 800; letter-spacing: 0.12em; color: var(--dim); border: 1px solid var(--rule); background: var(--steel);
  }
  .state.done { color: var(--telemetry); border-color: color-mix(in srgb, var(--telemetry) 45%, transparent); }
  .state.first { border-color: var(--hud-hi); }
  .gold { color: var(--hud-hi); }
  .dim { color: var(--dim); font-weight: 400; letter-spacing: 0.04em; }
  .small { font-size: 10px; }

  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; margin: 6px 0 4px; }
  .grid div { display: flex; flex-direction: column; min-width: 0; }
  .grid .wide { grid-column: 1 / -1; }
  .grid i { font-style: normal; font-size: 9px; letter-spacing: 0.14em; color: var(--dim); }
  .grid b { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .grid b.warn { color: var(--danger); }

  .row { display: flex; align-items: center; gap: 8px; min-height: 20px; font-size: 12px; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { flex: none; width: 70px; height: 6px; background: var(--steel); border: 1px solid var(--rule); }
  .bar s { display: block; height: 100%; background: var(--hud); }
  .v { flex: none; width: 46px; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }
  .held { flex: none; width: 58px; text-align: right; font-size: 11px; color: var(--ok); font-variant-numeric: tabular-nums; }
  .held.none { color: var(--faint); }
  .held.full { color: var(--danger); }
  .row.low .label { color: var(--hud-hi); }
  .g { flex: none; width: 24px; text-align: center; font-size: 9px; font-weight: 800; border: 1px solid var(--rule); color: var(--dim); }
  .g1 { color: var(--muted); }
  .g2 { color: var(--telemetry); border-color: color-mix(in srgb, var(--telemetry) 45%, transparent); }
  .g3 { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
  .g4 { color: var(--hud-hi); border-color: color-mix(in srgb, var(--hud-hi) 55%, transparent); }

  .chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 3px 0; }
  .chip { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; padding: 1px 6px; border: 1px solid var(--rule); color: var(--muted); }
  .chip.bio { color: #9af070; border-color: #4a9a2a; }
  .chip.geo { color: #ff9a5a; border-color: #b8501a; }
  .chip.warn { color: var(--danger); border-color: var(--danger); }
  .org { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-top: 3px; }
  .org .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pips { display: flex; gap: 2px; }
  .pips b { width: 9px; height: 9px; border: 1px solid #4a9a2a; background: transparent; }
  .pips b.on { background: #7ad050; }
  .ring { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: 12px; margin-bottom: 3px; }
</style>
