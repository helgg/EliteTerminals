<script lang="ts">
  import { onMount } from 'svelte';
  import { connect, link } from './lib/link.svelte.ts';
  import Panel from './lib/Panel.svelte';
  import Pips from './lib/Pips.svelte';
  import ShipPanel from './lib/ShipPanel.svelte';
  import SystemPanel from './lib/SystemPanel.svelte';
  import Flight from './screens/Flight.svelte';
  import Trade from './screens/Trade.svelte';
  import Combat from './screens/Combat.svelte';
  import Colony from './screens/Colony.svelte';
  import Carrier from './screens/Carrier.svelte';
  import Engineering from './screens/Engineering.svelte';
  import Explore from './screens/Explore.svelte';
  import { exploreRequest } from './lib/explore/nav.svelte.ts';
  import ComingSoon from './lib/ComingSoon.svelte';
  import Name from './lib/Name.svelte';
  import { copied } from './lib/copy.svelte.ts';
  import ConnectQr from './lib/ConnectQr.svelte';
  import About from './lib/About.svelte';
  import Help from './lib/Help.svelte';
  import HelpButton from './lib/HelpButton.svelte';
  import { HELP } from './lib/help/index.ts';
  import { GROUPS, TABS, type Tab } from './lib/tabs.ts';
  import GroupIcon from './lib/GroupIcon.svelte';
  import Feedback from './lib/Feedback.svelte';
  import FullScreen from './lib/FullScreen.svelte';
  import { viewport } from './lib/viewport.svelte.ts';
  import { short } from './lib/format.ts';

  let tab = $state<Tab>(readTab());
  let now = $state(Date.now());
  let showQr = $state(false);
  // the QR hint pulses hard until it has been opened once on this browser, softly after that
  const QR_KEY = 'et.qr.seen';
  let qrSeen = $state(false);
  try { qrSeen = localStorage.getItem(QR_KEY) === '1'; } catch { /* not remembered */ }
  function openQr() {
    showQr = true;
    qrSeen = true;
    try { localStorage.setItem(QR_KEY, '1'); } catch { /* not remembered */ }
  }
  let showAbout = $state(false);
  let showHelp = $state(false);
  let showFeedback = $state(false);
  let menu = $state(false);
  const phone = $derived(viewport.device === 'phone');
  const tablet = $derived(viewport.device === 'tablet');
  // The side column only where the screen is wide enough for it next to the screen's own panels.
  // Portrait screens bring SHIP and POWER into their own grid instead (RESPONSIVE-FLIGHT.md).
  // TRADE needs the width for its tables, COMBAT for its console (it has its own POWER bay).
  const side = $derived(
    tab !== 'TRADE' && tab !== 'COMBAT' && tab !== 'COLONY' && tab !== 'CARRIER' && tab !== 'ENGINEERING' && tab !== 'EXPLORE' && (viewport.vp === 'desktop-landscape' || viewport.vp === 'tablet-landscape'),
  );

  // an EXP button on another screen asks for EXPLORE
  $effect(() => {
    if (exploreRequest.seq > 0) pick('EXPLORE');
  });

  // "?" or F1 opens the tutorial, unless the key is going into a text box
  function onkey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'F1' || e.key === '?') { e.preventDefault(); showHelp = true; }
  }

  onMount(() => {
    connect();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  function readTab(): Tab {
    const asked = new URLSearchParams(location.search).get('tab')?.toUpperCase() as Tab | undefined;
    if (asked && TABS.includes(asked)) return asked;
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
  // SYNC: read the journals and the game's files again (server side), and say what is known about the carrier
  let synced = $state<{ at: number; ok: boolean; text: string } | null>(null);
  let syncing = $state(false);
  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      const r = await fetch('/api/sync', { method: 'POST' });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { journal: string; carrier: { reported: number; tracked: number; untracked: number } | null };
      const c = d.carrier;
      synced = {
        at: Date.now(), ok: !c?.untracked,
        text: c
          ? `SYNCED · carrier ${cr(c.reported)} t reported, ${cr(c.tracked)} t tracked${c.untracked ? `, ${cr(c.untracked)} t unassigned` : ''}`
          : 'SYNCED',
      };
    } catch {
      synced = { at: Date.now(), ok: false, text: 'SYNC FAILED · is the server running?' };
    } finally {
      syncing = false;
    }
  }
  const group = $derived(GROUPS.find((g) => (g.tabs as readonly string[]).includes(tab)));
  const notice = $derived(
    synced && now - synced.at < 8000
      ? { ok: synced.ok, text: synced.text }
      : copied.at && now - copied.at < 4000
      ? { ok: copied.ok, text: `${copied.ok ? 'COPIED' : 'COPY FAILED ON PC'} · ${copied.text}` }
      : link.last && now - link.last.at < 6000
        ? { ok: link.last.ok, text: `${link.last.command} ${link.last.ok ? '✓' : `✗ ${link.last.error}`}` }
        : null,
  );

</script>

<svelte:window onkeydown={onkey} />

<div class="shell" class:wide={!side} class:phone>
  {#if phone}
  <!-- phones: one slim bar; the screen tabs live in the ≡ menu -->
  <header class="top slim">
    <button class="brand" onclick={() => (showQr = true)} title="Open the panel on another device (QR code)">
      <span class="logo">ED·ET</span>
      <span class="scr {group?.id}">{tab}</span>
    </button>
    <!-- system over station: two short lines fit where one long one would be cut -->
    <div class="where">
      <div class="sys"><Name value={s.location.system} system /></div>
      <div class="st muted">{where}</div>
    </div>
    {#if !live}<span class="linkstate">{link.connected ? 'OFFLINE' : 'NO SERVER'}</span>{/if}
    <FullScreen />
    <button class="burger" class:on={menu} onclick={() => (menu = !menu)} aria-label="Screens" aria-expanded={menu}>
      <span></span><span></span><span></span>
    </button>
  </header>
  {:else}
  <header class="top">
    <button class="brand" onclick={openQr} title="Open the panel on a phone or tablet (QR code)">
      <span class="logo">ED·ET</span>
      <span class="sub dim">TERMINALS <span class="qr-hint" class:fresh={!qrSeen}>▣</span></span>
    </button>
    <div class="where">
      <div class="sys"><Name value={s.location.system} system /> <span class="dim">/</span> <span class="muted">{where}</span></div>
      <!-- game off: the last ship, credits and commander are a past session's, so none of them shows -->
      {#if !s.meta.online}
      <div class="line dim">ship, credits and commander unknown while the game is off</div>
      {:else}
      <div class="line tele">
        {s.ship.label || '—'}
        <!-- tablets drop the ident and the commander name: the line must fit without ellipsis -->
        <span class="opt">{s.ship.ident ? `· ${s.ship.ident}` : ''} {s.ship.name ? `· ${s.ship.name}` : ''}
          <span class="dim">· CMDR</span> {s.commander.name || '—'}</span>
        <span class="dim">·</span> <span class="num">{viewport.device === 'tablet' ? short(s.commander.credits) : cr(s.commander.credits)} Cr</span>
        {#if s.ship.cargoCapacity}
          <span class="dim">· CARGO</span>
          <span class="hold" class:full={free <= 0}>
            <span class="gauge"><span style:width="{Math.min(1, s.cargo.count / s.ship.cargoCapacity) * 100}%"></span></span>
            <span class="num">{cr(s.cargo.count)}/{cr(s.ship.cargoCapacity)}t</span>
            <span class="dim num opt">{free > 0 ? `${cr(free)}t free` : 'FULL'}</span>
          </span>
        {/if}
      </div>
      {/if}
    </div>
    <!-- tablets: the game's state sits in the header's free space, not in the status strip -->
    {#if tablet && !live}<span class="linkstate">{link.connected ? 'GAME OFFLINE' : 'NO SERVER'}</span>{/if}
    <nav>
      {#each GROUPS as g (g.id)}
        <div class="grp {g.id}" role="group" aria-label={g.name} title={g.note}>
          <span class="gname"><GroupIcon id={g.id} />{g.name}</span>
          <div class="btns">
            {#each g.tabs as t (t)}
              <button class:active={tab === t} onclick={() => pick(t)}>{t}</button>
            {/each}
          </div>
        </div>
      {/each}
      {#if tablet}<button class="reload" onclick={() => location.reload()} title="Reload the panel" aria-label="Reload">⟳</button>{/if}
      <FullScreen />
    </nav>
  </header>
  {/if}

  <!-- TRADE needs the width for its tables; it shows its own scan/session column instead. -->
  {#if side}
  <aside class="side">
    <ShipPanel {s} />
    <Panel class="power" title="Power" aside="tap to add">
      <!-- short bars where SYSTEM shares the column: its station list needs the height -->
      <Pips sys={s.pips.sys} eng={s.pips.eng} wep={s.pips.wep} compact={viewport.device !== 'tablet'} />
    </Panel>
    <!-- on a tablet the FSD target card already names the system: the column keeps the controls -->
    {#if viewport.device !== 'tablet'}<SystemPanel {s} />{/if}
  </aside>
  {/if}

  <main class="main">
    {#if tab === 'FLIGHT'}
      <Flight {s} />
    {:else if tab === 'TRADE'}
      <Trade {s} {now} />
    {:else if tab === 'COMBAT'}
      <Combat {s} {now} />
    {:else if tab === 'COLONY'}
      <Colony {s} {now} />
    {:else if tab === 'CARRIER'}
      <Carrier {s} {now} />
    {:else if tab === 'EXPLORE'}
      <Explore {s} />
    {:else if tab === 'ENGINEERING'}
      <Engineering {s} />
    {:else}
      <ComingSoon title={tab} plans={HELP[tab]?.soon ?? []} />
    {/if}
  </main>

  {#if !phone}
  <footer class="status">
    <span class="label">STATUS</span>
    {#if !tablet}
      <span class:ok={live} class:bad={!live}>
        {!link.connected ? 'NO CONNECTION TO THE SERVER' : s.meta.online ? 'GAME ONLINE' : 'GAME OFFLINE · last known state'}
      </span>
    {:else if live}
      <span class="ok">GAME ONLINE</span>
    {/if}
    <span class="vp" title="Layout picked for this screen">VP {viewport.vp}{viewport.forced ? '*' : ''} {viewport.width}×{viewport.height}</span>
    {#if notice}
      <span class:ok={notice.ok} class:bad={!notice.ok}>{notice.text}</span>
    {:else}
      <span class="dim opt journal">{s.meta.journal}</span>
    {/if}
    <button class="sync" disabled={syncing} onclick={sync}
      title="Read the journals and the game's files again now. The carrier's cargo is only as good as the moves the journal showed: type what it holds in the BUILD list.">
      {syncing ? '⟳ SYNCING…' : '⟳ SYNC'}
    </button>
    <HelpButton {tab} onopen={() => (showHelp = true)} />
    <button class="sync" onclick={() => (showFeedback = true)} title="Report a bug or suggest an idea">✎ FEEDBACK</button>
    <button class="sync" onclick={() => (showAbout = true)} title="About EliteTerminals">ⓘ ABOUT</button>
    <span class="dim right">
      binds {s.controls.presets[1] ?? '—'} · {Object.keys(s.controls.keys).length} actions ·
      {s.meta.gameVersion}{s.meta.odyssey ? ' · Odyssey' : ''}
    </span>
  </footer>
  {:else if notice}
    <!-- phones: no status strip; the last command shows as a short toast (the game's state is in the bar) -->
    <div class="toast" class:ok={notice.ok} class:bad={!notice.ok}>{notice.text}</div>
  {/if}
</div>

{#if phone && menu}
  <div class="sheet-bg" role="presentation" onclick={() => (menu = false)}>
    <div class="sheet" role="dialog" aria-label="Screens" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      {#each GROUPS as g (g.id)}
        <div class="gtitle {g.id}"><GroupIcon id={g.id} />{g.name} <span class="dim">· {g.note}</span></div>
        {#each g.tabs as t (t)}
          <button class="{g.id}" class:active={tab === t} onclick={() => pick(t)}>{t}</button>
        {/each}
      {/each}
      <button class="qr" onclick={() => { menu = false; showQr = true; }}>▣ OPEN ON ANOTHER DEVICE</button>
      <!-- opened from the home screen there is no browser bar: this is the only way to load a new version -->
      <button class="reload" onclick={() => location.reload()}>⟳ RELOAD</button>
      <button class="reload" disabled={syncing} onclick={() => { menu = false; void sync(); }}>⟳ SYNC THE JOURNAL</button>
      <button class="reload" onclick={() => { menu = false; showHelp = true; }}>? HOW TO USE</button>
      <button class="reload" onclick={() => { menu = false; showFeedback = true; }}>✎ REPORT A BUG · SUGGEST</button>
      <button class="reload" onclick={() => { menu = false; showAbout = true; }}>ⓘ ABOUT</button>
      <div class="meta dim">
        <span class:ok={live} class:bad={!live}>{live ? 'GAME ONLINE' : link.connected ? 'GAME OFFLINE' : 'NO SERVER'}</span>
        · VP {viewport.vp} {viewport.width}×{viewport.height}
      </div>
    </div>
  </div>
{/if}

<ConnectQr bind:open={showQr} />
<Help bind:open={showHelp} {tab} />
<About bind:open={showAbout} onfeedback={() => (showFeedback = true)} />
<Feedback bind:open={showFeedback} {s} {tab} />

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
  .qr-hint { position: relative; display: inline-block; color: var(--hud); }
  /* the same ring as the ? button: soft every 6 s, strong and quick until the QR has been opened once */
  .qr-hint::after {
    content: ''; position: absolute; inset: -2px; border: 1px solid var(--hud); opacity: 0; animation: qr-ping 6s ease-out infinite;
  }
  .qr-hint.fresh { text-shadow: var(--glow); }
  .qr-hint.fresh::after { animation: qr-ping-fresh 1.8s ease-out infinite; }
  @keyframes qr-ping { 0% { opacity: 0.6; transform: scale(1); } 22%, 100% { opacity: 0; transform: scale(2.2); } }
  @keyframes qr-ping-fresh { 0% { opacity: 0.9; transform: scale(1); } 70%, 100% { opacity: 0; transform: scale(2.8); } }
  @media (prefers-reduced-motion: reduce) { .qr-hint::after { animation: none; } }
  .logo { color: var(--hud); font-size: 20px; font-weight: 700; letter-spacing: 0.08em; text-shadow: var(--glow); }
  .sub { font-size: var(--fs-2xs); letter-spacing: 0.15em; }
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
  /* two groups: COCKPIT presses the game's keys (orange, filled when active); PLANNER only reads (cyan, outlined) */
  nav { align-items: flex-end; gap: 14px; }
  .grp { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .gname { display: flex; align-items: center; gap: 5px; font-size: var(--fs-2xs); font-weight: 800; letter-spacing: 0.2em; padding-bottom: 2px; border-bottom: 1px solid currentColor; }
  .btns { display: flex; gap: 4px; }
  .grp.cockpit .gname { color: var(--hud); }
  .grp.planner .gname { color: var(--telemetry); }
  .grp.cockpit button { clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px)); border-color: var(--hud); }
  .grp.planner button { background: transparent; color: var(--telemetry); border-color: var(--rule); border-bottom: 2px solid var(--telemetry); }
  .grp.planner button.active { background: rgb(55 198 212 / 0.14); color: var(--text); border-color: var(--telemetry); box-shadow: 0 0 8px rgb(55 198 212 / 0.35); }
  .sheet .gtitle { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.15em; }
  .sheet .gtitle.cockpit { color: var(--hud); }
  .sheet .gtitle.planner { color: var(--telemetry); }
  .sheet button.planner { background: transparent; color: var(--telemetry); border-bottom: 2px solid var(--telemetry); }
  .sheet button.planner.active { background: rgb(55 198 212 / 0.14); color: var(--text); }
  .sheet button.cockpit { border-color: var(--hud); }

  /* touch screens (viewport-review T1/T2): header controls are 44 px high, the status strip's buttons 32 */
  :global(html[data-device='tablet']) .top .brand, :global(html[data-device='phone']) .top .brand { min-height: 44px; justify-content: center; }
  :global(html[data-device='tablet']) nav button { min-height: 44px; }
  :global(html[data-device='tablet']) nav .reload { min-width: 44px; min-height: 44px; padding: 0; }
  :global(html[data-vp$='-portrait']) .top nav .reload { flex: 0 0 44px; }
  :global(html[data-device='tablet']) .status .sync { min-height: 28px; padding: 0 10px; }
  :global(html[data-device='tablet']) .status .right { display: none; }
  :global(html[data-vp='tablet-landscape']) nav { gap: 8px; }
  :global(html[data-vp='tablet-landscape']) .top .gauge { display: none; }
  .scr { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; line-height: 1.1; }
  .scr.cockpit { color: var(--hud); }
  .scr.planner { color: var(--telemetry); }
  .side { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: hidden; }
  .side > :global(.system) { flex: 1; min-height: 0; }
  /* when POWER is the last panel (tablets), it takes the rest of the column: taller bars, no dead space */
  .side > :global(.power:last-child) { flex: 1; min-height: 0; }
  .side > :global(.power .body) { flex: 1; display: flex; flex-direction: column; }
  :global(html[data-device='tablet']) .opt { display: none; }
  :global(html[data-vp$='-portrait']) .journal { display: none; }

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
  .sync {
    background: none; border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px; letter-spacing: 0.08em;
    padding: 0 8px; cursor: pointer;
  }
  .sync:hover:not(:disabled) { color: var(--hud-hi); border-color: var(--hud); }
  .sync:disabled { opacity: 0.6; cursor: progress; }

  .vp { color: var(--faint); font-size: 11px; }

  /* tablet: a slimmer side column */
  :global(html[data-vp='tablet-landscape']) .shell { grid-template-columns: 224px 1fr; }
  :global(html[data-vp='tablet-landscape']) .line { font-size: 11px; }
  /* portrait tablets and monitors: no side column, the screen lays out SHIP and POWER itself */
  :global(html[data-vp$='-portrait']) .top { flex-wrap: wrap; row-gap: 6px; }
  :global(html[data-vp$='-portrait']) .top nav { flex: 1 1 100%; justify-content: stretch; }
  :global(html[data-vp$='-portrait']) .top nav { gap: 10px; }
  :global(html[data-vp$='-portrait']) .top nav .grp { flex: 1; }
  :global(html[data-vp$='-portrait']) .top nav .grp.cockpit { flex: 3; }
  :global(html[data-vp$='-portrait']) .top nav .grp.planner { flex: 5; }
  :global(html[data-vp$='-portrait']) .top nav .btns { width: 100%; }
  :global(html[data-vp$='-portrait']) .top nav button { flex: 1; padding-left: 4px; padding-right: 4px; }
  /* phones: slim bar + the screen, nothing else (no side column, no status strip) */
  .shell.phone { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }

  /* phone bar */
  .shell.phone { gap: 6px; padding-top: max(6px, env(safe-area-inset-top)); }
  .top.slim { gap: 8px; padding: 4px 6px 4px 8px; position: sticky; top: 0; z-index: 5; }
  .top.slim .logo { font-size: 16px; }
  .top.slim .sys { font-size: 13px; line-height: 1.15; }
  /* the system name wraps (two lines at most) instead of being cut with an ellipsis */
  .top.slim .sys :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .top.slim .st { font-size: 11px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :global(html[data-vp='phone-portrait']) .cur { display: none; }
  .cur { color: var(--hud-hi); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
  /* the game is not running (or the server is gone): a red tag in the header's free space */
  .linkstate {
    flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
    color: var(--danger); border: 1px solid var(--danger); background: rgb(209 72 58 / 0.1);
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em; white-space: nowrap;
  }
  .linkstate::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--danger); }
  .burger {
    display: flex; flex-direction: column; justify-content: center; gap: 4px;
    width: 44px; height: 44px; padding: 0 11px; background: var(--steel); border: 1px solid var(--rule);
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
  .sheet .reload { grid-column: 1 / -1; color: var(--text); }
  nav .reload { font-size: 16px; padding: 4px 12px; }
  /* tablets: slimmer tabs, so the station name keeps its room next to them */
  :global(html[data-vp='tablet-landscape']) nav button { padding: 8px 6px; font-size: 11px; letter-spacing: 0.04em; }
  :global(html[data-vp='tablet-landscape']) .top { gap: 10px; }
  .sheet .meta { grid-column: 1 / -1; font-size: 11px; text-align: center; }
  .toast {
    position: fixed; left: 50%; transform: translateX(-50%); z-index: 30;
    bottom: calc(max(10px, env(safe-area-inset-bottom)) + 4px);
    max-width: calc(100% - 24px); padding: 6px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    background: var(--rail); border: 1px solid currentColor; font-size: 12px; font-weight: 700;
    pointer-events: none;
  }
</style>
