<script lang="ts">
  import type { ExploreFindResult, ExplorePreset, ExploreTarget } from '@et/shared';
  import Name from '../Name.svelte';
  import PlotButton from '../trade/PlotButton.svelte';
  import ReferencePicker from '../trade/ReferencePicker.svelte';
  import { credits, gravityLabel, distanceLabel } from './explore.ts';

  // FIND: places worth the trip, from Spansh's body search: biology with the species other commanders logged, worlds worth
  // scanning, geology. Around a system you pick (empty = where you are).
  let { current, onopen }: { current: string; onopen: (id64: number, system: string) => void } = $props();

  const PRESETS: { id: ExplorePreset; label: string; hint: string; signals?: boolean }[] = [
    { id: 'bio', label: 'EXOBIOLOGY', hint: 'landable bodies with biological signals', signals: true },
    { id: 'value', label: 'MOST VALUABLE', hint: 'bodies that pay most for a first scan' },
    { id: 'elw', label: 'EARTH-LIKE', hint: 'Earth-like worlds' },
    { id: 'ww', label: 'WATER WORLD', hint: 'water worlds' },
    { id: 'aw', label: 'AMMONIA', hint: 'ammonia worlds' },
    { id: 'terra', label: 'TERRAFORMABLE', hint: 'terraformable bodies, richest first' },
    { id: 'geo', label: 'GEOLOGY', hint: 'bodies with geological signals', signals: true },
  ];

  interface Form { preset: ExplorePreset; reference: string; radius: number; minBio: number; landableOnly: boolean }
  let f = $state<Form>(read());
  function read(): Form {
    const d: Form = { preset: 'bio', reference: '', radius: 60, minBio: 3, landableOnly: false };
    try { return { ...d, ...JSON.parse(localStorage.getItem('et.explore.find') ?? '{}') }; } catch { return d; }
  }
  $effect(() => {
    const v = JSON.stringify(f);
    try { localStorage.setItem('et.explore.find', v); } catch {}
  });

  let busy = $state(false);
  let error = $state('');
  let result = $state<ExploreFindResult | null>(null);

  async function run() {
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/explore/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, reference: f.reference || current }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      result = body;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  const spec = $derived(PRESETS.find((p) => p.id === f.preset)!);
  const known = (t: ExploreTarget) => t.species.length > 0;
</script>

