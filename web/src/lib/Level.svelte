<script lang="ts">
  // Supply / demand level, as the game's market shows it: low, medium or high (1–3 rising bars).
  let { level, exact = true }: { level: number; exact?: boolean } = $props();
  const LABEL = ['none', 'low', 'medium', 'high'];
</script>

<svg class="level l{level}" width="11" height="10" viewBox="0 0 11 10" role="img"
  aria-label={LABEL[level] ?? ''}>
  <title>{(LABEL[level] ?? '').toUpperCase()}{exact ? '' : ' · estimated from nearby markets'}</title>
  {#each [1, 2, 3] as b (b)}
    <rect x={(b - 1) * 4} y={10 - b * 3.3} width="3" height={b * 3.3} class:on={b <= level} />
  {/each}
</svg>

<style>
  .level { flex: none; vertical-align: -1px; }
  rect { fill: var(--rule); }
  .l1 rect.on { fill: var(--danger); }
  .l2 rect.on { fill: var(--hud-hi); }
  .l3 rect.on { fill: var(--ok); }
</style>
