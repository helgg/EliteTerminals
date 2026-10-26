<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Toggle from '../lib/Toggle.svelte';
  import Throttle from '../lib/Throttle.svelte';
  import FsdGauge from '../lib/FsdGauge.svelte';
  import Hologram from '../lib/Hologram.svelte';
  import ScoopIcon from '../lib/ScoopIcon.svelte';
  import StarIcon from '../lib/StarIcon.svelte';
  import PadBadge from '../lib/PadBadge.svelte';
  import ServiceIcon, { serviceKinds } from '../lib/ServiceIcon.svelte';
  import Name from '../lib/Name.svelte';
  import ShipPanel from '../lib/ShipPanel.svelte';
  import Pips from '../lib/Pips.svelte';
  import SystemPanel from '../lib/SystemPanel.svelte';
  import { viewport } from '../lib/viewport.svelte.ts';
  import { keyFor, link, sendCommand } from '../lib/link.svelte.ts';
  import { resolveTarget } from '../lib/target.ts';
  import { currentJumpRange } from '../lib/jump.ts';
  import {
    ALLEGIANCE, distanceLy, initials, isScoopable, securityTone, starClass, starColor, starKind,
  } from '../lib/astro.ts';

  let { s }: { s: EdState } = $props();

  const f = $derived(s.flags);
  const vp = $derived(viewport.vp);
  const phone = $derived(viewport.device === 'phone');
  // Portrait screens have no side column: SHIP and POWER come into this grid.
  const portrait = $derived(viewport.orientation === 'portrait' && viewport.device !== 'phone');
  // The full route list only on monitors (a column, or a bottom row when portrait); elsewhere a strip.
  const routeColumn = $derived(viewport.device === 'desktop');
  const tallPortrait = $derived(vp === 'desktop-portrait');
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

  // Phones show one page at a time; the last page is remembered per device.
  type Page = 'drive' | 'systems' | 'power' | 'route';
  const PAGES: { id: Page; label: string; icon: string }[] = [
    { id: 'drive', label: 'DRIVE', icon: '»' },
    { id: 'systems', label: 'SYSTEMS', icon: '▦' },
    { id: 'power', label: 'POWER', icon: '▮' },
    { id: 'route', label: 'ROUTE', icon: '⋯' },
  ];
  let page = $state<Page>(readPage());
  function readPage(): Page {
    try {
      const saved = localStorage.getItem('et.flight.page') as Page | null;
      if (saved && PAGES.some((p) => p.id === saved)) return saved;
    } catch {}
    return 'drive';
  }
  function setPage(p: Page) {
    page = p;
    try { localStorage.setItem('et.flight.page', p); } catch {}
  }

  // Phone DRIVE page: forward throttle detents and the three switches used on every approach.
  const QUICK = [
    { pct: 100, cmd: 'SetSpeed100' }, { pct: 75, cmd: 'SetSpeed75' }, { pct: 50, cmd: 'SetSpeed50' },
    { pct: 25, cmd: 'SetSpeed25' }, { pct: 0, cmd: 'SetSpeedZero' },
  ];
  const QUICK_TOGGLES = ['LandingGearToggle', 'ToggleCargoScoop', 'DeployHardpointToggle'];

  const alerts = $derived([
    { on: f.overHeating, label: 'HEAT' },
    { on: f.isInDanger, label: 'DANGER' },
    { on: f.beingInterdicted, label: 'INTERDICTION' },
    { on: f.lowFuel, label: 'LOW FUEL' },
    { on: !f.shieldsUp && f.inMainShip, label: 'SHIELDS DOWN' },
  ]);
  const alertsOn = $derived(alerts.some((a) => a.on));

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

