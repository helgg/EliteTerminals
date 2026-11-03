import type { HelpDoc } from './types.ts';

export const explore: HelpDoc = {
  about: 'A system explorer: the map of the orbits, a sheet for each body, a galaxy map and a finder for places worth a trip, with your own scans laid over the community data.',
  setup: [
    { title: 'Game files', text: 'Your scans, samples and position come from the journals. Nothing to install in the game.' },
    { title: 'Internet', text: 'Systems and the body search come from Spansh, so the PC needs internet access.' },
    { title: 'Plotting', text: 'PLOT in FIND needs a key bound for Galaxy Map in the game, as in FLIGHT.' },
  ],
  use: [
    { title: 'Choosing the system', text: 'Type or paste any system name, or use HERE (where you are), TARGET (your route target) or the system you opened. REFRESH fetches it again.' },
    { title: 'MAP', text: 'The orbits drawn like the game\'s system map: stars, planets and moons in the game\'s numbering, rings and asteroid belts at their real distance. Marks show scanned, first discovery and mapped. Drag or scroll sideways in a long system.' },
    { title: 'Highlights', text: 'ALL, LAND, BIO, GEO, WORLDS and RINGS dim everything else. WORTH A STOP ranks the bodies that pay most for a first scan and mapping.' },
    { title: 'Body sheet', text: 'Tap a body: size, gravity, atmosphere, signals and genera, the organic samples you took (1 to 3), rings with hotspots and its materials next to what you hold. A belt shows its type and what it orbits.' },
    { title: 'GALAXY', text: 'The galaxy map around the system and its Location panel. Drag to move, wheel to zoom.' },
    { title: 'FIND', text: 'Places worth a trip around any system: exobiology with the species other commanders logged and what a sample pays, the most valuable bodies, Earth-like, water and ammonia worlds, terraformable bodies and geology. MAP opens the system here, PLOT routes to it.' },
  ],
  tips: [
    'An EXP button next to PLOT in FLIGHT and COLONY opens that system here.',
    'The layout follows the game; if a system looks different from the in-game map, tell us with FEEDBACK.',
  ],
  data: 'Systems and bodies come from Spansh, overlaid with your own journal scans. The age of the Spansh data is shown in the panel header.',
  reviewed: '0.1.0',
};
