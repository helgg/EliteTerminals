<script lang="ts">
  import { onMount } from 'svelte';
  import type { Tab } from './tabs.ts';

  // The "?" in the status bar. It pulses softly all the time and strongly until the tutorial of the
  // current screen has been opened once (remembered per screen in this browser, if it can).
  let { tab, onopen }: { tab: Tab; onopen: () => void } = $props();
  const KEY = 'et.help.seen';
  let seen = $state<string[]>([]);
  const fresh = $derived(!seen.includes(tab));

  onMount(() => {
    try {
      seen = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      /* private window: every screen counts as new */
    }
  });

  function click() {
    if (!seen.includes(tab)) {
      seen = [...seen, tab];
      try {
        localStorage.setItem(KEY, JSON.stringify(seen));
      } catch {
        /* not remembered */
      }
    }
    onopen();
  }
</script>

<button class="help" class:fresh onclick={click} title="How to use this screen (? or F1)" aria-label="How to use {tab}">
  <span class="q">?</span> HOW TO USE
</button>

<style>
  .help {
    display: inline-flex; align-items: center; gap: 6px; background: none; border: 1px solid var(--rule);
    color: var(--muted); font: inherit; font-size: 11px; letter-spacing: 0.08em; padding: 0 8px; cursor: pointer;
  }
  .q {
    position: relative; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 15px; height: 15px;
    border-radius: 50%; border: 1px solid var(--hud); color: var(--hud-hi); font-size: 10px; font-weight: 800; line-height: 1;
    padding: 0 0 0 3px;
  }
  /* the ring that grows and fades: a soft one every 6 s, a stronger and quicker one while the screen's tutorial is unread */
  .q::after {
    content: ''; position: absolute; inset: -1px; border-radius: 50%; border: 1px solid var(--hud); opacity: 0;
    animation: ping 6s ease-out infinite;
  }
  .fresh .q { box-shadow: var(--glow); }
  .fresh .q::after { animation: ping-fresh 1.8s ease-out infinite; }
  .fresh { border-color: var(--hud); color: var(--hud-hi); }
  .help:hover { color: var(--hud-hi); border-color: var(--hud); }
  @keyframes ping { 0% { opacity: 0.6; transform: scale(1); } 22%, 100% { opacity: 0; transform: scale(2.4); } }
  @keyframes ping-fresh { 0% { opacity: 0.9; transform: scale(1); } 70%, 100% { opacity: 0; transform: scale(3); } }
  @media (prefers-reduced-motion: reduce) { .q::after { animation: none; } }
</style>
