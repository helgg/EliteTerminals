<script lang="ts">
  import { link } from '../link.svelte.ts';
  import { findPin, togglePin, type Pinnable } from './pins.ts';

  // ◇ pins a route so later scans keep it marked (◆); `label` shows PIN / PINNED beside the mark.
  let { pin, label = false }: { pin: Pinnable; label?: boolean } = $props();
  const on = $derived(!!findPin(link.state.tradePins ?? [], pin.kind, pin.item.id));

  function toggle(e: MouseEvent) {
    e.stopPropagation(); // rows and cards select on click
    void togglePin(link.state.tradePins ?? [], pin);
  }
</script>

<button class="pin" class:on class:label onclick={toggle} title={on ? 'unpin this route' : 'pin this route: later scans keep it marked'}>
  {on ? '◆' : '◇'}{#if label}<span>{on ? 'PINNED' : 'PIN'}</span>{/if}
</button>

<style>
  .pin {
    flex: none; display: inline-flex; gap: 5px; align-items: center; justify-content: center;
    padding: 2px 5px; background: transparent; border: 0; cursor: pointer;
    color: var(--faint); font: inherit; font-size: 13px; line-height: 1;
  }
  .pin:hover { color: var(--telemetry); }
  .pin.on { color: var(--telemetry); text-shadow: 0 0 6px rgb(55 198 212 / 0.7); }
  .pin span { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }
  /* beside the start box in a detail: a framed button */
  .pin.label { padding: 5px 10px; border: 1px solid var(--rule); background: var(--steel); color: var(--muted); }
  .pin.label.on { border-color: var(--telemetry); background: rgb(55 198 212 / 0.12); color: var(--telemetry); }
</style>
