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
  // Small line glyphs (our own drawings) telling systems and the kinds of station apart, like the
  // location list of the game's navigation panel.
  let { kind, size = 13 }: { kind: PlaceKind; size?: number } = $props();
</script>

<svg class="place {kind}" width={size} height={size} viewBox="0 0 16 16" aria-label={PLACE_LABEL[kind]} role="img">
  {#if kind === 'system'}
    <circle cx="8" cy="8" r="3.2" class="fill" />
    <circle cx="8" cy="8" r="6.2" />
  {:else if kind === 'coriolis'}
    <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />
    <path d="M6.3 7.2h3.4v1.6H6.3Z" class="fill" />
  {:else if kind === 'orbis'}
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="1.8" class="fill" />
    <path d="M8 2v4.2M8 9.8V14M2 8h4.2M9.8 8H14" />
  {:else if kind === 'ocellus'}
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r="1" class="fill" />
  {:else if kind === 'dodec'}
    <path d="M8 1.5 11.3 2.4 13.6 4.7 14.5 8 13.6 11.3 11.3 13.6 8 14.5 4.7 13.6 2.4 11.3 1.5 8 2.4 4.7 4.7 2.4Z" />
    <path d="M6.3 7.2h3.4v1.6H6.3Z" class="fill" />
  {:else if kind === 'outpost'}
    <path d="M8 2v12M3 5h10M4.5 11h7" />
    <rect x="6.3" y="6.5" width="3.4" height="3" class="fill" />
  {:else if kind === 'asteroid'}
    <path d="M4 3.5 9 2l4.5 3-.5 5.5L9.5 14 4 12.5 2 8Z" />
    <circle cx="8" cy="8" r="1.4" class="fill" />
  {:else if kind === 'planetary'}
    <path d="M1.5 12.5h13" />
    <path d="M3.5 12.5a4.5 4.5 0 0 1 9 0" />
    <path d="M8 4v3.5" />
  {:else if kind === 'settlement'}
    <path d="M1.5 13h13" />
    <rect x="2.5" y="9" width="3.5" height="4" />
    <rect x="7" y="6.5" width="3" height="6.5" />
    <rect x="11" y="10" width="2.5" height="3" />
  {:else if kind === 'megaship'}
    <path d="M1.5 8 4 5h9.5l1 3-1 3H4Z" />
    <path d="M6 8h6" />
  {:else if kind === 'carrier'}
    <path d="M1.5 6.5h10l3 1.5-3 1.5h-10Z" />
    <path d="M6 6.5V4h3v2.5" />
  {/if}
</svg>

<style>
  .place {
    flex: none; vertical-align: -2px; fill: none; stroke: currentColor; stroke-width: 1.3;
    stroke-linejoin: round; stroke-linecap: round;
  }
  .place .fill { fill: currentColor; stroke: none; }
  .system { color: var(--telemetry); }
</style>
