<script lang="ts">
  import type { FleetModule, FleetShip, ModuleGroup } from '@et/shared';
  import { cr, short } from '../format.ts';

  // One ship: the front has the hologram and the numbers, the back lists everything fitted. Tap to turn it over.
  let { ship, current, art = false }: { ship: FleetShip; current: boolean; art?: boolean } = $props();
  let flipped = $state(false);

  const GROUPS: { id: ModuleGroup; title: string }[] = [
    { id: 'hardpoint', title: 'HARDPOINTS' }, { id: 'utility', title: 'UTILITY' }, { id: 'armour', title: 'ARMOUR' },
    { id: 'core', title: 'CORE' }, { id: 'internal', title: 'INTERNAL' },
  ];
  const lo = $derived(ship.loadout);
  const by = (g: ModuleGroup): FleetModule[] => lo?.modules.filter((m) => m.group === g) ?? [];
  const size = (m: FleetModule) => (m.size ? `${m.size}${m.rating}` : m.rating);
  const mount = (m: FleetModule) => (m.mount ? m.mount[0].toUpperCase() : '');
  const fuel = $derived(lo ? lo.fuelMain : 0);
  const seen = $derived(lo ? lo.at.slice(0, 10) : '');
  const place = $derived(current ? 'IN USE' : ship.station ? `${ship.system} · ${ship.station}` : ship.system || 'location unknown');
  const engineered = $derived(lo?.modules.filter((m) => m.engineering).length ?? 0);
</script>

