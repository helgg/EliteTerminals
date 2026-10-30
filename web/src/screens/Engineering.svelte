<script lang="ts">
  import type { EdState, MaterialCategory, MaterialStock } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import PhonePages from '../lib/PhonePages.svelte';
  import { viewport } from '../lib/viewport.svelte.ts';

  // ENGINEERING: the materials the commander holds (from the journal's Materials event and what changes them),
  // by kind and grade with the storage limit of each grade, and the engineers' progress.
  let { s }: { s: EdState } = $props();

  const KINDS: { cat: MaterialCategory; title: string; aside: string }[] = [
    { cat: 'Raw', title: 'Raw', aside: 'mined and scooped' },
    { cat: 'Manufactured', title: 'Manufactured', aside: 'ship salvage and USS' },
    { cat: 'Encoded', title: 'Encoded', aside: 'scans and data' },
  ];
  type Sort = 'grade' | 'name' | 'count';
  const SORTS: Sort[] = ['grade', 'name', 'count'];

  let query = $state(read('et.eng.query', ''));
  let sort = $state<Sort>(read('et.eng.sort', 'grade') as Sort);
  function read(key: string, dflt: string): string {
    try { return localStorage.getItem(key) ?? dflt; } catch { return dflt; }
  }
  function save(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch {}
  }

  const q = $derived(query.trim().toLowerCase());
  const mats = $derived(s.engineering.materials);
  const shown = (cat: MaterialCategory): MaterialStock[] =>
    mats
      .filter((m) => m.category === cat && (!q || m.label.toLowerCase().includes(q)))
      .sort((a, b) =>
        sort === 'name' ? a.label.localeCompare(b.label)
        : sort === 'count' ? b.count - a.count || a.label.localeCompare(b.label)
        : a.grade - b.grade || a.label.localeCompare(b.label),
      );
  const total = (cat: MaterialCategory) => mats.filter((m) => m.category === cat).reduce((n, m) => n + m.count, 0);
  const full = (m: MaterialStock) => m.max > 0 && m.count >= m.max;
  const near = (m: MaterialStock) => m.max > 0 && m.count / m.max >= 0.9;

  const engineers = $derived(
    [...s.engineering.engineers].sort(
      (a, b) => order(a.progress) - order(b.progress) || (b.rank ?? 0) - (a.rank ?? 0) || a.name.localeCompare(b.name),
    ),
  );
  const order = (p: string) => ['Unlocked', 'Invited', 'Known'].indexOf(p) + 1 || 9;
  const unlocked = $derived(s.engineering.engineers.filter((e) => e.progress === 'Unlocked').length);

  // phones: one list at a time, picked from the bar at the bottom
  type Page = 'Raw' | 'Manufactured' | 'Encoded' | 'Engineers';
  const PAGES: { id: Page; label: string; icon: string }[] = [
    { id: 'Raw', label: 'RAW', icon: '◆' }, { id: 'Manufactured', label: 'MANUF', icon: '⚙' },
    { id: 'Encoded', label: 'ENCODED', icon: '▦' }, { id: 'Engineers', label: 'ENGINEERS', icon: '☺' },
  ];
  let page = $state<Page>((read('et.eng.page', 'Raw') as Page));
  $effect(() => save('et.eng.page', page));
  const phone = $derived(viewport.device === 'phone');
</script>