<!-- The pieces of the screen, arranged differently per viewport (docs/design/RESPONSIVE-FLIGHT.md). -->
{#snippet gauge()}
  <div class="gauge"><FsdGauge flags={f} caption={range ? `RANGE ≈${range.toFixed(1)}ly` : ''} /></div>
{/snippet}

{#snippet readouts(full: boolean)}
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
    {#if full}
      <dt>LAST JUMP</dt>
      <dd class="num">{s.ship.lastJump.distance ? `${s.ship.lastJump.distance.toFixed(1)}ly · ${s.ship.lastJump.fuelUsed.toFixed(1)}t` : '—'}</dd>
    {/if}
  </dl>
{/snippet}

{#snippet targetCard()}
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
      {#if target.pad}<dt>PAD</dt><dd><PadBadge pad={target.pad} /></dd>{/if}
      {#if target.services && serviceKinds(target.services).length}
        <dt>SVC</dt><dd class="svcs">{#each serviceKinds(target.services) as k (k)}<ServiceIcon kind={k} size={14} />{/each}</dd>
      {/if}
    </dl>
  </div>
{/snippet}

{#snippet strip(max: number)}
  <!-- the route column's job, in one line: the next stars and whether they refuel -->
  <div class="strip" title="{hops.length ? `${hops.length - 1} jumps · ${totalLy.toFixed(0)}ly` : ''}">
    <span class="k">ROUTE</span>
    {#if ahead.length}
      {#each ahead.slice(0, max) as h, i (h.address || i)}
        {#if i}<span class="sep">›</span>{/if}
        <span class="hop">
          <StarIcon cls={h.cls} size={11} />
          <span class="cls" style:color={starColor(h.cls)}>{h.cls || '?'}</span>
          <Name value={h.system} system />
        </span>
      {/each}
      {#if ahead.length > max}<span class="more">+{ahead.length - max}</span>{/if}
      <span class="tot num">{totalLy.toFixed(0)}ly · {fuelStars} fuel</span>
    {:else}
      <span class="dim">No route plotted.</span>
    {/if}
  </div>
{/snippet}

{#snippet act(b: (typeof drive)[number])}
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
{/snippet}

{#snippet groups()}
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
{/snippet}

{#snippet routeList()}
  {#if hops.length}
    <ol class="hops">
      {#each hops as h, i (h.address || i)}
        <li class:here={i === hereIdx} class:done={hereIdx >= 0 && i < hereIdx}>
          <div class="l1">
            <span class="idx num">{String(i).padStart(2, '0')}</span>
            <StarIcon cls={h.cls} size={12} />
            <span class="cls {h.kind}" style:color={starColor(h.cls)} title="Class {h.cls}">{h.cls || '?'}</span>
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
{/snippet}

{#snippet throttleRow()}
  <!-- phones: the forward detents only, in a row (the throttle column needs height a phone lacks) -->
  <div class="trow">
    {#each QUICK as d (d.cmd)}
      <button class:set={link.throttleCmd === d.cmd} class:zero={d.pct === 0} disabled={!keyFor(d.cmd)}
        onclick={() => sendCommand(d.cmd)} title={keyFor(d.cmd) ?? 'no bind'}>{d.pct || 'ZERO'}</button>
    {/each}
  </div>
{/snippet}

{#snippet boost()}
  <button class="pboost" disabled={!keyFor('UseBoostJuice')} onclick={() => sendCommand('UseBoostJuice')}
    title={keyFor('UseBoostJuice') ?? 'no bind'}><span aria-hidden="true">›››</span> BOOST</button>
{/snippet}

{#snippet quick()}
  <div class="quick">
    {#each GROUPS.flatMap((g) => g.items).filter((t) => QUICK_TOGGLES.includes(t.cmd)) as t (t.cmd)}
      <Toggle label={t.label} command={t.cmd} on={t.on?.() ?? false} hot={t.hot} />
    {/each}
  </div>
{/snippet}

{#if phone}
  <!-- PHONES: one page at a time, no scrolling; tabs at the bottom (portrait) or down the left (landscape) -->
  <div class="phone {viewport.orientation}">
    <nav class="pages" aria-label="Flight pages">
      {#each PAGES as p (p.id)}
        <button class:on={page === p.id} onclick={() => setPage(p.id)}>
          <span class="pi" aria-hidden="true">{p.icon}</span><span>{p.label}</span>
          {#if p.id === 'power' && alertsOn}<span class="dot"></span>{/if}
        </button>
      {/each}
    </nav>

    <div class="page p-{page}">
      {#if page === 'drive'}
        <div class="head">
          {@render gauge()}
          {@render readouts(false)}
        </div>
        {#if alertsOn}
          <div class="alerts">{#each alerts.filter((a) => a.on) as a (a.label)}<span>{a.label}</span>{/each}</div>
        {/if}
        {#if viewport.orientation === 'portrait'}{@render strip(2)}{/if}
        <div class="acts">
          {#each drive as b (b.cmd)}{@render act(b)}{/each}
          {@render boost()}
        </div>
        {@render throttleRow()}
        {@render quick()}
      {:else if page === 'systems'}
        {@render groups()}
      {:else if page === 'power'}
        <ShipPanel {s} />
        <Panel class="power" title="Power" aside="tap to add">
          <Pips sys={s.pips.sys} eng={s.pips.eng} wep={s.pips.wep} />
        </Panel>
      {:else}
        {@render targetCard()}
        <Panel class="route" title="Route"
          aside={hops.length ? `${hops.length - 1} jumps · ${totalLy.toFixed(0)}ly · ${fuelStars} fuel` : ''}>
          {@render routeList()}
        </Panel>
      {/if}
    </div>
  </div>
{:else}
<div class="flight {vp}" class:portrait>
  <Panel class="fsd" title="Frame shift drive" aside={f.supercruise ? 'supercruise' : 'normal space'}>
    <div class="fsd-body">
      {@render gauge()}
      {@render readouts(true)}
      {@render targetCard()}
    </div>

    {#if !routeColumn}{@render strip(4)}{/if}

    <div class="drive">
      {#each drive as b (b.cmd)}{@render act(b)}{/each}
    </div>
  </Panel>

  <Panel class="systems" title="Ship systems">
    {@render groups()}
  </Panel>

  {#if portrait}
    <ShipPanel {s} />
    <Panel class="power" title="Power" aside="tap to add">
      <Pips sys={s.pips.sys} eng={s.pips.eng} wep={s.pips.wep} />
    </Panel>
  {/if}
  <!-- a portrait monitor has the height for the system details the side column shows elsewhere -->
  {#if tallPortrait}<SystemPanel {s} />{/if}

  <Panel class="throttle" title="Throttle">
    <Throttle />
  </Panel>

  {#if routeColumn}
  <Panel class="route" title="Route"
    aside={hops.length ? `${hops.length - 1} jumps · ${totalLy.toFixed(0)}ly · ${fuelStars} fuel` : ''}>
    {@render routeList()}
  </Panel>
  {/if}
</div>
{/if}

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

  /* ---------------- phones ---------------- */
  .phone { height: 100%; min-height: 0; display: grid; gap: 6px; }
  .phone.portrait { grid-template-rows: minmax(0, 1fr) auto; }
  .phone.portrait .pages { grid-row: 2; }
  .phone.portrait .page { grid-row: 1; }
  .phone.landscape { grid-template-columns: 62px minmax(0, 1fr); }

  .pages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .landscape .pages { grid-template-columns: 1fr; grid-auto-rows: 1fr; }
  .pages button {
    position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
    min-height: 52px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi);
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  }
  .pages .pi { font-size: 18px; line-height: 1; }
  .pages button.on { background: var(--hud); border-color: var(--hud); color: var(--void); box-shadow: var(--glow); }
  .pages .dot { position: absolute; top: 5px; right: 7px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }

  .page { min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; }

  /* DRIVE */
  .page.p-drive .head { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr); gap: 8px; align-items: center; }
  .page.p-drive .readouts { gap: 3px 8px; }
  .page.p-drive .readouts .big { font-size: 19px; }
  .acts { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1.25fr 1fr 1fr; gap: 6px; }
  .acts .act.hero { grid-column: 1 / -1; }
  .phone .act { min-height: 0; padding: 6px 10px; grid-template-rows: 1fr; }
  .phone .act .key { display: none; }
  .phone .act b { font-size: 13px; letter-spacing: 0.05em; }
  .phone .act .icon { font-size: 22px; }
  .phone .act.hero b { font-size: 18px; letter-spacing: 0.12em; }
  .pboost {
    display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 0;
    background: linear-gradient(to right, #ff8c33, var(--hud)); border: 0; color: var(--void);
    font-size: 16px; font-weight: 800; letter-spacing: 0.18em; box-shadow: var(--glow);
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }
  .pboost:active:not(:disabled) { filter: brightness(1.25); }
  .pboost:disabled { opacity: 0.35; }
  .trow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
  .trow button {
    min-height: 44px; background: var(--steel); border: 1px solid var(--rule); color: var(--text);
    font-size: 15px; font-weight: 700;
  }
  .trow button.zero { color: var(--hud-hi); border-color: var(--hud-hi); letter-spacing: 0.08em; font-size: 13px; }
  .trow button.set { background: var(--hud); border-color: var(--hud); color: var(--void); box-shadow: var(--glow); }
  .trow button:disabled { opacity: 0.35; }
  .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .quick :global(.toggle) { min-height: 50px; padding: 8px 8px 5px; font-size: 11px; }
  .page .alerts { display: flex; flex-wrap: wrap; gap: 4px; }
  .page .alerts span {
    padding: 3px 8px; background: var(--danger); color: var(--void); font-size: 11px; font-weight: 800;
    letter-spacing: 0.08em; animation: blink 1s infinite alternate;
  }
  @keyframes blink { to { opacity: 0.6; } }

  /* DRIVE, phone on its side: instrument | actions | throttle column */
  .landscape .page.p-drive {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.6fr) 74px;
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .landscape .page.p-drive .head { grid-column: 1; grid-row: 1; grid-template-columns: 1fr; align-content: center; gap: 4px; }
  .landscape .page.p-drive .head :global(.gauge) { max-width: 120px; margin: 0 auto; }
  .landscape .page.p-drive .readouts { font-size: 12px; }
  .landscape .page.p-drive .readouts .big { font-size: 16px; }
  .landscape .page.p-drive .alerts { grid-column: 1; grid-row: 2; }
  .landscape .acts { grid-column: 2; grid-row: 1; grid-template-rows: 1.2fr 1fr 1fr; }
  .landscape .quick { grid-column: 2; grid-row: 2; }
  .landscape .quick :global(.toggle) { min-height: 44px; }
  .landscape .trow { grid-column: 3; grid-row: 1 / 3; grid-template-columns: 1fr; grid-template-rows: repeat(5, 1fr); }

  /* SYSTEMS: the four groups fill the page */
  .page.p-systems .groups { flex: 1; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 6px; }
  .landscape .page.p-systems .groups { grid-template-columns: repeat(4, 1fr); }
  .page.p-systems .group { grid-template-rows: auto repeat(3, minmax(0, 1fr)); }

  /* POWER: ship condition + a big distributor */
  .page.p-power { --bar-min: 80px; }
  .page.p-power > :global(.power) { flex: 1; min-height: 0; }
  .page.p-power > :global(.power .body) { flex: 1; display: flex; flex-direction: column; }
  .landscape .page.p-power { flex-direction: row; --bar-min: 60px; }
  .landscape .page.p-power > :global(*) { flex: 1; min-width: 0; }

  /* ROUTE: the target, then the route (the list scrolls inside its panel) */
  .page.p-route > :global(.route) { flex: 1; min-height: 0; }
  .page.p-route .target :global(.holo) { max-width: 110px; }
  .landscape .page.p-route { flex-direction: row; }
  .landscape .page.p-route .target { flex: 1; min-width: 0; }
  .landscape .page.p-route > :global(.route) { flex: 1.3; min-width: 0; }

  /* portrait monitor (1080×1920 at 125% ≈ 864×1430): the iPad portrait layout plus a fourth row
     with the SYSTEM details and the full ROUTE, and bigger instruments */
  .flight.desktop-portrait { grid-template-rows: auto auto auto minmax(0, 1fr); --bar-min: 110px; }
  .flight.desktop-portrait > :global(.system) { grid-column: 1; grid-row: 4; }
  .flight.desktop-portrait > :global(.route) { grid-column: 2 / -1; grid-row: 4; }
  .flight.desktop-portrait .fsd-body { grid-template-columns: minmax(190px, 240px) minmax(150px, 0.8fr) minmax(0, 1.2fr); }
  .flight.desktop-portrait .target :global(.holo) { max-width: 130px; }
  .flight.desktop-portrait .group { grid-template-rows: auto repeat(3, 60px); }

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
  .t-facts .svcs { display: flex; flex-wrap: wrap; gap: 3px; }
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
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .here .name { color: var(--hud); font-weight: 700; }
  .jump-ly { color: var(--dim); font-size: 11px; }
  .l2 { display: flex; flex-wrap: wrap; gap: 3px 8px; padding-left: calc(1.6em + 5px); font-size: 10px; margin-top: 1px; }
  .pwr { color: var(--muted); }
  .state { color: var(--telemetry); }
  .warn { color: var(--danger); font-weight: 700; }
  .faint { color: var(--faint); }
</style>
