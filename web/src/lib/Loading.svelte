<script lang="ts">
  // A waiting sign: a ring that turns beside a label. `block` centres it in the space it is given (a panel that has nothing to
  // show yet); `cover` lays it over what is already there, dimmed (a refresh).
  let { label = 'LOADING', block = false, cover = false }: { label?: string; block?: boolean; cover?: boolean } = $props();
</script>

<div class="loading" class:block class:cover role="status" aria-live="polite">
  <i class="ring" aria-hidden="true"></i>
  <span>{label}<b>…</b></span>
</div>

<style>
  .loading { display: inline-flex; align-items: center; gap: 8px; color: var(--hud-hi); font-size: 11px; font-weight: 800; letter-spacing: 0.14em; }
  .loading.block { display: flex; justify-content: center; padding: 48px 0; font-size: 13px; }
  .loading.cover {
    position: absolute; inset: 0; z-index: 5; display: flex; justify-content: center; align-items: flex-start; padding-top: 18%;
    background: color-mix(in srgb, var(--void) 62%, transparent); pointer-events: none; font-size: 13px;
  }
  .ring {
    flex: none; width: 16px; height: 16px; border-radius: 50%; box-sizing: border-box;
    border: 2px solid color-mix(in srgb, var(--hud) 25%, transparent); border-top-color: var(--hud-hi);
    animation: turn 0.9s linear infinite; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--hud) 60%, transparent));
  }
  .block .ring, .cover .ring { width: 22px; height: 22px; }
  b { font-weight: 800; animation: blink 1.2s steps(2, start) infinite; }
  @keyframes turn { to { transform: rotate(360deg); } }
  @keyframes blink { 50% { opacity: 0.2; } }
  @media (prefers-reduced-motion: reduce) { .ring { animation-duration: 3s; } }
</style>
