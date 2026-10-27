<script lang="ts">
  import { norm } from './astro.ts';
  import { link } from './link.svelte.ts';
  import { addFavorite, removeFavorite } from './favorites.ts';

  // ☆ saves a station (or, with no station, the system) as a favourite; ★ when it already is one.
  let { system, station = '', stationType = '' }: { system: string; station?: string; stationType?: string } = $props();
  const fav = $derived(link.state.favorites.find((f) => norm(f.system) === norm(system) && norm(f.station) === norm(station)));

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (fav) void removeFavorite(fav.id);
    else void addFavorite({ system, station, stationType });
  }
</script>

{#if system}
  <button class="fav" class:on={!!fav} onclick={toggle}
    title={fav ? 'remove from favourites' : station ? 'save the station as a favourite' : 'save the system as a favourite'}>{fav ? '★' : '☆'}</button>
{/if}

<style>
  .fav {
    flex: none; font: inherit; font-size: 13px; line-height: 1; padding: 0 3px; cursor: pointer;
    background: transparent; border: 0; color: var(--faint);
  }
  .fav:hover { color: var(--hud-hi); }
  .fav.on { color: var(--hud-hi); text-shadow: 0 0 6px rgb(255 181 69 / 0.6); }
</style>
