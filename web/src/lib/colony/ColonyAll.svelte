<script lang="ts">
  import { PLAN_PROFILES, type ColonyDepot, type EdState } from '@et/shared';
  import Panel from '../Panel.svelte';

  // COLONY › ALL SYSTEMS: every system the commander has a construction site in, one row each. Picking one opens BUILD
  // (when something is still being supplied there) or PLAN; the other tabs then work on that system.
  let { s, now, onpick }: { s: EdState; now: number; onpick: (system: string, to: 'build' | 'plan') => void } = $props();

  type Saved = { profile?: string; done?: string[] };
  let saved = $state<Record<string, Saved>>({});
  $effect(() => {
    let live = true;
    fetch('/api/colony/plans').then((r) => (r.ok ? r.json() : {})).then((p) => live && (saved = p ?? {})).catch(() => {});
    return () => (live = false);
  });

  interface Row { name: string; built: number; open: ColonyDepot[]; failed: number }
  const rows = $derived.by(() => {
    const by = new Map<string, ColonyDepot[]>();
    for (const d of s.colony.depots) if (d.system) by.set(d.system, [...(by.get(d.system) ?? []), d]);
    const list: Row[] = [...by].map(([name, sites]) => ({
      name,
      built: sites.filter((d) => d.complete).length,
      open: sites.filter((d) => !d.complete && !d.failed),
      failed: sites.filter((d) => d.failed).length,
    }));
    return list.sort((a, b) => b.open.length - a.open.length || a.name.localeCompare(b.name));
  });

  const days = (d: ColonyDepot) => Math.ceil((Date.parse(d.deadline) - now) / 864e5);
  const tons = (d: ColonyDepot) => d.resources.reduce((n, r) => n + Math.max(0, r.required - r.provided), 0);
  const profileName = (id?: string) => PLAN_PROFILES.find((p) => p.id === id)?.label ?? '';
  const plan = (name: string) => saved[name.toLowerCase()];
  const soonest = (ds: ColonyDepot[]) => ds.reduce((a, b) => (Date.parse(a.deadline) <= Date.parse(b.deadline) ? a : b));
</script>

<Panel title="All systems" aside="{rows.length} system{rows.length === 1 ? '' : 's'}">
  {#if !rows.length}
    <p class="dim">No construction site yet. Dock at a colonisation ship or construction site with the game running on this PC: the system appears here, and from then on you pick it to supply its builds (BUILD) or work out what comes next (PLAN).</p>
  {:else}
    <div class="grid head"><span>SYSTEM</span><span>BUILDS</span><span>BEING SUPPLIED</span><span>PLAN</span><span></span></div>
    {#each rows as r (r.name)}
      {@const nxt = r.open.length ? soonest(r.open) : null}
      {@const p = plan(r.name)}
      <div class="grid row" class:active={r.open.length > 0}>
        <span class="sys">{r.name}</span>
        <span class="num"><b>{r.built}</b> built{#if r.open.length} · {r.open.length} open{/if}{#if r.failed} · <i class="bad">{r.failed} failed</i>{/if}</span>
        <span class="open">
          {#if nxt}
            <span class="bar"><s style:width="{Math.round(nxt.progress * 100)}%"></s></span>
            <span class="num">{(nxt.progress * 100).toFixed(0)}% · {Math.round(tons(nxt)).toLocaleString('en')} t to go · <i class:bad={days(nxt) < 4}>{days(nxt) > 0 ? `${days(nxt)} d left` : 'overdue'}</i></span>
          {:else}<span class="dim">nothing open</span>{/if}
        </span>
        <span class="num">{#if !r.built}<span class="dim">after the first build</span>{:else if p}{profileName(p.profile)} · {p.done?.length ?? 0} steps done{:else}<span class="dim">not started</span>{/if}</span>
        <span class="acts">
          {#if r.open.length}<button onclick={() => onpick(r.name, 'build')}>BUILD</button>{/if}
          {#if r.built}<button onclick={() => onpick(r.name, 'plan')}>PLAN</button>{/if}
        </span>
      </div>
    {/each}
  {/if}
</Panel>

<style>
  .grid { display: grid; grid-template-columns: minmax(140px, 1.3fr) minmax(150px, 1.2fr) minmax(220px, 2fr) minmax(150px, 1.3fr) auto; gap: 12px; align-items: center; padding: 8px 6px; border-bottom: 1px solid var(--line); font-size: 12px; }
  .head { font-size: var(--fs-xs); letter-spacing: 0.14em; color: var(--dim); }
  .sys { color: var(--hud-hi); font-weight: 800; letter-spacing: 0.06em; }
  .row.active { background: rgba(255, 122, 24, 0.06); }
  .open { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .bar { display: block; height: 4px; background: var(--line); }
  .bar s { display: block; height: 100%; background: var(--hud); }
  .bad { color: var(--danger); font-style: normal; }
  .acts { display: flex; gap: 4px; justify-content: flex-end; }
  .acts button { padding: 5px 12px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi); font: inherit; font-size: var(--fs-xs); font-weight: 800; letter-spacing: 0.1em; cursor: pointer; }
  .acts button:hover { border-color: var(--hud); }
  :global(html[data-vp^='phone']) .head, :global(html[data-vp='tablet-portrait']) .head { display: none; }
  :global(html[data-vp^='phone']) .grid, :global(html[data-vp='tablet-portrait']) .grid { grid-template-columns: 1fr; gap: 4px; padding: 10px 6px; }
  :global(html[data-vp^='phone']) .acts button { min-height: 44px; }
  :global(html[data-vp^='phone']) .acts, :global(html[data-vp='tablet-portrait']) .acts { justify-content: flex-start; }
</style>
