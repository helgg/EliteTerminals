<script lang="ts">
  import type { EdState, ExploreBody, ExploreSystem } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import PhonePages from '../lib/PhonePages.svelte';
  import { viewport } from '../lib/viewport.svelte.ts';
  import Name from '../lib/Name.svelte';
  import PlotButton from '../lib/trade/PlotButton.svelte';
  import SystemMap from '../lib/explore/SystemMap.svelte';
  import BodyInspector from '../lib/explore/BodyInspector.svelte';
  import ExploreFind from '../lib/explore/ExploreFind.svelte';
  import ReferencePicker from '../lib/trade/ReferencePicker.svelte';
  import { exploreRequest } from '../lib/explore/nav.svelte.ts';
  import { beltOf, credits, distanceLabel, isBelt, orbitTree, ringTone, shortName } from '../lib/explore/explore.ts';

  // EXPLORE: the system as a map of orbits (Spansh for the bodies, your journal for what you have scanned), one body in
  // detail beside it, and FIND for places worth a trip: biology, worlds, geology.
  let { s }: { s: EdState } = $props();

  type View = 'MAP' | 'FIND';
  let view = $state<View>(read('et.explore.view', 'MAP') as View);
  function read(key: string, dflt: string): string {
    try { return localStorage.getItem(key) ?? dflt; } catch { return dflt; }
  }
  // phones: FILTER holds the system pick, the highlight and FIND; SYSTEM the map and the body
  type Page = 'filter' | 'system';
  const PAGES: { id: Page; label: string; icon: string }[] = [
    { id: 'filter', label: 'FILTER', icon: '⚙' }, { id: 'system', label: 'SYSTEM', icon: '◎' },
  ];
  let page = $state<Page>(view === 'FIND' ? 'filter' : 'system');
  const phone = $derived(viewport.device === 'phone');
  function setView(v: View) {
    view = v;
    page = v === 'FIND' ? 'filter' : 'system';
    try { localStorage.setItem('et.explore.view', v); } catch {}
  }

  // which system the map shows: where you are, the one you target, or one opened from FIND
  let opened = $state<{ id64: number; name: string } | null>(null);
  let pin = $state<'HERE' | 'TARGET' | 'OPENED'>('HERE');
  const hereId = $derived(s.location.address);
  const targetId = $derived(s.destination.system);
  // a system typed or pasted in the box (empty = the pinned one)
  let typed = $state('');
  let wasTyped = false;
  $effect(() => {
    if (typed) {
      opened = { id64: 0, name: typed };
      pin = 'OPENED';
      wasTyped = true;
    } else if (wasTyped) {
      // the box was cleared (⌖ HERE): back to where you are
      wasTyped = false;
      pin = 'HERE';
    }
  });
  // what the map loads: an id64, or a name for the server to look up
  const wanted = $derived<{ id64: number; name: string }>(
    pin === 'OPENED' && opened ? opened : pin === 'TARGET' && targetId ? { id64: targetId, name: '' } : { id64: hereId, name: '' },
  );
  const wantedKey = $derived(`${wanted.id64}|${wanted.name}`);
  // another screen's XP button
  $effect(() => {
    if (exploreRequest.seq === exploreRequest.taken) return;
    exploreRequest.taken = exploreRequest.seq;
    typed = '';
    opened = { id64: exploreRequest.id64, name: exploreRequest.system };
    pin = 'OPENED';
    setView('MAP');
  });

  let sys = $state<ExploreSystem | null>(null);
  let loading = $state(false);
  let error = $state('');
  let stamp = 0;
  async function load(want: { id64: number; name: string }, fresh = false) {
    if (!want.id64 && !want.name) { sys = null; return; }
    const mine = ++stamp;
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/explore/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id64: want.id64 || undefined, name: want.id64 ? undefined : want.name, fresh }),
      });
      const body = await res.json();
      if (mine !== stamp) return;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      sys = body;
      if (!isBelt(selected) && !sys?.bodies.some((b) => b.id === selected)) selected = sys?.bodies.find((b) => b.mainStar)?.id ?? sys?.bodies[0]?.id ?? -1;
    } catch (err) {
      if (mine === stamp) { error = (err as Error).message; sys = null; }
    } finally {
      if (mine === stamp) loading = false;
    }
  }
  $effect(() => {
    void wantedKey;
    void load(wanted);
  });

  let selected = $state(-1);
  let focus = $state<'ALL' | 'LAND' | 'BIO' | 'GEO' | 'WORLDS' | 'RINGS'>('ALL');
  const FOCUS = ['ALL', 'LAND', 'BIO', 'GEO', 'WORLDS', 'RINGS'] as const;

  // what the journal says of the system on show (only if it is the one you are in)
  const mineHere = $derived(sys && s.explore.address === sys.id64);
  const own = $derived(new Map((mineHere ? s.explore.bodies : []).map((b) => [b.id, b])));
  const tree = $derived(sys ? orbitTree(sys.bodies, sys.name) : []);
  const bodies = $derived(sys?.bodies ?? []);
  const pick = $derived(isBelt(selected) ? null : (bodies.find((b) => b.id === selected) ?? null));
  const beltPick = $derived.by(() => {
    if (!isBelt(selected)) return null;
    const { star, index } = beltOf(selected);
    const owner = bodies.find((b) => b.id === star);
    const belt = owner?.belts[index];
    return owner && belt ? { owner, belt } : null;
  });
  const held = $derived(new Map(s.engineering.materials.map((m) => [m.name, m])));

  const matches = (b: ExploreBody) => {
    const o = own.get(b.id);
    switch (focus) {
      case 'LAND': return b.landable;
      case 'BIO': return (o?.bio ?? b.bio) > 0;
      case 'GEO': return (o?.geo ?? b.geo) > 0;
      case 'WORLDS': return /earth-like|water world|ammonia world/i.test(b.subType) || b.terraformable;
      case 'RINGS': return b.rings.length > 0;
      default: return true;
    }
  };
  const dim = (b: ExploreBody) => focus !== 'ALL' && !matches(b);

  const stat = $derived.by(() => {
    const planets = bodies.filter((b) => b.type === 'Planet');
    const seen = bodies.filter((b) => own.get(b.id)?.scan).length;
    const todo = bodies.filter((b) => !own.get(b.id)?.scan);
    return {
      bodies: bodies.length,
      total: mineHere && s.explore.bodyCount ? s.explore.bodyCount : sys?.bodyCount ?? bodies.length,
      seen,
      mapped: bodies.filter((b) => own.get(b.id)?.mapped).length,
      landable: planets.filter((b) => b.landable).length,
      bio: bodies.reduce((n, b) => n + (own.get(b.id)?.bio ?? b.bio), 0),
      geo: bodies.reduce((n, b) => n + (own.get(b.id)?.geo ?? b.geo), 0),
      worlds: bodies.filter((b) => /earth-like|water world|ammonia world/i.test(b.subType)).length,
      scanLeft: todo.reduce((n, b) => n + b.scanValue, 0),
      mapLeft: bodies.filter((b) => !own.get(b.id)?.mapped && b.type === 'Planet').reduce((n, b) => n + b.mapValue, 0),
    };
  });
  // the bodies that pay most, with what you have done there
  const richest = $derived(
    [...bodies].filter((b) => b.scanValue + b.mapValue > 0).sort((a, b) => b.scanValue + b.mapValue - (a.scanValue + a.mapValue)).slice(0, 8),
  );
  const shownName = $derived(sys?.name || (pin === 'OPENED' ? opened?.name : '') || s.location.system);

  function open(id64: number, name: string) {
    typed = '';
    opened = { id64, name };
    pin = 'OPENED';
    setView('MAP');
  }
