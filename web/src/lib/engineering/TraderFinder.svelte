<script lang="ts">
  import type { MaterialCategory, TraderResult } from '@et/shared';
  import Panel from '../Panel.svelte';
  import Name from '../Name.svelte';
  import Loading from '../Loading.svelte';
  import PlotButton from '../trade/PlotButton.svelte';
  import ExpButton from '../explore/ExpButton.svelte';
  import ReferencePicker from '../trade/ReferencePicker.svelte';

  // MATERIAL TRADERS: the nearest station with a trader of one kind (raw, manufactured, encoded), around a system you pick
  // (empty = where you are, and it follows you as you jump). Spansh's station search; the answer is nearest first.
  let { current }: { current: string } = $props();

  const KINDS: { id: MaterialCategory; label: string }[] = [
    { id: 'Raw', label: 'RAW' }, { id: 'Manufactured', label: 'MANUFACTURED' }, { id: 'Encoded', label: 'ENCODED' },
  ];

  let kind = $state<MaterialCategory>(read('et.eng.trader.kind', 'Raw') as MaterialCategory);
  let reference = $state(read('et.eng.trader.ref', ''));
  function read(key: string, dflt: string): string {
    try { return localStorage.getItem(key) ?? dflt; } catch { return dflt; }
  }
  $effect(() => {
    const [k, r] = [kind, reference];
    try { localStorage.setItem('et.eng.trader.kind', k); localStorage.setItem('et.eng.trader.ref', r); } catch {}
  });

  let busy = $state(false);
  let error = $state('');
  let result = $state<TraderResult | null>(null);
  let seq = 0;

  // search whenever the kind or the place changes (the server keeps an answer for a while, so going back is instant)
  $effect(() => {
    const [k, system] = [kind, reference || current];
    if (!system) { result = null; return; }
    const mine = ++seq;
    busy = true;
    error = '';
    fetch('/api/engineering/traders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: k, reference: system }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (mine === seq) result = body;
      })
      .catch((err) => {
        if (mine !== seq) return;
        error = (err as Error).message;
        result = null;
      })
      .finally(() => { if (mine === seq) busy = false; });
  });

  const typeShort = (t: string) => t.replace(/ Starport$/, '').replace(/^Planetary /, 'Pl. ').replace(/Drake-Class /, '');
  const ls = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  const ly = (v: number) => (v < 1 ? '0 ly' : v < 100 ? `${v.toFixed(1)} ly` : `${Math.round(v).toLocaleString('en-US')} ly`);
  const place = $derived(reference || current);
</script>

<Panel title="Material traders" aside={result ? `${result.total.toLocaleString('en-US')} in the galaxy` : 'nearest first'}>
  <div class="finder">
    <div class="kinds" role="group" aria-label="Kind of trader">
      {#each KINDS as k (k.id)}
        <button class:on={kind === k.id} onclick={() => (kind = k.id)}>{k.label}</button>
      {/each}
    </div>
    <ReferencePicker bind:value={reference} {current} stations={false} label="NEAR" />

    {#if error}<p class="err">{error}</p>{/if}

    {#if busy && !result}
      <Loading block label="SEARCHING SPANSH" />
    {:else if !place}
      <p class="dim hint">Pick a system, or wait for the game to say where you are.</p>
    {:else if result}
      <div class="list" class:stale={busy}>
        {#each result.stations as t, i (t.system + t.station)}
          <div class="row" class:first={i === 0}>
            <div class="top">
              <span class="sys"><Name value={t.system} system /></span>
              <span class="away">{ly(t.ly)}</span>
            </div>
            <div class="st">{t.station}</div>
            <div class="foot">
              <span class="tags">
                <em class="t">{typeShort(t.type)}</em>
                {#if t.pad}<em class="t pad" title="largest landing pad">{t.pad} PAD</em>{/if}
                <em class="t dim">{ls(t.ls)} ls</em>
              </span>
              <span class="acts"><ExpButton system={t.system} /><PlotButton system={t.system} /></span>
            </div>
          </div>
        {:else}
          <p class="dim hint">No {kind.toLowerCase()} trader found.</p>
        {/each}
      </div>
    {/if}
  </div>
</Panel>

<style>
  .finder { display: flex; flex-direction: column; gap: 8px; }
  .kinds { display: flex; gap: 3px; }
  .kinds button {
    flex: 1; background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px;
    letter-spacing: 0.08em; padding: 6px 4px; cursor: pointer;
  }
  .kinds button.on { color: #1a0f05; background: var(--hud); border-color: var(--hud); }
  .err { color: var(--danger); font-size: 12px; margin: 0; }
  .hint { font-size: 12px; margin: 0; }
  .dim { color: var(--dim); }
  .list { display: flex; flex-direction: column; gap: 6px; transition: opacity 0.15s; }
  .list.stale { opacity: 0.5; }
  .row {
    display: flex; flex-direction: column; gap: 3px; padding: 7px 8px; background: var(--rail); border: 1px solid var(--rule);
    border-left: 2px solid var(--rule);
  }
  .row.first { border-left-color: var(--hud); }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .sys { font-weight: 800; letter-spacing: 0.05em; min-width: 0; overflow-wrap: anywhere; }
  .away { flex: none; color: var(--hud-hi); font-size: 12px; font-variant-numeric: tabular-nums; }
  .st { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .tags { display: flex; flex-wrap: wrap; gap: 3px; }
  .t { font-style: normal; font-size: var(--fs-2xs); font-weight: 800; letter-spacing: 0.05em; padding: 0 4px; line-height: 15px; border: 1px solid var(--rule); color: var(--muted); }
  .t.pad { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .t.dim { color: var(--dim); }
  .acts { display: flex; gap: 6px; align-items: center; flex: none; }
  :global(html[data-device='tablet']) .kinds button, :global(html[data-device='phone']) .kinds button { min-height: 40px; }
  :global(html[data-device='phone']) .acts :global(button) { min-height: 40px; }
</style>
