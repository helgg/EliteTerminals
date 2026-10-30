<script lang="ts" generics="T extends string">
  import type { Snippet } from 'svelte';
  import { viewport } from './viewport.svelte.ts';

  // A phone shows one page at a time: the page buttons stand at the bottom (portrait) or down the left (landscape),
  // the same bar TRADE and COMBAT use. Anywhere else the children are simply rendered without it (see `on`).
  let { pages, page = $bindable(), children }: {
    pages: { id: T; label: string; icon: string }[];
    page: T;
    children: Snippet;
  } = $props();
</script>

<div class="pp {viewport.orientation}">
  <nav class="pages" aria-label="Pages" style:--n={pages.length}>
    {#each pages as p (p.id)}
      <button class:on={page === p.id} onclick={() => (page = p.id)}><span class="pi">{p.icon}</span>{p.label}</button>
    {/each}
  </nav>
  <div class="page">{@render children()}</div>
</div>

<style>
  .pp { display: grid; gap: 6px; height: 100%; min-height: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .pp.landscape { grid-template-columns: 74px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .pp.portrait .pages { grid-row: 2; }
  .pp.portrait .page { grid-row: 1; }
  .pages { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 4px; }
  .landscape .pages { grid-template-columns: 1fr; grid-auto-rows: 1fr; }
  .pages button {
    min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: var(--muted);
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule); cursor: pointer;
  }
  .pi { font-size: 18px; line-height: 1; }
  .pages button.on { background: var(--hud); border-color: var(--hud); color: var(--void); box-shadow: var(--glow); }
  .page { min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
</style>
