<script lang="ts">
  import type { CarrierRoute, EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Name from '../lib/Name.svelte';
  import Hop from '../lib/trade/Hop.svelte';
  import ReferencePicker from '../lib/trade/ReferencePicker.svelte';
  import PhonePages from '../lib/PhonePages.svelte';
  import { viewport } from '../lib/viewport.svelte.ts';
  import { ageLabel, cr, short } from '../lib/format.ts';

  // CARRIER: the fleet carrier as the journal last showed it, and a jump planner: Spansh's carrier router for the
  // systems, the tritium worked out on the server from this carrier's load (tank, cargo, space used).
  let { s, now }: { s: EdState; now: number } = $props();

  const c = $derived(s.carrier);
  const used = $derived(c.space.total ? c.space.total - c.space.free : 0);

  // --- planner inputs, kept on this device; empty numbers = the carrier's last known values ---
  interface Form { from: string; to: string[]; used: number | null; fuel: number | null; tritium: number | null }
  let f = $state<Form>(readForm());
  function readForm(): Form {
    try {
      const v = JSON.parse(localStorage.getItem('et.carrier.route') ?? '');
      if (Array.isArray(v.to)) return { from: v.from ?? '', to: v.to.length ? v.to : [''], used: v.used ?? null, fuel: v.fuel ?? null, tritium: v.tritium ?? null };
    } catch {}
    return { from: '', to: [''], used: null, fuel: null, tritium: null };
  }
  $effect(() => {
    try { localStorage.setItem('et.carrier.route', JSON.stringify(f)); } catch {}
  });
  const start = $derived(c.system || s.location.system);
  const q = $derived({
    from: f.from || start,
    to: f.to.filter((t) => t.trim()),
    used: f.used ?? used,
    fuel: f.fuel ?? c.fuel,
    tritium: f.tritium ?? 0,
  });

  let route = $state<CarrierRoute | null>(null);
  let busy = $state(false);
  let error = $state('');
  async function plot() {
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/carrier/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      route = body as CarrierRoute;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  $effect(() => {
    fetch('/api/carrier/last-route').then((r) => (r.status === 200 ? r.json() : null)).then((r) => r && !route && (route = r)).catch(() => {});
  });

  /** Countdown 15 min + jump + ~5 min cooldown before the next one can be scheduled (community figures). */
  const JUMP_MIN = 20;
  const jumps = $derived(route ? route.jumps.length - 1 : 0);
  const key = (n: string) => n.trim().toLowerCase();
  // where the carrier is on the route now: the next jump is the row after it
  const at = $derived(route ? route.jumps.findIndex((j) => key(j.system) === key(c.system)) : -1);
  const goingTo = $derived(c.jump ? key(c.jump.system) : '');
  const departIn = $derived(c.jump ? Date.parse(c.jump.departAt) - now : 0);
  const clock = (ms: number) => `${Math.floor(ms / 6e4)}:${String(Math.floor((ms % 6e4) / 1000)).padStart(2, '0')}`;
  const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.round(min)}m`);

  // --- upkeep: the journal gives the balance, not the weekly cost; it is charged Thursdays 07:00 UTC from the balance.
  // Defaults to the most it can cost (every service on, ~30M); type the figure the carrier management shows. ---
  const UPKEEP_MAX = 30; // M Cr
  const MARGIN_WEEKS = 4;
  const WEEK = 7 * 864e5;
  // kept on the server with the carrier, so every device shows the last figure typed
  const upkeepM = $derived(c.upkeep ? c.upkeep / 1e6 : null);
  async function setUpkeep(m: number | null) {
    await fetch('/api/carrier/upkeep', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekly: m && m > 0 ? Math.round(m * 1e6) : 0 }),
    }).catch(() => {});
  }
  // a figure this device kept before it lived on the server goes up once
  $effect(() => {
    if (!c.id || c.upkeep) return;
    try {
      const old = Number(localStorage.getItem('et.carrier.upkeep'));
      if (old > 0) void setUpkeep(old);
      localStorage.removeItem('et.carrier.upkeep');
    } catch {}
  });
  const weekly = $derived((upkeepM ?? UPKEEP_MAX) * 1e6);
  const nextCharge = $derived.by(() => {
    const d = new Date(now);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((4 - d.getUTCDay() + 7) % 7), 7);
    if (t <= now) t += WEEK;
    return t;
  });
  /** How many weekly charges the balance pays, and the dates that follow from it. */
  const runway = $derived.by(() => {
    const paid = Math.floor(c.balance / weekly);
    const lastPaid = paid ? nextCharge + (paid - 1) * WEEK : 0;
    const short = nextCharge + paid * WEEK; // the first charge the balance cannot pay
    return { paid, weeks: c.balance / weekly, lastPaid, short, topUpBy: short - MARGIN_WEEKS * WEEK };
  });
  /**
   * Income of the last 7 days from the balance history: each step's change, less what the player deposited or
   * withdrew. Rises are income; falls are costs (upkeep, jumps, buy orders being filled). Goal: income >= weekly upkeep.
   */
  const flow = $derived.by(() => {
    const L = c.ledger ?? [];
    const cut = now - WEEK;
    let inn = 0;
    let out = 0;
    for (let k = 1; k < L.length; k++) {
      if (Date.parse(L[k].at) < cut) continue;
      const d = L[k].balance - L[k - 1].balance - L[k].moved;
      if (d > 0) inn += d;
      else out -= d;
    }
    const days = L.length ? Math.min(7, (now - Math.max(cut, Date.parse(L[0].at))) / 864e5) : 0;
    return { inn, out, net: inn - out, days, pct: weekly ? (inn / weekly) * 100 : 0 };
  });
  const GOAL_SCALE = 200; // the bar runs to 200% of the goal, the mark at 100%
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  const span = (weeks: number) => {
    const m = Math.floor((weeks * 7) / 30.44);
    return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : m >= 1 ? `${m} mo` : `${Math.floor(weeks)} wk`;
  };

  // phones: the carrier's status and the jump planner are two pages, picked from the bar
  type Page = 'status' | 'planner';
  const PAGES: { id: Page; label: string; icon: string }[] = [
    { id: 'status', label: 'STATUS', icon: '▣' }, { id: 'planner', label: 'JUMP PLANNER', icon: '➤' },
  ];
  let page = $state<Page>(readPage());
  function readPage(): Page {
    try { return localStorage.getItem('et.carrier.page') === 'planner' ? 'planner' : 'status'; } catch { return 'status'; }
  }
  $effect(() => {
    try { localStorage.setItem('et.carrier.page', page); } catch {}
  });
  const phone = $derived(viewport.device === 'phone');
  const wide = $derived(viewport.vp === 'desktop-landscape' || viewport.vp === 'tablet-landscape');
  const tracked = $derived(c.cargo.reduce((t, x) => t + x.count, 0));
  const seg = (n: number) => `${c.space.total ? (n / c.space.total) * 100 : 0}%`;
</script>

{#snippet status()}
  <Panel class="cstat" title="Carrier" aside={c.callsign}>
    {#if !c.id}
      <p class="dim">No carrier known yet. With the game running on this PC, open the carrier management once: its
        tritium, space and balance come from there and are kept here from then on.</p>
    {:else}
      <div class="ident">
        {#if c.name}<div class="cname">{c.name}</div>{/if}
        <div class="row"><span class="k">AT</span><span class="sys"><Name value={c.system || '—'} system /></span></div>
      </div>
      {#if c.jump}
        <div class="jumpbox" class:go={departIn <= 0}>
          <span class="k">{departIn > 0 ? 'JUMPING IN' : 'JUMPING'}</span>
          <b class="num">{departIn > 0 ? clock(departIn) : '…'}</b>
          <span class="sys"><Name value={c.jump.system} system /></span>
          {#if c.jump.body}<span class="dim">{c.jump.body.replace(c.jump.system, '').trim() || 'star'}</span>{/if}
        </div>
      {/if}

      <section class="sec">
        <header><span>TRITIUM</span><i></i><em>tank</em></header>
        <div class="tank"><div style:width="{(c.fuel / 1000) * 100}%"></div><span class="num">{cr(c.fuel)} / 1,000 t</span></div>
      </section>

      <section class="sec">
        <header><span>SPACE</span><i></i><em>{cr(used)} of {cr(c.space.total)} t</em></header>
        <div class="space">
          <span class="crew" style:width={seg(c.space.crew)}></span><span class="cargo" style:width={seg(c.space.cargo)}></span><span
            class="res" style:width={seg(c.space.reserved)}></span><span class="packs" style:width={seg(c.space.packs)}></span>
        </div>
        <div class="legend">
          <span><i class="crew"></i>services {cr(c.space.crew)}</span>
          <span><i class="cargo"></i>cargo {cr(c.space.cargo)}</span>
          <span><i class="res"></i>buy orders {cr(c.space.reserved)}</span>
          {#if c.space.packs}<span><i class="packs"></i>packs {cr(c.space.packs)}</span>{/if}
          <span>free {cr(c.space.free)}</span>
        </div>
      </section>

      <section class="sec">
        <header><span>CARGO</span><i></i><em>{cr(tracked)} t tracked</em></header>
        {#if c.cargo.length}
          <div class="cargo-list">
            {#each c.cargo as x (x.name)}<div class="cg"><span>{x.label}</span><b class="num">{cr(x.count)}</b></div>{/each}
          </div>
        {:else}
          <p class="dim small">Nothing tracked yet: transfers from your ship and sales to the carrier's market show here.</p>
        {/if}
        {#if c.statsAt && tracked !== c.space.cargo}
          <p class="drift" title="Tracked from your own transfers and trades with the carrier. Other players filling orders, play on another machine and anything before tracking began are not seen.">
            carrier reported {cr(c.space.cargo)} t {ageLabel((now - Date.parse(c.statsAt)) / 3.6e6)} ago · open the carrier management to refresh</p>
        {/if}
      </section>

      <section class="sec">
        <header><span>FINANCES</span><i></i></header>
        <div class="money">
          <div><span class="k">BALANCE</span><b class="num">{short(c.balance)} Cr</b></div>
          <div><span class="k">AVAILABLE</span><b class="num ok">{short(c.available)} Cr</b></div>
          {#if c.reserve}<div><span class="k">RESERVE</span><b class="num">{short(c.reserve)} Cr</b></div>{/if}
        </div>
      </section>

      <section class="sec">
        <header><span>INCOME</span><i></i><em>{flow.days < 7 ? `${flow.days.toFixed(1)} of 7 days` : 'last 7 days'}</em></header>
        <div class="goal" title="The goal: income of the last 7 days against the weekly upkeep (the history covers {flow.days.toFixed(1)} days so far). The bar runs to {GOAL_SCALE}%; the mark is 100%.">
          <div class="fill" class:over={flow.pct >= 100} style:width="{Math.min(flow.pct, GOAL_SCALE) / GOAL_SCALE * 100}%"></div>
          <i class="mark"></i>
          <span class="num">{flow.pct.toFixed(0)}% of goal</span>
        </div>
        <div class="dates">
          <span class="k">INCOME</span><b class="num ok">+{short(flow.inn)} Cr</b>
          <span class="k" title="Upkeep, jumps and buy orders being filled: the balance cannot tell them apart">COSTS</span><b class="num">−{short(flow.out)} Cr</b>
          <span class="k">NET</span><b class="num" class:bad={flow.net < 0}>{flow.net < 0 ? '−' : '+'}{short(Math.abs(flow.net))} Cr</b>
        </div>
      </section>

      <section class="sec">
        <header><span>UPKEEP</span><i></i><em>Thursdays 07:00 UTC</em></header>
        <div class="upkeep">
          <label class="wk" title="What the carrier management shows as the weekly upkeep. Empty = {UPKEEP_MAX}M, the most it can cost with every service on.">
            <span class="k">PER WEEK</span><input type="number" min="1" step="any" inputmode="decimal" value={upkeepM ?? ''} onchange={(e) => setUpkeep(e.currentTarget.valueAsNumber)} placeholder={String(UPKEEP_MAX)} />M Cr
            {#if !upkeepM}<span class="est">ESTIMATE · max</span>{/if}</label>
          <div class="run" class:bad={runway.paid < MARGIN_WEEKS} title="{cr(runway.paid)} weekly charges paid from the balance">
            <b class="num">{span(runway.weeks)}</b><span class="dim">{cr(runway.paid)} weeks of upkeep</span></div>
          <div class="dates">
            <span class="k">NEXT CHARGE</span><b class="num">{day(nextCharge)}</b>
            <span class="k">PAID UNTIL</span><b class="num">{runway.paid ? day(runway.lastPaid) : 'NOT COVERED'}</b>
            <span class="k" title="{MARGIN_WEEKS} weeks before the first charge the balance cannot pay">TOP UP BY</span>
            <b class="num" class:bad={runway.topUpBy <= now}>{runway.topUpBy <= now ? 'NOW' : day(runway.topUpBy)}</b>
          </div>
        </div>
      </section>

      <div class="dim seen">as of {c.updatedAt ? ageLabel((now - Date.parse(c.updatedAt)) / 3.6e6) : '?'} ago · tank and space refresh when the
        carrier management opens</div>
    {/if}
  </Panel>
{/snippet}

{#snippet planner()}
  <Panel class="cplan" title="Jump planner" aside={route ? `${jumps} jump${jumps === 1 ? '' : 's'}` : ''}>
    <div class="form">
      <div class="places">
        <ReferencePicker bind:value={f.from} current={start} stations={false} />
        {#each f.to as _, i (i)}
          <div class="to">
            <ReferencePicker bind:value={f.to[i]} current="" label={f.to.length > 1 && i < f.to.length - 1 ? `VIA ${i + 1}` : 'TO'} stations={false} />
            {#if f.to.length > 1}<button class="mini" onclick={() => f.to.splice(i, 1)} title="Remove this stop">−</button>{/if}
          </div>
        {/each}
        <button class="add" onclick={() => f.to.splice(f.to.length - 1, 0, '')} title="A stop on the way (the order of the list)">+ STOP ON THE WAY</button>
      </div>
      <div class="nums">
        <label title="Space used on the carrier (services, cargo, buy orders, packs): it is mass">
          <span class="k">USED</span><input type="number" min="0" max="25000" inputmode="numeric" bind:value={f.used} placeholder={String(used)} />t</label>
        <label title="Tritium in the tank at the start">
          <span class="k">TANK</span><input type="number" min="0" max="1000" inputmode="numeric" bind:value={f.fuel} placeholder={String(c.fuel)} />t</label>
        <label title="Tritium in the carrier's cargo, moved into the tank on the way (already counted in USED)">
          <span class="k">TRITIUM IN CARGO</span><input type="number" min="0" inputmode="numeric" bind:value={f.tritium} placeholder="0" />t</label>
        {#if f.used !== null || f.fuel !== null}<button class="link" onclick={() => ((f.used = null), (f.fuel = null))}>carrier's values</button>{/if}
      </div>
      <button class="plot" disabled={busy || !q.from || !q.to.length} onclick={plot}>
        {busy ? 'PLOTTING…' : `PLOT · ${(q.from || '?').toUpperCase()} → ${(q.to.at(-1) || '?').toUpperCase()}`}
      </button>
      {#if error}<p class="bad">{error}</p>{/if}
    </div>

    {#if route}
      <div class="sum">
        <div><span class="k">JUMPS</span><b class="num">{jumps}</b></div>
        <div><span class="k">DISTANCE</span><b class="num">{cr(route.distance)} ly</b></div>
        <div><span class="k">TRITIUM</span><b class="num hud">{cr(route.tritium)} t</b></div>
        <div title="{JUMP_MIN} min per jump: 15 min countdown, the jump, ~5 min cooldown (estimated)"><span class="k">TIME ≈</span><b class="num">{hm(jumps * JUMP_MIN)}</b></div>
        <div class:bad={route.missing > 0} class:ok={!route.missing}>
          <span class="k">{route.missing ? 'BUY BEFORE LEAVING' : 'TRITIUM'}</span>
          <b class="num">{route.missing ? `${cr(route.missing)} t` : 'COVERED'}</b>
        </div>
      </div>
      <div class="scroll">
        <div class="chain">
          {#each route.jumps as j, i (i)}
            <div class="seg">
            {#if i}<div class="lane"><Hop ly={j.ly} label="{j.fuelUsed} t" vertical /></div>{/if}
            <div class="stop" class:here={i === at} class:next={at >= 0 && i === at + 1} class:way={j.waypoint} class:short={j.short} class:going={!!goingTo && key(j.system) === goingTo}>
              <span class="badge">{i || '·'}</span>
              <div class="info">
                <div class="name"><Name value={j.system} system /></div>
                <div class="mid">
                  {#if j.icyRing}
                    <span class="mine" class:pristine={j.pristine} title="Icy ring: tritium can be mined here{j.pristine ? ' (pristine: the richest reserves)' : ''}">⛏ TRITIUM{j.pristine ? ' · PRISTINE' : ''}</span>
                  {/if}
                </div>
                <div class="foot-row">
                  <div class="tags">
                    {#if i === at}<span class="tag here">HERE</span>{:else if at >= 0 && i === at + 1}<span class="tag">NEXT</span>{/if}
                    {#if !!goingTo && key(j.system) === goingTo}<span class="tag go">JUMPING</span>{/if}
                    {#if i && j.waypoint}<span class="tag wpt">STOP</span>{/if}
                    {#if j.short}<span class="tag sh" title="A jump shorter than the carrier's range">SHORT</span>{/if}
                    {#if j.topUp}<span class="tag refuel" title="Move {j.topUp}t of tritium from the cargo into the tank before this jump">REFUEL {j.topUp}t</span>{/if}
                  </div>
                  <div class="meta">
                    <span>TANK <b class="num">{j.tank}</b></span>
                    {#if q.tritium || j.cargo}<span>CARGO <b class="num">{j.cargo}</b></span>{/if}
                  </div>
                </div>
              </div>
            </div>
            </div>
          {/each}
        </div>
      </div>
      <p class="dim foot">Tap a system to copy it, then paste it in the carrier's galaxy map. In the system map you can
        pick the body the carrier parks at (near the construction site saves the supercruise).</p>
    {:else}
      <p class="dim">FROM is the carrier's system unless you pick another. Tritium per jump is worked out from the
        space used and the tank: 5 t + about 1 t every 7 ly when loaded light.</p>
    {/if}
  </Panel>
{/snippet}

{#if phone}
  <PhonePages pages={PAGES} bind:page>
    <div class="carrier phone">
      {#if page === 'status'}{@render status()}{:else}{@render planner()}{/if}
    </div>
  </PhonePages>
{:else}
<div class="carrier" class:wide>
  {@render status()}
  {@render planner()}
</div>
{/if}

<style>
  .carrier { display: grid; gap: 8px; height: 100%; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
  .carrier.wide { grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  /* a phone: one panel per page, the page scrolls as a whole */
  .carrier.phone { display: block; height: auto; }
  .carrier.phone :global(.cstat .body) { overflow: visible; }
  .carrier.phone .scroll { overflow: visible; flex: none; }
  .carrier :global(.cplan .body) { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .ident { padding-bottom: 2px; }
  .carrier :global(.cstat .body) { overflow-y: auto; min-height: 0; }
  .cname { font-weight: 800; color: var(--hud-hi); letter-spacing: 0.06em; margin-bottom: 4px; }
  .row { display: flex; gap: 8px; align-items: baseline; }
  .sys { font-weight: 800; color: var(--telemetry); font-size: 13px; min-width: 0; }
  .sys :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .jumpbox {
    display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; margin-top: 6px; padding: 6px 8px;
    border: 1px solid var(--hud); background: rgb(255 122 24 / 0.08);
  }
  .jumpbox b { font-size: 17px; color: var(--hud-hi); }
  .jumpbox.go b { color: var(--telemetry); }
  .tank { position: relative; height: 22px; background: var(--steel); border: 1px solid var(--rule); }
  .tank div { height: 100%; background: var(--telemetry); opacity: 0.7; }
  .tank span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--text); }
  .space { display: flex; height: 22px; background: var(--steel); border: 1px solid var(--rule); }
  .crew { background: var(--muted); }
  .cargo { background: var(--hud); }
  .res { background: var(--hud-hi); opacity: 0.6; }
  .packs { background: var(--telemetry); }
  .legend { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 10px; color: var(--muted); margin-top: 3px; }
  .legend i { display: inline-block; width: 8px; height: 8px; margin-right: 3px; }
  .cargo-list { display: flex; flex-direction: column; max-height: 220px; overflow-y: auto; }
  .cg { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 11px; border-bottom: 1px solid var(--rule); }
  .cg b { color: var(--hud-hi); }
  .cg span { display: inline-block; }
  .cg span::first-letter { text-transform: uppercase; }
  .small { font-size: 10px; margin: 0; }
  .drift { font-size: 10px; color: var(--hud-hi); margin: 4px 0 0; }
  .money { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; }
  .money div { display: flex; flex-direction: column; padding: 4px 8px; border: 1px solid var(--rule); background: var(--rail); }
  .money b { font-size: 14px; }
  .upkeep { display: flex; flex-direction: column; gap: 6px; }
  .wk { display: flex; gap: 5px; align-items: center; font-size: 11px; color: var(--dim); flex-wrap: wrap; }
  .wk input {
    width: 64px; padding: 3px 6px; font: 700 12px var(--mono); color: var(--telemetry); text-align: right;
    background: var(--void); border: 1px solid var(--rule); appearance: textfield; -moz-appearance: textfield;
  }
  .wk input::-webkit-outer-spin-button, .wk input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .est { font-size: 9px; font-weight: 800; letter-spacing: 0.06em; color: var(--hud-hi); }
  .goal { position: relative; height: 22px; background: var(--steel); border: 1px solid var(--rule); margin-bottom: 6px; }
  .goal .fill { height: 100%; background: var(--hud); opacity: 0.75; }
  .goal .fill.over { background: var(--ok); }
  .goal .mark { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--text); opacity: 0.8; }
  .goal span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
  .run { display: flex; align-items: baseline; gap: 8px; padding: 5px 8px; border: 1px solid var(--rule); background: var(--rail); }
  .run b { font-size: 18px; color: var(--ok); }
  .run.bad b { color: var(--danger); }
  .run .dim { font-size: 10px; }
  .dates { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: baseline; font-size: 11px; }
  .dates b { text-align: right; }
  .dates .bad { color: var(--danger); }
  .ok { color: var(--ok); }
  .hud { color: var(--hud); }
  .bad { color: var(--danger); font-size: 11px; }
  .seen { font-size: 10px; margin-top: 8px; }

  .form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
  .places { display: flex; flex-direction: column; gap: 4px; }
  .to { display: flex; gap: 4px; align-items: center; }
  .to > :global(*:first-child) { flex: 1; min-width: 0; }
  .mini, .add {
    padding: 4px 8px; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer;
    color: var(--muted); background: var(--steel); border: 1px solid var(--rule);
  }
  .add { align-self: flex-start; color: var(--hud-hi); }
  .nums { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 11px; color: var(--dim); }
  .nums label { display: flex; gap: 5px; align-items: center; }
  .nums input {
    width: 70px; padding: 4px 6px; font: 700 12px var(--mono); color: var(--telemetry); text-align: right;
    background: var(--void); border: 1px solid var(--rule); appearance: textfield; -moz-appearance: textfield;
  }
  .nums input::-webkit-outer-spin-button, .nums input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .link { background: none; border: 0; padding: 0; color: var(--hud-hi); text-decoration: underline; font: inherit; font-size: 10px; cursor: pointer; }
  .plot {
    padding: 11px; background: var(--hud); color: var(--void); border: 0; font-weight: 800; letter-spacing: 0.1em; overflow-wrap: anywhere;
    box-shadow: var(--glow); clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }
  .plot:disabled { opacity: 0.6; }

  .sum { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 6px 8px; margin-bottom: 6px; border: 1px solid var(--rule); background: var(--rail); }
  .sum div { display: flex; flex-direction: column; }
  .sum b { font-size: 16px; }
  .sum .bad b, .sum .bad .k { color: var(--danger); font-size: 16px; }
  .sum .bad .k { font-size: 10px; }
  /* the gutter stays: a scrollbar coming and going would change the card columns, and with them the height */
  .scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
  /* the route as a chain of stops, left to right and wrapping, with the jump lane between each pair */
  .chain { display: grid; grid-template-columns: repeat(auto-fill, minmax(274px, 1fr)); gap: 6px 0; }
  .seg { display: flex; min-width: 0; }
  .lane { flex: none; width: 84px; }
  /* the cards grow to fill each row: name on top, what to mine in the middle, tags and tank/cargo at the bottom */
  .stop {
    flex: 1; min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px; align-items: stretch;
    padding: 6px 8px; border: 1px solid var(--rule); background: var(--rail);
  }
  .stop.way { border-color: var(--telemetry); }
  .stop.here { border-color: var(--ok); background: rgb(92 214 120 / 0.12); }
  .stop.next { border-color: var(--hud); background: rgb(255 122 24 / 0.12); }
  .stop.short { border-color: var(--danger); }
  .badge {
    display: grid; place-items: center; height: 22px; background: var(--hud); color: var(--void); font-weight: 800;
    clip-path: polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px);
  }
  .info { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .name { font-weight: 700; color: var(--telemetry); }
  .name :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .mid { flex: 1; display: flex; align-items: center; min-height: 14px; }
  .mine { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--muted); }
  .mine.pristine { color: var(--ok); }
  .foot-row { display: flex; flex-direction: column; gap: 3px; }
  .tags { display: flex; flex-wrap: wrap; gap: 3px 4px; }
  .tags:empty { display: none; }
  .meta { display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 10px; color: var(--muted); }
  .meta b { color: var(--text); }
  .tag { padding: 0 4px; font-size: 9px; font-weight: 800; color: var(--void); background: var(--hud); }
  .tag.here { background: var(--ok); }
  .tag.go, .tag.wpt { background: var(--telemetry); }
  .tag.sh { background: var(--danger); }
  .tag.refuel { background: var(--hud-hi); }
  .foot { font-size: 10px; margin: 6px 0 0; }
</style>
