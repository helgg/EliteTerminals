<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import Throttle from '../lib/Throttle.svelte';
  import FsdGauge from '../lib/FsdGauge.svelte';
  import Hologram from '../lib/Hologram.svelte';
  import ScoopIcon from '../lib/ScoopIcon.svelte';
  import Name from '../lib/Name.svelte';
  import ShipPanel from '../lib/ShipPanel.svelte';
  import Pips from '../lib/Pips.svelte';
  import { viewport } from '../lib/viewport.svelte.ts';
  import { keyFor, sendCommand } from '../lib/link.svelte.ts';
  import { resolveTarget } from '../lib/target.ts';
  import { currentJumpRange } from '../lib/jump.ts';
  import {
    ALLEGIANCE, distanceLy, initials, isScoopable, securityTone, starClass, starColor, starKind,
  } from '../lib/astro.ts';

  let { s }: { s: EdState } = $props();

  const f = $derived(s.flags);
  const vp = $derived(viewport.vp);
  // Portrait screens have no side column: SHIP and POWER come into this grid.
  const portrait = $derived(viewport.orientation === 'portrait' && viewport.device !== 'phone');
  // The full route column only on a wide monitor; elsewhere a strip of the next jumps.
  const routeColumn = $derived(vp === 'desktop-landscape' || viewport.device === 'phone');
  const target = $derived(resolveTarget(s));
  const hereIdx = $derived(s.route.hops.findIndex((h) => h.system === s.location.system));
  const next = $derived(hereIdx >= 0 ? s.route.hops[hereIdx + 1] : s.route.hops[0]);

  const hops = $derived(
    s.route.hops.map((h, i) => {
      const cls = starClass(h.starClass);
      return {
        ...h,
        cls,
        kind: starKind(cls),
        jump: i > 0 ? distanceLy(s.route.hops[i - 1].pos, h.pos) : 0,
        info: s.galaxy.systems[h.address],
      };
    }),
  );
  const totalLy = $derived(hops.reduce((t, h) => t + h.jump, 0));
  const ahead = $derived(hops.slice(hereIdx >= 0 ? hereIdx + 1 : 0));
  const fuelStars = $derived(hops.filter((h) => isScoopable(h.cls)).length);

  const range = $derived(currentJumpRange(s));
  // Jumps the tank still holds, from what the last jump burnt (the journal gives no fuel curve).
  const fuelJumps = $derived(s.ship.lastJump.fuelUsed > 0 ? Math.floor(s.status.fuelMain / s.ship.lastJump.fuelUsed) : null);

  const drive = $derived([
    { label: 'HYPERSPACE', cmd: 'Hyperspace', tone: 'hero', icon: '⟫',
      sub: f.fsdMassLocked ? 'MASS LOCKED' : next ? `to ${next.system.toUpperCase()}` : 'to the target system' },
    { label: 'SUPERCRUISE', cmd: 'Supercruise', tone: 'cruise', icon: '»', sub: f.supercruise ? 'drop out' : 'in system' },
    { label: 'FSD AUTO', cmd: 'HyperSuperCombination', tone: 'auto', icon: '◈', sub: 'jump or cruise' },
    { label: 'NEXT SYSTEM', cmd: 'TargetNextRouteSystem', tone: 'target', icon: '⌖', sub: 'target on route' },
  ]);

  // Ship switches by job, so a hand finds them without reading every label.
  const GROUPS: { title: string; items: { label: string; cmd: string; on?: () => boolean; hot?: boolean }[] }[] = [
    { title: 'Flight', items: [
      { label: 'Landing gear', cmd: 'LandingGearToggle', on: () => f.landingGearDown, hot: true },
      { label: 'Cargo scoop', cmd: 'ToggleCargoScoop', on: () => f.cargoScoopDeployed, hot: true },
      { label: 'Flight assist off', cmd: 'ToggleFlightAssist', on: () => f.flightAssistOff, hot: true },
    ] },
    { title: 'Combat', items: [
      { label: 'Hardpoints', cmd: 'DeployHardpointToggle', on: () => f.hardpointsDeployed, hot: true },
      { label: 'Silent running', cmd: 'ToggleButtonUpInput', on: () => f.silentRunning, hot: true },
      { label: 'Heatsink', cmd: 'DeployHeatSink', on: () => f.overHeating, hot: true },
    ] },
    { title: 'HUD & lights', items: [
      { label: 'Analysis mode', cmd: 'PlayerHUDModeToggle', on: () => f.hudAnalysisMode },
      { label: 'Lights', cmd: 'ShipSpotLightToggle', on: () => f.lightsOn },
      { label: 'Night vision', cmd: 'NightVisionToggle', on: () => f.nightVision },
    ] },
    { title: 'Nav', items: [
      { label: 'Docking request', cmd: 'RequestDocking' },
      { label: 'Galaxy map', cmd: 'GalaxyMapOpen' },
      { label: 'System map', cmd: 'SystemMapOpen' },
    ] },
  ];
