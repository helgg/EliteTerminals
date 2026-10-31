<script lang="ts">
  import type { Snippet } from 'svelte';

  // A HUD card over a dimmed screen: closes on the backdrop, on Escape and on the ✕.
  let { open = $bindable(false), title, width = 420, children }: { open: boolean; title: string; width?: number; children: Snippet } = $props();
  const close = () => (open = false);
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div class="backdrop" role="presentation" onclick={close}>
    <div class="card" style:width="min({width}px, 100%)" role="dialog" aria-modal="true" aria-label={title} tabindex="-1"
      onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <header>
        <span class="bar"></span>
        <span class="title">{title}</span>
        <button class="x" onclick={close} aria-label="Close">✕</button>
      </header>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
    background: rgb(5 3 2 / 0.82); backdrop-filter: blur(3px);
  }
  .card {
    max-height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 0 18px 16px;
    background: var(--panel); border: 1px solid var(--hud); box-shadow: var(--glow), 0 0 60px rgb(255 122 24 / 0.15);
    clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  }
  header { display: flex; align-items: center; gap: 8px; margin: 0 -18px 4px; padding: 8px 10px 8px 18px; border-bottom: 1px solid var(--rule); }
  .bar { width: 3px; height: 13px; background: var(--hud); box-shadow: var(--glow); }
  .title { color: var(--hud-hi); font-weight: 700; letter-spacing: 0.12em; font-size: 12px; }
  .x { margin-left: auto; width: 36px; height: 32px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi); font-size: 14px; cursor: pointer; }
</style>
