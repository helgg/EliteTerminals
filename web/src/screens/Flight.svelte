<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import { sendCommand } from '../lib/link.svelte.ts';

  let { s }: { s: EdState } = $props();

  const f = $derived(s.flags);
  const fsd = $derived(
    f.fsdJump ? ['JUMPING', 'tele']
    : f.fsdCharging ? ['CHARGING', 'tele']
    : f.fsdCooldown ? ['COOLDOWN', 'dim']
    : f.fsdMassLocked ? ['MASS LOCKED', 'bad']
    : f.supercruise ? ['SUPERCRUISE', 'tele']
    : ['READY', 'ok'],
  );

  const throttle = [
    ['100', 'SetSpeed100'], ['75', 'SetSpeed75'], ['50', 'SetSpeed50'], ['25', 'SetSpeed25'],
    ['0', 'SetSpeedZero'], ['-25', 'SetSpeedMinus25'], ['-50', 'SetSpeedMinus50'], ['-100', 'SetSpeedMinus100'],
  ];
</script>

<div class="flight">
  <Panel title="Frame shift drive" aside={s.route.fsdTarget ? `alvo ${s.route.fsdTarget}` : ''}>
    <div class="fsd">
      <div class="state {fsd[1]}">{fsd[0]}</div>
      <div class="jumps num">
        <span class="dim">saltos</span> {s.route.remainingJumps}
        <span class="dim">· alcance</span> {s.ship.maxJumpRange.toFixed(1)} ly
      </div>
      <div class="actions">
        <button class="act chamfer" onclick={() => sendCommand('Supercruise')}>SUPERCRUISE</button>
        <button class="act chamfer tele" onclick={() => sendCommand('Hyperspace')}>HYPERSPACE</button>
        <button class="act chamfer" onclick={() => sendCommand('HyperSuperCombination')}>FSD (auto)</button>
      </div>
    </div>
  </Panel>

  <Panel title="Throttle">
    <div class="throttle">
      {#each throttle as [label, cmd] (cmd)}
        <button class="thr chamfer" class:rev={label.startsWith('-')} class:zero={label === '0'}
          onclick={() => sendCommand(cmd)}>{label}%</button>
      {/each}
      <button class="thr chamfer boost" onclick={() => sendCommand('UseBoostJuice')}>BOOST</button>
    </div>
  </Panel>

  <Panel title="Ship systems">
    <div class="toggles">
      <Toggle label="Landing gear" command="LandingGearToggle" on={f.landingGearDown} hot />
      <Toggle label="Cargo scoop" command="ToggleCargoScoop" on={f.cargoScoopDeployed} hot />
      <Toggle label="Hardpoints" command="DeployHardpointToggle" on={f.hardpointsDeployed} hot />
      <Toggle label="Lights" command="ShipSpotLightToggle" on={f.lightsOn} />
      <Toggle label="Night vision" command="NightVisionToggle" on={f.nightVision} />
      <Toggle label="Silent running" command="ToggleButtonUpInput" on={f.silentRunning} hot />
      <Toggle label="Flight assist off" command="ToggleFlightAssist" on={f.flightAssistOff} hot />
      <Toggle label="Heatsink" command="DeployHeatSink" />
      <Toggle label="Analysis mode" command="PlayerHUDModeToggle" on={f.hudAnalysisMode} />
      <Toggle label="Galaxy map" command="GalaxyMapOpen" />
      <Toggle label="System map" command="SystemMapOpen" />
      <Toggle label="Docking request" command="RequestDocking" />
    </div>
  </Panel>

  <Panel title="Route" aside="{s.route.hops.length} sistemas">
    {#if s.route.hops.length}
      <ol class="route">
        {#each s.route.hops as hop, i (hop.address || i)}
          <li class:here={hop.system === s.location.system}>
            <span class="num dim">{String(i).padStart(2, '0')}</span>
            <span>{hop.system}</span>
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
    grid-template-columns: 1.2fr 1fr;
    grid-template-rows: auto auto 1fr;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .flight > :global(:nth-child(3)) { grid-column: 1; }
  .flight > :global(:nth-child(4)) { grid-column: 2; grid-row: 1 / span 3; }

  .fsd { display: grid; gap: 8px; }
  .state { font-size: 22px; font-weight: 700; letter-spacing: 0.12em; }
  .state.ok { color: var(--ok); }
  .state.tele { color: var(--telemetry); text-shadow: 0 0 8px rgb(55 198 212 / 0.5); }
  .state.bad { color: var(--danger); }
  .state.dim { color: var(--dim); }
  .jumps { color: var(--text); }
  .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .act {
    padding: 10px 4px;
    background: var(--steel);
    border: 0;
    color: var(--hud);
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .act.tele { color: var(--telemetry); }
  .act:active, .thr:active { background: var(--rule); }

  .throttle { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .thr {
    padding: 10px 0;
    background: var(--steel);
    border: 0;
    color: var(--text);
    font-weight: 700;
  }
  .thr.zero { color: var(--hud-hi); }
  .thr.rev { color: var(--danger); }
  .thr.boost { background: var(--hud); color: var(--void); grid-column: span 2; }

  .toggles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }

  .route { list-style: none; margin: 0; padding: 0; }
  .route li {
    display: grid;
    grid-template-columns: 2.2em 1fr auto;
    gap: 6px;
    padding: 3px 0;
    border-bottom: 1px solid var(--rule);
  }
  .route li.here { color: var(--hud); }
  .star { color: var(--faint); }
  .star.scoop { color: var(--hud-hi); }
</style>
