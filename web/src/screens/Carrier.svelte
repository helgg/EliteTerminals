<script lang="ts">
  import type { CarrierRoute, EdState } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Name from '../lib/Name.svelte';
  import ReferencePicker from '../lib/trade/ReferencePicker.svelte';
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
      {#if c.name}<div class="cname">{c.name}</div>{/if}
      <div class="row"><span class="k">AT</span><span class="sys"><Name value={c.system || '—'} system /></span></div>
      {#if c.jump}
        <div class="jumpbox" class:go={departIn <= 0}>
          <span class="k">{departIn > 0 ? 'JUMPING IN' : 'JUMPING'}</span>
          <b class="num">{departIn > 0 ? clock(departIn) : '…'}</b>
          <span class="sys"><Name value={c.jump.system} system /></span>
          {#if c.jump.body}<span class="dim">{c.jump.body.replace(c.jump.system, '').trim() || 'star'}</span>{/if}
        </div>
      {/if}
      <div class="k top">TRITIUM IN TANK</div>
      <div class="tank"><div style:width="{(c.fuel / 1000) * 100}%"></div><span class="num">{cr(c.fuel)} / 1,000 t</span></div>
      <div class="k top">SPACE · {cr(used)} used of {cr(c.space.total)} t</div>
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
      <div class="k top">CARGO · {cr(tracked)} t tracked</div>
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
      <div class="money">
        <div><span class="k">BALANCE</span><b class="num">{short(c.balance)} Cr</b></div>
        <div><span class="k">AVAILABLE</span><b class="num ok">{short(c.available)} Cr</b></div>
      </div>
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
        <table>
          <thead><tr><th>#</th><th>System</th><th class="r">Jump</th><th class="r">Tritium</th><th class="r">Tank</th><th class="r">Cargo</th><th>Notes</th></tr></thead>
          <tbody>
            {#each route.jumps as j, i (i)}
              <tr class:here={i === at} class:next={at >= 0 && i === at + 1} class:way={j.waypoint} class:short={j.short} class:going={!!goingTo && key(j.system) === goingTo}>
                <td class="num dim">{i || '·'}</td>
                <td class="sysn"><Name value={j.system} system />
                  {#if i === at}<span class="tag here">HERE</span>{:else if at >= 0 && i === at + 1}<span class="tag">NEXT</span>{/if}
                  {#if !!goingTo && key(j.system) === goingTo}<span class="tag go">JUMPING</span>{/if}</td>
                <td class="r num">{i ? `${j.ly.toFixed(1)}` : ''}</td>
                <td class="r num hud">{i ? j.fuelUsed : ''}</td>
                <td class="r num">{j.tank}</td>
                <td class="r num dim">{q.tritium || j.cargo ? j.cargo : ''}</td>
                <td class="notes"><div class="nl">
                  {#if j.topUp}<span class="tu" title="Move {j.topUp}t of tritium from the cargo into the tank before this jump">CARGO → TANK {j.topUp}t</span>{/if}
                  {#if j.short}<span class="sh">SHORT</span>{/if}
                  {#if i && j.waypoint}<span class="wp">STOP</span>{/if}
                  {#if j.icyRing}<span class="dim" title="Icy ring: tritium can be mined here{j.pristine ? ' (pristine)' : ''}">icy ring{j.pristine ? ' · pristine' : ''}</span>{/if}
                </div></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="dim foot">Tap a system to copy it, then paste it in the carrier's galaxy map. In the system map you can
        pick the body the carrier parks at (near the construction site saves the supercruise).</p>
    {:else}
      <p class="dim">FROM is the carrier's system unless you pick another. Tritium per jump is worked out from the
        space used and the tank: 5 t + about 1 t every 7 ly when loaded light.</p>
    {/if}
  </Panel>
{/snippet}

<div class="carrier" class:wide>
  {@render status()}
  {@render planner()}
</div>

<style>
  .carrier { display: grid; gap: 8px; height: 100%; min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
  .carrier.wide { grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .carrier :global(.cplan .body) { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .top { margin-top: 8px; margin-bottom: 3px; }
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
  .tank { position: relative; height: 16px; background: var(--steel); border: 1px solid var(--rule); }
  .tank div { height: 100%; background: var(--telemetry); opacity: 0.7; }
  .tank span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--text); }
  .space { display: flex; height: 10px; background: var(--steel); border: 1px solid var(--rule); }
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
  .money { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
  .money div { display: flex; flex-direction: column; }
  .money b { font-size: 15px; }
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
  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { position: sticky; top: 0; background: var(--panel); text-align: left; font-size: 10px; color: var(--dim); letter-spacing: 0.08em; padding: 3px 4px; }
  th.r, td.r { text-align: right; }
  td { padding: 5px 4px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
  .sysn { color: var(--telemetry); font-weight: 700; white-space: normal; }
  .sysn :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  tr.way td { background: rgb(55 198 212 / 0.06); }
  tr.here td { background: rgb(92 214 120 / 0.12); }
  tr.next td { background: rgb(255 122 24 / 0.12); }
  tr.next td:first-child { box-shadow: inset 3px 0 var(--hud); }
  tr.short td { color: var(--danger); }
  .tag { margin-left: 6px; padding: 0 4px; font-size: 9px; font-weight: 800; color: var(--void); background: var(--hud); }
  .tag.here { background: var(--ok); }
  .tag.go { background: var(--telemetry); }
  /* a flex <td> stops being a table cell: the wrapping goes in a div inside it */
  td.notes { white-space: normal; width: 30%; }
  .nl { display: flex; flex-wrap: wrap; gap: 2px 8px; font-size: 10px; }
  .tu { color: var(--hud-hi); font-weight: 700; }
  .sh { color: var(--danger); font-weight: 800; }
  .wp { color: var(--telemetry); font-weight: 700; }
  .foot { font-size: 10px; margin: 6px 0 0; }
</style>
