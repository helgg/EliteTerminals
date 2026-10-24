<script lang="ts">
  let { label, value, max, unit = '', warnBelow = 0 }: {
    label: string;
    value: number;
    max: number;
    unit?: string;
    warnBelow?: number;
  } = $props();

  const ratio = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);
  const warn = $derived(max > 0 && ratio < warnBelow);
</script>

<div class="bar">
  <div class="row">
    <span class="dim">{label}</span>
    <span class="num" class:bad={warn}>
      {value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<span class="dim">/{max.toLocaleString('pt-BR')}{unit}</span>
    </span>
  </div>
  <div class="track"><div class="fill" class:warn style:width="{ratio * 100}%"></div></div>
</div>

<style>
  .row { display: flex; justify-content: space-between; font-size: 12px; }
  .track { height: 6px; margin-top: 3px; background: var(--steel); border: 1px solid var(--rule); }
  .fill { height: 100%; background: var(--hud); box-shadow: var(--glow); transition: width 0.3s; }
  .fill.warn { background: var(--danger); }
</style>
