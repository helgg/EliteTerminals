<script lang="ts">
  // Design sheet for the icon set (open with ?sheet=icons): every glyph at three sizes, on the
  // panel and void backgrounds, plus a few rows the way the screens will use them.
  import PlaceIcon, { PLACE_LABEL, type PlaceKind } from './lib/PlaceIcon.svelte';
  import PadBadge from './lib/PadBadge.svelte';
  import ServiceIcon, { SERVICE_LABEL, SERVICE_ORDER, serviceKinds } from './lib/ServiceIcon.svelte';
  import StarIcon from './lib/StarIcon.svelte';
  import Hologram, { type HoloTarget } from './lib/Hologram.svelte';

  const holoMisc: [HoloTarget, string][] = [
    [{ kind: 'poi', poi: 'beacon' }, 'Nav beacon'], [{ kind: 'poi', poi: 'res' }, 'Resource extraction site'],
    [{ kind: 'poi', poi: 'cz' }, 'Conflict zone'], [{ kind: 'poi', poi: 'signal' }, 'Other signal'],
    [{ kind: 'unknown' }, 'No data yet'], [{ kind: 'none' }, 'No target'],
  ];

  const SIZES = [13, 18, 32];
  const places = Object.keys(PLACE_LABEL) as PlaceKind[];
  const stars = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'L', 'T', 'Y', 'TTS', 'W', 'C', 'DA', 'N', 'H'];
  const planets: [string, boolean][] = [
    ['Class I gas giant', false], ['Class III gas giant', true], ['Water world', false],
    ['Earth-like world', false], ['Ammonia world', false], ['Icy body', false],
    ['Metal rich body', false], ['High metal content world', true], ['Rocky body', false],
  ];

  const rows = [
    { sys: 'LHS 3447', station: 'Worlidge Terminal', type: 'Coriolis Starport', pad: 'L', star: 'M', svc: ['Refuel', 'Repair', 'Restock', 'Market', 'Outfitting', 'Shipyard', 'Black Market', 'Material Trader'] },
    { sys: 'EOTIENSES', station: 'Lyakhov Hub', type: 'Outpost', pad: 'M', star: 'K', svc: ['Refuel', 'Market', 'Missions'] },
    { sys: 'HIP 8396', station: 'Ising Terminal', type: 'CraterPort', pad: 'L', star: 'DA', svc: ['Refuel', 'Repair', 'Market', 'Technology Broker', 'Universal Cartographics', 'Vista Genomics'] },
    { sys: 'COL 285 SECTOR', station: 'X7K-41T', type: 'FleetCarrier', pad: 'L', star: 'N', svc: ['Refuel', 'Repair', 'Market'] },
    { sys: 'SHINRARTA DEZHRA', station: 'Jameson Memorial', type: 'Orbis Starport', pad: 'L', star: 'G', svc: ['Refuel', 'Repair', 'Restock', 'Market', 'Outfitting', 'Shipyard', 'Interstellar Factors Contact', 'Search and Rescue'] },
  ];
</script>

<main>
  <h1>ICON SET <span>icons and holograms, drawn in code</span></h1>

  {#each ['panel', 'void'] as bg (bg)}
    <section class={bg}>
      <h2>STATIONS · {bg.toUpperCase()}</h2>
      <div class="grid">
        {#each places as k (k)}
          <figure>
            <div class="sizes">{#each SIZES as s (s)}<PlaceIcon kind={k} size={s} />{/each}</div>
            <figcaption>{PLACE_LABEL[k]}</figcaption>
          </figure>
        {/each}
      </div>
    </section>
  {/each}

  <section class="panel">
    <h2>LANDING PAD</h2>
    <div class="grid">
      {#each ['S', 'M', 'L'] as p (p)}
        <figure>
          <div class="sizes">{#each SIZES as s (s)}<PadBadge pad={p} size={s} />{/each}</div>
          <figcaption>{p} pad</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>SERVICES</h2>
    <div class="grid">
      {#each SERVICE_ORDER as k (k)}
        <figure>
          <div class="sizes">{#each SIZES as s (s)}<ServiceIcon kind={k} size={s} />{/each}</div>
          <figcaption>{SERVICE_LABEL[k]}</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>STARS</h2>
    <div class="grid">
      {#each stars as c (c)}
        <figure>
          <div class="sizes">{#each SIZES as s (s)}<StarIcon cls={c} size={s} />{/each}</div>
          <figcaption>Class {c}</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>BODIES</h2>
    <div class="grid">
      {#each planets as [p, r] (p)}
        <figure>
          <div class="sizes">{#each SIZES as s (s)}<StarIcon planet={p} ringed={r} size={s} />{/each}</div>
          <figcaption>{p}{r ? ' · rings' : ''}</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>HOLOGRAMS · STATIONS</h2>
    <div class="grid">
      {#each places.filter((k) => k !== 'system') as k (k)}
        <figure><Hologram target={{ kind: 'station', stationType: k }} /><figcaption>{PLACE_LABEL[k]}</figcaption></figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>HOLOGRAMS · STARS</h2>
    <div class="grid">
      {#each ['O', 'G', 'K', 'M', 'T', 'DA', 'N', 'H'] as c (c)}
        <figure><Hologram target={{ kind: 'star', cls: c }} /><figcaption>Class {c}</figcaption></figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>HOLOGRAMS · BODIES</h2>
    <div class="grid">
      {#each planets as [p, r] (p)}
        <figure><Hologram target={{ kind: 'planet', subType: p, rings: r }} /><figcaption>{p}{r ? ' · rings' : ''}</figcaption></figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>HOLOGRAMS · SIGNALS AND STATES</h2>
    <div class="grid">
      {#each holoMisc as [t, label] (label)}
        <figure><Hologram target={t} /><figcaption>{label}</figcaption></figure>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h2>IN CONTEXT · ROUTE / MARKET ROWS</h2>
    <table>
      <tbody>
        {#each rows as r (r.station)}
          <tr>
            <td><StarIcon cls={r.star} /> <PlaceIcon kind="system" /> <b class="sys">{r.sys}</b></td>
            <td><PlaceIcon kind={(r.type.includes('Fleet') ? 'carrier' : r.type.includes('Crater') ? 'planetary' : r.type.includes('Orbis') ? 'orbis' : r.type.includes('Outpost') ? 'outpost' : 'coriolis')} /> {r.station}</td>
            <td><PadBadge pad={r.pad} /></td>
            <td class="svcs">{#each serviceKinds(r.svc) as k (k)}<ServiceIcon kind={k} />{/each}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</main>

<style>
  main { padding: 16px; font: 13px var(--mono); color: var(--text); background: var(--void); min-height: 100vh; }
  h1 { color: var(--hud); font-size: 18px; letter-spacing: .12em; margin: 0 0 12px; }
  h1 span { color: var(--dim); font-size: 12px; letter-spacing: .04em; }
  h2 { color: var(--hud-hi); font-size: 12px; letter-spacing: .14em; margin: 0 0 10px; }
  section { padding: 12px; margin-bottom: 12px; border: 1px solid var(--rule); }
  section.panel { background: var(--panel); }
  section.void { background: var(--void); --icon-cut: var(--void); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  figure { margin: 0; padding: 8px; border: 1px solid var(--steel); }
  .sizes { display: flex; align-items: center; gap: 12px; min-height: 36px; }
  figcaption { margin-top: 6px; color: var(--muted); font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 5px 10px 5px 0; border-bottom: 1px solid var(--steel); white-space: nowrap; }
  .sys { color: var(--telemetry); font-weight: 400; }
  .svcs { display: flex; gap: 4px; }
</style>
