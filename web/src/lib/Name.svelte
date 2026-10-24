<script lang="ts">
  import PlaceIcon, { placeKind } from './PlaceIcon.svelte';
  import { copyName } from './copy.svelte.ts';

  // A station or system name that copies itself when tapped. Systems show in capitals, as in the game.
  let { value, system = false, stationType = '', icon = false }: {
    value: string;
    system?: boolean;
    stationType?: string;
    icon?: boolean;
  } = $props();
</script>

{#if value}
  <span class="name" class:system role="button" tabindex="0" title="{value} · tap to copy"
    onclick={() => copyName(value)}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && copyName(value)}
  >{#if icon}<PlaceIcon kind={system ? 'system' : placeKind(stationType)} />{/if}<span class="text">{system ? value.toUpperCase() : value}</span></span>
{:else}—{/if}

<style>
  .name { display: inline-flex; align-items: baseline; gap: 4px; max-width: 100%; cursor: copy; min-width: 0; }
  .name:hover .text { text-decoration: underline dotted; text-underline-offset: 2px; }
  .name:active { filter: brightness(1.5); }
  .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .system .text { letter-spacing: 0.03em; }
</style>
