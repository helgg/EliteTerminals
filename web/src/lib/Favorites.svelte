<script lang="ts">
  // Favourite destinations: one tap plots the route through the galaxy map (macros.svelte.ts).
  // The game's own bookmarks cannot be read (they live on Frontier's servers), so the list is ours:
  // ★ HERE saves the current system, + finds any system by name, and the SYSTEM panel saves stations.
  import type { EdState, Favorite, SystemMatch } from '@et/shared';
  import PlaceIcon, { placeKind } from './PlaceIcon.svelte';
  import { distanceLy } from './astro.ts';
  import { busy, plotMissing, plotTo, routeEndsAt } from './macros.svelte.ts';
  import { addFavorite, removeFavorite } from './favorites.ts';

  let { s }: { s: EdState } = $props();

  let sort = $state<'new' | 'near'>('new');
  let editing = $state(false);
  let adding = $state(false);
  let text = $state('');
  let matches = $state<SystemMatch[]>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const here = $derived(s.location.system);
  const dist = (f: Favorite) => (f.pos && here ? distanceLy(f.pos, s.location.pos) : null);
  const list = $derived(
    sort === 'near'
      ? [...s.favorites].sort((a, b) => (dist(a) ?? 1e9) - (dist(b) ?? 1e9))
      : s.favorites,
  );
  const missing = $derived(plotMissing());
  const plotting = $derived(busy('Plot') ? s.macros.plot.system : '');
  const saved = $derived(s.favorites.some((f) => !f.station && f.system.toLowerCase() === here.toLowerCase()));
  const LABELS: Record<string, string> = { GalaxyMapOpen: 'GALAXY MAP (Open galaxy map)' };
  const fmt = (ly: number) => (ly < 10 ? ly.toFixed(2) : ly < 1000 ? ly.toFixed(1) : Math.round(ly).toLocaleString('en-US'));

  function onInput() {
    clearTimeout(timer);
    const q = text.trim();
    if (q.length < 2) {
      matches = [];
      return;
    }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const res = await fetch(`/api/systems?q=${encodeURIComponent(q)}`);
        const found = res.ok ? ((await res.json()) as SystemMatch[]) : [];
        if (mine === seq) matches = found;
      } catch {
        if (mine === seq) matches = [];
      }
    }, 250);
  }

  function pick(m: SystemMatch) {
    void addFavorite({ system: m.name, pos: m.pos });
    text = '';
    matches = [];
    adding = false;
  }

  const saveHere = () => addFavorite({ system: here, pos: s.location.pos });
</script>

