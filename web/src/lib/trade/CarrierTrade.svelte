<script lang="ts">
  import type { CarrierTradeQuery, CarrierTradeRoute, CarrierTradeSide, EdState } from '@et/shared';
  import Panel from '../Panel.svelte';
  import { ageLabel, ageTone, cr, duration, short } from '../format.ts';
  import { ladenJumpRange } from '../jump.ts';
  import { viewport } from '../viewport.svelte.ts';
  import { tradeStore as ts } from './store.svelte.ts';

  // CARRIER TRADE: load the carrier where a commodity is plentiful and cheap, jump, unload where it is wanted and pays much
  // more. A ship (a Clipper, say) shuttles between the carrier and the markets. Everything comes from the local price database.
  let { s, now }: { s: EdState; now: number } = $props();

  interface Params {
    reference: string; sourceRadius: number; maxJumps: number; destRadius: number; minSupply: number; minDemand: number;
    maxAgeH: number; pad: 'S' | 'M' | 'L'; planetary: boolean; carriers: boolean; maxLs: number; commodity: string;
    lot: number; tritiumPrice: number; slipPct: number; maxPriceRatio: number;
  }
  const DEFAULTS: Params = {
    reference: '', sourceRadius: 30, maxJumps: 1, destRadius: 30, minSupply: 10000, minDemand: 10000, maxAgeH: 72, pad: 'L',
    planetary: false, carriers: false, maxLs: 5000, commodity: '', lot: 0, tritiumPrice: 0, slipPct: 10, maxPriceRatio: 3,
  };
  const KEY = 'et.carriertrade.params';
  function read(): Params {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
  }
  let p = $state<Params>(read());
  $effect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  });

  // the ship: from the game while it runs, typed in (shared with the other TRADE tabs) otherwise
  const online = $derived(s.meta.online);
  const gameCargo = $derived(online ? s.ship.cargoCapacity : 0);
  const gameJump = $derived(online ? ladenJumpRange(s) : 0);
  function readShip() {
    try {
      const v = JSON.parse(localStorage.getItem('et.trade.ship') ?? '{}');
      return { cargo: Number(v.cargo) || 0, jump: Number(v.jump) || 0 };
    } catch { return { cargo: 0, jump: 0 }; }
  }
  let ship = $state(readShip());
  $effect(() => {
    try { localStorage.setItem('et.trade.ship', JSON.stringify(ship)); } catch {}
  });

  const c = $derived(s.carrier);
  const hasCarrier = $derived(!!c.system);
  const query = $derived<CarrierTradeQuery>({
    reference: p.reference.trim(), sourceRadius: p.sourceRadius, maxJumps: p.maxJumps, destRadius: p.destRadius,
    minSupply: p.minSupply, minDemand: p.minDemand, maxAgeH: p.maxAgeH, pad: p.pad, planetary: p.planetary, carriers: p.carriers,
    maxLs: p.maxLs, commodity: p.commodity.trim(), lot: p.lot, tritiumPrice: p.tritiumPrice, slip: p.slipPct / 100,
    maxPriceRatio: p.maxPriceRatio,
    cargo: gameCargo || Math.max(0, Math.round(ship.cargo || 0)), jumpRange: gameJump || Math.max(0, ship.jump || 0),
  });

  /** The ship's trips are most of the time: without its hold and jump range the figures would be far too rosy. */
  const missing = $derived(!query.cargo ? 'SET SHIP HOLD' : !query.jumpRange ? 'SET SHIP JUMP' : '');
  let busy = $state(false);
  let error = $state('');
  async function search() {
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/trade/carrier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `the server answered ${res.status}`);
      ts.carrier = body;
      ts.carrierSelected = [...body.routes].sort((a: CarrierTradeRoute, b: CarrierTradeRoute) => b.netPerHour - a.netPerHour)[0]?.key ?? '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  // --- the list ---
  type Sort = 'netPerHour' | 'net' | 'margin' | 'hours' | 'lot';
  const SORTS: [Sort, string, string][] = [
    ['netPerHour', 'CR/H', 'Net per hour of the whole operation'], ['net', 'NET', 'Net of one operation, after tritium and upkeep'],
    ['margin', 'CR/T', 'Selling minus buying price per ton'], ['hours', 'HOURS', 'Time of the whole operation'], ['lot', 'LOT', 'Tons moved'],
  ];
  let sort = $state<Sort>('netPerHour');
  const value = (r: CarrierTradeRoute, k: Sort) => (k === 'margin' ? r.sellAvg - r.buyAvg : r[k]);
  const sorted = $derived(
    [...(ts.carrier?.routes ?? [])].sort((a, b) => (sort === 'hours' ? 1 : -1) * (value(a, sort) - value(b, sort))),
  );
  const route = $derived(ts.carrier?.routes.find((r) => r.key === ts.carrierSelected) ?? null);
  const res = $derived(ts.carrier);

  const wide = $derived(viewport.vp === 'desktop-landscape');
  let open = $state(true);
  $effect(() => {
    if (!wide && res) open = false;
  });
  const tone = (h: number) => ageTone(h);
  const sides = (xs: CarrierTradeSide[]) => xs.length;
