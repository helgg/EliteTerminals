<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { PROJECT } from './project.ts';
  import { link } from './link.svelte.ts';

  let { open = $bindable(false), onfeedback }: { open: boolean; onfeedback: () => void } = $props();

  const up = $derived(link.state.eddnUpload);
  let busy = $state(false);
  let failed = $state('');

  async function share(enabled: boolean) {
    busy = true;
    failed = '';
    try {
      const res = await fetch('/api/eddn/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      if (!res.ok) failed = 'The server did not accept that.';
    } catch {
      failed = 'The server did not answer.';
    } finally {
      busy = false;
    }
  }
</script>

<Dialog bind:open title="ABOUT">
  <div class="id">
    <span class="logo">ED·ET</span>
    <div>
      <div class="name">{PROJECT.name}</div>
      <div class="dim">A second-screen cockpit for Elite Dangerous · v{PROJECT.version}</div>
    </div>
  </div>

  <section>
    <span class="k">CREATED BY</span>
    <div class="who">{PROJECT.author}</div>
  </section>

  <section>
    <span class="k">PROJECT</span>
    <a href={PROJECT.repo} target="_blank" rel="noopener noreferrer">{PROJECT.repo.replace('https://', '')}</a>
    <div class="dim">Free software under the {PROJECT.license} licence: you may use, study and share it, and a copy that is shared must keep this credit and its source open.</div>
  </section>

  <section>
    <span class="k">DATA</span>
    <div class="dim">
      Your own journals and game files, read-only. Systems, bodies and prices also come from the community:
      <a href="https://spansh.co.uk" target="_blank" rel="noopener noreferrer">Spansh</a> and the
      <a href="https://github.com/EDCD/EDDN" target="_blank" rel="noopener noreferrer">EDDN</a> network. Thank you to everyone who keeps them running.
    </div>
  </section>

  <section>
    <span class="k">SHARE WITH EDDN</span>
    <label class="share">
      <input type="checkbox" checked={up.enabled} disabled={busy || up.locked} onchange={(e) => share(e.currentTarget.checked)} />
      <span>Send what my game shows to the EDDN network</span>
    </label>
    <div class="dim">
      Off by default. When on, the markets you open at stations, the shipyards and outfitting, and the systems and bodies you
      scan or jump to are sent to <a href="https://eddn.edcd.io" target="_blank" rel="noopener noreferrer">EDDN</a>, which feeds
      community tools such as Spansh and EDSM. Only new events are sent, never your history. Nothing about you is included
      except your commander name, which EDDN scrambles. Frontier's journal rules and your own judgement still apply.
    </div>
    {#if up.locked}<div class="dim">Set by the ET_EDDN_UPLOAD setting of the server; it cannot be changed here.</div>{/if}
    {#if up.enabled}
      <div class="stat">
        <span>SENT <b>{up.sent}</b></span>
        <span>WAITING <b>{up.queued}</b></span>
        <span class:bad={up.failed > 0}>REFUSED <b>{up.failed}</b></span>
        {#if up.test}<span class="warn">TEST MODE</span>{/if}
      </div>
      {#if up.lastError}<div class="dim">Last problem: {up.lastError}</div>{/if}
    {/if}
    {#if failed}<div class="dim bad">{failed}</div>{/if}
  </section>

  <section>
    <span class="k">SUPPORT</span>
    <div class="dim">
      EliteTerminals is free and always will be. If it helps your flights, a coffee helps keep it going.
    </div>
    <a class="coffee" href={PROJECT.support} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">☕</span> BUY ME A COFFEE</a>
  </section>

  <button class="go" onclick={() => { open = false; onfeedback(); }}>REPORT A BUG OR SUGGEST AN IDEA</button>

  <p class="legal">
    EliteTerminals is an unofficial fan project and is not affiliated with or endorsed by Frontier Developments.
    Elite Dangerous is a trademark of Frontier Developments plc.
  </p>
</Dialog>

<style>
  .id { display: flex; align-items: center; gap: 12px; }
  .logo { font-size: 22px; font-weight: 800; letter-spacing: 0.08em; color: var(--hud); text-shadow: var(--glow); }
  .name { font-size: 16px; font-weight: 800; letter-spacing: 0.08em; color: var(--text); }
  .dim { color: var(--muted); font-size: 12px; line-height: 1.5; }
  section { display: flex; flex-direction: column; gap: 3px; }
  .k { color: var(--dim); font-size: var(--fs-xs); letter-spacing: 0.1em; }
  .who { color: var(--hud-hi); font-size: 18px; font-weight: 800; letter-spacing: 0.08em; }
  a { color: var(--telemetry); font-size: 12px; overflow-wrap: anywhere; }
  .coffee {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; margin-top: 4px; padding: 9px 16px; min-height: 36px;
    background: var(--hud); border: 1px solid var(--hud-hi); color: #0b0705; font-size: 12px; font-weight: 800; letter-spacing: 0.1em;
    text-decoration: none; box-shadow: var(--glow); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  }
  .go {
    background: var(--steel); border: 1px solid var(--hud); color: var(--hud-hi); font: inherit; font-size: 12px; font-weight: 800;
    letter-spacing: 0.1em; padding: 9px 10px; cursor: pointer;
  }
  .share { display: flex; align-items: center; gap: 8px; color: var(--text); font-size: 13px; cursor: pointer; }
  .share input { accent-color: var(--hud); width: 16px; height: 16px; }
  .stat { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; letter-spacing: 0.08em; color: var(--muted); }
  .stat b { color: var(--hud-hi); }
  .bad, .bad b { color: var(--alert, #ff5a3c); }
  .warn { color: var(--amber, #ffb545); font-weight: 800; }
  .legal { margin: 0; font-size: var(--fs-xs); color: var(--dim); }
  :global(html[data-device='tablet']) a:not(.coffee), :global(html[data-device='phone']) a:not(.coffee) { display: inline-block; padding-block: 8px; margin-block: -8px; }
  :global(html[data-device='tablet']) .coffee, :global(html[data-device='phone']) .coffee { min-height: 44px; }
  :global(html[data-device='tablet']) .share, :global(html[data-device='phone']) .share { min-height: 36px; align-items: center; }
</style>