<div class="favs">
  <div class="tools">
    <button class="chip" disabled={!here || saved} onclick={saveHere} title="save the current system">★ HERE</button>
    <button class="chip" class:on={adding} onclick={() => { adding = !adding; editing = false; }}>+ FIND</button>
    <span class="grow"></span>
    <button class="chip" class:on={sort === 'near'} onclick={() => (sort = sort === 'near' ? 'new' : 'near')}
      title="sort by distance">NEAR</button>
    <button class="chip" class:on={editing} disabled={!s.favorites.length} onclick={() => { editing = !editing; adding = false; }}>EDIT</button>
  </div>

  {#if adding}
    <div class="find">
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={text} oninput={onInput} autofocus placeholder="SYSTEM NAME"
        onkeydown={(e) => e.key === 'Enter' && matches[0] && pick(matches[0])} />
      {#if matches.length}
        <ul class="matches">
          {#each matches as m (m.name)}
            <li><button onclick={() => pick(m)}><span class="mn">{m.name.toUpperCase()}</span>
              <span class="num dim">{fmt(m.distance)}ly</span></button></li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if list.length}
    <ul class="list">
      {#each list as f (f.id)}
        {@const ly = dist(f)}
        {@const routed = routeEndsAt(f.system)}
        {@const busy = plotting && plotting === f.system}
        <li class:routed class:busy>
          <span class="ic">{#if f.station}<PlaceIcon kind={placeKind(f.stationType)} />{:else}<span class="star">★</span>{/if}</span>
          <span class="what">
            <span class="sys">{f.system.toUpperCase()}</span>
            {#if f.station}<span class="st dim">{f.station}</span>{/if}
          </span>
          <span class="ly num">{#if f.system.toLowerCase() === here.toLowerCase()}<span class="tele">HERE</span>{:else if ly !== null}{fmt(ly)}<small>ly</small>{/if}</span>
          {#if editing}
            <button class="btn del" onclick={() => removeFavorite(f.id)} title="remove">✕ DEL</button>
          {:else}
            {@const state = busy ? 'busy' : routed ? 'routed' : missing.length || f.system.toLowerCase() === here.toLowerCase() || plotting ? 'off' : 'ready'}
            <button class="btn plot {state}" disabled={state === 'off' || state === 'routed'}
              onclick={() => plotTo(f.system)} title={busy ? 'tap to stop' : `plot a route to ${f.system}`}>
              <span class="glyph" aria-hidden="true">{busy ? '■' : routed ? '✓' : '›'}</span>{busy ? 'STOP' : routed ? 'ROUTED' : 'PLOT'}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if !adding}
    <p class="empty dim">No favourites yet. <b>★ HERE</b> saves this system, <b>+ FIND</b> any other; stations from the
      SYSTEM panel. The game's own bookmarks stay in the game: they are not saved on this PC.</p>
  {/if}

  {#if missing.length}
    <p class="note warn">To plot routes from here, give {missing.map((k) => LABELS[k] ?? k).join(', ')} a keyboard key in the
      game's controls.</p>
  {:else if plotting}
    <p class="note tele">{s.macros.plot.stage === 'map' ? 'Opening the galaxy map…' : s.macros.plot.stage === 'search' ? `Searching ${plotting.toUpperCase()}…` : 'Plotting…'}</p>
  {:else if s.macros.plot.error}
    <p class="note warn">{s.macros.plot.system.toUpperCase()}: {s.macros.plot.error}</p>
  {/if}
</div>

<style>
  .favs { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
  .tools { display: flex; gap: 4px; align-items: center; }
  .grow { flex: 1; }
  .chip {
    font: inherit; font-size: 10px; letter-spacing: 0.08em; padding: 3px 7px; cursor: pointer;
    background: transparent; color: var(--hud); border: 1px solid var(--rule);
  }
  .chip.on { background: var(--hud); color: var(--void); border-color: var(--hud); }
  .chip:disabled { opacity: 0.35; cursor: default; }
  .find { position: relative; }
  .find input {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; padding: 5px 7px; text-transform: uppercase;
    background: var(--void); color: var(--text); border: 1px solid var(--hud);
  }
  .matches { list-style: none; margin: 2px 0 0; padding: 0; border: 1px solid var(--rule); max-height: 180px; overflow: auto; }
  .matches button {
    width: 100%; display: flex; justify-content: space-between; gap: 6px; font: inherit; font-size: 11px; padding: 5px 7px;
    background: var(--panel); color: var(--text); border: 0; border-bottom: 1px solid var(--rule); cursor: pointer; text-align: left;
  }
  .mn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list { list-style: none; margin: 0; padding: 0; overflow: auto; min-height: 0; flex: 1; }
  .list li {
    display: grid; grid-template-columns: 16px 1fr auto auto; align-items: center; gap: 6px;
    padding: 4px 0; border-bottom: 1px solid var(--rule); font-size: 12px;
  }
  .list li.routed .sys { color: var(--ok); }
  .ic { display: inline-flex; justify-content: center; color: var(--hud-hi); }
  .star { font-size: 12px; }
  .what { display: flex; flex-direction: column; min-width: 0; }
  /* long names wrap: never cut with "…" */
  .sys, .st { overflow-wrap: anywhere; line-height: 1.25; }
  .sys { letter-spacing: 0.03em; }
  .st { font-size: 10px; }
  .ly { font-size: 11px; white-space: nowrap; }
  .ly small { color: var(--dim); margin-left: 1px; }
  /* HUD buttons: no outline (a chamfer cuts it), a tinted face with a lit top edge in the state's colour */
  .btn {
    --tone: var(--telemetry);
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 74px; padding: 7px 10px 6px;
    font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; border: 0;
    color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, var(--steel));
    box-shadow: inset 0 2px var(--tone);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);
  }
  .btn:hover:not(:disabled) { background: color-mix(in srgb, var(--tone) 24%, var(--steel)); }
  .btn:active:not(:disabled) { filter: brightness(1.3); transform: translateY(1px); }
  .glyph { font-size: 11px; line-height: 1; }
  .plot.busy { color: var(--void); background: var(--tone); box-shadow: none; animation: pulse 1s ease-in-out infinite; }
  .plot.routed { --tone: var(--ok); cursor: default; }
  .plot.off { --tone: var(--faint); color: var(--dim); background: var(--steel); cursor: default; }
  .del { --tone: var(--danger); min-width: 0; }
  .empty, .note { margin: 0; font-size: 11px; line-height: 1.4; }
  .warn { color: var(--hud-hi); }
  @keyframes pulse { 50% { opacity: 0.6; } }
</style>
