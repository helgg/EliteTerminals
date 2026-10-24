<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import Throttle from '../lib/Throttle.svelte';
  import FsdGauge from '../lib/FsdGauge.svelte';
  import { keyFor, sendCommand } from '../lib/link.svelte.ts';

  let { s }: { s: EdState } = $props();

  const f = $derived(s.flags);
  const next = $derived(s.route.hops.find((h, i) => i > 0 && s.route.hops[i - 1].system === s.location.system));

  const jumpButtons = [
    { label: 'SUPERCRUISE', cmd: 'Supercruise', tone: '' },
    { label: 'HYPERSPACE', cmd: 'Hyperspace', tone: 'tele' },
    { label: 'FSD AUTO', cmd: 'HyperSuperCombination', tone: '' },
  ];
</script>

<div class="flight">
  <Panel class="fsd" title="Frame shift drive" aside={f.supercruise ? 'supercruise' : 'normal space'}>
    <div class="fsd-body">
      <FsdGauge flags={f} />
      <dl class="readouts">
        <dt>TARGET</dt><dd class="tele">{s.route.fsdTarget || '—'}</dd>
        <dt>NEXT</dt><dd>{next?.system ?? '—'} {#if next}<span class="dim">{next.starClass}</span>{/if}</dd>
        <dt>JUMPS</dt><dd class="num">{s.route.remainingJumps}</dd>
        <dt>RANGE</dt><dd class="num">{s.ship.maxJumpRange.toFixed(2)} ly</dd>
        <dt>FUEL</dt><dd class="num" class:bad={f.lowFuel}>{s.status.fuelMain.toFixed(1)} t</dd>
      </dl>
    </div>
    <div class="jumps">
      {#each jumpButtons as b (b.cmd)}
        <button class="jump chamfer {b.tone}" disabled={!keyFor(b.cmd)} onclick={() => sendCommand(b.cmd)}>
          <span>{b.label}</span><span class="key">{keyFor(b.cmd) ?? 'sem bind'}</span>
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

  <Panel class="route" title="Route" aside="{s.route.hops.length} sistemas">
    {#if s.route.hops.length}
      <ol class="hops">
        {#each s.route.hops as hop, i (hop.address || i)}
          <li class:here={hop.system === s.location.system}>
            <span class="num dim">{String(i).padStart(2, '0')}</span>
            <span class="name">{hop.system}</span>
            <span class="star" class:scoop={'KGBFOAM'.includes(hop.starClass)}>{hop.starClass}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="dim">Sem rota plotada.</p>
    {/if}
  </Panel>
</div>

<style>
  .flight {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 236px 240px;
    grid-template-rows: auto 1fr;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .flight > :global(.fsd) { grid-column: 1; grid-row: 1; }
  .flight > :global(.systems) { grid-column: 1; grid-row: 2; }
  .flight > :global(.throttle) { grid-column: 2; grid-row: 1 / span 2; }
  .flight > :global(.throttle .body) { flex: 1; display: flex; flex-direction: column; }
  .flight > :global(.systems .body) { flex: 1; display: flex; flex-direction: column; }
  .flight > :global(.route) { grid-column: 3; grid-row: 1 / span 2; }

  .fsd-body {
    display: grid;
    grid-template-columns: minmax(150px, 230px) 1fr;
    gap: 14px;
    align-items: center;
  }
  .readouts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 12px;
    margin: 0;
    font-size: 13px;
  }
  dt { color: var(--dim); font-size: 11px; letter-spacing: 0.1em; align-self: center; }
  dd { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
  .hops li {
    display: grid;
    grid-template-columns: 2.2em 1fr auto;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--rule);
  }
  .hops li.here { color: var(--hud); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .star { color: var(--faint); }
  .star.scoop { color: var(--hud-hi); }
</style>
