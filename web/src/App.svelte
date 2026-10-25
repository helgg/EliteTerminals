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
  import ConnectQr from './lib/ConnectQr.svelte';
  import FullScreen from './lib/FullScreen.svelte';
  import { viewport } from './lib/viewport.svelte.ts';

  const TABS = ['FLIGHT', 'COMBAT', 'EXPLORE', 'MINING', 'TRADE', 'SRV', 'CARRIER'] as const;
  type Tab = (typeof TABS)[number];

  let tab = $state<Tab>(readTab());
  let now = $state(Date.now());
  let showQr = $state(false);
  let menu = $state(false);
  const phone = $derived(viewport.device === 'phone');

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
    menu = false;
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

  // Last command or copy, shown for a few seconds (status strip, or a toast on phones).
  const notice = $derived(
    copied.at && now - copied.at < 4000
      ? { ok: copied.ok, text: `${copied.ok ? 'COPIED' : 'COPY FAILED ON PC'} · ${copied.text}` }
      : link.last && now - link.last.at < 6000
        ? { ok: link.last.ok, text: `${link.last.command} ${link.last.ok ? '✓' : `✗ ${link.last.error}`}` }
        : null,
  );

  const alerts = $derived([
    { on: f.overHeating, label: 'HEAT' },
    { on: f.isInDanger, label: 'DANGER' },
    { on: f.beingInterdicted, label: 'INTERDICTION' },
    { on: f.lowFuel, label: 'LOW FUEL' },
    { on: !f.shieldsUp && f.inMainShip, label: 'SHIELDS DOWN' },
  ]);
</script>

<div class="shell" class:wide={tab === 'TRADE'} class:phone>
  {#if phone}
  <!-- phones: one slim bar; the screen tabs live in the ≡ menu -->
  <header class="top slim">
    <button class="brand" onclick={() => (showQr = true)} title="Open the panel on another device (QR code)">
      <span class="logo">ED·ET</span>
    </button>
    <div class="where">
      <div class="sys"><Name value={s.location.system} system /> <span class="dim">/</span> <span class="muted">{where}</span></div>
    </div>
    <span class="cur">{tab}</span>
    <FullScreen />
    <button class="burger" class:on={menu} onclick={() => (menu = !menu)} aria-label="Screens" aria-expanded={menu}>
      <span></span><span></span><span></span>
    </button>
  </header>
  {:else}
  <header class="top">
    <button class="brand" onclick={() => (showQr = true)} title="Open the panel on a phone or tablet (QR code)">
      <span class="logo">ED·ET</span>
      <span class="sub dim">TERMINALS <span class="qr-hint">▣</span></span>
    </button>
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
      <FullScreen />
    </nav>
  </header>
  {/if}

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
    <Panel title="Power" aside="tap to add">
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

  {#if !phone}
  <footer class="status">
    <span class="label">STATUS</span>
    <span class:ok={live} class:bad={!live}>
      {!link.connected ? 'NO CONNECTION TO THE SERVER' : s.meta.online ? 'GAME ONLINE' : 'GAME OFFLINE · last known state'}
    </span>
    {#if notice}
      <span class:ok={notice.ok} class:bad={!notice.ok}>{notice.text}</span>
    {:else}
      <span class="dim">{s.meta.journal}</span>
    {/if}
    <span class="dim right">
      binds {s.controls.presets[1] ?? '—'} · {Object.keys(s.controls.keys).length} actions ·
      {s.meta.gameVersion}{s.meta.odyssey ? ' · Odyssey' : ''}
    </span>
    <span class="vp" title="Layout picked for this screen">VP {viewport.vp}{viewport.forced ? '*' : ''} {viewport.width}×{viewport.height}</span>
  </footer>
  {:else if notice || !live}
    <!-- phones: no status strip; a short toast instead -->
    <div class="toast" class:ok={notice?.ok} class:bad={notice ? !notice.ok : true}>
      {notice ? notice.text : !link.connected ? 'NO CONNECTION TO THE SERVER' : 'GAME OFFLINE'}
    </div>
  {/if}
</div>

{#if phone && menu}
  <div class="sheet-bg" role="presentation" onclick={() => (menu = false)}>
    <div class="sheet" role="dialog" aria-label="Screens" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      {#each TABS as t (t)}
        <button class:active={tab === t} onclick={() => pick(t)}>{t}</button>
      {/each}
      <button class="qr" onclick={() => { menu = false; showQr = true; }}>▣ OPEN ON ANOTHER DEVICE</button>
      <div class="meta dim">
        <span class:ok={live} class:bad={!live}>{live ? 'GAME ONLINE' : link.connected ? 'GAME OFFLINE' : 'NO SERVER'}</span>
        · VP {viewport.vp} {viewport.width}×{viewport.height}
      </div>
    </div>
  </div>
{/if}

<ConnectQr bind:open={showQr} />

<style>
  .shell {
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: auto 1fr auto;
    gap: 8px;
    height: 100%;
    padding: 8px;
    /* full screen on iPhone/iPad: keep clear of the notch, rounded corners and home indicator */
    padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
      max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
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
  .brand {
    display: flex; flex-direction: column; align-items: flex-start; padding: 2px 6px 2px 0;
    background: none; border: 0; text-align: left; cursor: pointer;
  }
  .brand:active .logo { filter: brightness(1.4); }
  .qr-hint { color: var(--hud); }
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

  .vp { color: var(--faint); font-size: 11px; }

  /* Narrow layouts stack for now; each screen gets its own arrangement per viewport (RESPONSIVE-FLIGHT.md). */
  :global(html[data-vp='tablet-portrait']) .shell,
  :global(html[data-device='phone']) .shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto;
    overflow: auto;
    height: auto;
    min-height: 100%;
  }
  :global(html[data-vp='tablet-portrait']) .top { flex-wrap: wrap; }

  /* phone bar */
  .shell.phone { gap: 6px; padding-top: max(6px, env(safe-area-inset-top)); }
  .top.slim { gap: 8px; padding: 4px 6px 4px 8px; position: sticky; top: 0; z-index: 5; }
  .top.slim .logo { font-size: 16px; }
  .top.slim .sys { font-size: 13px; }
  .cur { color: var(--hud-hi); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
  .burger {
    display: flex; flex-direction: column; justify-content: center; gap: 4px;
    width: 44px; height: 38px; padding: 0 11px; background: var(--steel); border: 1px solid var(--rule);
  }
  .burger span { height: 2px; background: var(--hud-hi); }
  .burger.on { border-color: var(--hud); }
  .sheet-bg {
    position: fixed; inset: 0; z-index: 40; background: rgb(5 3 2 / 0.7);
    padding: calc(max(6px, env(safe-area-inset-top)) + 52px) max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
  }
  .sheet {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px;
    background: var(--panel); border: 1px solid var(--hud); box-shadow: var(--glow);
  }
  .sheet button {
    min-height: 48px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi);
    font-weight: 700; letter-spacing: 0.08em;
  }
  .sheet button.active { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .sheet .qr { grid-column: 1 / -1; color: var(--telemetry); }
  .sheet .meta { grid-column: 1 / -1; font-size: 11px; text-align: center; }
  .toast {
    position: fixed; left: 50%; transform: translateX(-50%); z-index: 30;
    bottom: calc(max(10px, env(safe-area-inset-bottom)) + 4px);
    max-width: calc(100% - 24px); padding: 6px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    background: var(--rail); border: 1px solid currentColor; font-size: 12px; font-weight: 700;
    pointer-events: none;
  }
</style>
