<script lang="ts">
  // Fuel-star marker: a scoop funnel over a fuel drop. Drawn here, not taken from game assets.
  let { size = 12, title = 'Scoopable star (fuel scoop)' }: { size?: number; title?: string } = $props();
</script>

<svg class="scoop" width={size} height={size} viewBox="0 0 12 12" role="img" aria-label={title}>
  <title>{title}</title>
  <path d="M1 1.5h10L7.2 5.6v1.2H4.8V5.6Z" />
  <path d="M6 7.6c1.4 1.5 2 2.3 2 3a2 2 0 0 1-4 0c0-.7.6-1.5 2-3Z" />
</svg>

<style>
  .scoop { flex: none; fill: var(--hud-hi); filter: drop-shadow(0 0 2px rgb(255 181 69 / 0.6)); vertical-align: -1px; }
</style>
