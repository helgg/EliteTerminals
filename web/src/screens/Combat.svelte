<script lang="ts">
  import type { Contact, EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import { keyFor, sendCommand } from '../lib/link.svelte.ts';
  import {
    bestScore, canRun, keyOf, lockContact, macro, massacreFactions, onSubsystem, runMacro, sendOrder, toggleAutoNext,
    watchKills, type Subsystem,
  } from '../lib/macros.svelte.ts';
  import { short } from '../lib/format.ts';

  // COMBAT: one screen, actions first. Left: what the cockpit HUD does not show (contacts with bounties,
  // massacre progress, session). Right: the console; plain keys, and macros checked step by step by the game.
  let { s, now }: { s: EdState; now: number } = $props();

  const c = $derived(s.combat);
  $effect(() => {
    void c.session.kills;
    watchKills();
  });

  // --- contacts ---
  type Filter = { wanted: boolean; massacre: boolean; clean: boolean };
  let filt = $state<Filter>(readFilter());
  function readFilter(): Filter {
    try {
      const saved = JSON.parse(localStorage.getItem('et.combatFilter') ?? 'null');
      if (saved && typeof saved.wanted === 'boolean') return saved;
    } catch {}
    return { wanted: true, massacre: false, clean: false };
  }
  function setFilter(next: Filter) {
    filt = next;
    try { localStorage.setItem('et.combatFilter', JSON.stringify(next)); } catch {}
  }
  const targets = $derived(massacreFactions());
  const isWanted = (k: Contact) => k.legalStatus === 'Wanted';
  const isClean = (k: Contact) => !isWanted(k);
  const isMassacre = (k: Contact) => targets.has(k.faction);
  // Sorting: tap a column; tap it again to flip. Highest bounty on top by default.
  type Col = 'ship' | 'pilot' | 'rank' | 'legal' | 'bounty' | 'faction' | 'seen';
  type Sort = { col: Col; desc: boolean };
  const RANKS = ['Harmless', 'Mostly Harmless', 'Novice', 'Competent', 'Expert', 'Master', 'Dangerous', 'Deadly', 'Elite'];
  const COLS: [Col, string][] = [
    ['ship', 'SHIP'], ['pilot', 'PILOT'], ['rank', 'RANK'], ['legal', 'LEGAL'], ['bounty', 'BOUNTY'],
    ['faction', 'FACTION'], ['seen', 'SEEN'],
  ];
  let sort = $state<Sort>(readSort());
  function readSort(): Sort {
    try {
      const saved = JSON.parse(localStorage.getItem('et.combatSort') ?? 'null');
      if (saved && COLS.some(([c]) => c === saved.col)) return saved;
    } catch {}
    return { col: 'bounty', desc: true };
  }
  function sortBy(col: Col) {
    // Numbers and recency read best biggest-first; names A→Z.
    sort = sort.col === col ? { col, desc: !sort.desc } : { col, desc: ['rank', 'bounty', 'seen'].includes(col) };
    try { localStorage.setItem('et.combatSort', JSON.stringify(sort)); } catch {}
  }
  const sortKey: Record<Col, (k: Contact) => string | number> = {
    ship: (k) => k.ship, pilot: (k) => k.pilot, rank: (k) => RANKS.indexOf(k.rank),
    legal: (k) => k.legalStatus, bounty: (k) => k.bounty, faction: (k) => k.faction, seen: (k) => Date.parse(k.seenAt) || 0,
  };
  function compare(a: Contact, b: Contact) {
    const x = sortKey[sort.col](a), y = sortKey[sort.col](b);
    const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -d : d;
  }
  const shown = $derived(c.contacts.filter((k) =>
    (filt.wanted && isWanted(k)) || (filt.clean && isClean(k)) || (filt.massacre && isMassacre(k))).sort(compare));
  const counts = $derived({
    wanted: c.contacts.filter(isWanted).length,
    massacre: c.contacts.filter(isMassacre).length,
    clean: c.contacts.filter(isClean).length,
  });
  const allOn = $derived(filt.wanted && filt.massacre && filt.clean);
  const locked = (k: Contact) => s.target.locked && s.target.ship === k.ship && s.target.pilot === k.pilot;
  const absent = (k: Contact) => macro.absent.includes(keyOf(k));
  /** The ship AUTO NEXT would go for: a massacre ship, else the highest bounty, among those still in range. */
  const best = $derived.by(() => {
    void targets;
    const pool = c.contacts.filter((k) => !absent(k) && bestScore(k) >= 0);
    return pool.length ? keyOf(pool.reduce((a, b) => (bestScore(b) > bestScore(a) ? b : a))) : '';
  });
  const ago = (iso: string) => {
    const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    return sec < 5 ? 'now' : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m`;
  };
  const cr = (n: number) => n.toLocaleString('en-US');

  // --- session ---
  const ss = $derived(c.session);
  const hours = $derived(ss.firstKillAt ? Math.max((now - Date.parse(ss.firstKillAt)) / 3.6e6, 1 / 60) : 0);
  const perHour = $derived(hours ? (ss.bounties + ss.bonds) / hours : 0);
  const rebuyTimes = $derived(c.rebuy ? Math.floor(s.commander.credits / c.rebuy) : 0);
  /** One line per target faction: missions stack per giving faction, the slowest giver sets the pace. */
  const massacres = $derived.by(() => {
    const byTarget = new Map<string, { givers: Map<string, { need: number; done: number }>; reward: number; missions: number }>();
    for (const m of c.missions) {
      const t = byTarget.get(m.targetFaction) ?? { givers: new Map(), reward: 0, missions: 0 };
      const g = t.givers.get(m.faction) ?? { need: 0, done: 0 };
      g.need += m.killCount;
      g.done += m.kills;
      t.givers.set(m.faction, g);
      t.reward += m.reward;
      t.missions += 1;
      byTarget.set(m.targetFaction, t);
    }
    return [...byTarget].map(([faction, t]) => {
      const pace = [...t.givers.values()].sort((a, b) => b.need - b.done - (a.need - a.done))[0];
      return { faction, missions: t.missions, reward: t.reward, done: pace.done, need: pace.need };
    });
  });

  // --- console ---
  const fighterText = $derived(
    { none: 'no fighter bay', docked: 'docked', out: 'out', destroyed: 'destroyed · rebuilding' }[c.fighter],
  );
  const subs: [Subsystem, string][] = [
    ['PowerPlant', 'POWER PLANT'], ['Drives', 'DRIVES'], ['FSD', 'FSD'], ['ShieldGen', 'SHIELD GEN'],
    ['Distributor', 'DISTRIBUTOR'], ['Hatch', 'CARGO HATCH'],
  ];
  const ORDERS: [string, string, string][] = [
    ['OrderFocusTarget', 'FOCUS', 'my target'], ['OrderAggressiveBehaviour', 'ATTACK', 'at will'],
    ['OrderDefensiveBehaviour', 'DEFEND', 'guard me'], ['OrderHoldFire', 'HOLD FIRE', ''],
    ['OrderHoldPosition', 'STAY', 'hold position'], ['OrderFollow', 'FOLLOW', 'stay close'],
  ];
  // This ship has no fighter bay: orders would go nowhere.
  const noBay = $derived(c.fighter === 'none');
  const pipBars = (sys: number, eng: number, wep: number) => [sys, eng, wep].map((v) => v * 5 + 2);
</script>

{#snippet keyTile(action: string, title: string, sub = '', cls = '', opts: { count?: number; order?: boolean } = {})}
  {@const bound = keyFor(action)}
  {@const off = !bound || (opts.order && noBay)}
  <button class="act {cls}" class:disabled={off} class:live={opts.order && macro.order === action} disabled={off}
    onclick={() => (opts.order ? sendOrder(action) : sendCommand(action))}>
    {#if opts.order}<span class="led"></span>{/if}
    {#if opts.count !== undefined}<span class="count">{opts.count}</span>{/if}
    <b>{title}</b><small>{sub || ' '}</small>
    <span class="key" class:nobind={!bound}>{bound ?? 'NO BIND'}</span>
  </button>
{/snippet}

{#snippet macroTile(id: string, title: string, sub = '', cls = '', opts: { live?: boolean; led?: boolean; count?: string; fighter?: boolean } = {})}
  {@const ok = canRun(id) && !(opts.fighter && noBay)}
  <button class="act macro {cls}" class:disabled={!ok} class:busy={macro.running === id} class:live={opts.live}
    disabled={!ok} onclick={() => runMacro(id)}>
    {#if opts.led}<span class="led"></span>{/if}
    {#if opts.count}<span class="count">{opts.count}</span>{/if}
    <b>{title}</b><small>{sub || ' '}</small>
    {#if !canRun(id)}<span class="key nobind">NO BIND</span>{/if}
  </button>
{/snippet}

{#snippet power(label: 'DEF' | 'RUN' | 'ATK', bars: number[])}
  {@const ok = canRun(`Power${label}`)}
  <button class="act macro" class:disabled={!ok} class:busy={macro.running === `Power${label}`} disabled={!ok}
    onclick={() => runMacro(`Power${label}`)}>
    <b>{label}</b>
    <span class="pips">{#each bars as h, i (i)}<i style:height="{h}px"></i>{/each}</span>
  </button>
{/snippet}

<div class="combat">
  <div class="left">
    <Panel class="contacts" title="Contacts" aside="scanned this instance · tap a row to lock it" scroll={false}>
      <div class="pick">
        <button class="act toggle" class:live={macro.autoNext} class:busy={macro.running === 'NextBest'}
          disabled={!canRun('NextBest')} class:disabled={!canRun('NextBest')} onclick={toggleAutoNext}>
          <span class="state">{macro.autoNext ? 'ON' : 'OFF'}</span>
          <b>AUTO NEXT</b><small>on each kill → <span class="star">★</span></small>
        </button>
        {@render macroTile('NextWanted', 'NEXT WANTED', 'top bounty in range')}
        {@render macroTile('NextMassacre', 'NEXT MASSACRE', 'mission faction')}
      </div>
      <div class="filters">
        <button class="fchip" class:on={filt.wanted} onclick={() => setFilter({ ...filt, wanted: !filt.wanted })}>
          WANTED<span class="n">{counts.wanted}</span></button>
        <button class="fchip" class:on={filt.massacre} onclick={() => setFilter({ ...filt, massacre: !filt.massacre })}>
          MASSACRE<span class="n">{counts.massacre}</span></button>
        <button class="fchip" class:on={filt.clean} onclick={() => setFilter({ ...filt, clean: !filt.clean })}>
          CLEAN<span class="n">{counts.clean}</span></button>
        <button class="fchip all" onclick={() => setFilter({ wanted: !allOn, massacre: !allOn, clean: !allOn })}>
          {allOn ? 'UNSELECT ALL' : 'SELECT ALL'}</button>
      </div>
      {#if !c.contacts.length}
        <p class="none">No ships scanned in this instance yet. Lock one in the game, or tap NEXT WANTED.</p>
      {:else if !shown.length}
        <p class="none">Nothing matches. Pick WANTED, MASSACRE or CLEAN above.</p>
      {:else}
        <table>
          <thead><tr>
            {#each COLS as [col, label] (col)}
              <th class:r={col === 'bounty'} class:on={sort.col === col} onclick={() => sortBy(col)}>
                {label}<span class="arrow">{sort.col === col ? (sort.desc ? '▼' : '▲') : ''}</span></th>
            {/each}
          </tr></thead>
          <tbody>
            {#each shown as k (k.ship + k.pilot)}
              <tr class:sel={locked(k)} class:clean={isClean(k)} class:gone={absent(k)}
                class:locking={macro.locking === keyOf(k)} onclick={() => lockContact(k)}>
                <td>{#if locked(k)}<span class="lock">◉</span> {:else if best === keyOf(k)}<span class="star">★</span> {/if}{k.ship}</td>
                <td class="muted">{k.pilot}</td>
                <td>{k.rank}</td>
                <td>{#if isWanted(k)}<span class="lw">WANTED</span>{:else if k.legalStatus}<span class="lc">{k.legalStatus.toUpperCase()}</span>{:else}<span class="dim">scan…</span>{/if}</td>
                <td class="num r" class:bad={k.bounty > 0} class:dim={!k.bounty}>{k.bounty ? cr(k.bounty) : '—'}</td>
                <td class="muted">{k.faction}{#if isMassacre(k)}<span class="mtag">M</span>{/if}</td>
                <td class="dim">{macro.locking === keyOf(k) ? 'locking…' : absent(k) ? 'not in range' : ago(k.seenAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <div class="tot">
        <span><b>{shown.length}</b> shown</span>
        <span>bounty <b class="bad">{cr(shown.reduce((a, k) => a + k.bounty, 0))} Cr</b></span>
        <span><span class="mtag">M</span> massacre mission</span>
        <span><span class="star">★</span> next pick</span>
      </div>
    </Panel>

    <Panel title="Session" aside={c.rebuy ? `rebuy ${short(c.rebuy)} · ${rebuyTimes ? `✓ ${rebuyTimes}×` : '✗ NOT COVERED'}` : ''} scroll={false}>
      <div class="kpis">
        <div><small>BOUNTIES</small><b class="ok">{short(ss.bounties)}</b></div>
        <div><small>UNREDEEMED</small><b class="warn">{short(ss.unredeemed)}</b></div>
        <div><small>CR/H</small><b class="tele">{short(perHour)}</b></div>
        <div><small>KILLS</small><b>{ss.kills}</b></div>
        <div><small>BONDS</small><b class:dim={!ss.bonds}>{short(ss.bonds)}</b></div>
      </div>
      {#each massacres.slice(0, 2) as m (m.faction)}
        <div class="mission">
          <div class="line"><span>Massacre · {m.faction} · {m.missions} stacked <span class="mtag">M</span></span>
            <span class="num"><b>{m.done}</b>/{m.need} · {short(m.reward)}</span></div>
          <div class="t"><i style:width="{m.need ? (m.done / m.need) * 100 : 0}%"></i></div>
        </div>
      {:else}
        <p class="dim mission">No massacre missions active.</p>
      {/each}
    </Panel>
  </div>

  <div class="console">
    <div class="ccol">
      <section class="bay g-power" style:--rows="1">
        <h4>POWER<span class="st">exact pips</span></h4>
        <div class="tiles">
          {@render power('DEF', pipBars(4, 2, 0))}
          {@render power('RUN', pipBars(2, 4, 0))}
          {@render power('ATK', pipBars(2, 0, 4))}
          {@render keyTile('ResetPowerDistribution', 'RESET', '2 · 2 · 2', 'amber')}
        </div>
      </section>

      <section class="bay g-target" style:--rows="2">
        <h4>SUBSYSTEM<span class="st">{s.target.locked ? s.target.subsystem || 'scan first' : 'no target'}</span></h4>
        <div class="tiles">
          {#each subs as [id, label] (id)}
            {@render macroTile(`Sub${id}`, label, '', '', { led: true, live: onSubsystem(id) })}
          {/each}
          {@render macroTile('Hunt', 'HUNT', 'massacre → power plant → fighter', 'x2')}
        </div>
      </section>

      <section class="bay g-fighter" style:--rows="3">
        <h4>FIGHTER<span class="st">{fighterText}</span></h4>
        <div class="tiles">
          <button class="act macro disabled" disabled>
            <span class="exp">COMING SOON</span><b>LAUNCH</b><small>NPC crew</small>
          </button>
          {#each ORDERS as [action, title, sub] (action)}
            {@render keyTile(action, title, sub, 'cyan', { order: true })}
          {/each}
          {@render keyTile('OrderRequestDock', 'RECALL', 'dock', 'amber', { order: true })}
          {@render macroTile('SicThreat', 'SIC THREAT', 'threat → focus', '', { fighter: true })}
          {@render macroTile('SicWanted', 'SIC WANTED', 'wanted → focus', '', { fighter: true })}
          {@render macroTile('Cripple', 'CRIPPLE', 'drives → focus', '', { fighter: true })}
          {@render macroTile('FighterSafe', 'FIGHTER SAFE', 'follow · hold', '', { fighter: true })}
        </div>
      </section>
    </div>

    <div class="ccol">
      <section class="bay g-escape" style:--rows="1">
        <h4>ESCAPE<span class="st">{s.flags.fsdMassLocked ? 'mass locked' : s.flags.fsdCooldown ? 'FSD cooldown' : 'FSD ready'}</span></h4>
        <!-- one row of tall plates: the big red one first -->
        <div class="tiles tall">
          {@render macroTile('Escape', '⟫ EMERGENCY ESCAPE', 'retract · RUN · boost · jump', 'danger')}
          {@render macroTile('SubmitRun', 'SUBMIT & RUN', 'interdiction')}
          {@render macroTile('RecallJump', 'RECALL & JUMP', 'after the dock')}
          {@render macroTile('Disengage', 'DISENGAGE', 'retract · RUN')}
        </div>
      </section>

      <section class="bay g-defence" style:--rows="4">
        <h4>DEFENCE<span class="st">loadout counts</span></h4>
        <!-- the consumables you reach for most get two columns -->
        <div class="tiles">
          {@render keyTile('DeployHeatSink', 'HEAT SINK', '', 'amber x2', { count: c.heatSinks })}
          {@render keyTile('UseShieldCell', 'SHIELD CELL', '', 'amber x2', { count: c.shieldCells })}
          {@render keyTile('FireChaffLauncher', 'CHAFF', '', 'amber x2', { count: c.chaff })}
          {@render keyTile('ChargeECM', 'ECM', 'hold', 'amber')}
          {@render keyTile('ToggleAdvanceMode', 'SILENT RUN', s.flags.silentRunning ? 'on' : '')}
          {@render macroTile('ShieldSink', 'SHIELD + SINK', 'cell, then a sink', 'x2', { count: `${c.shieldCells} · ${c.heatSinks}` })}
          {@render macroTile('CellCell', 'CELL × 2', 'cell + sink, twice', 'x2')}
          {@render macroTile('GoDark', 'GO DARK', 'silent run + sink')}
          {@render macroTile('ChaffBoost', 'CHAFF + BOOST', 'break gimbal lock')}
          {@render macroTile('Brace', 'BRACE', 'DEF · cell · chaff', 'x2')}
        </div>
      </section>

      <section class="bay g-weapons" style:--rows="1">
        <h4>ATTACK<span class="st">{s.flags.inWing ? 'wing' : 'solo'}</span></h4>
        <div class="tiles">
          {#each [0, 1, 2] as i (i)}
            {@render macroTile(`Assist${i}`, `ASSIST ${i + 1}`, "wingman's target")}
          {/each}
          {@render macroTile('AttackRun', 'ATTACK RUN', 'deploy · ATK')}
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .combat { height: 100%; display: grid; grid-template-columns: 664px 1fr; gap: 8px; min-height: 0; }
  .left { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .left > :global(.contacts) { flex: 1; }

  /* contact filters: thumb-sized, same plate as the console tiles */
  .filters { display: grid; grid-template-columns: repeat(3, 1fr) 1.1fr; gap: 6px; margin-bottom: 10px; }
  .fchip {
    min-height: 46px; padding: 0 12px; display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 700; letter-spacing: .08em; color: var(--dim);
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule); border-top: 3px solid var(--faint);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
  }
  .fchip::before { content: ''; width: 10px; height: 10px; border: 1px solid var(--dim); flex: none; }
  .fchip.on { color: var(--hud); border-top-color: var(--hud); }
  .fchip.on::before { background: var(--hud); border-color: var(--hud); box-shadow: var(--glow); }
  .fchip.all { justify-content: center; color: var(--muted); }
  .fchip.all::before { display: none; }
  .fchip .n { margin-left: auto; color: var(--muted); font-weight: 400; }
  .fchip:active { filter: brightness(1.35); transform: translateY(1px); }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: var(--dim); font-weight: 400; font-size: 10px; letter-spacing: .1em; padding: 6px 5px 7px; border-bottom: 1px solid var(--rule);
    cursor: pointer; user-select: none; white-space: nowrap; }
  th.on { color: var(--hud-hi); border-bottom-color: var(--hud); }
  th .arrow { margin-left: 4px; font-size: 8px; }
  th:active { color: var(--text); }
  td { padding: 6px 5px; border-bottom: 1px solid #241708; white-space: nowrap; }
  .r { text-align: right; }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: rgb(255 122 24 / .06); }
  tr.sel td { background: rgb(255 122 24 / .14); }
  tr.sel td:first-child { box-shadow: inset 3px 0 var(--hud); }
  tr.clean td { color: var(--muted); }
  .lw { color: #fff; background: var(--danger); padding: 0 5px; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
  .lc { color: var(--ok); font-size: 10px; letter-spacing: .08em; border: 1px solid var(--ok); padding: 0 4px; }
  .mtag { color: #140b04; background: var(--hud-hi); font-size: 10px; font-weight: 700; padding: 0 4px; margin-left: 4px; }
  .lock { color: var(--hud); font-weight: 700; }
  .tot { display: flex; gap: 18px; margin-top: 8px; font-size: 12px; color: var(--dim); }
  .tot b { color: var(--text); }
  .none { padding: 12px 4px; color: var(--dim); margin: 0; }

  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .kpis small { display: block; color: var(--dim); font-size: 10px; letter-spacing: .1em; }
  .kpis b { font-size: 16px; }
  .mission { margin: 8px 0 0; font-size: 12px; }
  .mission .line { display: flex; justify-content: space-between; }
  .mission .t { height: 6px; background: var(--steel); position: relative; margin-top: 3px; }
  .mission .t i { position: absolute; inset: 0 auto 0 0; background: var(--hud); }

  /* console: two columns of bays; a bay grows by its rows of tiles, on top of its header */
  .console { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 0; }
  .ccol { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  /* a bay: a vertical rail in the group's colour (name at the top, state at the bottom) beside its tiles */
  .bay { --g: var(--hud-hi); display: flex; background: var(--rail); border: 1px solid var(--rule); border-left: 0;
    min-height: 0; flex: var(--rows) 1 44px; }
  .bay h4 {
    margin: 0; flex: none; width: 30px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 0; writing-mode: vertical-rl; transform: rotate(180deg);
    font-size: 12px; font-weight: 800; color: var(--g); letter-spacing: .22em; white-space: nowrap; overflow: hidden;
    background: linear-gradient(to left, color-mix(in srgb, var(--g) 26%, transparent), color-mix(in srgb, var(--g) 8%, transparent));
    border-right: 3px solid var(--g);
    text-shadow: 0 0 8px color-mix(in srgb, var(--g) 45%, transparent);
  }
  .bay h4 .st { font-size: 10px; font-weight: 400; color: var(--muted); letter-spacing: .08em; text-shadow: none;
    overflow: hidden; text-overflow: ellipsis; min-height: 0; }
  .g-power { --g: var(--macro); }
  .g-target { --g: var(--hud); }
  .g-fighter { --g: var(--telemetry); }
  .g-escape { --g: var(--danger); }
  .g-defence { --g: var(--hud-hi); }
  .g-weapons { --g: var(--ok); }
  .tiles { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 1fr; gap: 6px; padding: 8px; min-height: 0; min-width: 0; }
  /* escape row: the red plate wider; titles may wrap */
  .tiles.tall { grid-template-columns: 1.6fr 1fr 1fr 1fr; }
  .tiles.tall .act b { white-space: normal; font-size: 14px; line-height: 1.2; }
  .tiles.tall .act small { white-space: normal; }
  .tiles.tall .act.danger b { font-size: 18px; }

  /* target picker above the contact filters */
  .pick { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 6px; margin-bottom: 8px; min-height: 62px; }
  .star { color: var(--hud-hi); text-shadow: var(--glow); }
  tr.gone td { opacity: .45; }
  tr.locking td { animation: busy .5s linear infinite alternate; background: rgb(184 108 230 / .12); }

  /* tile: FLIGHT's drive-button plate — warm gradient, thin rule, 3px tone on top, one cut corner */
  .act {
    --tone: var(--faint);
    position: relative; display: flex; flex-direction: column; justify-content: center; gap: 3px;
    padding: 9px 10px 8px; text-align: left; min-width: 0;
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule); border-top: 3px solid var(--tone);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
  }
  .act b { letter-spacing: .04em; font-size: 13.5px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act small { color: var(--dim); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act .key { position: absolute; right: 14px; bottom: 5px; color: var(--dim); font-size: 10px; }
  .act .key.nobind { color: var(--danger); }
  .act .count { position: absolute; right: 10px; top: 6px; font-weight: 700; color: var(--hud-hi); font-size: 12px; }
  .act .exp { position: absolute; left: 10px; top: 5px; font-size: 9px; letter-spacing: .1em; color: var(--macro); opacity: .8; }
  .act.cyan { --tone: var(--telemetry); } .act.cyan b { color: var(--telemetry); }
  .act.amber { --tone: var(--hud-hi); } .act.amber b { color: var(--hud-hi); }
  .act.macro { --tone: var(--macro); background: linear-gradient(to bottom, #2d1d2c, var(--steel)); }
  .act.macro b { color: var(--macro); }
  .act.disabled { opacity: .38; cursor: not-allowed; }
  .act:active:not(:disabled) { filter: brightness(1.35); transform: translateY(1px); }
  .act.busy { animation: busy .5s linear infinite alternate; }
  @keyframes busy { to { filter: brightness(1.5); } }
  :global(.act.x2) { grid-column: span 2; }
  :global(.act.x2r) { grid-row: span 2; }

  /* LED: a state the game confirms (subsystem locked, fire group, last fighter order) */
  .act .led { position: absolute; left: 10px; top: 8px; width: 18px; height: 3px; background: var(--faint); }
  .act.live .led { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .act.live { background: linear-gradient(180deg, rgb(53 208 127 / .10), var(--steel) 60%); }

  /* toggle: the tile itself latches; ON tints it green and lights the state word */
  .act.toggle .state { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 18px; font-weight: 700; letter-spacing: .14em; color: var(--faint); }
  .act.toggle small { padding-right: 60px; }
  .act.toggle.live { --tone: var(--ok); }
  .act.toggle.live b, .act.toggle.live small, .act.toggle.live .state { color: var(--ok); }
  .act.toggle.live .state { text-shadow: 0 0 8px rgb(53 208 127 / .6); }

  /* lit plate: emergency escape, like FLIGHT's HYPERSPACE */
  .act.danger { background: linear-gradient(120deg, #c4412e, #8f2a20 55%, #5c1c15); border: 0; box-shadow: 0 0 18px rgb(209 72 58 / .35); }
  .act.danger b, .act.danger small { color: #fff; }
  .act.danger b { font-size: 20px; letter-spacing: .1em; }
  .act.danger small { font-size: 12px; }


  /* power presets: the pip split as three bars */
  .pips { display: flex; gap: 4px; align-items: flex-end; height: 22px; margin-top: 2px; }
  .pips i { width: 14px; background: var(--macro); }
</style>