<button class="card" class:flipped class:current onclick={() => (flipped = !flipped)} aria-pressed={flipped}
  aria-label="{ship.label}: {flipped ? 'show the hologram' : 'show the fitted modules'}">
  <div class="turn">
    <!-- front -->
    <div class="face front">
      <header>
        <span class="model">{ship.label.toUpperCase()}</span>
        {#if current}<em class="now">IN USE</em>{/if}
      </header>
      <div class="title">
        <span class="name">{ship.name}</span>
        {#if ship.ident}<span class="ident">{ship.ident}</span>{/if}
      </div>
      <div class="holo">
        {#if art}
          <!-- a picture the player keeps in their own art folder: it replaces the drawn wireframe -->
          <div class="artbox" style="--src: url(/api/fleet/art/{ship.type.toLowerCase()}.png)">
            <img class="art" src="/api/fleet/art/{ship.type.toLowerCase()}.png" alt="{ship.label} hologram" draggable="false" />
            <!-- scan: a bright band sweeping down the ship, drawn only where the picture has lines -->
            <span class="scan" aria-hidden="true"></span>
            <span class="beam" aria-hidden="true"></span>
          </div>
        {:else}
          <!-- no picture for this ship yet: a terminal that says so -->
          <div class="noscan" role="img" aria-label="Scan not available for {ship.label}">
            <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
            <p class="l1">&gt; HULL SCAN</p>
            <p class="l2">SCAN NOT AVAILABLE</p>
            <p class="l3">&gt; NO HOLOGRAM ON FILE<span class="cur">_</span></p>
            <span class="sweep" aria-hidden="true"></span>
          </div>
        {/if}
      </div>
      <dl class="stats">
        <div><dt>JUMP</dt><dd>{lo?.maxJump ? `${lo.maxJump.toFixed(1)}` : '—'}<small>{lo?.maxJump ? ' ly' : ''}</small></dd></div>
        <div><dt>MASS</dt><dd>{lo?.mass ? cr(lo.mass) : '—'}<small>{lo?.mass ? ' t' : ''}</small></dd></div>
        <div><dt>CARGO</dt><dd>{lo ? cr(lo.cargo) : '—'}<small>{lo ? ' t' : ''}</small></dd></div>
        <div><dt>FUEL</dt><dd>{lo ? fuel : '—'}<small>{lo ? ' t' : ''}</small></dd></div>
        <div><dt>VALUE</dt><dd>{ship.value ? short(ship.value) : '—'}<small>{ship.value ? ' cr' : ''}</small></dd></div>
        <div><dt>REBUY</dt><dd>{lo?.rebuy ? short(lo.rebuy) : '—'}<small>{lo?.rebuy ? ' cr' : ''}</small></dd></div>
      </dl>
      <footer>
        <span class="where" title="where the ship is">{place}</span>
        {#if !lo}<span class="unseen">FIT NOT SEEN YET</span>{:else}<span class="dim">fit of {seen}</span>{/if}
      </footer>
    </div>

    <!-- back -->
    <div class="face back">
      <header>
        <span class="model">{ship.name ? `${ship.name} · ${ship.label}`.toUpperCase() : ship.label.toUpperCase()}</span>
        {#if lo}<em class="dim">{lo.modules.length} modules{engineered ? ` · ${engineered} engineered` : ''}</em>{/if}
      </header>
      {#if lo}
        <div class="mods">
          {#each GROUPS as g (g.id)}
            {#if by(g.id).length}
              <h4>{g.title}</h4>
              {#each by(g.id) as m (m.slot)}
                <div class="mod" class:off={!m.on}>
                  <span class="sz">{size(m)}</span>
                  <span class="lb">{m.label}{#if mount(m)}<small>{mount(m)}</small>{/if}</span>
                  {#if m.engineering}
                    <span class="eng" title="{m.engineering.blueprint}{m.engineering.experimental ? ' · ' + m.engineering.experimental : ''}">G{m.engineering.level} {m.engineering.blueprint}</span>
                  {/if}
                </div>
              {/each}
            {/if}
          {/each}
        </div>
      {:else}
        <p class="empty">The game only reports how a ship is fitted while it is flown. Fly this one once and the fit shows up here, kept from then on.</p>
      {/if}
    </div>
  </div>
</button>

<style>
  .card { all: unset; box-sizing: border-box; display: block; perspective: 1200px; cursor: pointer; height: 480px; }
  .card:focus-visible .face { outline: 1px solid var(--hud); }
  .turn { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(0.3, 0.7, 0.2, 1); }
  .flipped .turn { transform: rotateY(180deg); }
  .face {
    position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 10px 11px;
    background: var(--panel); border: 1px solid var(--rule); backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden;
    /* the cut corners of the HUD frames */
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
  }
  .back header { flex-direction: column; align-items: flex-start; gap: 1px; }
  .back .model { max-width: 100%; }
  .current .face { border-color: var(--hud); }
  .back { transform: rotateY(180deg); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 16px; }
  .model { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: var(--hud-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .now { font-style: normal; font-size: var(--fs-2xs); font-weight: 800; letter-spacing: 0.1em; padding: 0 5px; line-height: 15px; color: #1a0f05; background: var(--hud); }
  .title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .name { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
  .ident { flex: none; font-size: 11px; color: var(--dim); letter-spacing: 0.08em; }
  .holo { flex: 1; min-height: 0; padding: 2px 8px; }
  .artbox { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .art { width: 100%; height: 100%; object-fit: contain; display: block; filter: brightness(1.3) drop-shadow(0 0 6px color-mix(in srgb, var(--telemetry) 60%, transparent)); }
  /* both layers share one gradient (a thin band in the middle of a tall strip) that slides down; the strip is mostly empty, so the scan rests between passes */
  .scan, .beam {
    position: absolute; inset: 0; pointer-events: none; background-size: 100% 300%; background-repeat: no-repeat;
    background-image: linear-gradient(to bottom, transparent 0%, transparent 44%, color-mix(in srgb, var(--hud-hi) 55%, transparent) 49%, #fff 50%, color-mix(in srgb, var(--hud-hi) 55%, transparent) 51%, transparent 56%, transparent 100%);
    animation: scan 5s linear infinite;
  }
  .scan { -webkit-mask: var(--src) center / contain no-repeat; mask: var(--src) center / contain no-repeat; filter: drop-shadow(0 0 4px var(--hud-hi)); }
  .beam { opacity: 0.25; background-image: linear-gradient(to bottom, transparent 0%, transparent 49.6%, var(--hud-hi) 50%, transparent 50.4%, transparent 100%); }
  .noscan {
    position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    border: 1px dashed color-mix(in srgb, var(--telemetry) 30%, transparent); font-family: inherit; letter-spacing: 0.14em;
    background: repeating-linear-gradient(to bottom, transparent 0 3px, color-mix(in srgb, var(--telemetry) 5%, transparent) 3px 4px);
  }
  .noscan p { margin: 0; font-size: 11px; color: color-mix(in srgb, var(--telemetry) 65%, transparent); }
  .noscan .l2 { font-size: 15px; font-weight: 800; color: var(--hud-hi); text-shadow: 0 0 8px color-mix(in srgb, var(--hud-hi) 55%, transparent); animation: flick 3.2s steps(1) infinite; }
  .noscan .l3 { color: var(--dim); }
  .cur { animation: blink 1s steps(1) infinite; }
  .c { position: absolute; width: 14px; height: 14px; border: 0 solid var(--telemetry); opacity: 0.55; }
  .tl { top: 6px; left: 6px; border-width: 1px 0 0 1px; } .tr { top: 6px; right: 6px; border-width: 1px 1px 0 0; }
  .bl { bottom: 6px; left: 6px; border-width: 0 0 1px 1px; } .br { bottom: 6px; right: 6px; border-width: 0 1px 1px 0; }
  .sweep { position: absolute; left: 0; right: 0; height: 2px; background: var(--telemetry); opacity: 0.18; box-shadow: 0 0 8px var(--telemetry); animation: sweepy 4s linear infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes flick { 0%, 92%, 96% { opacity: 1; } 94%, 98% { opacity: 0.55; } }
  @keyframes sweepy { from { top: -4%; } to { top: 104%; } }
  @keyframes scan { from { background-position: 0 100%; } to { background-position: 0 0; } }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px 6px; margin: 0; }
  .stats div { padding: 3px 5px; background: var(--rail); border: 1px solid var(--rule); min-width: 0; }
  dt { font-size: var(--fs-2xs); letter-spacing: 0.1em; color: var(--dim); }
  dd { margin: 0; font-size: 13px; font-weight: 700; color: var(--telemetry); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  dd small { font-size: 10px; font-weight: 400; color: var(--muted); }
  footer { display: flex; flex-direction: column; gap: 1px; font-size: 11px; color: var(--muted); }
  .where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unseen { color: var(--warn, var(--hud-hi)); font-size: var(--fs-2xs); font-weight: 800; letter-spacing: 0.1em; }
  .dim { color: var(--dim); font-style: normal; font-size: 11px; }

  .mods { flex: 1; min-height: 0; overflow-y: auto; padding-right: 3px; }
  h4 { margin: 8px 0 2px; font-size: var(--fs-2xs); letter-spacing: 0.14em; color: var(--hud); font-weight: 800; border-bottom: 1px solid var(--rule); padding-bottom: 1px; }
  h4:first-child { margin-top: 0; }
  .mod { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; font-size: 11px; border-bottom: 1px solid color-mix(in srgb, var(--rule) 45%, transparent); }
  .mod.off { opacity: 0.5; }
  .sz { flex: none; width: 26px; color: var(--telemetry); font-weight: 800; font-variant-numeric: tabular-nums; }
  .lb { flex: 1; min-width: 0; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb small { margin-left: 5px; color: var(--dim); font-size: 9px; }
  .eng { flex: none; max-width: 48%; color: var(--ok); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { font-size: 12px; color: var(--muted); line-height: 1.5; margin: 8px 0; }
  @media (prefers-reduced-motion: reduce) { .turn { transition: none; } .scan, .beam, .sweep { animation: none; display: none; } .cur, .noscan .l2 { animation: none; } }
</style>
