<script lang="ts">
  import type { EdState, FleetSnapshot } from '@et/shared';
  import FleetCard from '../lib/fleet/FleetCard.svelte';
  import Loading from '../lib/Loading.svelte';
  import { cr } from '../lib/format.ts';

  // FLEET: every ship the commander owns as a card (hologram and numbers in front, the fitted modules on the back).
  // The list and the fits come from the journal; the server keeps the last fit seen of each ship (the game only gives it while flown).
  let { s }: { s: EdState } = $props();

  let fleet = $state<FleetSnapshot | null>(null);
  let error = $state('');
  $effect(() => {
    void s.fleet.rev; // the server changes it whenever a ship or a fit does
    let live = true;
    fetch('/api/fleet')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((f: FleetSnapshot) => live && ((fleet = f), (error = '')))
      .catch((e: Error) => live && (error = e.message));
    return () => (live = false);
  });

  const total = $derived((fleet?.ships ?? []).reduce((n, x) => n + x.value, 0));
  const fitted = $derived((fleet?.ships ?? []).filter((x) => x.loadout).length);
</script>

<div class="fleet">
  <div class="bar">
    <span class="k">FLEET</span>
    {#if fleet}
      <span>{fleet.ships.length} ships</span>
      <span class="dim">{fitted} with a known fit</span>
      <span class="dim">worth {cr(total)} cr</span>
    {/if}
    <span class="dim note">Tap a card to turn it over</span>
  </div>
  {#if error}<p class="err">{error}</p>{/if}
  {#if !fleet}
    <Loading block label="READING THE FLEET" />
  {:else if !fleet.ships.length}
    <p class="dim">The game has not listed any ship yet: open the shipyard (Starport Services) once.</p>
  {:else}
    <div class="grid">
      {#each fleet.ships as ship (ship.id)}
        <FleetCard {ship} current={ship.id === fleet.currentId} art={fleet.art?.includes(ship.type.toLowerCase()) ?? false} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .fleet { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; overflow-y: auto; }
  .bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; font-size: 12px; letter-spacing: 0.06em; }
  .k { font-weight: 800; letter-spacing: 0.14em; color: var(--hud-hi); }
  .note { margin-left: auto; font-size: 11px; }
  .dim { color: var(--dim); }
  .err { color: var(--danger); font-size: 12px; margin: 0; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); padding-bottom: 8px; }
</style>
