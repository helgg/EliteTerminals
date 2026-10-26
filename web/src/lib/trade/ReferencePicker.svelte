<script lang="ts">
  // FROM: the system the trade scan runs around. Empty = the current system; typing searches
  // system names (Spansh autocomplete + the server's price database) and a pick sets the reference.
  import type { SystemMatch } from '@et/shared';
  import PlaceIcon from '../PlaceIcon.svelte';

  let { value = $bindable(''), current }: { value?: string; current: string } = $props();

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
    value = m.name;
    text = '';
    matches = [];
    open = false;
  }

  function reset() {
    value = '';
    text = '';
    matches = [];
  }
</script>

<div class="ref">
  <span class="k">FROM</span>
  <div class="field">
    <input
      bind:value={text}
      oninput={onInput}
      onfocus={() => (open = matches.length > 0)}
      onblur={() => setTimeout(() => (open = false), 150)}
      onkeydown={(e) => e.key === 'Enter' && matches[0] && pick(matches[0])}
      placeholder={(value || current || 'system').toUpperCase()}
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
  <button class="here" class:on={!value} disabled={!value} onclick={reset} title="Back to the current system">⌖ HERE</button>
</div>

<style>
  .ref { display: flex; align-items: center; gap: 6px; }
  .k { font-size: 10px; letter-spacing: 0.1em; color: var(--dim); }
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