</script>

<div class="ct" class:wide>
  <Panel class="params" title="Carrier trade" aside={hasCarrier ? `${c.name || c.callsign} · ${c.system}` : 'no carrier known'} scroll={wide}>
    {#if !wide}
      <button class="fold" onclick={() => (open = !open)}>SEARCH SETTINGS {open ? '▴' : '▾'}</button>
    {/if}
    {#if wide || open}
      <div class="form">
        <label class="wide2"><span class="k">LOADING SYSTEM</span>
          <input type="text" bind:value={p.reference} placeholder={c.system || 'carrier system'} autocomplete="off" spellcheck="false" /></label>
        <label><span class="k">LOAD WITHIN (ly)</span><input type="number" min="0" max="200" inputmode="numeric" bind:value={p.sourceRadius} /></label>
        <label><span class="k">SELL WITHIN (ly)</span><input type="number" min="0" max="200" inputmode="numeric" bind:value={p.destRadius} /></label>
        <div class="wide2"><span class="k">CARRIER JUMPS (500 ly each, at most)</span>
          <div class="chips">{#each [1, 2, 3, 4] as n (n)}<button class:on={p.maxJumps === n} onclick={() => (p.maxJumps = n)}>{n}</button>{/each}</div></div>
        <label><span class="k">MIN STOCK (t)</span><input type="number" min="0" inputmode="numeric" bind:value={p.minSupply} /></label>
        <label><span class="k">MIN DEMAND (t)</span><input type="number" min="0" inputmode="numeric" bind:value={p.minDemand} /></label>
        <label><span class="k">PRICE AGE (h)</span><input type="number" min="0" inputmode="numeric" bind:value={p.maxAgeH} title="0 = any" /></label>
        <label><span class="k">LOT (t, 0 = all)</span><input type="number" min="0" inputmode="numeric" bind:value={p.lot} /></label>
        <div class="wide2"><span class="k">SHIP LANDS ON</span>
          <div class="chips">{#each ['S', 'M', 'L'] as x (x)}<button class:on={p.pad === x} onclick={() => (p.pad = x as 'S' | 'M' | 'L')}>{x}</button>{/each}
            <button class:on={p.planetary} onclick={() => (p.planetary = !p.planetary)}>PLANETARY</button>
            <button class:on={p.carriers} onclick={() => (p.carriers = !p.carriers)}
              title="Other players' carriers: their prices are often made up, so they are off">PLAYER CARRIERS</button></div></div>
        <label><span class="k">SHIP HOLD (t)</span>
          {#if gameCargo}<b class="num">{cr(gameCargo)}</b>{:else}<input type="number" min="0" inputmode="numeric" bind:value={ship.cargo} />{/if}</label>
        <label><span class="k">SHIP JUMP (ly)</span>
          {#if gameJump}<b class="num">{gameJump.toFixed(1)}</b>{:else}<input type="number" min="0" step="0.1" inputmode="decimal" bind:value={ship.jump} />{/if}</label>
        <label class="wide2"><span class="k">COMMODITY (blank = all)</span>
          <input type="text" bind:value={p.commodity} placeholder="Gold, Palladium…" autocomplete="off" spellcheck="false" /></label>
        <label><span class="k">TRITIUM (Cr/t, 0 = auto)</span><input type="number" min="0" inputmode="numeric" bind:value={p.tritiumPrice} /></label>
        <label title="Share of a price that moves when all of a market's stock or demand is used. An assumption, not measured.">
          <span class="k">PRICE SLIP (%)</span><input type="number" min="0" max="50" inputmode="numeric" bind:value={p.slipPct} /></label>
        <label title="A price this many times off the usual for that commodity is left out"><span class="k">OUTLIER (×)</span>
          <input type="number" min="1.5" step="0.5" inputmode="decimal" bind:value={p.maxPriceRatio} /></label>
      </div>
      <button class="go" disabled={busy || !!missing || (!hasCarrier && !p.reference.trim())} onclick={search}>{busy ? 'SEARCHING…' : missing || 'SEARCH'}</button>
      {#if error}<div class="bad">{error}</div>{/if}
    {/if}
    <div class="carrier dim">
      {#if hasCarrier}
        FREE <b>{cr(c.space.free)}</b> t · TANK <b>{cr(c.fuel)}</b> t · UPKEEP <b>{c.upkeep ? short(c.upkeep) + '/wk' : '—'}</b>
      {:else}
        No carrier in the journal yet: pick the loading system.
      {/if}
    </div>
  </Panel>

  <Panel class="list" title="Routes" aside={res ? `${res.routes.length} routes · ${cr(res.markets)} markets` : ''}>
    {#if !res}
      <p class="dim empty">Press SEARCH: the carrier fills up where a commodity is plentiful and cheap, jumps, and unloads where it pays much more.
        Costs (tritium, upkeep, ship trips) are in every figure.</p>
    {:else}
      <div class="sorts">
        {#each SORTS as [k, label, tip] (k)}<button class:on={sort === k} title={tip} onclick={() => (sort = k)}>{label}</button>{/each}
      </div>
      {#if !res.routes.length}<p class="dim empty">Nothing pays after the costs with these settings. Widen the radius or the jumps, or lower the minimums.</p>{/if}
      {#each sorted as r (r.key)}
        <button class="row" class:on={r.key === ts.carrierSelected} onclick={() => (ts.carrierSelected = r.key)}>
          <span class="l1"><b class="name">{r.commodity}</b><span class="tons">{cr(r.lot)} t</span><span class="big">{short(r.netPerHour)}/h</span></span>
          <span class="l2"><span class="tele">{cr(r.buyAvg)}</span> {r.from} → <span class="tele">{cr(r.sellAvg)}</span> {r.to}</span>
          <span class="l3 dim">{Math.round(r.ly)} ly · {r.jumpsTo ? `${r.jumpsTo}+` : ''}{r.jumps} jump{r.jumps + r.jumpsTo > 1 ? 's' : ''} · net {short(r.net)} · {r.hours.toFixed(1)} h
            {#if r.warnings.length}<span class="warn" title={r.warnings.join('\n')}> ⚠ {r.warnings.length}</span>{/if}</span>
        </button>
      {/each}
      {#if res.excluded.carriers || res.excluded.outliers || res.excluded.implausible}
        <p class="dim foot">Left out: {cr(res.excluded.carriers)} player-carrier rows, {cr(res.excluded.outliers)} prices far off the usual,
          {cr(res.excluded.implausible)} with an impossible stock or demand.</p>
      {/if}
    {/if}
  </Panel>

  <Panel class="detail" title="Operation" aside={route ? route.commodity : ''}>
    {#if !route}
      <p class="dim empty">Pick a route.</p>
    {:else}
      {@const r = route}
      <section>
        <header>1 · LOAD at {r.from}</header>
        {#each r.buy as x (x.marketId)}
          <div class="mk"><span>{x.station}<i class="dim"> · {x.system} · {Math.round(x.fromCarrier)} ly · {x.ls ? cr(x.ls) + ' ls' : ''} · pad {x.pad}</i></span>
            <span><b>{cr(x.tons)}</b> t @ <b class="tele">{cr(x.price)}</b> <i class={tone(x.ageH)}>{ageLabel(x.ageH)}</i></span></div>
        {/each}
        <div class="dim">{r.tripsBuy ? `${r.tripsBuy} ship trips` : 'ship hold not given'}</div>
      </section>
      <section>
        <header>2 · CARRIER {r.from} → {r.to}</header>
        <div class="kv"><span>distance</span><b>{Math.round(r.ly)} ly</b></div>
        <div class="kv"><span>jumps</span><b>{r.jumpsTo ? `${r.jumpsTo} to the loading system + ` : ''}{r.jumps} loaded</b></div>
        <div class="kv"><span>tritium burnt</span><b>{Math.round(r.tritium)} t <i class="dim">of {cr(r.tritiumHave)} held</i></b></div>
      </section>
      <section>
        <header>3 · SELL at {r.to}</header>
        {#each r.sell as x (x.marketId)}
          <div class="mk"><span>{x.station}<i class="dim"> · {x.system} · {Math.round(x.fromCarrier)} ly · {x.ls ? cr(x.ls) + ' ls' : ''} · pad {x.pad}</i></span>
            <span><b>{cr(x.tons)}</b> t @ <b class="tele">{cr(x.price)}</b> <i class={tone(x.ageH)}>{ageLabel(x.ageH)}</i></span></div>
        {/each}
        <div class="dim">{r.tripsSell ? `${r.tripsSell} ship trips` : ''}</div>
      </section>
      <section class="money">
        <header>COST OF THE OPERATION</header>
        <div class="kv"><span>revenue</span><b>{cr(r.revenue)}</b></div>
        <div class="kv"><span>− cargo bought ({sides(r.buy)} mk)</span><b>{cr(r.buyCost)}</b></div>
        <div class="kv"><span>− tritium</span><b>{cr(r.tritiumCost)}</b></div>
        <div class="kv"><span>− carrier upkeep</span><b>{cr(r.upkeepCost)}</b></div>
        <div class="kv total"><span>NET</span><b>{cr(r.net)} Cr</b></div>
        <div class="kv dim"><span>at the listed prices (no slip)</span><span>{cr(r.netListed)}</span></div>
        <div class="kv"><span>capital needed</span><b>{cr(r.buyCost)}{#if online && s.commander.credits < r.buyCost}<i class="warn"> over your credits</i>{/if}</b></div>
        <div class="kv"><span>time</span><b>{duration(r.hours * 3600)} · {cr(r.netPerHour)} Cr/h</b></div>
      </section>
      {#if r.warnings.length}
        <ul class="warns">{#each r.warnings as w (w)}<li>{w}</li>{/each}</ul>
      {/if}
      <p class="dim foot">Prices move as you buy and sell: the figures use a {Math.round(query.slip * 100)} % slip when all of a market's stock or demand
        is taken (an assumption). A carrier jump is counted as 20 min. Check the markets in the game before you commit the credits.</p>
    {/if}
  </Panel>
</div>

<style>
  .ct { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; overflow: hidden; }
  .ct.wide { display: grid; grid-template-columns: 272px minmax(0, 1fr) 340px; }
  .ct :global(.panel) { min-height: 0; }
  /* narrower screens: the settings on top, then the list and the operation share what is left, each scrolling on its own */
  .ct:not(.wide) :global(.params) { flex: none; max-height: 55%; }
  .ct:not(.wide) :global(.list), .ct:not(.wide) :global(.detail) { flex: 1 1 0; min-height: 140px; }
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; }
  .form label, .form > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .wide2 { grid-column: 1 / -1; }
  .k { color: var(--dim); font-size: var(--fs-xs); letter-spacing: 0.1em; }
  input[type='text'], input[type='number'] {
    background: var(--void); border: 1px solid var(--rule); color: var(--text); font: inherit; font-size: 12px; padding: 4px 6px; min-width: 0; width: 100%;
  }
  .num { color: var(--hud-hi); font-size: 14px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button, .sorts button, .fold {
    background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px; letter-spacing: 0.08em;
    padding: 4px 8px; cursor: pointer;
  }
  .chips button.on, .sorts button.on { background: var(--hud); border-color: var(--hud); color: var(--void); font-weight: 800; }
  .fold { width: 100%; margin-bottom: 6px; padding: 8px; color: var(--hud-hi); }
  .go {
    margin-top: 8px; width: 100%; padding: 9px; background: var(--hud); border: 1px solid var(--hud-hi); color: var(--void); font: inherit;
    font-weight: 800; letter-spacing: 0.12em; cursor: pointer;
  }
  .go:disabled { opacity: 0.5; cursor: default; }
  .bad { color: var(--danger, #d1483a); font-size: 12px; margin-top: 6px; }
  .carrier { margin-top: 8px; font-size: 11px; }
  .carrier b { color: var(--hud-hi); }
  .empty { padding: 10px; font-size: 12px; line-height: 1.5; }
  .foot { font-size: 11px; line-height: 1.5; margin: 8px 0 0; }
  .sorts { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
  .row {
    display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 6px 8px; margin-bottom: 4px; cursor: pointer;
    background: var(--rail); border: 1px solid var(--rule); color: var(--text); font: inherit; font-size: 12px;
  }
  .row.on { border-color: var(--hud); box-shadow: inset 2px 0 0 var(--hud); }
  .l1 { display: flex; gap: 10px; align-items: baseline; }
  .name { color: var(--hud-hi); letter-spacing: 0.06em; flex: 1; min-width: 0; }
  .tons { color: var(--muted); }
  .big { color: var(--hud); font-weight: 800; font-size: 14px; }
  .tele { color: var(--telemetry); }
  .l3 { font-size: 11px; }
  .warn { color: var(--hud-hi); }
  section { margin-bottom: 10px; display: flex; flex-direction: column; gap: 3px; }
  section header { color: var(--hud); font-size: var(--fs-xs); font-weight: 800; letter-spacing: 0.14em; border-bottom: 1px solid var(--rule); padding-bottom: 2px; margin-bottom: 2px; }
  .mk { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; flex-wrap: wrap; }
  .mk i { font-style: normal; font-size: 11px; }
  .kv { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
  .kv.total { border-top: 1px solid var(--rule); padding-top: 3px; margin-top: 2px; font-size: 14px; }
  .kv.total b { color: var(--ok); }
  .fresh { color: var(--ok); } .ok { color: var(--muted); } .stale { color: var(--hud-hi); }
  .warns { margin: 0 0 8px; padding-left: 16px; color: var(--hud-hi); font-size: 12px; }
  :global(html[data-device='tablet']) .chips button, :global(html[data-device='tablet']) .sorts button, :global(html[data-device='tablet']) .go, :global(html[data-device='tablet']) .fold,
  :global(html[data-device='phone']) .chips button, :global(html[data-device='phone']) .sorts button, :global(html[data-device='phone']) .go, :global(html[data-device='phone']) .fold { min-height: 44px; }
  :global(html[data-device='tablet']) input[type='text'], :global(html[data-device='tablet']) input[type='number'],
  :global(html[data-device='phone']) input[type='text'], :global(html[data-device='phone']) input[type='number'] { min-height: 36px; font-size: 13px; }
  :global(html[data-device='tablet']) .row, :global(html[data-device='phone']) .row { min-height: 44px; padding-block: 8px; }
</style>