{#snippet materials(k: (typeof KINDS)[number])}
  <Panel title={k.title} aside={`${total(k.cat).toLocaleString('en-US')} held · ${k.aside}`}>
    {#each shown(k.cat) as m (m.name)}
      <div class="mat" class:full={full(m)} class:near={near(m) && !full(m)}>
        <i class="fill" style:width="{m.max ? Math.min(100, (m.count / m.max) * 100) : 0}%"></i>
        <span class="g g{m.grade}">{m.grade ? `G${m.grade}` : '·'}</span>
        <span class="name">{m.label}</span>
        <span class="n">{m.count}<em>{m.max ? `/${m.max}` : ''}</em></span>
      </div>
    {:else}
      <p class="dim empty">{q ? 'No material matches.' : 'None held.'}</p>
    {/each}
  </Panel>
{/snippet}

{#snippet engineersPanel()}
  <Panel title="Engineers" aside={`${unlocked} unlocked of ${engineers.length}`}>
    {#each engineers as e (e.id)}
      <div class="eg" class:locked={e.progress !== 'Unlocked'}>
        <span class="name">{e.name}</span>
        <span class="st {e.progress.toLowerCase()}">{e.progress.toUpperCase()}</span>
        {#if e.rank !== null}
          <span class="pips" aria-label="Grade {e.rank}">
            {#each [1, 2, 3, 4, 5] as g (g)}<b class:on={g <= (e.rank ?? 0)}></b>{/each}
          </span>
          <span class="dim pct">{e.rank >= 5 ? 'MAX' : `${e.rankProgress ?? 0}%`}</span>
        {/if}
      </div>
    {:else}
      <p class="dim empty">The game has not listed the engineers yet.</p>
    {/each}
  </Panel>
{/snippet}

{#snippet tools()}
  <div class="tools">
    <input
      type="search"
      placeholder="FIND A MATERIAL"
      bind:value={query}
      oninput={() => save('et.eng.query', query)}
      spellcheck="false"
    />
    <div class="toggles" role="group" aria-label="Sort">
      {#each SORTS as o (o)}
        <button class:on={sort === o} onclick={() => { sort = o; save('et.eng.sort', o); }}>{o.toUpperCase()}</button>
      {/each}
    </div>
    <span class="dim note">{s.engineering.updatedAt ? 'read from the game' : 'waiting for the game to list the materials'}</span>
  </div>
{/snippet}

{#if phone}
  <PhonePages pages={PAGES} bind:page>
    <div class="eng">
      {#if page !== 'Engineers'}{@render tools()}{/if}
      <div class="one">
        {#if page === 'Engineers'}
          {@render engineersPanel()}
        {:else}
          {@render materials(KINDS.find((k) => k.cat === page)!)}
        {/if}
      </div>
    </div>
  </PhonePages>
{:else}
<div class="eng">
  {@render tools()}

  <div class="cols">
    {#each KINDS as k (k.cat)}
      {@render materials(k)}
    {/each}
    {@render engineersPanel()}
  </div>
</div>
{/if}

<style>
  .eng { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
  .tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .tools input {
    flex: 1 1 200px; max-width: 320px; background: var(--steel); border: 1px solid var(--rule); color: var(--text);
    font: inherit; font-size: 12px; letter-spacing: 0.08em; padding: 6px 8px;
  }
  .tools input:focus { outline: 1px solid var(--hud); }
  .toggles { display: flex; gap: 3px; }
  .toggles button {
    background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px;
    letter-spacing: 0.1em; padding: 6px 10px; cursor: pointer;
  }
  .toggles button.on { color: #1a0f05; background: var(--hud); border-color: var(--hud); }
  .note { font-size: 11px; }

  .cols {
    flex: 1; min-height: 0; display: grid; gap: 10px; align-items: stretch;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  @media (max-width: 1100px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .cols :global(.panel) { min-height: 0; }
  /* a phone shows one list at a time (PhonePages); the panel fills the page and scrolls inside */
  .one { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .one :global(.panel) { flex: 1; min-height: 0; }

  .mat, .eg {
    position: relative; display: flex; align-items: center; gap: 8px; min-height: 24px; padding: 2px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent); font-size: 12px; overflow: hidden;
  }
  .mat .fill {
    position: absolute; left: 0; top: 0; bottom: 0; background: rgb(255 122 24 / 0.13); pointer-events: none;
  }
  .mat.near .fill { background: rgb(255 181 69 / 0.22); }
  .mat.full .fill { background: rgb(209 72 58 / 0.28); }
  .mat > :not(.fill) { position: relative; }
  .g {
    flex: none; width: 24px; text-align: center; font-size: 10px; font-weight: 800; letter-spacing: 0.04em;
    border: 1px solid var(--rule); color: var(--dim);
  }
  .g1 { color: var(--muted); }
  .g2 { color: var(--telemetry); border-color: color-mix(in srgb, var(--telemetry) 45%, transparent); }
  .g3 { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
  .g4 { color: var(--hud-hi); border-color: color-mix(in srgb, var(--hud-hi) 55%, transparent); }
  .g5 { color: var(--macro); border-color: color-mix(in srgb, var(--macro) 55%, transparent); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { flex: none; font-variant-numeric: tabular-nums; font-weight: 700; }
  .n em { font-style: normal; font-weight: 400; color: var(--dim); }
  .mat.full .n { color: var(--danger); }
  .mat.near .n { color: var(--hud-hi); }
  .empty { padding: 8px 6px; font-size: 12px; }

  .eg.locked .name { color: var(--muted); }
  .st { flex: none; font-size: 10px; letter-spacing: 0.1em; color: var(--dim); }
  .st.unlocked { color: var(--ok); }
  .st.invited { color: var(--hud-hi); }
  .pips { flex: none; display: flex; gap: 2px; }
  .pips b { width: 8px; height: 10px; border: 1px solid var(--rule); background: var(--steel); }
  .pips b.on { background: var(--hud); border-color: var(--hud); }
  .pct { flex: none; width: 34px; text-align: right; font-size: 11px; }
</style>
