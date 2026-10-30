<script lang="ts">
  import type { ColonyDepot, ColonyMarkets, EdState } from '@et/shared';
  import Panel from '../Panel.svelte';
  import Name from '../Name.svelte';
  import PadBadge from '../PadBadge.svelte';
  import PlotButton from '../trade/PlotButton.svelte';
  import PlaceIcon, { placeKind } from '../PlaceIcon.svelte';
  import { viewport } from '../viewport.svelte.ts';
  import { ageLabel, ageTone, cr, short } from '../format.ts';

  // COLONY v2 (docs/design/COLONY.md): the construction site being supplied. What is left, the pace the deadline
  // asks for, what the hold carries now, and the markets near the site that stock most of the list.
  let { s, now }: { s: EdState; now: number } = $props();

  const depots = $derived(s.colony.depots);
  let pickedId = $state(0);
  const depot = $derived<ColonyDepot | null>(depots.find((d) => d.marketId === pickedId) ?? depots.find((d) => !d.complete && !d.failed) ?? depots[0] ?? null);

  /** Same commodity key as the server: "$steel_name;", "Steel" and "steel" are one commodity. */
  const key = (n: string) => n.toLowerCase().replace(/^\$/, '').replace(/_name;$/, '').replace(/[^a-z0-9]/g, '');
  const inHold = $derived(new Map(s.cargo.items.map((i) => [key(i.name), i.count])));
  // on the player's carrier: tracked from their own transfers (CARRIER screen)
  const onCarrier = $derived(new Map(s.carrier.cargo.map((i) => [key(i.name), i.count])));

  // the hauler doing the deliveries (often not the ship flown now): typed here and kept on this device;
  // until then the current ship's hold, or the one typed on TRADE
  let hauler = $state(readHauler());
  function readHauler() {
    try { return Number(localStorage.getItem('et.colony.hauler')) || 0; } catch { return 0; }
  }
  $effect(() => {
    try { localStorage.setItem('et.colony.hauler', String(hauler || '')); } catch {}
  });
  function typedCargo() {
    try { return Number(JSON.parse(localStorage.getItem('et.trade.ship') ?? '{}').cargo) || 0; } catch { return 0; }
  }
  const hold = $derived(hauler > 0 ? hauler : s.meta.online && s.ship.cargoCapacity ? s.ship.cargoCapacity : typedCargo());

  const rows = $derived(
    (depot?.resources ?? []).map((r) => {
      const left = Math.max(0, r.required - r.provided);
      const hold = inHold.get(key(r.name)) ?? 0;
      const carrier = onCarrier.get(key(r.name)) ?? 0;
      return { ...r, left, hold, carrier, toBuy: Math.max(0, left - hold - carrier) };
    })
      .sort((a, b) => Number(a.left === 0) - Number(b.left === 0) || b.left - a.left),
  );
  const required = $derived(rows.reduce((t, r) => t + r.required, 0));
  const provided = $derived(rows.reduce((t, r) => t + Math.min(r.provided, r.required), 0));
  const left = $derived(required - provided);
  const carried = $derived(rows.reduce((t, r) => t + Math.min(r.hold, r.left), 0));
  const stocked = $derived(rows.reduce((t, r) => t + Math.min(r.carrier, Math.max(0, r.left - r.hold)), 0));
  const toBuy = $derived(rows.reduce((t, r) => t + r.toBuy, 0));
  const paid = $derived(rows.reduce((t, r) => t + Math.min(r.provided, r.required) * r.payment, 0));
  const toBePaid = $derived(rows.reduce((t, r) => t + r.left * r.payment, 0));
  const msLeft = $derived(depot?.deadline ? Date.parse(depot.deadline) - now : 0);
  const daysLeft = $derived(Math.max(0, msLeft / 864e5));
  const trips = $derived(hold ? Math.ceil(left / hold) : 0);
  const perDay = $derived(daysLeft > 0 ? left / daysLeft : left);
  const tripsPerDay = $derived(hold && daysLeft > 0 ? perDay / hold : 0);
  const countdown = $derived(msLeft <= 0 ? 'OVER' : daysLeft >= 2 ? `${Math.floor(daysLeft)}d ${Math.floor((daysLeft % 1) * 24)}h` : `${Math.floor(msLeft / 3.6e6)}h ${Math.floor((msLeft % 3.6e6) / 6e4)}m`);

  // --- deadline (estimated as first seen + 28 days until set) ---
  let editing = $state(false);
  let deadlineText = $state('');
  function startEdit() {
    if (!depot) return;
    const d = new Date(depot.deadline);
    deadlineText = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    editing = true;
  }
  async function saveDeadline() {
    if (!depot || !deadlineText) return;
    await fetch('/api/colony/depot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketId: depot.marketId, deadline: new Date(deadlineText).toISOString() }),
    }).catch(() => null);
    editing = false;
  }

  // --- where to buy ---
  // the frontier has few markets, often with old prices: wide radii and any price age
  const RADII = [50, 100, 250, 500];
  let radius = $state(100);
  let near = $state<'site' | 'me' | 'carrier'>('site');
  let pad = $state<'S' | 'M' | 'L'>('L');
  // surface ports cost a descent and a climb per trip: off leaves only stations in space
  let planetary = $state(readPlanetary());
  function readPlanetary() {
    try { return localStorage.getItem('et.colony.planetary') !== '0'; } catch { return true; }
  }
  $effect(() => {
    try { localStorage.setItem('et.colony.planetary', planetary ? '1' : '0'); } catch {}
  });
  // fleet carriers' markets too (they move and their stock changes: the age shows how old the list is)
  let carriers = $state(readCarriers());
  function readCarriers() {
    try { return localStorage.getItem('et.colony.carriers') === '1'; } catch { return false; }
  }
  $effect(() => {
    try { localStorage.setItem('et.colony.carriers', carriers ? '1' : '0'); } catch {}
  });
  let markets = $state<ColonyMarkets | null>(null);
  let busy = $state(false);
  let error = $state('');
  let highlight = $state('');
  async function findMarkets() {
    if (!depot) return;
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/colony/markets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: depot.marketId,
          near,
          query: {
            radius, maxAgeH: 0, pad, planetary, carriers, exportHere: false, importHere: false, states: [], hops: 2,
            maxLs: 0, minSupply: 0, minDemand: 0, cargo: hold || 1, capital: 0, jumpRange: 20,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      markets = body as ColonyMarkets;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  const shownMarkets = $derived(
    markets?.marketId === depot?.marketId ? (markets?.markets ?? []).filter((m) => !highlight || m.items.some((i) => i.name === highlight)) : [],
  );
  /** Still to buy: what is left minus what the hold and the carrier already carry. */
  const leftOf = (name: string) => rows.find((r) => r.label === name)?.toBuy ?? 0;
  // a market card picked on the right marks on the list what it covers: all that is left (full) or some (part)
  let pickedMarket = $state(0);
  const covered = $derived.by(() => {
    const m = markets?.marketId === depot?.marketId ? markets?.markets.find((x) => x.end.marketId === pickedMarket) : undefined;
    return new Map((m?.items ?? []).map((i) => [i.name, i.stock >= leftOf(i.name) ? 'full' : 'part']));
  });
  function pickMarket(e: Event, id: number) {
    if ((e.target as HTMLElement).closest('button, a, select, input')) return; // PLOT and links keep their own click
    pickedMarket = pickedMarket === id ? 0 : id;
  }
  const vp = $derived(viewport.vp);
  const phone = $derived(viewport.device === 'phone');
  type Page = 'site' | 'list' | 'buy';
  let page = $state<Page>('list');
</script>

{#snippet site()}
  <Panel class="site" title="Construction" aside={depot ? (depot.complete ? 'COMPLETE' : depot.failed ? 'FAILED' : `${(depot.progress * 100).toFixed(1)}%`) : ''}>
    {#if !depot}
      <p class="dim">No construction site yet. Dock at a colonisation ship or construction site with the game running on
        this PC: the journal lists what it needs, and it is kept here from then on (also when you play elsewhere).</p>
    {:else}
      {#if depots.length > 1}
        <select class="pick" bind:value={pickedId}>
          {#each depots as d (d.marketId)}<option value={d.marketId}>{d.system} · {d.station}{d.complete ? ' · done' : ''}</option>{/each}
        </select>
      {/if}
      <div class="where">
        <span class="sys"><Name value={depot.system} system /></span>
        <span class="dim">{depot.station}</span>
        <span class="dim">{depot.body.replace(depot.system, '').trim()}</span>
        <PlotButton system={depot.system} />
        <a class="raven" href="https://ravencolonial.com/#sys={encodeURIComponent(depot.system)}" target="_blank" rel="noopener"
          title="Plan this system in RavenColonial">PLAN ↗</a>
      </div>
      <section class="sec">
        <header><span>PROGRESS</span><i></i><em>{cr(provided)} of {cr(required)} t delivered</em></header>
        <div class="bigbar"><div style:width="{required ? (provided / required) * 100 : 0}%"></div>
          {#if carried}<div class="hold" style:left="{(provided / required) * 100}%" style:width="{(carried / required) * 100}%"></div>{/if}
          {#if stocked}<div class="fc" style:left="{((provided + carried) / required) * 100}%" style:width="{(stocked / required) * 100}%"></div>{/if}</div>
        <div class="legend">
          <span><i class="dl"></i>delivered</span><span><i class="hd"></i>in hold</span><span><i class="cc"></i>on carrier</span><span>still to buy</span>
        </div>
        <div class="kpis">
          <div><span class="k">LEFT</span><b class="num hud">{cr(left)}t</b></div>
          <div><span class="k">STILL TO BUY</span><b class="num">{cr(toBuy)}t</b></div>
          <div><span class="k">IN HOLD</span><b class="num tele">{cr(carried)}t</b></div>
          <div><span class="k">ON CARRIER</span><b class="num fcc">{cr(stocked)}t</b></div>
        </div>
      </section>

      <section class="sec">
        <header><span>DELIVERY</span><i></i><em>{hauler ? 'ship typed here' : 'the ship flown now'}</em></header>
        <label class="hauler" title="The cargo ship doing the deliveries, often not the one flown now">
          <span class="k">SHIP HOLD</span>
          <input type="number" min="0" step="1" inputmode="numeric" bind:value={hauler} placeholder={String(s.ship.cargoCapacity || 0)} />t
        </label>
        <div class="kpis">
          <div><span class="k">TRIPS LEFT</span><b class="num">{hold ? trips : '—'}{#if hold}<small> × {cr(hold)}t</small>{/if}</b></div>
          <div><span class="k">PACE NEEDED</span><b class="num">{cr(perDay)}t<small>/day</small></b>{#if hold}<span class="dim sub">≈{tripsPerDay.toFixed(1)} trips/day</span>{/if}</div>
        </div>
      </section>

      <section class="sec">
        <header><span>DEADLINE</span><i></i><em>{new Date(depot.deadline).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</em></header>
        <div class="deadline" class:late={msLeft <= 0 || (hold > 0 && tripsPerDay > 6)}>
          <div>
            <span class="k">TIME LEFT {depot.deadlineSet ? '' : '· ESTIMATED'}</span>
            <b class="num">{countdown}</b>
          </div>
          {#if editing}
            <span class="edit"><input type="datetime-local" bind:value={deadlineText} /><button onclick={saveDeadline}>SET</button><button onclick={() => (editing = false)}>✕</button></span>
          {:else}
            <button class="set" onclick={startEdit} title="The journal does not give the time limit: set the one the game shows">{depot.deadlineSet ? 'EDIT' : 'SET'} DEADLINE</button>
          {/if}
        </div>
      </section>

      <section class="sec">
        <header><span>REWARD</span><i></i><em>paid for deliveries</em></header>
        <div class="pay"><b class="num ok">{short(paid)} Cr</b><span class="dim">· {short(toBePaid)} Cr still to earn</span></div>
      </section>
      <div class="dim seen">list from {ageLabel((now - Date.parse(depot.updatedAt)) / 3.6e6)} ago · it refreshes while docked there</div>
    {/if}
  </Panel>
{/snippet}

{#snippet list()}
  <Panel class="center" title="Shopping list" aside={depot ? `${rows.filter((r) => r.left).length} of ${rows.length} left` : ''}>
    {#if depot}
      <div class="scroll">
        <table>
          <thead><tr><th>Commodity</th><th class="r">Left</th><th class="r">Hold</th><th class="r" title="On your carrier (tracked from your own transfers)">Carrier</th><th class="bar"></th><th class="r">Need</th><th class="r">Cr/t</th></tr></thead>
          <tbody>
            {#each rows as r (r.name)}
              <tr class:done={!r.left} class:hl={highlight === r.label}
                class:full={!!r.toBuy && covered.get(r.label) === 'full'} class:part={!!r.toBuy && covered.get(r.label) === 'part'} onclick={() => (highlight = highlight === r.label ? '' : r.label)}
                title="Tap to show only the markets with {r.label}">
                <td class="cn">{r.label}</td>
                <td class="r num left">{r.left ? cr(r.left) : '✓'}</td>
                <td class="r num tele">{r.hold ? cr(r.hold) : ''}</td>
                <td class="r num fcc">{r.carrier ? cr(r.carrier) : ''}</td>
                <td class="bar"><span class="mini"><span style:width="{(r.provided / r.required) * 100}%"></span></span></td>
                <td class="r num dim">{cr(r.required)}</td>
                <td class="r num dim">{cr(r.payment)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Panel>
{/snippet}

{#snippet buy()}
  <Panel class="right" title="Where to buy" aside={markets && markets.marketId === depot?.marketId ? `${markets.markets.length} markets` : ''}>
    {#if depot}
      <!-- the filters as on TRADE: the title above its buttons, one choice filled orange, on/off outlined blue -->
      <div class="filters">
        <div class="row three">
          <div class="group">
            <span class="k">AROUND</span>
            <div class="chips">
              {#each [['site', 'SITE'], ['me', 'ME'], ...(s.carrier.id ? [['carrier', 'MY CARRIER']] : [])] as [v, label] (v)}
                <button class:on={near === v} onclick={() => (near = v as typeof near)}
                  title={v === 'me' ? 'Around where you are now (fill a carrier in the bubble)' : v === 'carrier' ? 'Around where your carrier is parked' : 'Around the construction site'}>{label}</button>
              {/each}
            </div>
          </div>
          <div class="group">
            <span class="k">PAD</span>
            <div class="chips">{#each ['M', 'L'] as const as p (p)}<button class:on={pad === p} onclick={() => (pad = p)}>{p}</button>{/each}</div>
          </div>
          <div class="group">
            <span class="k">INCLUDE</span>
            <div class="toggles">
              <button class:on={planetary} onclick={() => (planetary = !planetary)}
                title={planetary ? 'Surface ports included: tap to leave them out' : 'Only stations in space: tap to include surface ports'}>PLANETARY</button>
              <button class:on={carriers} onclick={() => (carriers = !carriers)}
                title={carriers ? 'Fleet carriers included: tap to leave them out' : 'Only stations and ports: tap to include fleet carriers'}>FLEET CARRIERS</button>
            </div>
          </div>
        </div>
        <div class="row find">
          <div class="group">
            <span class="k">RADIUS (ly)</span>
            <div class="chips">{#each RADII as r (r)}<button class:on={radius === r} onclick={() => (radius = r)}>{r}</button>{/each}</div>
          </div>
          <button class="scan" disabled={busy || !left} onclick={findMarkets}
            title="Markets {near === 'me' ? 'around you' : near === 'carrier' ? 'around your carrier' : 'around the construction site'} within {radius} ly">{busy ? 'SEARCHING…' : 'FIND'}</button>
        </div>
      </div>
      {#if error}<p class="bad">{error}</p>{/if}
      {#if highlight}<p class="hlnote">only markets with <b>{highlight}</b> · <button class="link" onclick={() => (highlight = '')}>show all</button></p>{/if}
      {#if markets?.missing.length && markets.marketId === depot.marketId}
        <p class="bad">none around: {markets.missing.join(', ')}</p>
      {/if}
      <div class="scroll mk">
        {#each shownMarkets as m (m.end.marketId)}
          <div class="market" class:on={pickedMarket === m.end.marketId} role="button" tabindex="0"
            title="Tap to mark on the list what this market covers (green: all that is left, yellow: part)"
            onclick={(e) => pickMarket(e, m.end.marketId)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pickMarket(e, m.end.marketId))}>
            <div class="mh">
              <span class="st"><PlaceIcon kind={placeKind(m.end.type)} /><Name value={m.end.station} /></span>
              <PadBadge pad={m.end.pad} />
              <span class="num dim">{m.end.fromMe.toFixed(1)}ly {near === 'me' ? 'from you' : near === 'carrier' ? 'from carrier' : 'from site'} · {cr(m.end.ls)}ls</span>
              <span class="{ageTone(m.end.ageH)} num">{ageLabel(m.end.ageH)}</span>
            </div>
            <div class="ms"><Name value={m.end.system} system /><PlotButton system={m.end.system} /></div>
            <div class="items">
              {#each m.items as i (i.name)}
                <span class="it" class:short={i.stock < leftOf(i.name)} class:hl={highlight === i.name}
                  title="{i.name}: {cr(i.stock)}t at {cr(i.price)} Cr · {cr(leftOf(i.name))}t still to buy">{i.name} <b>{short(i.stock)}</b></span>
              {/each}
            </div>
          </div>
        {:else}
          <p class="dim">{markets ? 'No market around has what is left: widen WITHIN.' : 'FIND lists the markets near the site with what is still needed, the ones carrying most of the list first. Tap a commodity on the left to see only its markets; tap a market to mark on the list what it covers.'}</p>
        {/each}
      </div>
    {/if}
  </Panel>
{/snippet}

{#if phone}
  <div class="build phone {viewport.orientation}">
    <nav class="pages">
      {#each [['site', 'SITE', '◎'], ['list', 'LIST', '≡'], ['buy', 'BUY', '⌖']] as [id, label, icon] (id)}
        <button class:on={page === id} onclick={() => (page = id as Page)}><span class="pi">{icon}</span>{label}</button>
      {/each}
    </nav>
    <div class="page">
      {#if page === 'site'}{@render site()}{:else if page === 'list'}{@render list()}{:else}{@render buy()}{/if}
    </div>
  </div>
{:else}
  <div class="build {vp === 'desktop-landscape' ? 'wide' : `mid ${viewport.orientation}`}">
    {@render site()}
    {@render list()}
    {@render buy()}
  </div>
{/if}

<style>
  .build { display: grid; gap: 8px; height: 100%; min-height: 0; }
  .build.wide { grid-template-columns: 300px minmax(0, 1fr) minmax(340px, 32%); }
  .build.mid.landscape { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .build.mid.landscape > :global(.site) { grid-column: 1 / -1; }
  .build.mid.portrait { grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr); }
  .build :global(.center .body), .build :global(.right .body) { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .pick { width: 100%; margin-bottom: 6px; padding: 5px; font: 700 11px var(--mono); color: var(--hud-hi); background: var(--void); border: 1px solid var(--rule); }
  .where { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: center; margin-bottom: 6px; font-size: 11px; }
  .where .sys { font-weight: 800; color: var(--telemetry); font-size: 14px; }
  .where :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .raven {
    padding: 5px 8px 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--hud-hi); text-decoration: none;
    background: color-mix(in srgb, var(--hud) 14%, var(--steel)); box-shadow: inset 0 2px var(--hud);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
  }
  .bigbar { position: relative; height: 22px; background: var(--steel); border: 1px solid var(--rule); }
  .bigbar > div { position: absolute; top: 0; bottom: 0; left: 0; background: var(--ok); }
  .bigbar .hold { background: var(--telemetry); opacity: 0.8; }
  .bigbar .fc { background: var(--hud-hi); opacity: 0.7; }
  .fcc { color: var(--hud-hi); }
  .legend { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 10px; color: var(--muted); margin: 3px 0 6px; }
  .legend i { display: inline-block; width: 8px; height: 8px; margin-right: 3px; }
  .legend .dl { background: var(--ok); }
  .legend .hd { background: var(--telemetry); opacity: 0.8; }
  .legend .cc { background: var(--hud-hi); opacity: 0.7; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .kpis div { padding: 4px 8px; border: 1px solid var(--rule); background: var(--rail); }
  .kpis div, .deadline > div { display: flex; flex-direction: column; }
  .sub { font-size: 10px; }
  .kpis b { font-size: 17px; }
  .kpis small, .deadline small { font-size: 11px; color: var(--dim); font-weight: 400; }
  .hud { color: var(--hud); }
  .hauler { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: 10px; color: var(--dim); margin: 0 0 6px; }
  .hauler input {
    width: 64px; padding: 2px 4px; font: 700 12px var(--mono); color: var(--telemetry); text-align: right;
    background: var(--void); border: 1px solid var(--rule); appearance: textfield; -moz-appearance: textfield;
  }
  .hauler input::-webkit-outer-spin-button, .hauler input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .deadline {
    display: flex; justify-content: space-between; align-items: center; gap: 6px 10px; padding: 6px 8px;
    border: 1px solid var(--rule); background: var(--rail);
  }
  .deadline b { font-size: 17px; color: var(--hud-hi); }
  .deadline .dim { font-size: 10px; }
  .deadline.late { border-color: var(--danger); }
  .deadline.late b { color: var(--danger); }
  .set, .edit button {
    padding: 5px 8px; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer;
    color: var(--muted); background: var(--steel); border: 1px solid var(--rule);
  }
  .set { grid-column: 1 / -1; color: var(--hud-hi); }
  .edit { grid-column: 1 / -1; display: flex; gap: 4px; }
  .edit input { flex: 1; min-width: 0; font: 700 11px var(--mono); color: var(--telemetry); background: var(--void); border: 1px solid var(--rule); padding: 4px; }
  .pay { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; font-size: 11px; }
  .pay b { font-size: 14px; }
  .ok { color: var(--ok); }
  .seen { font-size: 10px; margin-top: 6px; }

  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { position: sticky; top: 0; background: var(--panel); text-align: left; font-size: 10px; color: var(--dim); letter-spacing: 0.08em; padding: 3px 4px; }
  th.r, td.r { text-align: right; }
  td { padding: 5px 4px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
  tr { cursor: pointer; }
  tr:hover td { background: rgb(255 122 24 / 0.06); }
  tr.hl td { background: rgb(55 198 212 / 0.12); }
  tr.done td { opacity: 0.4; }
  tr.full td { background: rgb(92 214 120 / 0.16); }
  tr.full td:first-child { box-shadow: inset 3px 0 rgb(92 214 120); }
  tr.part td { background: rgb(255 214 64 / 0.14); }
  tr.part td:first-child { box-shadow: inset 3px 0 rgb(255 214 64); }
  .cn { font-weight: 700; color: var(--text); white-space: normal; }
  .left { color: var(--hud); font-weight: 800; }
  td.bar, th.bar { width: 22%; }
  .mini { display: block; height: 6px; background: var(--steel); }
  .mini span { display: block; height: 100%; background: var(--ok); }

  /* same filters as TRADE */
  .filters { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
  .group { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  /* two rows: where / pad / planetary, then radius beside FIND */
  .row { display: grid; gap: 6px; align-items: end; }
  /* each group is at least as wide as its buttons and shares the rest (3 : 2 : 3): one fixed line, nothing wraps (a wrapping row
     changes the panel height, a scrollbar then changes the width, and the row flips back and forth) */
  .row.three { grid-template-columns: minmax(max-content, 3fr) minmax(max-content, 2fr) minmax(max-content, 3fr); gap: 6px 10px; }
  .row.three .chips { flex-wrap: nowrap; }
  .row.three button { white-space: nowrap; }
  .row.find { grid-template-columns: minmax(0, 1fr) auto; }
  .row.find .scan { padding: 8px 22px; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chips button, .toggles button {
    flex: 1; padding: 8px 4px; background: var(--steel); border: 1px solid var(--rule);
    color: var(--muted); font-size: 11px; font-weight: 700; cursor: pointer;
  }
  .chips button.on { background: var(--hud); border-color: var(--hud); color: var(--void); }
  .toggles { display: flex; gap: 3px; }
  .toggles button { flex: 1 1 0; white-space: nowrap; }
  .toggles button.on { border-color: var(--telemetry); color: var(--telemetry); box-shadow: inset 0 2px var(--telemetry); }
  .scan {
    padding: 11px; background: var(--hud); color: var(--void); border: 0; cursor: pointer;
    font-weight: 800; letter-spacing: 0.1em; box-shadow: var(--glow); overflow-wrap: anywhere;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }
  .scan:disabled { opacity: 0.6; cursor: progress; }
  .bad { color: var(--danger); font-size: 11px; margin: 0 0 6px; }
  .hlnote { font-size: 11px; color: var(--telemetry); margin: 0 0 6px; }
  .link { background: none; border: 0; padding: 0; color: var(--hud-hi); text-decoration: underline; font: inherit; cursor: pointer; }
  .mk { display: flex; flex-direction: column; gap: 4px; }
  .market { padding: 5px 7px; border: 1px solid var(--rule); background: rgb(36 26 16 / 0.6); cursor: pointer; }
  .market:hover { border-color: var(--hud); }
  .market.on { border-color: var(--hud-hi); box-shadow: inset 3px 0 var(--hud-hi); background: rgb(255 122 24 / 0.08); }
  .mh { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; font-size: 11px; }
  .mh .st { display: inline-flex; gap: 4px; align-items: baseline; font-weight: 700; min-width: 0; }
  .mh :global(.text), .ms :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .ms { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; color: var(--telemetry); margin: 2px 0 4px; }
  .fresh { color: var(--ok); }
  .stale { color: var(--danger); }
  .items { display: flex; flex-wrap: wrap; gap: 3px; }
  .it { padding: 1px 5px; font-size: 10px; border: 1px solid var(--rule); color: var(--muted); }
  .it b { color: var(--text); }
  .it.short { opacity: 0.6; border-style: dashed; }
  .it.hl { border-color: var(--telemetry); color: var(--telemetry); }

  .build.phone { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 6px; }
  .build.phone.landscape { grid-template-columns: 74px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .phone.portrait .pages { grid-row: 2; }
  .phone.portrait .page { grid-row: 1; }
  .pages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .landscape .pages { grid-template-columns: 1fr; grid-auto-rows: 1fr; }
  .pages button {
    min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted);
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule);
  }
  .pages .pi { font-size: 18px; line-height: 1; }
  .pages button.on { background: var(--hud); border-color: var(--hud); color: var(--void); box-shadow: var(--glow); }
  .page { min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; }
  .page > :global(*) { flex: 1; min-height: 0; }
</style>
