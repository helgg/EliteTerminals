<script lang="ts">
  import type { Snippet } from 'svelte';

  // `scroll={false}` clips instead of scrolling: for panels whose content is sized to fit.
  let { title, aside, children, class: cls = '', scroll = true }: {
    title: string;
    aside?: string;
    children: Snippet;
    class?: string;
    scroll?: boolean;
  } = $props();
</script>

<section class="panel {cls}">
  <header>
    <span class="bar"></span>
    <span class="label">{title}</span>
    {#if aside}<span class="aside dim">{aside}</span>{/if}
  </header>
  <div class="body" class:clip={!scroll}>{@render children()}</div>
</section>

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--panel);
    border: 1px solid var(--rule);
  }
  /* corner brackets, like the cockpit HUD frames */
  .panel::before,
  .panel::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    border-color: var(--hud);
    border-style: solid;
    pointer-events: none;
  }
  .panel::before { top: -1px; left: -1px; border-width: 1px 0 0 1px; }
  .panel::after { bottom: -1px; right: -1px; border-width: 0 1px 1px 0; }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 5px;
    border-bottom: 1px solid var(--rule);
  }
  .bar {
    width: 3px;
    height: 13px;
    background: var(--hud);
    box-shadow: var(--glow);
  }
  .aside {
    margin-left: auto;
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .body {
    padding: 8px 10px;
    min-height: 0;
    overflow: auto;
  }
  .body.clip { overflow: hidden; }
</style>
