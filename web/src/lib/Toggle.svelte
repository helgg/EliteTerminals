<script lang="ts">
  import { sendCommand } from './link.svelte.ts';

  // A command button that also shows the real in-game state it controls.
  let { label, command, on = false, hot = false }: {
    label: string;
    command: string;
    on?: boolean;
    hot?: boolean;
  } = $props();
</script>

<button class="toggle chamfer" class:on class:hot onclick={() => sendCommand(command)}>
  <span class="led"></span>
  <span>{label}</span>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    background: var(--steel);
    border: 0;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-align: left;
  }
  .toggle:active { background: var(--rule); }
  .led {
    flex: none;
    width: 8px;
    height: 8px;
    background: var(--faint);
  }
  .on { color: var(--text); }
  .on .led { background: var(--telemetry); box-shadow: 0 0 6px var(--telemetry); }
  .hot.on .led { background: var(--hud); box-shadow: var(--glow); }
</style>
