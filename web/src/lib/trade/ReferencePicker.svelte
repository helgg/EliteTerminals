<script lang="ts">
  // FROM (or TO): a system, and optionally one of its stations. Empty = the current system (none for TO);
  // typing searches system names (Spansh autocomplete + the server's price database) and a pick sets it.
  // The station list under it holds the stations of that system with a market; ANY STATION = the whole system.
  import type { StationOption, SystemMatch } from '@et/shared';
  import PlaceIcon from '../PlaceIcon.svelte';
  import { cr } from '../format.ts';

  // `stations` off: just the system (the COLONY finder searches around systems, not stations)
  let { value = $bindable(''), station = $bindable(0), current, label = 'FROM', stations: withStations = true }: {
    value?: string; station?: number; current: string; label?: string; stations?: boolean;
  } = $props();

  const system = $derived(value || current);
  let stations = $state<StationOption[]>([]);
  let loading = $state(false);
  $effect(() => {
    const name = system;
    stations = [];
    if (!name || !withStations) return;
    loading = true;
    let live = true;
    fetch(`/api/trade/stations?system=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: StationOption[]) => live && (stations = list))
      .catch(() => {})
      .finally(() => live && (loading = false));
    return () => (live = false);
  });
  const typeShort = (t: string) => t.replace(/ Starport$/, '').replace(/^Planetary /, 'Pl. ').replace(/Drake-Class /, '');

  let text = $state('');
  let matches = $state<SystemMatch[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

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
        if (mine === seq) {
          matches = found;
          open = true;
        }
      } catch {
        if (mine === seq) matches = [];
      }
    }, 250);
  }

  function pick(m: SystemMatch) {
    if (m.name !== value) station = 0;
    value = m.name;
    text = '';
    matches = [];
    open = false;
  }

  function reset() {
    if (value) station = 0;
    value = '';
    text = '';
    matches = [];
  }
</script>

<div class="place">
<div class="ref">
  <span class="k">{label}</span>
  <div class="field">
    <input
      bind:value={text}
      oninput={onInput}
      onfocus={() => (open = matches.length > 0)}
      onblur={() => setTimeout(() => (open = false), 150)}
      onkeydown={(e) => e.key === 'Enter' && matches[0] && pick(matches[0])}
      placeholder={(value || current || 'pick a system').toUpperCase()}
      class:remote={!!value}
      spellcheck="false"
      autocomplete="off"
    />
    {#if open && matches.length}
      <ul class="list">
        {#each matches as m (m.name)}
          <li>
            <button onmousedown={(e) => e.preventDefault()} onclick={() => pick(m)}>
              <PlaceIcon kind="system" />
              <span class="name">{m.name.toUpperCase()}</span>
              <span class="dist">{m.distance.toFixed(m.distance < 100 ? 1 : 0)}ly</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if current}
    <button class="here" class:on={!value} disabled={!value} onclick={reset} title="Back to the current system">⌖ HERE</button>
  {:else}
    <button class="here" class:on={!value} disabled={!value} onclick={reset} title="Clear">✕</button>
  {/if}
</div>
{#if system && withStations}
  <select class="station" class:on={!!station} bind:value={station} disabled={loading && !stations.length}
    title="A station of {system.toUpperCase()}: EXPORT / IMPORT and A → B then mean that station">
    <option value={0}>{loading && !stations.length ? 'LOADING STATIONS…' : `ANY STATION · ${stations.length}`}</option>
    {#if station && !stations.some((x) => x.marketId === station)}<option value={station}>PICKED STATION</option>{/if}
    {#each stations as x (x.marketId)}
      <option value={x.marketId}>{x.station} · {typeShort(x.type)} · {cr(Math.round(x.ls))}ls · {x.pad}</option>
    {/each}
  </select>
{/if}
</div>

<style>
  .place { display: flex; flex-direction: column; gap: 3px; }
  .ref { display: flex; align-items: center; gap: 6px; }
  .k { font-size: 10px; letter-spacing: 0.1em; color: var(--dim); min-width: 30px; }
  .station {
    width: 100%; min-width: 0; padding: 5px 6px; font: 700 11px var(--mono); color: var(--muted);
    background: var(--void); border: 1px solid var(--rule); outline: none;
  }
  .station.on { color: var(--hud-hi); border-color: var(--hud); }
  .station:focus { border-color: var(--hud); }
  .field { position: relative; flex: 1; min-width: 0; }
  input {
    width: 100%; box-sizing: border-box; padding: 6px 8px; font: 700 12px var(--mono); letter-spacing: 0.04em;
    color: var(--telemetry); background: var(--void); border: 1px solid var(--rule); outline: none;
  }
  input::placeholder { color: var(--telemetry); opacity: 0.85; }
  input.remote::placeholder { color: var(--hud-hi); opacity: 1; }
  input:focus { border-color: var(--hud); }
  .list {
    position: absolute; z-index: 20; left: 0; right: 0; top: 100%; margin: 2px 0 0; padding: 0; list-style: none;
    background: var(--panel); border: 1px solid var(--hud); max-height: 260px; overflow-y: auto;
  }
  .list button {
    display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 8px; border: 0; background: none;
    font: 12px var(--mono); color: var(--text); text-align: left; cursor: pointer;
  }
  .list button:hover { background: var(--steel); }
  .name { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--telemetry); }
  .dist { color: var(--muted); font-size: 11px; }
  .here {
    flex: none; padding: 6px 8px; font: 700 10px var(--mono); letter-spacing: 0.06em; color: var(--hud);
    background: var(--steel); border: 1px solid var(--rule); cursor: pointer;
  }
  .here.on { color: var(--dim); cursor: default; }
</style>