</script>

<div class="flight {vp}" class:portrait>
  <Panel class="fsd" title="Frame shift drive" aside={f.supercruise ? 'supercruise' : 'normal space'}>
    <div class="fsd-body">
      <div class="gauge"><FsdGauge flags={f} caption={range ? `RANGE ≈${range.toFixed(1)}ly` : ''} /></div>
      <dl class="readouts">
        <dt>NEXT</dt><dd class="next"><Name value={next?.system ?? ''} system /></dd>
        <dt>JUMPS LEFT</dt><dd class="big num">{s.route.remainingJumps}</dd>
        <dt>RANGE</dt>
        <dd class="big num" title="Estimate with the current cargo and fuel (max empty: {s.ship.maxJumpRange.toFixed(2)}ly)">
          ≈{range.toFixed(1)}<small>ly</small>
        </dd>
        <dt>FUEL</dt>
        <dd class="num" class:bad={f.lowFuel}>{s.status.fuelMain.toFixed(1)}t</dd>
        {#if fuelJumps !== null}
          <dt title="Jumps the tank still holds, at the fuel the last jump used">ON TANK</dt>
          <dd class="num">≈{fuelJumps} jumps</dd>
        {/if}
        <dt>LAST JUMP</dt>
        <dd class="num">{s.ship.lastJump.distance ? `${s.ship.lastJump.distance.toFixed(1)}ly · ${s.ship.lastJump.fuelUsed.toFixed(1)}t` : '—'}</dd>
      </dl>

      <div class="target">
        <div class="t-head">
          <span class="t-label">{target.label}</span>
          {#if target.scoopable}<span class="fuel"><ScoopIcon size={13} /> FUEL STAR</span>{/if}
        </div>
        <Hologram target={target.holo} />
        <div class="t-name">{#if target.label === 'SYSTEM' || target.label === 'STATION'}<Name value={target.name}
          system={target.label === 'SYSTEM'} stationType={target.subtitle} icon={target.label === 'STATION'} />{:else}{target.name}{/if}</div>
        <div class="t-sub">{target.subtitle}{target.pending ? ' · fetching…' : ''}</div>
        <dl class="t-facts">
          {#each target.facts as [k, v] (k)}
            <dt>{k}</dt><dd title={v}>{v}</dd>
          {/each}
        </dl>
      </div>
    </div>

    {#if !routeColumn}
      <!-- the route column's job, in one line: the next stars and whether they refuel -->
      <div class="strip" title="{hops.length ? `${hops.length - 1} jumps · ${totalLy.toFixed(0)}ly` : ''}">
        <span class="k">ROUTE</span>
        {#if ahead.length}
          {#each ahead.slice(0, 4) as h, i (h.address || i)}
            {#if i}<span class="sep">›</span>{/if}
            <span class="hop">
              <span class="cls" style:color={starColor(h.cls)}>{h.cls || '?'}</span>
              {#if isScoopable(h.cls)}<ScoopIcon size={10} />{/if}
              <Name value={h.system} system />
            </span>
          {/each}
          {#if ahead.length > 4}<span class="more">+{ahead.length - 4}</span>{/if}
          <span class="tot num">{totalLy.toFixed(0)}ly · {fuelStars} fuel</span>
        {:else}
          <span class="dim">No route plotted.</span>
        {/if}
      </div>
    {/if}

    <div class="drive">
      {#each drive as b (b.cmd)}
        {@const key = keyFor(b.cmd)}
        <button class="act {b.tone}" class:charging={b.tone === 'hero' && (f.fsdCharging || f.fsdJump)}
          class:locked={b.tone === 'hero' && f.fsdMassLocked} disabled={!key} onclick={() => sendCommand(b.cmd)}
          title={key ?? 'no bind'}>
          <span class="icon" aria-hidden="true">{b.icon}</span>
          <span class="words">
            <b>{b.label}</b>
            <span class="sub">{b.sub}</span>
          </span>
          <span class="key">{key ?? 'no bind'}</span>
        </button>
      {/each}
    </div>
  </Panel>

  <Panel class="systems" title="Ship systems">
    <div class="groups">
      {#each GROUPS as g (g.title)}
        <section class="group">
          <h3>{g.title}</h3>
          {#each g.items as t (t.cmd)}
            <Toggle label={t.label} command={t.cmd} on={t.on?.() ?? false} hot={t.hot} />
          {/each}
        </section>
      {/each}
    </div>
  </Panel>

  {#if portrait}
    <ShipPanel {s} />
    <Panel class="power" title="Power" aside="tap to add">
      <Pips sys={s.pips.sys} eng={s.pips.eng} wep={s.pips.wep} />
    </Panel>
  {/if}

  <Panel class="throttle" title="Throttle">
    <Throttle />
  </Panel>

  {#if routeColumn}
  <Panel class="route" title="Route"
    aside={hops.length ? `${hops.length - 1} jumps · ${totalLy.toFixed(0)}ly · ${fuelStars} fuel` : ''}>
    {#if hops.length}
      <ol class="hops">
        {#each hops as h, i (h.address || i)}
          <li class:here={i === hereIdx} class:done={hereIdx >= 0 && i < hereIdx}>
            <div class="l1">
              <span class="idx num">{String(i).padStart(2, '0')}</span>
              <span class="cls {h.kind}" style:color={starColor(h.cls)} title="Class {h.cls}">{h.cls || '?'}</span>
              {#if isScoopable(h.cls)}<ScoopIcon size={11} />{:else}<span class="noscoop"></span>{/if}
              <span class="name"><Name value={h.system} system /></span>
              {#if h.jump}<span class="jump-ly num">{h.jump.toFixed(1)}</span>{/if}
            </div>
            <div class="l2">
              {#if h.kind === 'neutron' || h.kind === 'whiteDwarf'}
                <span class="warn" title="Jet cone: can supercharge the FSD, careful when leaving">⚠ JET</span>
              {/if}
              {#if h.info}
                <span class="sec" style:color={securityTone(h.info.security)}>■ {h.info.security || 'n/a'}</span>
                {#if h.info.controllingPower}
                  <span class="pwr" title="{h.info.controllingPower} · {h.info.powerState}">
                    {initials(h.info.controllingPower)}<span class="dim">·{h.info.powerState.slice(0, 4)}</span>
                  </span>
                {/if}
                {#if h.info.factionState && h.info.factionState !== 'None'}
                  <span class="state">{h.info.factionState}</span>
                {/if}
                {#if h.info.allegiance}<span class="dim">{ALLEGIANCE[h.info.allegiance] ?? h.info.allegiance}</span>{/if}
                {#if h.info.needsPermit}<span class="bad" title="Permit required">🔒</span>{/if}
                {#if !h.info.population}<span class="faint">unpopulated</span>{/if}
              {:else}
                <span class="faint">…</span>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="dim">No route plotted.</p>
    {/if}
  </Panel>
  {/if}
</div>

<style>
  .flight {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 236px 270px;
    grid-template-rows: auto 1fr;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .flight > :global(.fsd) { grid-column: 1; grid-row: 1; }
  .flight > :global(.systems) { grid-column: 1; grid-row: 2; }
  .flight > :global(.systems .body) { flex: 1; display: flex; flex-direction: column; }
  .flight > :global(.throttle) { grid-column: 2; grid-row: 1 / span 2; }
  .flight > :global(.throttle .body) { flex: 1; display: flex; flex-direction: column; }
  .flight > :global(.route) { grid-column: 3; grid-row: 1 / span 2; }

  /* tablet landscape (iPad Air 3 1112×834): no route column, a narrow throttle */
  .flight.tablet-landscape { grid-template-columns: minmax(0, 1fr) 150px; }
  .tablet-landscape :global(.detent .key), .tablet-landscape :global(.boost .key) { display: none; }
  .tablet-landscape :global(.boost) { font-size: 16px; letter-spacing: 0.12em; gap: 6px; padding: 0 10px; }
  .tablet-landscape .fsd-body { grid-template-columns: minmax(160px, 200px) minmax(140px, 0.8fr) minmax(0, 1.2fr); }
  /* drive labels must fit whole in ~120px buttons */
  .tablet-landscape .drive { grid-template-columns: 1.3fr 1fr 1fr 1fr; }
  .tablet-landscape .act { padding: 10px 8px 6px; gap: 0 7px; }
  .tablet-landscape .act b { font-size: 13px; letter-spacing: 0.04em; }
  .tablet-landscape .act.hero b { font-size: 16px; letter-spacing: 0.1em; }
  .tablet-landscape .act .icon { font-size: 24px; }
  .tablet-landscape .target :global(.holo) { max-width: 96px; }
  .tablet-landscape .group { grid-template-rows: auto repeat(3, minmax(46px, 1fr)); }

  /* portrait tablets and monitors: FSD across the top; under it the switches, then SHIP | POWER,
     with the throttle as a tall lever down the right side (it needs height more than width) */
  .flight.portrait {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 168px;
    grid-template-rows: auto auto minmax(0, 1fr);
  }
  .portrait > :global(.fsd) { grid-column: 1 / -1; grid-row: 1; }
  .portrait > :global(.systems) { grid-column: 1 / 3; grid-row: 2; }
  .portrait > :global(.ship) { grid-column: 1; grid-row: 3; }
  .portrait > :global(.power) { grid-column: 2; grid-row: 3; }
  .portrait > :global(.throttle) { grid-column: 3; grid-row: 2 / 4; }
  .portrait .groups { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .portrait .group { grid-template-rows: auto repeat(3, 54px); }
  .portrait .fsd-body { grid-template-columns: minmax(150px, 190px) minmax(140px, 0.8fr) minmax(0, 1.2fr); }
  .portrait .target :global(.holo) { max-width: 96px; }
  .portrait :global(.detent .key), .portrait :global(.boost .key) { display: none; }
  .portrait :global(.boost) { font-size: 16px; letter-spacing: 0.12em; gap: 6px; padding: 0 10px; }
  .portrait > :global(.power .body) { flex: 1; display: flex; flex-direction: column; }
  .portrait { --bar-min: 60px; }
  .portrait :global(.ship .stack) { gap: 5px; }

  .strip {
    display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 5px 8px;
    border: 1px solid var(--rule); background: var(--rail); font-size: 12px;
    white-space: nowrap; overflow: hidden;
  }
  .strip .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .strip .hop { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .strip .cls { font-weight: 700; }
  .strip .sep { color: var(--hud); }
  .strip .more { color: var(--muted); }
  .strip .tot { margin-left: auto; color: var(--dim); font-size: 11px; }

  .fsd-body {
    display: grid;
    grid-template-columns: minmax(170px, 250px) minmax(150px, 0.8fr) minmax(0, 1.2fr);
    gap: 12px;
    align-items: center;
  }
  .gauge { min-width: 0; }
  .readouts { gap: 5px 10px; }
  .readouts dd { font-size: 14px; }
  .readouts .big { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1.1; }
  .readouts .big small { font-size: 12px; color: var(--muted); margin-left: 1px; }
  .readouts .next { font-size: 15px; font-weight: 700; color: var(--telemetry); }
  .readouts, .t-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    margin: 0;
    font-size: 12px;
  }
  dt { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .target {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    background: radial-gradient(ellipse at 50% 40%, rgb(255 122 24 / 0.07), transparent 70%), var(--rail);
    border: 1px solid var(--rule);
    min-width: 0;
  }
  .t-head { display: flex; justify-content: space-between; align-items: center; }
  .t-label { color: var(--hud-hi); font-size: 10px; font-weight: 700; letter-spacing: 0.15em; }
  .fuel { display: flex; gap: 4px; align-items: center; color: var(--hud-hi); font-size: 10px; font-weight: 700; }
  .t-name { color: var(--text); font-weight: 700; font-size: 14px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t-sub { color: var(--telemetry); font-size: 11px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t-facts { margin-top: 4px; grid-template-columns: auto 1fr auto 1fr; }
  /* long facts (services, power) wrap instead of ending in "…" */
  .t-facts dd { white-space: normal; overflow-wrap: anywhere; line-height: 1.25; }

  /* drive actions: the most used buttons on the screen, sized for a thumb */
  .drive { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 6px; margin-top: 10px; }
  .act {
    --tone: var(--hud);
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    align-items: center;
    gap: 0 10px;
    min-height: 76px;
    padding: 10px 12px 6px;
    background: linear-gradient(to bottom, #2b2014, var(--steel));
    border: 1px solid var(--rule);
    border-top: 3px solid var(--tone);
    color: var(--tone);
    text-align: left;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
  }
  .act .icon { grid-row: 1 / span 2; font-size: 30px; line-height: 1; text-shadow: 0 0 10px var(--tone); }
  .act .words { display: flex; flex-direction: column; min-width: 0; }
  .act b { font-size: 15px; letter-spacing: 0.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act .sub { color: var(--muted); font-size: 10px; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act .key { grid-column: 2; color: var(--dim); font-size: 10px; }
  .act:active:not(:disabled) { filter: brightness(1.35); transform: translateY(1px); }
  .act:disabled { opacity: 0.35; cursor: not-allowed; }
  .act.cruise { --tone: var(--hud); }
  .act.auto { --tone: var(--hud-hi); }
  .act.target { --tone: var(--telemetry); }

  /* HYPERSPACE: the hero, a lit cyan plate that glows harder while the drive charges */
  .act.hero {
    --tone: var(--void);
    background: linear-gradient(120deg, #7fe7f0, var(--telemetry) 55%, #1f8e99);
    border: 0;
    box-shadow: 0 0 18px rgb(55 198 212 / 0.35);
  }
  .act.hero b { font-size: 18px; letter-spacing: 0.14em; }
  .act.hero .sub, .act.hero .key { color: rgb(11 7 5 / 0.7); font-weight: 700; }
  .act.hero .icon { text-shadow: none; }
  .act.hero.charging { animation: charge 0.45s ease-in-out infinite alternate; }
  @keyframes charge { to { filter: brightness(1.35); box-shadow: 0 0 34px rgb(55 198 212 / 0.8); } }
  .act.hero.locked { background: linear-gradient(120deg, #8a3d34, #5c2620); --tone: #ffd0c8; }
  .act.hero.locked .sub { color: #ffd0c8; }

  /* switches in four groups of three; they fill the panel height */
  .groups {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .group {
    display: grid;
    grid-template-rows: auto repeat(3, minmax(56px, 1fr));
    gap: 5px;
    padding: 0 6px 6px;
    border: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgb(255 122 24 / 0.05), transparent 40%);
  }
  .group h3 {
    margin: 0 -6px;
    padding: 4px 8px;
    color: var(--hud-hi);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--rule);
  }

  .hops { list-style: none; margin: 0; padding: 0; }
  .hops li { padding: 4px 0 5px; border-bottom: 1px solid var(--rule); }
  .hops li.here { background: rgb(255 122 24 / 0.08); box-shadow: inset 2px 0 var(--hud); }
  .hops li.done { opacity: 0.45; }
  .l1 { display: flex; align-items: center; gap: 5px; }
  .idx { color: var(--faint); font-size: 11px; width: 1.6em; }
  .cls { font-weight: 700; min-width: 1.6em; text-align: center; font-size: 12px; }
  .cls.neutron, .cls.whiteDwarf { text-decoration: underline wavy var(--danger); }
  .noscoop { width: 11px; flex: none; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .here .name { color: var(--hud); font-weight: 700; }
  .jump-ly { color: var(--dim); font-size: 11px; }
  .l2 { display: flex; flex-wrap: wrap; gap: 3px 8px; padding-left: calc(1.6em + 5px); font-size: 10px; margin-top: 1px; }
  .pwr { color: var(--muted); }
  .state { color: var(--telemetry); }
  .warn { color: var(--danger); font-weight: 700; }
  .faint { color: var(--faint); }
</style>
