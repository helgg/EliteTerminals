<script lang="ts">
  import type { PanelAddress } from '@et/shared';

  // "Open on another device": a QR code of this PC's network address, for a phone or tablet camera.
  let { open = $bindable(false) }: { open: boolean } = $props();

  let addresses = $state<PanelAddress[]>([]);
  let pick = $state(0);
  let error = $state('');

  $effect(() => {
    if (!open) return;
    error = '';
    fetch('/api/connect')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((list: PanelAddress[]) => {
        addresses = list;
        pick = 0;
        if (!list.length) error = 'This PC has no network address: connect it to the Wi-Fi or a cable.';
      })
      .catch((e: Error) => (error = `Could not reach the panel server: ${e.message}`));
  });

  const shown = $derived(addresses[pick]);
  const close = () => (open = false);
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <!-- the backdrop closes on tap; the card stops the tap -->
  <div class="backdrop" role="presentation" onclick={close}>
    <div class="card" role="dialog" aria-modal="true" aria-label="Open on another device" tabindex="-1"
      onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <header>
        <span class="bar"></span>
        <span class="title">OPEN ON ANOTHER DEVICE</span>
        <button class="x" onclick={close} aria-label="Close">✕</button>
      </header>

      {#if error}
        <p class="bad">{error}</p>
      {:else if shown}
        <div class="qr" class:virtual={shown.virtual}>
          <!-- SVG made by our own server from the address below -->
          {@html shown.svg}
          <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
        </div>
        <div class="url num">{shown.url}</div>
        <div class="via dim">
          {shown.name}{shown.primary ? ' · main network' : ''}{shown.virtual ? ' · virtual adapter, other devices cannot reach it' : ''}
        </div>
        <ol class="steps">
          <li>Phone or tablet on the <b>same Wi-Fi</b> as this PC.</li>
          <li>Point the <b>camera</b> at the code and open the link.</li>
          <li>Add it to the home screen for a full-screen panel.</li>
        </ol>
        {#if addresses.length > 1}
          <div class="others">
            <span class="k">OTHER ADDRESSES</span>
            <div class="list">
              {#each addresses as a, i (a.url)}
                <button class:on={i === pick} class:virtual={a.virtual} onclick={() => (pick = i)} title={a.name}>
                  {a.url.replace('http://', '')}<small>{a.virtual ? 'virtual' : a.name}</small>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <p class="dim">Finding this PC's address…</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(5 3 2 / 0.82);
    backdrop-filter: blur(3px);
  }
  .card {
    width: min(400px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0 18px 16px;
    background: var(--panel);
    border: 1px solid var(--hud);
    box-shadow: var(--glow), 0 0 60px rgb(255 122 24 / 0.15);
    clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  }
  header {
    align-self: stretch;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 -18px 6px;
    padding: 8px 10px 8px 18px;
    border-bottom: 1px solid var(--rule);
  }
  .bar { width: 3px; height: 13px; background: var(--hud); box-shadow: var(--glow); }
  .title { color: var(--hud-hi); font-weight: 700; letter-spacing: 0.12em; font-size: 12px; }
  .x {
    margin-left: auto;
    width: 36px;
    height: 32px;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--hud-hi);
    font-size: 14px;
  }

  /* the code in a HUD target bracket */
  .qr { position: relative; width: min(280px, 72vw); padding: 10px; }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  .qr.virtual :global(svg) { opacity: 0.35; }
  .c { position: absolute; width: 22px; height: 22px; border: 0 solid var(--hud); }
  .tl { top: 0; left: 0; border-width: 2px 0 0 2px; }
  .tr { top: 0; right: 0; border-width: 2px 2px 0 0; }
  .bl { bottom: 0; left: 0; border-width: 0 0 2px 2px; }
  .br { bottom: 0; right: 0; border-width: 0 2px 2px 0; }

  .url { color: var(--telemetry); font-size: 18px; font-weight: 700; letter-spacing: 0.03em; }
  .via { font-size: 11px; text-align: center; }
  .steps { margin: 4px 0 0; padding-left: 20px; color: var(--muted); font-size: 12px; line-height: 1.6; align-self: stretch; }
  .steps b { color: var(--text); }

  .others { align-self: stretch; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .list { display: flex; flex-wrap: wrap; gap: 4px; }
  .list button {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
    background: var(--steel);
    border: 1px solid var(--rule);
    color: var(--text);
    font-size: 12px;
    text-align: left;
  }
  .list button small { color: var(--dim); font-size: 10px; }
  .list button.on { border-color: var(--telemetry); box-shadow: inset 0 2px var(--telemetry); }
  .list button.virtual { color: var(--muted); }
</style>