</script>

{#snippet pins()}
  <div class="views" role="group" aria-label="System">
    <button class:on={pin === 'HERE'} onclick={() => { typed = ''; pin = 'HERE'; }}>HERE</button>
    <button class:on={pin === 'TARGET'} disabled={!targetId || targetId === hereId} onclick={() => { typed = ''; pin = 'TARGET'; }} title={s.destination.name || 'no target selected'}>TARGET</button>
    {#if opened}<button class:on={pin === 'OPENED'} onclick={() => (pin = 'OPENED')}>{opened.name.toUpperCase()}</button>{/if}
  </div>
  <div class="pick"><ReferencePicker bind:value={typed} current={s.location.system} stations={false} label="SYSTEM" /></div>
  <button class="mini" disabled={loading || (!wanted.id64 && !wanted.name)} onclick={() => load(wanted, true)} title="Fetch the system again">{loading ? 'LOADING…' : 'REFRESH'}</button>
{/snippet}

{#snippet strip()}
  <div class="strip">
    <div class="who">
      <span class="k">SYSTEM</span>
      <span class="v"><Name value={shownName} system /></span>
      {#if shownName && shownName !== s.location.system}<PlotButton system={shownName} />{/if}
    </div>
    <div class="n"><span class="k">BODIES</span><span class="v">{stat.bodies}{stat.total > stat.bodies ? ` of ${stat.total}` : ''}</span></div>
    {#if mineHere}
      <div class="n"><span class="k">SCANNED</span><span class="v">{stat.seen}<em>/{stat.bodies}</em></span></div>
      <div class="n"><span class="k">MAPPED</span><span class="v">{stat.mapped}</span></div>
    {/if}
    <div class="n"><span class="k">LANDABLE</span><span class="v">{stat.landable}</span></div>
    <div class="n"><span class="k">BIO</span><span class="v bio">{stat.bio}</span></div>
    <div class="n"><span class="k">GEO</span><span class="v geo">{stat.geo}</span></div>
    {#if stat.worlds}<div class="n"><span class="k">WORLDS</span><span class="v">{stat.worlds}</span></div>{/if}
    <div class="n worth"><span class="k">{mineHere ? 'STILL TO SCAN' : 'FIRST SCAN'}</span><span class="v">{credits(stat.scanLeft)} Cr</span></div>
    <div class="n worth"><span class="k">MAPPING</span><span class="v">{credits(stat.mapLeft)} Cr</span></div>
  </div>
{/snippet}

{#snippet focusBar()}
  <div class="focus" role="group" aria-label="Highlight">
    <span class="k">HIGHLIGHT</span>
    {#each FOCUS as f (f)}<button class:on={focus === f} onclick={() => (focus = f)}>{f}</button>{/each}
    <span class="legend"><i class="d"></i>not scanned <i class="c"></i>scanned <b>★</b> first discovery <b class="ok">✓</b> mapped</span>
  </div>
{/snippet}

{#snippet systemBody()}
  {#if error}
    <Panel title="System"><p class="err">{error}</p></Panel>
  {:else if !wanted.id64 && !wanted.name}
    <Panel title="System"><p class="dim">The game has not told where the ship is. Start it, or open a system from FIND.</p></Panel>
  {:else}
    <div class="cols">
      <Panel title="System map" aside={loading ? 'loading…' : sys ? `${bodies.length} bodies · Spansh${mineHere ? ' + your scans' : ''}` : ''}>
        {#if sys}
          <SystemMap {tree} system={sys.name} {own} {selected} onpick={(id) => (selected = id)} {dim} focus={focus} />
          {#if richest.length}
            <section class="sec worthy">
              <header><span>WORTH A STOP</span><i></i><em>first scan + mapping, Spansh's estimate</em></header>
              {#each richest as b (b.id)}
                {@const o = own.get(b.id)}
                <button class="wrow" class:sel={selected === b.id} onclick={() => (selected = b.id)}>
                  <span class="wn">{b.name.startsWith(sys.name) ? b.name.slice(sys.name.length).trim() || 'A' : b.name}</span>
                  <span class="wt">{b.subType}</span>
                  <span class="ws">{o?.mapped ? 'MAPPED' : o?.scan === 'detailed' ? 'SCANNED' : o?.scan === 'auto' ? 'SEEN' : ''}</span>
                  <span class="wv">{credits(b.scanValue)} <em>scan</em></span>
                  <span class="wv">{credits(b.mapValue)} <em>map</em></span>
                </button>
              {/each}
            </section>
          {/if}
        {:else}
          <p class="dim">Loading the system…</p>
        {/if}
      </Panel>
      <Panel title={beltPick ? 'Asteroid belt' : 'Body'} aside={pick ? (own.get(pick.id)?.scan ? 'scanned by you' : '') : ''}>
        {#if beltPick && sys}
          {@const bt = beltPick.belt}
          <div class="belt">
            <header>
              <span class="swatch" style:--rc={ringTone(bt.type)}></span>
              <div><h3>{bt.name.toUpperCase()}</h3><div class="sub">{bt.type} asteroid belt · around {shortName(beltPick.owner.name, sys.name)}</div></div>
            </header>
            <div class="grid">
              <div><i>STARTS AT</i><b>{distanceLabel(bt.innerLs)}</b></div>
              <div><i>ENDS AT</i><b>{distanceLabel(bt.outerLs)}</b></div>
              <div><i>WIDTH</i><b>{distanceLabel(bt.outerLs - bt.innerLs)}</b></div>
              <div><i>TYPE</i><b>{bt.type}</b></div>
            </div>
            <p class="dim">Spansh lists the belt as a whole. Its clusters show up as you scan them in the game.</p>
          </div>
        {:else if pick && sys}
          <BodyInspector
            body={pick}
            system={sys.name}
            own={own.get(pick.id)}
            organics={mineHere ? s.explore.organics.filter((o) => o.body === pick.id) : []}
            {held}
          />
        {:else}
          <p class="dim">Pick a body on the map.</p>
        {/if}
      </Panel>
    </div>
  {/if}
{/snippet}

{#if phone}
  <!-- PHONES: FILTER (which system, what to highlight, FIND) and SYSTEM (the map and the body), from the bar -->
  <PhonePages pages={PAGES} bind:page>
    <div class="ex phone {viewport.orientation}">
      {#if page === 'filter'}
        <Panel title="Map" aside="which system to show">
          <div class="bar">{@render pins()}</div>
        </Panel>
        <Panel title="Find" aside="Spansh body search">
          <ExploreFind current={s.location.system} onopen={open} />
        </Panel>
      {:else}
        {@render strip()}
        {@render focusBar()}
        {@render systemBody()}
      {/if}
    </div>
  </PhonePages>
{:else}
<div class="ex">
  <div class="bar">
    <div class="views" role="group" aria-label="View">
      {#each ['MAP', 'FIND'] as v (v)}
        <button class:on={view === v} onclick={() => setView(v as View)}>{v}</button>
      {/each}
    </div>
    {#if view === 'MAP'}{@render pins()}{/if}
  </div>

  {#if view === 'FIND'}
    <Panel title="Find" aside="Spansh body search · places worth a trip">
      <ExploreFind current={s.location.system} onopen={open} />
    </Panel>
  {:else}
    {@render strip()}
    {@render focusBar()}
    {@render systemBody()}
  {/if}
</div>
{/if}

<style>
  .ex { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
  /* a phone: the page scrolls as a whole (PhonePages), the panels take the height of what they hold */
  .ex.phone { height: auto; min-height: min-content; gap: 8px; }
  .ex.phone :global(.panel) { flex: none; }
  .ex.phone .strip { flex-wrap: nowrap; overflow-x: auto; flex: none; }
  .ex.phone .strip > div { flex: none; padding: 5px 10px; }
  .ex.phone .who { flex: none; max-width: 70%; }
  .ex.phone .v { font-size: 13px; }
  /* the highlight sits above the map it acts on: a row of chips that slides sideways, the legend under it */
  .ex.phone .focus { flex: none; flex-wrap: wrap; gap: 4px; }
  .ex.phone .focus .k { flex: 1 0 100%; margin: 0; }
  .ex.phone .focus button { padding: 8px 10px; }
  .ex.phone .legend { flex: 1 0 100%; font-size: 9px; gap: 4px 8px; }
  .ex.phone .pick { flex: 1 1 100%; min-width: 0; }
  .ex.phone .wt, .ex.phone .ws { display: none; }
  .ex.phone .wrow { gap: 8px; }
  .ex.phone .wv { flex: 1; width: auto; }
  .ex.phone .legend { margin-left: 0; flex-wrap: wrap; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .views { display: flex; gap: 3px; }
  button {
    background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px; letter-spacing: 0.1em;
    padding: 6px 12px; cursor: pointer;
  }
  button.on { background: var(--hud); border-color: var(--hud); color: #1a0f05; }
  button:disabled { opacity: 0.4; cursor: default; }
  .mini { padding: 4px 10px; font-size: 10px; }
  .pick { flex: 0 1 340px; min-width: 240px; }

  .strip {
    display: flex; flex-wrap: wrap; align-items: stretch; gap: 0; border: 1px solid var(--rule); background: var(--panel);
  }
  .strip > div { padding: 6px 14px; border-right: 1px solid var(--rule); display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .strip > div:last-child { border-right: 0; }
  .who { flex: 1 1 260px; flex-direction: row !important; align-items: center; justify-content: flex-start !important; gap: 10px; }
  .k { font-size: 9px; letter-spacing: 0.14em; color: var(--dim); }
  .v { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .v em { font-style: normal; font-weight: 400; color: var(--dim); font-size: 12px; }
  .v.bio { color: #9af070; }
  .v.geo { color: #ff9a5a; }
  .worth .v { color: var(--hud-hi); }

  .focus { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .focus .k { margin-right: 6px; }
  .focus button { padding: 4px 9px; font-size: 10px; }
  .legend { margin-left: auto; font-size: 10px; color: var(--dim); display: flex; align-items: center; gap: 6px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .legend i.d { outline: 1px dashed var(--muted); outline-offset: 1px; }
  .legend i.c { outline: 1px solid var(--telemetry); outline-offset: 1px; }
  .legend b { color: var(--hud-hi); font-weight: 400; }
  .legend b.ok { color: var(--ok); }

  .cols { flex: 1; min-height: 0; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) 380px; align-items: stretch; }
  @media (max-width: 1000px) { .cols { grid-template-columns: minmax(0, 1fr); } }
  .ex.phone .cols { display: flex; flex-direction: column; gap: 8px; flex: none; }
  .ex.phone .cols > :global(.panel:first-child) { min-height: 300px; }
  .cols :global(.panel) { min-height: 0; }
  .belt header { display: flex; align-items: center; gap: 10px; }
  .belt h3 { margin: 0; font-size: 14px; letter-spacing: 0.06em; }
  .belt .sub { color: var(--muted); font-size: 11px; letter-spacing: 0.06em; }
  .belt .swatch { flex: none; width: 34px; height: 14px; border-radius: 50%; border: 3px dotted var(--rc); filter: drop-shadow(0 0 4px var(--rc)); }
  .belt .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; margin: 12px 0 8px; }
  .belt .grid div { display: flex; flex-direction: column; }
  .belt .grid i { font-style: normal; font-size: 9px; letter-spacing: 0.14em; color: var(--dim); }
  .belt .grid b { font-size: 13px; font-variant-numeric: tabular-nums; }
  .worthy { margin: 6px 8px 10px; }
  .wrow {
    display: flex; align-items: center; gap: 12px; width: 100%; padding: 4px 8px; font-size: 12px; letter-spacing: 0; text-align: left;
    background: transparent; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent); color: var(--text);
  }
  .wrow:hover, .wrow.sel { background: color-mix(in srgb, var(--hud) 9%, transparent); }
  .wn { flex: none; width: 70px; font-weight: 800; }
  .wt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .ws { flex: none; width: 70px; font-size: 10px; letter-spacing: 0.1em; color: var(--telemetry); }
  .wv { flex: none; width: 84px; text-align: right; color: var(--hud-hi); font-variant-numeric: tabular-nums; }
  .wv em { font-style: normal; font-size: 9px; letter-spacing: 0.1em; color: var(--dim); }
  .err { color: var(--danger); font-size: 13px; }
  .dim { color: var(--dim); font-size: 12px; }
</style>
