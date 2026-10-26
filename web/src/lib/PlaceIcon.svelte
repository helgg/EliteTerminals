<script lang="ts" module>
  export type PlaceKind =
    | 'system' | 'coriolis' | 'orbis' | 'ocellus' | 'dodec' | 'outpost' | 'asteroid'
    | 'planetary' | 'settlement' | 'megaship' | 'carrier';

  /** Station type as written by the game or Spansh ("Coriolis Starport", "CraterOutpost"…) → icon. */
  export function placeKind(stationType: string): PlaceKind {
    const t = stationType.toLowerCase();
    if (t.includes('carrier')) return 'carrier';
    if (t.includes('settlement') || t.includes('onfoot')) return 'settlement';
    if (t.includes('planetary') || t.includes('surface') || t.includes('crater')) return 'planetary';
    if (t.includes('orbis')) return 'orbis';
    if (t.includes('ocellus') || t.includes('bernal')) return 'ocellus';
    if (t.includes('dodec')) return 'dodec';
    if (t.includes('outpost')) return 'outpost';
    if (t.includes('asteroid')) return 'asteroid';
    if (t.includes('mega')) return 'megaship';
    return 'coriolis';
  }

  export const PLACE_LABEL: Record<PlaceKind, string> = {
    system: 'System', coriolis: 'Coriolis starport', orbis: 'Orbis starport', ocellus: 'Ocellus starport',
    dodec: 'Dodec starport', outpost: 'Outpost', asteroid: 'Asteroid base', planetary: 'Planetary port',
    settlement: 'Settlement', megaship: 'Megaship', carrier: 'Fleet carrier',
  };
</script>

<script lang="ts">
  // Filled glyphs (our own drawings) telling systems and the kinds of station apart. Body in the
  // kind's colour, detail cut out in the background colour so they read at 13px and up.
  let { kind, size = 13 }: { kind: PlaceKind; size?: number } = $props();
</script>

