<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import Throttle from '../lib/Throttle.svelte';
  import FsdGauge from '../lib/FsdGauge.svelte';
  import Hologram from '../lib/Hologram.svelte';
  import ScoopIcon from '../lib/ScoopIcon.svelte';
  import Name from '../lib/Name.svelte';
  import { keyFor, sendCommand } from '../lib/link.svelte.ts';
  import { resolveTarget } from '../lib/target.ts';
  import { currentJumpRange } from '../lib/jump.ts';
  import {
    ALLEGIANCE, distanceLy, initials, isScoopable, securityTone, starClass, starColor, starKind,
  } from '../lib/astro.ts';

  let { s }: { s: EdState } = $props();

  const f = $derived(s.flags);
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
  const fuelStars = $derived(hops.filter((h) => isScoopable(h.cls)).length);

  const jumpButtons = [
    { label: 'SUPERCRUISE', cmd: 'Supercruise', tone: '' },
    { label: 'HYPERSPACE', cmd: 'Hyperspace', tone: 'tele' },
    { label: 'FSD AUTO', cmd: 'HyperSuperCombination', tone: '' },
  ];
</script>

<div class="flight">
  <Panel class="fsd" title="Frame shift drive" aside={f.supercruise ? 'supercruise' : 'normal space'}>
    <div class="fsd-body">
      <div class="gauge-col">
        <FsdGauge flags={f} />
        <dl class="readouts">
          <dt>NEXT</dt><dd><Name value={next?.system ?? ''} system /></dd>
          <dt>JUMPS</dt><dd class="num">{s.route.remainingJumps}</dd>
          <dt>RANGE</dt>
          <dd class="num" title="Estimate with the current cargo and fuel (max empty: {s.ship.maxJumpRange.toFixed(2)}ly)">
            ≈{currentJumpRange(s).toFixed(1)}ly
          </dd>
          <dt>LAST</dt>
          <dd class="num">{s.ship.lastJump.distance ? `${s.ship.lastJump.distance.toFixed(1)}ly ${s.ship.lastJump.fuelUsed.toFixed(1)}t` : '—'}</dd>
          <dt>FUEL</dt><dd class="num" class:bad={f.lowFuel}>{s.status.fuelMain.toFixed(1)}t</dd>
        </dl>
      </div>

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

    <div class="jumps">
      {#each jumpButtons as b (b.cmd)}
        <button class="jump chamfer {b.tone}" disabled={!keyFor(b.cmd)} onclick={() => sendCommand(b.cmd)}>
          <span>{b.label}</span><span class="key">{keyFor(b.cmd) ?? 'no bind'}</span>
        </button>
      {/each}
    </div>
  </Panel>

  <Panel class="systems" title="Ship systems">
    <div class="switches">
      <Toggle label="Landing gear" command="LandingGearToggle" on={f.landingGearDown} hot />
      <Toggle label="Cargo scoop" command="ToggleCargoScoop" on={f.cargoScoopDeployed} hot />
      <Toggle label="Hardpoints" command="DeployHardpointToggle" on={f.hardpointsDeployed} hot />
      <Toggle label="Flight assist off" command="ToggleFlightAssist" on={f.flightAssistOff} hot />
      <Toggle label="Lights" command="ShipSpotLightToggle" on={f.lightsOn} />
      <Toggle label="Night vision" command="NightVisionToggle" on={f.nightVision} />
      <Toggle label="Silent running" command="ToggleButtonUpInput" on={f.silentRunning} hot />
      <Toggle label="Analysis mode" command="PlayerHUDModeToggle" on={f.hudAnalysisMode} />
      <Toggle label="Heatsink" command="DeployHeatSink" />
      <Toggle label="Galaxy map" command="GalaxyMapOpen" />
      <Toggle label="System map" command="SystemMapOpen" />
      <Toggle label="Docking request" command="RequestDocking" />
    </div>
  </Panel>

  <Panel class="throttle" title="Throttle">
    <Throttle />
  </Panel>

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

  .fsd-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
    gap: 12px;
  }
  .gauge-col { display: grid; grid-template-columns: minmax(110px, 170px) 1fr; gap: 10px; align-items: center; }
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

  .jumps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
  .jump {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 4px;
    background: var(--steel);
    border: 0;
    color: var(--hud);
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .jump.tele { color: var(--telemetry); }
  .jump .key { color: var(--dim); font-size: 10px; font-weight: 400; letter-spacing: 0; }
  .jump:active:not(:disabled) { background: var(--rule); }
  .jump:disabled { opacity: 0.35; cursor: not-allowed; }

  /* switches grow to fill the panel: big touch targets, no dead space */
  .switches {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: minmax(52px, 1fr);
    gap: 6px;
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