<div class="find">
  <div class="presets" role="group" aria-label="What to look for">
    {#each PRESETS as p (p.id)}
      <button class:on={f.preset === p.id} onclick={() => { f.preset = p.id; result = null; }} title={p.hint}>{p.label}</button>
    {/each}
  </div>

  <div class="form">
    <div class="ref"><ReferencePicker bind:value={f.reference} {current} stations={false} label="AROUND" /></div>
    <label>WITHIN <input type="number" min="5" max="1000" step="10" bind:value={f.radius} /> LY</label>
    {#if spec.signals}
      <label>AT LEAST <input type="number" min="1" max="12" bind:value={f.minBio} /> SIGNALS</label>
    {/if}
    {#if f.preset === 'geo'}
      <button class="tog" class:on={f.landableOnly} onclick={() => (f.landableOnly = !f.landableOnly)}>LANDABLE ONLY</button>
    {/if}
    <button class="go" disabled={busy} onclick={run}>{busy ? 'SEARCHING…' : 'SEARCH'}</button>
  </div>

  {#if error}<p class="err">{error}</p>{/if}

  {#if result}
    <div class="count">{result.targets.length} of {result.total.toLocaleString('en-US')} bodies · nearest first{result.query.preset === 'terra' || result.query.preset === 'value' ? ' · richest first' : ''}</div>
    <div class="cards">
      {#each result.targets as t (t.system + t.body)}
        <article class="card">
          <header>
            <div class="sys"><Name value={t.system} system /></div>
            <span class="ly">{t.ly.toFixed(1)} ly</span>
          </header>
          <div class="body">{t.body.startsWith(t.system) ? t.body.slice(t.system.length).trim() || 'A' : t.body} · {t.subType}</div>
          <div class="tags">
            {#if t.landable}<em class="t">LAND {gravityLabel(t.gravity)}</em>{/if}
            {#if t.atmosphere}<em class="t">{t.atmosphere}</em>{/if}
            {#if t.terraformable}<em class="t terra">TERRAFORMABLE</em>{/if}
            {#if t.bio}<em class="t bio">BIO {t.bio}</em>{/if}
            {#if t.geo}<em class="t geo">GEO {t.geo}</em>{/if}
            <em class="t dist">{distanceLabel(t.ls)}</em>
          </div>
          {#if t.genuses.length}<div class="gen">{t.genuses.join(' · ')}</div>{/if}
          {#if known(t)}
            <ul class="sp">
              {#each t.species.slice(0, 4) as sp (sp.name)}
                <li><span>{sp.name}<small>{sp.count} logged</small></span><b>{credits(sp.value)}</b></li>
              {/each}
              {#if t.species.length > 4}<li class="dim">+{t.species.length - 4} more</li>{/if}
            </ul>
          {/if}
          <footer>
            <span class="worth">
              {#if t.bioValue}<span title="one sample of each species others logged here"><i>BIO</i> {credits(t.bioValue)}</span>{/if}
              <span><i>SCAN</i> {credits(t.scanValue)}</span>
              {#if t.mapValue}<span><i>MAP</i> {credits(t.mapValue)}</span>{/if}
            </span>
            <span class="acts">
              <button class="mini" onclick={() => onopen(t.id64, t.system)} title="Open this system on the map">MAP</button>
              <PlotButton system={t.system} />
            </span>
          </footer>
        </article>
      {:else}
        <p class="dim">Nothing matches. Widen the distance or lower the signals.</p>
      {/each}
    </div>
  {:else if !busy}
    <p class="dim hint">{spec.hint}, around {f.reference || current || 'you'} · press SEARCH.</p>
  {/if}
</div>

<style>
  .find { display: flex; flex-direction: column; gap: 10px; }
  .presets { display: flex; flex-wrap: wrap; gap: 4px; }
  .presets button, .tog, .go, .mini {
    background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px; letter-spacing: 0.1em;
    padding: 6px 10px; cursor: pointer;
  }
  .presets button.on, .tog.on { background: var(--hud); border-color: var(--hud); color: #1a0f05; }
  .go { color: var(--hud-hi); border-color: var(--hud); font-weight: 800; }
  .go:disabled { opacity: 0.5; cursor: wait; }
  .mini { padding: 2px 8px; font-size: 10px; }
  .form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 14px; }
  .ref { flex: 1 1 260px; min-width: 220px; max-width: 420px; }
  label { display: flex; align-items: center; gap: 6px; font-size: 10px; letter-spacing: 0.1em; color: var(--dim); }
  input[type='number'] {
    width: 64px; background: var(--steel); border: 1px solid var(--rule); color: var(--text); font: inherit; font-size: 12px; padding: 5px 6px;
  }
  .err { color: var(--danger); font-size: 12px; margin: 0; }
  .count, .hint { font-size: 11px; color: var(--dim); letter-spacing: 0.06em; margin: 0; }
  .dim { color: var(--dim); }

  .cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); align-items: stretch; }
  .card {
    display: flex; flex-direction: column; gap: 5px; padding: 9px 10px; background: var(--rail); border: 1px solid var(--rule);
    border-left: 2px solid var(--hud);
  }
  .card header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .sys { font-weight: 800; letter-spacing: 0.05em; min-width: 0; }
  .ly { color: var(--hud-hi); font-size: 12px; font-variant-numeric: tabular-nums; }
  .body { font-size: 12px; color: var(--muted); }
  .tags { display: flex; flex-wrap: wrap; gap: 3px; }
  .t { font-style: normal; font-size: 9px; font-weight: 800; letter-spacing: 0.05em; padding: 0 4px; line-height: 15px; border: 1px solid var(--rule); color: var(--muted); }
  .t.bio { color: #9af070; border-color: #4a9a2a; }
  .t.geo { color: #ff9a5a; border-color: #b8501a; }
  .t.terra { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .t.dist { color: var(--dim); }
  .gen { font-size: 11px; color: #9af070; letter-spacing: 0.04em; }
  .sp { list-style: none; margin: 0; padding: 0; font-size: 11px; display: flex; flex-direction: column; gap: 1px; }
  .sp li { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); }
  .sp small { margin-left: 6px; font-size: 9px; color: var(--faint); }
  .sp b { color: var(--hud-hi); font-variant-numeric: tabular-nums; }
  footer { margin-top: auto; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-top: 4px; border-top: 1px solid color-mix(in srgb, var(--rule) 70%, transparent); }
  .worth { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: var(--hud-hi); font-variant-numeric: tabular-nums; }
  .worth i { font-style: normal; font-size: 9px; letter-spacing: 0.1em; color: var(--dim); margin-right: 3px; }
  .acts { display: flex; gap: 6px; align-items: center; flex: none; }
</style>
