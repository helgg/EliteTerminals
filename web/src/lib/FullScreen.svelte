<script lang="ts">
  // Full-screen button for the top bar. Where the browser has the Fullscreen API (Android Chrome,
  // iPad Safari, desktop) it toggles full screen. iPhone Safari has none for pages: the only way is
  // "Add to Home Screen", so there the button explains that. Opened from the home screen, the panel
  // already runs full screen (manifest + apple-mobile-web-app-capable) and the button hides.
  type FsDoc = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
  const doc = document as FsDoc;

  const installed =
    matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const hasApi = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let full = $state(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
  let help = $state(false);

  $effect(() => {
    const sync = () => (full = !!(doc.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  });

  async function toggle() {
    if (!hasApi) {
      help = true;
      return;
    }
    try {
      if (full) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      } else {
        const el = document.documentElement as FsEl;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else el.webkitRequestFullscreen?.();
      }
    } catch {
      help = true; // refused (e.g. an iframe without permission): fall back to the home-screen way
    }
  }
</script>

{#if !installed}
  <button class="fs" class:on={full} onclick={toggle} title={full ? 'Leave full screen' : 'Full screen'}
    aria-label={full ? 'Leave full screen' : 'Full screen'}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {#if full}
        <path d="M7 2v5H2M13 2v5h5M7 18v-5H2M13 18v-5h5" />
      {:else}
        <path d="M2 7V2h5M18 7V2h-5M2 13v5h5M18 13v5h-5" />
      {/if}
    </svg>
  </button>
{/if}

<svelte:window onkeydown={(e) => help && e.key === 'Escape' && (help = false)} />

{#if help}
  <div class="backdrop" role="presentation" onclick={() => (help = false)}>
    <div class="card" role="dialog" aria-modal="true" aria-label="Full screen" tabindex="-1"
      onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <header>
        <span class="bar"></span><span class="title">FULL SCREEN</span>
        <button class="x" onclick={() => (help = false)} aria-label="Close">✕</button>
      </header>
      {#if ios}
        <p>On iPhone, Safari only goes full screen for apps on the <b>home screen</b>:</p>
        <ol>
          <li>Tap <b>Share</b> <span class="glyph">⬆</span> in Safari's bar.</li>
          <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li>Open <b>ED·ET</b> from the home screen: no browser bars, full screen.</li>
        </ol>
        <p class="dim">The PC address is kept in the icon; open it while the panel server is running.</p>
      {:else}
        <p>{hasApi ? 'The browser did not allow full screen here.' : 'This browser cannot go full screen from a page.'}
          Add the panel to the home screen instead:</p>
        <ol>
          <li>Open the browser menu <span class="glyph">⋮</span>.</li>
          <li>Choose <b>Add to Home screen</b> (or <b>Install app</b>).</li>
          <li>Open <b>ED·ET</b> from the home screen.</li>
        </ol>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fs {
    display: grid;
    place-items: center;
    width: 40px;
    min-height: 34px;
    padding: 0;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--hud-hi);
  }
  .fs.on { border-color: var(--telemetry); color: var(--telemetry); }
  .fs:active { filter: brightness(1.4); }
  svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: square; }

  .backdrop {
    position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
    background: rgb(5 3 2 / 0.82); backdrop-filter: blur(3px);
  }
  .card {
    width: min(400px, 100%); max-height: 100%; overflow: auto; padding: 0 18px 14px;
    background: var(--panel); border: 1px solid var(--hud); box-shadow: var(--glow);
    clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
    font-size: 13px; line-height: 1.6;
  }
  header { display: flex; align-items: center; gap: 8px; margin: 0 -18px 4px; padding: 8px 10px 8px 18px; border-bottom: 1px solid var(--rule); }
  .bar { width: 3px; height: 13px; background: var(--hud); box-shadow: var(--glow); }
  .title { color: var(--hud-hi); font-weight: 700; letter-spacing: 0.12em; font-size: 12px; }
  .x { margin-left: auto; width: 36px; height: 32px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi); }
  p { margin: 8px 0; color: var(--muted); }
  ol { margin: 0; padding-left: 20px; color: var(--muted); }
  b { color: var(--text); }
  .glyph { color: var(--telemetry); font-weight: 700; }
</style>
