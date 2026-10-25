<script lang="ts">
  import type { EdState } from '@et/shared';
  import Panel from './Panel.svelte';
  import Bar from './Bar.svelte';

  // Ship condition at a glance: fuel/cargo/hull bars, a few facts and the alert lights.
  let { s }: { s: EdState } = $props();
  const f = $derived(s.flags);

  const alerts = $derived([
    { on: f.overHeating, label: 'HEAT' },
    { on: f.isInDanger, label: 'DANGER' },
    { on: f.beingInterdicted, label: 'INTERDICTION' },
    { on: f.lowFuel, label: 'LOW FUEL' },
    { on: !f.shieldsUp && f.inMainShip, label: 'SHIELDS DOWN' },
  ]);
</script>

<Panel class="ship" title="Ship">
  <div class="stack">
    <Bar label="FUEL" value={s.status.fuelMain} max={s.ship.fuelCapacity} unit="t" warnBelow={0.25} />
    <Bar label="CARGO" value={s.cargo.count} max={s.ship.cargoCapacity} unit="t" />
    <Bar label="HULL" value={Math.round(s.ship.hullHealth * 100)} max={100} unit="%" warnBelow={0.5} />
    <div class="facts">
      <span class="dim">JUMP MAX</span><span class="num" title="Game figure: empty hold, fuel for one jump only">{s.ship.maxJumpRange.toFixed(2)}ly</span>
      <span class="dim">FIRE GRP</span><span class="num">{String.fromCharCode(65 + s.status.fireGroup)}</span>
      <span class="dim">LEGAL</span><span>{s.status.legalState || '—'}</span>
    </div>
    <div class="alerts">
      {#each alerts as a (a.label)}
        <span class="alert" class:on={a.on}>{a.label}</span>
      {/each}
    </div>
  </div>
</Panel>

<style>
  .stack { display: flex; flex-direction: column; gap: 8px; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 12px; }
  .alerts { display: flex; flex-wrap: wrap; gap: 4px; }
  .alert {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--faint);
    border: 1px solid var(--rule);
  }
  .alert.on { color: var(--void); background: var(--danger); border-color: var(--danger); animation: pulse 1s infinite alternate; }
  @keyframes pulse { to { opacity: 0.6; } }
</style>
