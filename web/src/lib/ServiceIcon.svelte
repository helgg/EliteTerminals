<script lang="ts" module>
  export type ServiceKind =
    | 'market' | 'blackmarket' | 'outfitting' | 'shipyard' | 'refuel' | 'repair' | 'restock'
    | 'materials' | 'techbroker' | 'factors' | 'cartographics' | 'genomics' | 'rescue'
    | 'missions' | 'powerplay' | 'frontline' | 'apex';

  /** Spansh / journal service names ("Material Trader", "techBroker"…) → icon; null for the ones we don't show. */
  export function serviceKind(name: string): ServiceKind | null {
    const s = name.toLowerCase().replace(/[\s_-]/g, '');
    if (s === 'market' || s === 'commodities') return 'market';
    if (s === 'blackmarket') return 'blackmarket';
    if (s === 'outfitting') return 'outfitting';
    if (s === 'shipyard') return 'shipyard';
    if (s === 'refuel') return 'refuel';
    if (s === 'repair') return 'repair';
    if (s === 'restock' || s === 'rearm') return 'restock';
    if (s.startsWith('materialtrader')) return 'materials';
    if (s.startsWith('technologybroker') || s === 'techbroker') return 'techbroker';
    if (s.startsWith('interstellarfactors') || s === 'facilitator') return 'factors';
    if (s === 'universalcartographics' || s === 'cartographics') return 'cartographics';
    if (s === 'vistagenomics') return 'genomics';
    if (s === 'searchandrescue' || s === 'searchrescue') return 'rescue';
    if (s === 'missions') return 'missions';
    if (s === 'powerplay') return 'powerplay';
    if (s === 'frontlinesolutions') return 'frontline';
    if (s === 'apexinterstellar' || s === 'apex') return 'apex';
    return null;
  }

  export const SERVICE_LABEL: Record<ServiceKind, string> = {
    market: 'Commodity market', blackmarket: 'Black market', outfitting: 'Outfitting', shipyard: 'Shipyard',
    refuel: 'Refuel', repair: 'Repair', restock: 'Restock', materials: 'Material trader',
    techbroker: 'Technology broker', factors: 'Interstellar factors', cartographics: 'Universal cartographics',
    genomics: 'Vista Genomics', rescue: 'Search and rescue', missions: 'Missions', powerplay: 'Powerplay',
    frontline: 'Frontline Solutions', apex: 'Apex Interstellar',
  };

  /** Display order, most useful first. */
  export const SERVICE_ORDER: ServiceKind[] = [
    'refuel', 'repair', 'restock', 'market', 'outfitting', 'shipyard', 'materials', 'techbroker',
    'factors', 'cartographics', 'genomics', 'blackmarket', 'rescue', 'missions', 'powerplay', 'frontline', 'apex',
  ];

  /** A station's service list → known kinds, deduplicated and in display order. */
  export function serviceKinds(names: string[]): ServiceKind[] {
    const have = new Set(names.map(serviceKind).filter((k): k is ServiceKind => k !== null));
    return SERVICE_ORDER.filter((k) => have.has(k));
  }
</script>

<script lang="ts">
  // Filled service glyphs (our own drawings). Ship upkeep (fuel/repair/ammo) in amber, trade in
  // orange, engineering/brokers in cyan, the black market in red.
  let { kind, size = 13 }: { kind: ServiceKind; size?: number } = $props();
</script>

