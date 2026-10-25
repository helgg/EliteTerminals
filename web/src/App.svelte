<script lang="ts">
  import { onMount } from 'svelte';
  import { connect, link } from './lib/link.svelte.ts';
  import Panel from './lib/Panel.svelte';
  import Pips from './lib/Pips.svelte';
  import Bar from './lib/Bar.svelte';
  import SystemPanel from './lib/SystemPanel.svelte';
  import Flight from './screens/Flight.svelte';
  import Trade from './screens/Trade.svelte';
  import Name from './lib/Name.svelte';
  import { copied } from './lib/copy.svelte.ts';

  const TABS = ['FLIGHT', 'COMBAT', 'EXPLORE', 'MINING', 'TRADE', 'SRV', 'CARRIER'] as const;
  type Tab = (typeof TABS)[number];

  let tab = $state<Tab>(readTab());
  let now = $state(Date.now());

  onMount(() => {
    connect();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  function readTab(): Tab {
    try {
      const saved = localStorage.getItem('et.tab') as Tab | null;
      if (saved && TABS.includes(saved)) return saved;
    } catch {}
    return 'FLIGHT';
  }
  function pick(t: Tab) {
    tab = t;
    try { localStorage.setItem('et.tab', t); } catch {}
  }

  const s = $derived(link.state);
  const f = $derived(s.flags);
  const live = $derived(link.connected && s.meta.online);
  const cr = (n: number) => n.toLocaleString('en-US');
  const free = $derived(s.ship.cargoCapacity - s.cargo.count);
  const where = $derived(
    s.location.station ? `${s.location.station}` : s.location.body || (f.supercruise ? 'supercruise' : 'normal space'),
  );

  const alerts = $derived([
    { on: f.overHeating, label: 'HEAT' },
    { on: f.isInDanger, label: 'DANGER' },
    { on: f.beingInterdicted, label: 'INTERDICTION' },
    { on: f.lowFuel, label: 'LOW FUEL' },
    { on: !f.shieldsUp && f.inMainShip, label: 'SHIELDS DOWN' },
  ]);
</script>

<div class="shell" class:wide={tab === 'TRADE'}>
  <header class="top">
    <div class="brand">
      <span class="logo">ED·ET</span>
      <span class="sub dim">TERMINALS</span>
    </div>
    <div class="where">
      <div class="sys"><Name value={s.location.system} system /> <span class="dim">/</span> <span class="muted">{where}</span></div>
      <div class="line tele">
        {s.ship.label || '—'} {s.ship.ident ? `· ${s.ship.ident}` : ''} {s.ship.name ? `· ${s.ship.name}` : ''}
        <span class="dim">· CMDR</span> {s.commander.name || '—'}
        <span class="dim">·</span> <span class="num">{cr(s.commander.credits)} Cr</span>
        {#if s.ship.cargoCapacity}
          <span class="dim">· CARGO</span>
          <span class="hold" class:full={free <= 0}>
            <span class="gauge"><span style:width="{Math.min(1, s.cargo.count / s.ship.cargoCapacity) * 100}%"></span></span>
            <span class="num">{cr(s.cargo.count)}/{cr(s.ship.cargoCapacity)}t</span>
            <span class="dim num">{free > 0 ? `${cr(free)}t free` : 'FULL'}</span>
          </span>
        {/if}
      </div>
    </div>
    <nav>
      {#each TABS as t (t)}
        <button class:active={tab === t} onclick={() => pick(t)}>{t}</button>
      {/each}
    </nav>
  </header>

  <!-- TRADE needs the width for its tables; it shows its own scan/session column instead. -->
  {#if tab !== 'TRADE'}
  <aside class="side">
    <Panel title="Ship">
      <div class="stack">
        <Bar label="FUEL" value={s.status.fuelMain} max={s.ship.fuelCapacity} unit="t" warnBelow={0.25} />
        <Bar label="CARGO" value={s.cargo.count} max={s.ship.cargoCapacity} unit="t" />
        <Bar label="HULL" value={Math.round(s.ship.hullHealth * 100)} max={100} unit="%" warnBelow={0.5} />
        <div class="facts">
          <span class="dim">JUMP MAX</span><span class="num" title="Game figure: empty hold, fuel for one jump only">{s.ship.maxJumpRange.toFixed(2)}ly</span>
          <span class="dim">FIRE GRP</span><span class="num">{String.fromCharCode(65 + s.status.fireGroup)}</span>
          <span class="dim">LEGAL</span><span>{s.status.legalState || '—'}</span>
        </div>
        <div class="alerts">
          {#each alerts as a (a.label)}
            <span class="alert" class:on={a.on}>{a.label}</span>
          {/each}
        </div>
      </div>
    </Panel>
    <Panel title="Power" aside="SYS · ENG · WEP">
      <Pips sys={s.pips.sys} eng={s.pips.eng} wep={s.pips.wep} />
    </Panel>
    <SystemPanel {s} />
  </aside>
  {/if}

  <main class="main">
    {#if tab === 'FLIGHT'}
      <Flight {s} />
    {:else if tab === 'TRADE'}
      <Trade {s} {now} />
    {:else}
      <Panel title={tab} aside="under construction">
        <p class="dim">The {tab} screen arrives in a later milestone (see docs/PLAN.md).</p>
      </Panel>
    {/if}
  </main>

  <footer class="status">
    <span class="label">STATUS</span>
    <span class:ok={live} class:bad={!live}>
      {!link.connected ? 'NO CONNECTION TO THE SERVER' : s.meta.online ? 'GAME ONLINE' : 'GAME OFFLINE · last known state'}
    </span>
    {#if copied.at && now - copied.at < 4000}
      <span class:ok={copied.ok} class:bad={!copied.ok}>
        {copied.ok ? 'COPIED' : 'COPY FAILED ON PC'} · {copied.text}
      </span>
    {:else if link.last && now - link.last.at < 6000}
      <span class:ok={link.last.ok} class:bad={!link.last.ok}>
        {link.last.command} {link.last.ok ? '✓' : `✗ ${link.last.error}`}
      </span>
    {:else}
      <span class="dim">{s.meta.journal}</span>
    {/if}
    <span class="dim right">
      binds {s.controls.presets[1] ?? '—'} · {Object.keys(s.controls.keys).length} actions ·
      {s.meta.gameVersion}{s.meta.odyssey ? ' · Odyssey' : ''}
    </span>
  </footer>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: auto 1fr auto;
    gap: 8px;
    height: 100%;
    padding: 8px;
  }
  .top {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 10px;
    background: var(--rail);
    border-bottom: 1px solid var(--hud);
    box-shadow: 0 1px 0 rgb(255 122 24 / 0.25);
  }
  .brand { display: flex; flex-direction: column; }
  .logo { color: var(--hud); font-size: 20px; font-weight: 700; letter-spacing: 0.08em; text-shadow: var(--glow); }
  .sub { font-size: 9px; letter-spacing: 0.15em; }
  .where { min-width: 0; flex: 1; }
  .sys { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* hold fill, always in sight: mixed loads are bought line by line against the free tons */
  .hold { display: inline-flex; gap: 6px; align-items: center; color: var(--text); }
  .gauge { width: 56px; height: 6px; background: var(--steel); border: 1px solid var(--rule); }
  .gauge span { display: block; height: 100%; background: var(--telemetry); }
  .hold.full .gauge span { background: var(--hud); }
  .hold.full .dim { color: var(--hud-hi); font-weight: 700; }

  nav { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  nav button {
    padding: 8px 12px;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--hud-hi);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.06em;
  }
  nav button.active { background: var(--hud); color: var(--void); border-color: var(--hud); box-shadow: var(--glow); }

  .side { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: hidden; }
  .side > :global(.system) { flex: 1; min-height: 0; }
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 12px; }
  .alerts { display: flex; flex-wrap: wrap; gap: 4px; }
  .alert {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--faint);
    border: 1px solid var(--rule);
  }
  .alert.on { color: var(--void); background: var(--danger); border-color: var(--danger); animation: pulse 1s infinite alternate; }
  @keyframes pulse { to { opacity: 0.6; } }

  .main { min-height: 0; min-width: 0; }
  .wide .main { grid-column: 1 / -1; }

  .status {
    grid-column: 1 / -1;
    display: flex;
    gap: 14px;
    padding: 5px 10px;
    background: var(--rail);
    border-top: 1px solid var(--rule);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
  }
  .right { margin-left: auto; }

  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto; overflow: auto; height: auto; min-height: 100%; }
    .top { flex-wrap: wrap; }
  }
</style>
