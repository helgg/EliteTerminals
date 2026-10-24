<script lang="ts">
  import { keyFor, sendCommand } from './link.svelte.ts';

  // A command button that also shows the real in-game state it controls and the key behind it.
  let { label, command, on = false, hot = false }: {
    label: string;
    command: string;
    on?: boolean;
    hot?: boolean;
  } = $props();

  const key = $derived(keyFor(command));
</script>

<button class="toggle chamfer" class:on class:hot disabled={!key} onclick={() => sendCommand(command)}
  title={key ? `${command} · ${key}` : `${command}: sem tecla de teclado nos seus binds`}>
  <span class="led"></span>
  <span class="text">{label}</span>
  <span class="key">{key ?? 'sem bind'}</span>
</button>

<style>
  .toggle {
    display: grid;
    grid-template-columns: 8px 1fr;
    grid-template-rows: auto auto;
    column-gap: 8px;
    align-items: center;
    padding: 6px 10px;
    background: var(--steel);
    border: 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: left;
  }
  .toggle:active:not(:disabled) { background: var(--rule); }
  .toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  .led {
    grid-row: 1 / span 2;
    width: 8px;
    height: 8px;
    background: var(--faint);
  }
  .key {
    grid-column: 2;
    color: var(--dim);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.02em;
    text-transform: none;
  }
  .on { color: var(--text); }
  .on .led { background: var(--telemetry); box-shadow: 0 0 6px var(--telemetry); }
  .hot.on .led { background: var(--hud); box-shadow: var(--glow); }
</style>