<svg class="svc {kind}" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={SERVICE_LABEL[kind]}>
  <title>{SERVICE_LABEL[kind]}</title>
  {#if kind === 'market' || kind === 'blackmarket'}
    <path d="M1 5.2 8 1.4l7 3.8v6.6L8 15.6 1 11.8Z" />
    <path d="M1.4 5.4 8 9l6.6-3.6M8 9v6.2" class="cut" />
    {#if kind === 'blackmarket'}<path d="M3.2 7.2 6 8.8v3.4M10 8.8l2.8-1.6" class="cut" />{/if}
  {:else if kind === 'outfitting'}
    <path d="M6.8 1h2.4l.4 1.9 1.5.6 1.6-1.1 1.7 1.7-1.1 1.6.6 1.5L15 7.6v2.4l-1.9.4-.6 1.5 1.1 1.6-1.7 1.7-1.6-1.1-1.5.6-.4 1.9H6.8l-.4-1.9-1.5-.6-1.6 1.1-1.7-1.7 1.1-1.6-.6-1.5L1 10V7.6l1.9-.4.6-1.5-1.1-1.6 1.7-1.7 1.6 1.1 1.5-.6Z" transform="translate(0 -.8)" />
    <circle cx="8" cy="8" r="2.4" class="hole" />
  {:else if kind === 'shipyard'}
    <!-- a Cobra-style ship seen from above: flat wide wedge, straight nose, swept wings, nose up -->
    <path d="M5.2 4.2h5.6l4.6 6.4-.6 1.4H1.2l-.6-1.4Z" />
    <path d="M6.8 5h2.4l.5 1.4H6.3Z" class="hole" />
    <path d="M1.6 10.6h4.2M10.2 10.6h4.2M6.6 8.4h2.8" class="cut" />
    <rect x="5" y="12" width="2" height=".9" />
    <rect x="9" y="12" width="2" height=".9" />
  {:else if kind === 'refuel'}
    <path d="M8 .8c3.6 4.4 5.4 7.4 5.4 9.6a5.4 5.4 0 0 1-10.8 0C2.6 8.2 4.4 5.2 8 .8Z" />
    <path d="M5.4 10.4a2.6 2.6 0 0 0 2.6 2.6" class="cut" />
  {:else if kind === 'repair'}
    <path d="M10.6.8a4.4 4.4 0 0 0-4.2 5.8L1.2 11.8a1.8 1.8 0 0 0 2.6 2.6l5.2-5.2a4.4 4.4 0 0 0 5.8-4.2l-.1-.9-2.4 2.4-2.6-.6-.6-2.6L11.5.9Z" />
    <circle cx="2.6" cy="13.2" r=".8" class="hole" />
  {:else if kind === 'restock'}
    <path d="M2 5.4 3.6 1.6l1.6 3.8V15H2Z" />
    <path d="M6.4 5.4 8 1.6l1.6 3.8V15H6.4Z" />
    <path d="M10.8 5.4l1.6-3.8 1.6 3.8V15h-3.2Z" />
    <path d="M1.8 11.4h3.6M6.2 11.4h3.6M10.6 11.4h3.6" class="cut" />
  {:else if kind === 'materials'}
    <path d="M1 4.6 5 2.4l4 2.2v4.4L5 11.2 1 9Z" />
    <path d="M7 9.2l4-2.2 4 2.2v4.4l-4 2.2-4-2.2Z" class="alt" />
    <path d="M11 1.4a3.6 3.6 0 0 1 3.4 3.4M14.4 4.8l-1.6-.8M14.4 4.8l.6-1.6" class="line" />
  {:else if kind === 'techbroker'}
    <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1" />
    <path d="M5.6 1v2.4M8 1v2.4M10.4 1v2.4M5.6 12.6V15M8 12.6V15M10.4 12.6V15M1 5.6h2.4M1 8h2.4M1 10.4h2.4M12.6 5.6H15M12.6 8H15M12.6 10.4H15" class="line" />
    <rect x="5.8" y="5.8" width="4.4" height="4.4" class="hole" />
    <rect x="7" y="7" width="2" height="2" />
  {:else if kind === 'factors'}
    <rect x="7.2" y="2" width="1.6" height="11" />
    <rect x="4" y="13" width="8" height="2" rx=".5" />
    <rect x="1.6" y="2.8" width="12.8" height="1.4" rx=".5" />
    <path d="M.8 9.6 3 4.6l2.2 5a2.2 2.2 0 0 1-4.4 0ZM10.8 9.6 13 4.6l2.2 5a2.2 2.2 0 0 1-4.4 0Z" />
  {:else if kind === 'cartographics'}
    <circle cx="8" cy="8" r="7" />
    <path d="M8 2.2 9.4 6.6 13.8 8 9.4 9.4 8 13.8 6.6 9.4 2.2 8 6.6 6.6Z" class="hole" />
    <circle cx="8" cy="8" r="1.2" />
  {:else if kind === 'genomics'}
    <path d="M4 1c0 4.6 8 4.6 8 7s-8 2.4-8 7" class="line thick" />
    <path d="M12 1c0 4.6-8 4.6-8 7s8 2.4 8 7" class="line thick" />
    <path d="M5 3h6M6.2 5.2h3.6M6.2 10.8h3.6M5 13h6" class="line" />
  {:else if kind === 'rescue'}
    <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 3.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
    <path d="M6.6 1.2h2.8v3.3H6.6ZM6.6 11.5h2.8v3.3H6.6ZM1.2 6.6h3.3v2.8H1.2ZM11.5 6.6h3.3v2.8h-3.3Z" class="alt" />
  {:else if kind === 'missions'}
    <path d="M3 1h7.4L13 3.6V15H3Z" />
    <path d="M10.4 1v2.6H13" class="cut" />
    <path d="M5 6.4h6M5 9h6M5 11.6h4" class="cut" />
  {:else if kind === 'powerplay'}
    <path d="M8 .8l6.4 2.6v4.4c0 3.6-2.6 6.4-6.4 7.6-3.8-1.2-6.4-4-6.4-7.6V3.4Z" />
    <path d="M8 3.6 9.2 6.6h3l-2.4 1.9.9 3L8 9.6l-2.7 1.9.9-3-2.4-1.9h3Z" class="hole" />
  {:else if kind === 'frontline'}
    <path d="M1 3.4 8 .8l7 2.6v2.4L8 3.2 1 5.8Z" />
    <path d="M1 8.2l7-2.6 7 2.6v2.4L8 8 1 10.6Z" />
    <path d="M1 13l7-2.6 7 2.6v2.2L8 12.8 1 15.2Z" />
  {:else if kind === 'apex'}
    <path d="M1 9.2 4 5.8h7.6l3.4 2.2v2.6l-3.4 1.6H4Z" />
    <rect x="9.4" y="7.2" width="3.2" height="1.6" class="hole" />
    <path d="M2.4 13.6h4" class="line" />
  {/if}
</svg>

<style>
  .svc { flex: none; vertical-align: -2px; fill: var(--hud); }
  .svc :global(.cut) { fill: none; stroke: var(--icon-cut, var(--panel)); stroke-width: 1; stroke-linecap: round; stroke-linejoin: round; }
  .svc :global(.hole) { fill: var(--icon-cut, var(--panel)); }
  .svc :global(.line) { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; }
  .svc :global(.line.thick) { stroke-width: 1.8; }
  .svc :global(.alt) { fill: currentColor; }
  .svc { color: var(--hud); }
  .refuel, .repair, .restock { fill: var(--hud-hi); color: var(--hud-hi); }
  .materials, .techbroker, .factors, .cartographics, .genomics { fill: var(--telemetry); color: var(--telemetry); }
  .materials { color: var(--hud-hi); }
  .blackmarket { fill: var(--danger); }
  .rescue { fill: var(--text); color: var(--danger); }
  .powerplay, .frontline, .apex, .missions { fill: var(--muted); color: var(--muted); }
</style>
