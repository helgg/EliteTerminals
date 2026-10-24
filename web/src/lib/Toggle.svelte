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
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    gap: 3px;
    padding: 10px 10px 7px;
    min-height: 52px;
    background: linear-gradient(to bottom, #2b2014, var(--steel));
    border: 1px solid var(--rule);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: left;
  }
  .toggle:active:not(:disabled) { background: var(--rule); transform: translateY(1px); }
  .toggle:disabled { opacity: 0.4; cursor: not-allowed; }
  /* indicator strip along the top edge, like a lit cockpit switch */
  .led {
    position: absolute;
    top: 3px;
    left: 10px;
    right: 22px;
    height: 3px;
    background: var(--faint);
  }
  .key {
    color: var(--dim);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.02em;
    text-transform: none;
  }
  .on { color: var(--text); border-color: rgb(55 198 212 / 0.5); }
  .on .led { background: var(--telemetry); box-shadow: 0 0 8px var(--telemetry); }
  .hot.on { border-color: rgb(255 122 24 / 0.6); }
  .hot.on .led { background: var(--hud); box-shadow: var(--glow); }
</style>
