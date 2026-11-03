<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { HELP } from './help/index.ts';
  import type { Tab } from './tabs.ts';

  let { open = $bindable(false), tab }: { open: boolean; tab: Tab } = $props();
  const doc = $derived(HELP[tab]);
</script>

<Dialog bind:open title="{tab} · HOW TO USE" width={560}>
  {#if doc}
    <p class="about">{doc.about}</p>
    {#if doc.soon}
      <section>
        <span class="k">COMING SOON</span>
        <ul>{#each doc.soon as p (p)}<li>{p}</li>{/each}</ul>
      </section>
    {/if}
    {#if doc.setup.length}
      <section>
        <span class="k">SET UP</span>
        {#each doc.setup as t (t.title)}<div class="t"><b>{t.title}</b> <span>{t.text}</span></div>{/each}
      </section>
    {/if}
    {#if doc.use.length}
      <section>
        <span class="k">USE</span>
        {#each doc.use as t (t.title)}<div class="t"><b>{t.title}</b> <span>{t.text}</span></div>{/each}
      </section>
    {/if}
    {#if doc.tips.length}
      <section>
        <span class="k">TIPS</span>
        <ul>{#each doc.tips as p (p)}<li>{p}</li>{/each}</ul>
      </section>
    {/if}
    {#if doc.data}
      <section>
        <span class="k">DATA</span>
        <div class="t"><span>{doc.data}</span></div>
      </section>
    {/if}
    <footer class="dim">checked against v{doc.reviewed}</footer>
  {:else}
    <p class="about">No tutorial for this screen yet.</p>
  {/if}
</Dialog>

<style>
  .about { margin: 0; color: var(--text); font-size: 13px; line-height: 1.5; }
  section { display: flex; flex-direction: column; gap: 5px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; border-bottom: 1px solid var(--rule); padding-bottom: 2px; }
  .t { font-size: 12px; line-height: 1.5; color: var(--muted); }
  .t b { color: var(--hud-hi); letter-spacing: 0.06em; }
  ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.5; color: var(--muted); }
  footer { font-size: 10px; text-align: right; }
</style>