<svg class="place {kind}" width={size} height={size} viewBox="0 0 16 16" aria-label={PLACE_LABEL[kind]} role="img">
  {#if kind === 'system'}
    <circle cx="8" cy="8" r="7" class="halo" />
    <circle cx="8" cy="8" r="3.6" />
    <circle cx="8" cy="8" r="6.2" class="line" />
    <circle cx="13.2" cy="4.6" r="1.3" />
  {:else if kind === 'coriolis'}
    <path d="M8 .8 15.2 8 8 15.2.8 8Z" />
    <path d="M8 .8V15.2M.8 8h4.4M10.8 8h4.4" class="cut" />
    <path d="M5.6 6.9h4.8v2.2H5.6Z" class="hole" />
  {:else if kind === 'orbis'}
    <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 2.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Z" />
    <path d="M7.1 3.2h1.8v9.6H7.1ZM3.2 7.1h9.6v1.8H3.2Z" />
    <circle cx="8" cy="8" r="2.2" />
    <rect x="7.2" y="7.6" width="1.6" height=".8" class="hole" />
  {:else if kind === 'ocellus'}
    <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 1.9a5.1 5.1 0 1 0 0 10.2A5.1 5.1 0 0 0 8 2.9Z" />
    <circle cx="8" cy="8" r="3.4" />
    <path d="M8 3.4V1M8 15v-2.4" class="cut" />
    <rect x="6.6" y="7.4" width="2.8" height="1.2" class="hole" />
  {:else if kind === 'dodec'}
    <path d="M8 .8l3.6 1 2.6 2.6 1 3.6-1 3.6-2.6 2.6-3.6 1-3.6-1-2.6-2.6-1-3.6 1-3.6 2.6-2.6Z" />
    <path d="M8 .8 8 4.6M15.2 8h-3.8M8 15.2v-3.8M.8 8h3.8" class="cut" />
    <path d="M5.6 6.9h4.8v2.2H5.6Z" class="hole" />
  {:else if kind === 'outpost'}
    <rect x="6.6" y="1" width="2.8" height="14" rx=".6" />
    <rect x="1.5" y="3.4" width="13" height="2.4" rx=".5" />
    <rect x="3" y="10.4" width="10" height="2.2" rx=".5" />
    <rect x="1.5" y="7" width="3" height="2.4" />
    <rect x="11.5" y="7" width="3" height="2.4" />
    <path d="M8 1.6v12.8" class="cut" />
  {:else if kind === 'asteroid'}
    <path d="M4.2 2.2 9.4.9l4.7 3 1 5.4-2.6 4.7-5.2 1.3-4.8-2L.9 8.3l1-4Z" />
    <circle cx="4.8" cy="4.6" r="1" class="hole" />
    <circle cx="11.6" cy="11" r=".9" class="hole" />
    <path d="M6 7h4v2.2H6Z" class="hole" />
  {:else if kind === 'planetary'}
    <path d="M2.4 12.6a5.6 5.6 0 0 1 11.2 0Z" />
    <rect x=".6" y="12.6" width="14.8" height="2.2" rx=".4" />
    <rect x="7.2" y="1.6" width="1.6" height="4" />
    <circle cx="8" cy="1.8" r="1.2" />
    <path d="M4.4 10.2h7.2" class="cut" />
    <rect x="6.6" y="10.9" width="2.8" height="1.7" class="hole" />
  {:else if kind === 'settlement'}
    <rect x=".6" y="13.2" width="14.8" height="1.8" rx=".4" />
    <path d="M1.6 13.2V8.4L4 6.6l2.4 1.8v4.8Z" />
    <path d="M7.2 13.2V4.2h3.4v9Z" />
    <path d="M11.4 13.2V9.6a2 2 0 0 1 4 0v3.6Z" />
    <rect x="8.2" y="5.6" width="1.4" height="1.2" class="hole" />
    <rect x="8.2" y="8.2" width="1.4" height="1.2" class="hole" />
    <rect x="3.3" y="10" width="1.4" height="1.4" class="hole" />
  {:else if kind === 'megaship'}
    <!-- side view: long spine carrying cargo modules, engine block aft, bow to the right -->
    <path d="M.6 5.4h2.2v5.2H.6Z" />
    <path d="M2.4 7.2h10.8l2.4.8-2.4.8H2.4Z" />
    <rect x="3.4" y="4.2" width="2.8" height="7.6" rx=".4" />
    <rect x="6.8" y="4.2" width="2.8" height="7.6" rx=".4" />
    <rect x="10.2" y="5" width="2.4" height="6" rx=".4" />
    <path d="M3.4 8h9.2" class="cut" />
  {:else if kind === 'carrier'}
    <!-- rounded triangle split into three bays (top bay, two lower bays around a central strut) -->
    <path d="M8 1.6 14.6 13.8H1.4Z" class="round" />
    <path d="M8 4.1 9.7 7.3H6.3Z" class="hole soft" />
    <path d="M5.4 8.7h1.6v3.9H3.3Z" class="hole soft" />
    <path d="M10.6 8.7H9v3.9h3.7Z" class="hole soft" />
    <path d="M8 13.8v1" class="cut" />
  {/if}
</svg>

<style>
  .place { flex: none; vertical-align: -2px; fill: var(--hud); }
  .place :global(.cut) { fill: none; stroke: var(--icon-cut, var(--panel)); stroke-width: .9; stroke-linecap: round; }
  .place :global(.hole) { fill: var(--icon-cut, var(--panel)); }
  .place :global(.line) { fill: none; stroke: currentColor; stroke-width: 1; }
  .place :global(.hole.soft) { stroke: var(--icon-cut, var(--panel)); stroke-width: 1; stroke-linejoin: round; }
  .place :global(.round) { stroke: currentColor; stroke-width: 2.4; stroke-linejoin: round; }
  .place :global(.halo) { fill: rgb(55 198 212 / 0.16); }
  .system { color: var(--telemetry); fill: var(--telemetry); }
  .carrier, .megaship { fill: var(--hud-hi); color: var(--hud-hi); }
  .planetary, .settlement { fill: #f09a3e; }
</style>
