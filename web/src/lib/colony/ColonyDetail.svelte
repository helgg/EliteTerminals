<script lang="ts">
  import type { ColonyBody, ColonyClaimStation, ColonySystem } from '@et/shared';
  import Name from '../Name.svelte';
  import FavStar from '../FavStar.svelte';
  import PlotButton from '../trade/PlotButton.svelte';
  import PlaceIcon, { placeKind } from '../PlaceIcon.svelte';
  import { ageLabel, cr } from '../format.ts';

  // The picked system: where to buy its claim, where its score comes from, then its bodies in system-map order.
  // `reach`: how far from the system the claim may be bought (the search's MAX LY TO POPULATED).
  // `onhide`: the game refused the system, or it shows as claimed: it leaves the finder for good (undo in SEARCH).
  let { sys, reach = 15, onhide }: {
    sys: ColonySystem | null; reach?: number; onhide?: (reason: 'not allowed' | 'claimed') => void;
  } = $props();
  /** Days since Spansh last heard of the system: a claim made since is not in its data. */
  const seenDays = $derived(sys?.seenAt ? (Date.now() - Date.parse(sys.seenAt)) / 864e5 : Infinity);

  let claims = $state<ColonyClaimStation[] | null>(null);
  let claimError = $state('');
  $effect(() => {
    const name = sys?.name;
    claims = null;
    claimError = '';
    if (!name) return;
    let live = true;
    fetch(`/api/colony/claim?system=${encodeURIComponent(name)}&ly=${reach}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? r.statusText))))
      .then((list: ColonyClaimStation[]) => live && (claims = list))
      .catch((e: Error) => live && (claimError = e.message));
    return () => (live = false);
  });

  /** "Col 285 Sector VX-W b16-6 A 1 a" → "A 1 a"; the star named like the system → "★". */
  const short = (b: ColonyBody) => {
    if (!sys) return b.name;
    const rest = b.name.startsWith(sys.name) ? b.name.slice(sys.name.length).trim() : b.name;
    return rest || (b.type === 'Star' ? 'MAIN' : b.name);
  };
  const kind = (b: ColonyBody) =>
    b.type === 'Star' ? 'star' : /gas giant/i.test(b.subType) ? 'giant' : /earth-like|water world|ammonia/i.test(b.subType) ? 'life' : 'rock';
  const GLYPH = { star: '✷', giant: '◍', life: '◉', rock: '●' };
  const subShort = (s: string) => s.replace(/ Star$/, '').replace(/ body$/, '').replace(/^Class ([IV]+) gas giant$/, 'GG $1')
    .replace(/Sudarsky class ([IV]+) gas giant/i, 'GG $1').replace(/Gas giant with (water|ammonia)-based life/i, 'GG $1 life');
  const hot = (b: ColonyBody) => b.rings.reduce((t, r) => t + r.hotspots.reduce((u, h) => u + h.count, 0), 0);
</script>

{#if sys}
  {@const c = sys.counts}
  <div class="detail">
    <div class="head">
      <div class="title">
        <span class="sys"><Name value={sys.name} system /></span><FavStar system={sys.name} />
      </div>
      <div class="acts">
        <PlotButton system={sys.name} />
        <a class="raven" href="https://ravencolonial.com/#sys={encodeURIComponent(sys.name)}" target="_blank" rel="noopener"
          title="Plan this system in RavenColonial">PLAN ↗</a>
      </div>
    </div>
    <div class="facts">
      <span><b class="num">{sys.distance.toFixed(0)}</b>ly away</span>
      <span><b class="num">{sys.nearestPopulated.toFixed(1)}</b>ly to populated</span>
      <span class:warn={sys.bodiesKnown < sys.bodyCount}><b class="num">{sys.bodiesKnown}/{sys.bodyCount}</b> bodies known</span>
      <span class:ok={sys.scoopable}>{sys.mainStar.replace(/ Star$/, '') || '?'}{sys.scoopable ? ' · scoopable' : ''}</span>
      <span class:warn={seenDays > 30} title="When Spansh last heard of this system: a claim made since then is not in its data">
        data <b class="num">{Number.isFinite(seenDays) ? ageLabel(seenDays * 24) : '?'}</b> old{seenDays > 30 ? ' · check the galaxy map' : ''}</span>
    </div>
    {#if c.human}
      <div class="humanwarn">HUMAN SIGNAL on {sys.bodies.filter((b) => b.human).length} {sys.bodies.filter((b) => b.human).length === 1 ? 'body' : 'bodies'}:
        could be someone's construction. Check the galaxy map before flying.</div>
    {/if}
    {#if onhide}
      <div class="mark">
        <span class="dim">refused in game?</span>
        <button onclick={() => onhide('not allowed')} title="The game says colonising it is not allowed: hide it">✕ NOT ALLOWED</button>
        <button onclick={() => onhide('claimed')} title="The galaxy map shows it as claimed: hide it">✕ CLAIMED</button>
      </div>
    {/if}
    <div class="claim">
      <div class="ck">CLAIM AT <span class="dim">· System Colonisation contact within {reach}ly</span></div>
      {#if claimError}
        <div class="bad">{claimError}</div>
      {:else if !claims}
        <div class="dim">looking for stations…</div>
      {:else if !claims.length}
        <div class="bad">no station with the contact within {reach}ly</div>
      {:else}
        {#each claims.slice(0, 3) as c (c.system + c.station)}
          <div class="cl">
            <span class="cly num">{c.ly.toFixed(1)}ly</span>
            <span class="cw">
              <span class="cst"><PlaceIcon kind={placeKind(c.type)} /><Name value={c.station} /></span>
              <span class="dim"><Name value={c.system} system /> · {c.type.replace(/ Starport$/, '')} · {cr(c.ls)}ls · <b class="pad">{c.pad}</b></span>
            </span>
            <PlotButton system={c.system} />
          </div>
        {/each}
      {/if}
    </div>
    <div class="score">
      <span class="big num">{sys.score}</span>
      <div class="parts">
        {#each sys.parts as p (p.label)}<span class="part"><b class="num">+{p.points}</b> {p.label}</span>{/each}
      </div>
    </div>
    <div class="counts">
      <span><b>{c.landable}</b> LAND{#if c.atmospheric}<i> · {c.atmospheric} ATM</i>{/if}</span>
      <span><b>{c.rings}</b> RINGS{#if c.pristineRings}<i> · {c.pristineRings} PRISTINE</i>{/if}</span>
      <span><b>{c.hotspots}</b> HOTSPOTS</span>
      <span><b>{c.belts}</b> BELTS</span>
      <span><b>{c.gasGiants}</b> GAS GIANTS</span>
      <span><b>{c.elw + c.ww + c.aw}</b> ELW/WW/AW · <b>{c.terraformable}</b> TERRA</span>
      <span><b>{c.bio}</b> BIO · <b>{c.geo}</b> GEO</span>
      <span><b>{cr(c.maxLs)}</b>ls FARTHEST</span>
    </div>
    <ul class="bodies">
      {#each sys.bodies as b (b.bodyId)}
        <li style:padding-left="{b.depth * 12}px">
          <span class="g {kind(b)}">{GLYPH[kind(b)]}</span>
          <span class="bn">{short(b)}</span>
          <span class="st dim">{subShort(b.subType)}</span>
          <span class="tags">
            {#if b.landable}<span class="t land">LAND</span>{/if}
            {#if b.landable && b.atmosphere}<span class="t atm" title={b.atmosphere}>ATM</span>{/if}
            {#if b.terraformable}<span class="t terra">TERRA</span>{/if}
            {#each b.rings as r (r.name)}<span class="t ring" class:metal={/metal/i.test(r.type)} title={r.name}>{r.type.toUpperCase()} RING</span>{/each}
            {#if b.rings.length && b.reserve === 'Pristine'}<span class="t pristine">PRISTINE</span>{/if}
            {#if hot(b)}<span class="t hot" title={b.rings.flatMap((r) => r.hotspots.map((h) => `${h.name} ×${h.count}`)).join(', ')}>◆{hot(b)} HOT</span>{/if}
            {#if b.belts}<span class="t belt">{b.belts} BELT{b.belts > 1 ? 'S' : ''}</span>{/if}
            {#if b.bio}<span class="t bio">BIO {b.bio}</span>{/if}
            {#if b.geo}<span class="t geo">GEO {b.geo}</span>{/if}
            {#if b.human}<span class="t human" title="Human signals: a settlement, wreck or someone's construction">HUMAN {b.human}</span>{/if}
          </span>
          <span class="ls num dim">{b.ls ? `${cr(b.ls)}ls` : ''}</span>
        </li>
      {/each}
    </ul>
  </div>
{:else}
  <p class="dim">Pick a system in the list.</p>
{/if}

<style>
  .detail { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .head { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .title { display: flex; gap: 6px; align-items: baseline; min-width: 0; font-size: 15px; font-weight: 800; color: var(--telemetry); }
  .title :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .acts { display: flex; gap: 6px; align-items: center; }
  .raven {
    padding: 5px 8px 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; color: var(--hud-hi); text-decoration: none;
    background: color-mix(in srgb, var(--hud) 14%, var(--steel)); box-shadow: inset 0 2px var(--hud);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
  }
  .facts { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 11px; color: var(--muted); }
  .facts b { color: var(--text); margin-right: 2px; }
  .facts .warn b { color: var(--hud-hi); }
  .facts .ok { color: var(--ok); }
  .humanwarn { padding: 4px 8px; font-size: 10px; color: var(--danger); border: 1px solid var(--danger); background: rgb(209 72 58 / 0.08); }
  .mark { display: flex; gap: 6px; align-items: center; justify-content: flex-end; font-size: 10px; }
  .mark button {
    padding: 4px 8px; font: inherit; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer;
    color: var(--danger); background: var(--steel); border: 1px solid var(--rule);
  }
  .mark button:hover { border-color: var(--danger); }
  .claim { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; border: 1px solid var(--telemetry); background: rgb(55 198 212 / 0.06); }
  .ck { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; color: var(--telemetry); }
  .ck .dim { font-weight: 400; letter-spacing: 0.04em; }
  .cl { display: grid; grid-template-columns: 50px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 11px; }
  .cly { color: var(--text); font-weight: 700; text-align: right; }
  .cw { display: flex; flex-direction: column; min-width: 0; }
  .cw :global(.text) { white-space: normal; overflow-wrap: anywhere; }
  .cst { display: inline-flex; gap: 4px; align-items: baseline; font-weight: 700; }
  .cw .dim { font-size: 10px; }
  .pad { color: var(--hud-hi); }
  .bad { font-size: 11px; color: var(--danger); }
  .score { display: flex; gap: 10px; align-items: center; padding: 6px 8px; background: var(--rail); border: 1px solid var(--rule); }
  .big { font-size: 26px; font-weight: 800; color: var(--hud); text-shadow: var(--glow); }
  .parts { display: flex; flex-wrap: wrap; gap: 3px 8px; font-size: 10px; color: var(--muted); }
  .part b { color: var(--ok); }
  .counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 2px 10px; font-size: 10px; color: var(--muted); letter-spacing: 0.06em; }
  .counts b { color: var(--text); font-size: 12px; }
  .counts i { font-style: normal; color: var(--telemetry); }
  .bodies { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; flex: 1; border-top: 1px solid var(--rule); }
  .bodies li {
    display: grid; grid-template-columns: 14px auto auto minmax(0, 1fr) auto; gap: 6px; align-items: baseline;
    padding: 3px 2px; border-bottom: 1px solid var(--rule); font-size: 11px;
  }
  .g { text-align: center; }
  .g.star { color: var(--hud-hi); }
  .g.giant { color: var(--hud); }
  .g.life { color: var(--ok); }
  .g.rock { color: var(--muted); }
  .bn { font-weight: 700; white-space: nowrap; }
  .st { font-size: 10px; white-space: nowrap; }
  .tags { display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
  .t { padding: 0 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; border: 1px solid var(--rule); color: var(--muted); }
  .t.land { color: var(--telemetry); border-color: var(--telemetry); }
  .t.atm { color: var(--ok); border-color: var(--ok); }
  .t.terra { color: var(--ok); }
  .t.ring { color: var(--hud-hi); }
  .t.ring.metal { color: var(--hud); border-color: var(--hud); }
  .t.pristine { color: var(--void); background: var(--hud-hi); border-color: var(--hud-hi); }
  .t.hot { color: var(--macro); border-color: var(--macro); }
  .t.belt { color: var(--hud-hi); }
  .t.bio { color: var(--ok); }
  .t.geo { color: var(--danger); }
  .t.human { color: var(--void); background: var(--danger); border-color: var(--danger); }
  .ls { font-size: 10px; white-space: nowrap; }
  .ok { color: var(--ok); }
</style>
