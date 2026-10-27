<script lang="ts">
  import Panel from './Panel.svelte';

  // A screen that is not ready yet: what it will show, in the panel's own frame.
  let { title, plans }: { title: string; plans: string[] } = $props();
</script>

<Panel class="soonp" {title} aside="coming soon">
  <div class="soon">
    <div class="ring" aria-hidden="true"><span></span></div>
    <div class="head">COMING SOON</div>
    <div class="sub">{title} · IN DEVELOPMENT</div>
    <ul>
      {#each plans as p (p)}<li>{p}</li>{/each}
    </ul>
  </div>
</Panel>

<style>
  :global(.panel.soonp) { height: 100%; }
  :global(.panel.soonp > .body) { flex: 1; display: flex; }
  .soon {
    flex: 1; min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; text-align: center;
  }
  .ring {
    width: 72px; height: 72px; border: 1px solid var(--rule); border-radius: 50%; position: relative;
    box-shadow: inset 0 0 18px rgb(255 122 24 / 0.12);
  }
  .ring span {
    position: absolute; inset: 6px; border-radius: 50%; border: 2px solid transparent;
    border-top-color: var(--hud); border-right-color: var(--hud); filter: drop-shadow(0 0 4px var(--hud));
    animation: spin 2.4s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .ring span { animation: none; } }
  .head { color: var(--hud); font-size: 26px; font-weight: 800; letter-spacing: 0.3em; text-shadow: var(--glow); }
  .sub { color: var(--telemetry); font-size: 11px; font-weight: 700; letter-spacing: 0.2em; }
  ul {
    margin: 6px 0 0; padding: 8px 14px; list-style: none; display: flex; flex-direction: column; gap: 4px;
    border-top: 1px solid var(--rule); color: var(--muted); font-size: 12px; text-align: left;
  }
  li::before { content: '▸ '; color: var(--hud); }
</style>
