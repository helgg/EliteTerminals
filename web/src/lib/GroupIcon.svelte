<script lang="ts">
  // COCKPIT: a button being pressed; PLANNER: an eye (looks, presses nothing).
  let { id }: { id: 'cockpit' | 'planner' } = $props();
</script>

<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
  {#if id === 'cockpit'}
    <rect x="2.5" y="9" width="11" height="4.5" />
    <path d="M8 2.5v5M5.5 5.5 8 8l2.5-2.5" />
  {:else}
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  {/if}
</svg>
