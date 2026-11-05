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
    { title: 'GALAXY', text: 'The galaxy map around the system and its Location panel. Drag to move, wheel or pinch to zoom.' },
    { title: 'Layers', text: 'The chips at the bottom right of the map switch NEUTRON stars, BLACK HOLE, GUARDIAN and THARGOID sites on and off (remembered). Guardian and Thargoid show the whole galaxy. Neutron stars and black holes are too many for that: they load around the centre of the map, the nearest 500, once you have zoomed in enough, and more come as you zoom in or drag. The count on each chip is what is loaded.' },
    { title: 'Carrier ring', text: 'CARRIER 500 LY draws the most your fleet carrier can jump, around where it is parked, with its name; CAR in the buttons at the top right centres on it. While it is on, a note counts what the layers you have loaded hold inside the ring (true distance, so height counts).' },
    { title: 'Road to riches', text: 'RICHES opens a panel: set your jump range (it starts at your ship maximum; 5 to 500 ly, so a carrier jump of 500 works) and how many stops (3 to 100), then CALCULATE. Spansh plans a loop from where you are through systems whose worlds pay most for a scan and a mapping; more stops means a wider loop, and it takes a few seconds. The route is drawn as a glowing line with numbered stops, listed in the panel with what each pays; tap one for its worlds, then COPY or PLOT.' },
    { title: 'Point card', text: 'Tap a point (or a landmark) for its card: the system, what it is, the codex region and the distance from you and from the system on show. COPY puts the system name on the PC\'s clipboard (and on this device), PLOT sends the route to the game, EXP opens it in EXPLORE.' },
    { title: 'FIND', text: 'Places worth a trip around any system: exobiology with the species other commanders logged and what a sample pays, the most valuable bodies, Earth-like, water and ammonia worlds, terraformable bodies and geology. MAP opens the system here, PLOT routes to it.' },
  ],
  tips: [
    'An EXP button next to PLOT in FLIGHT and COLONY opens that system here.',
    'The layout follows the game; if a system looks different from the in-game map, tell us with FEEDBACK.',
  ],
  data: 'Systems, bodies and roads to riches come from Spansh, overlaid with your own journal scans. The age of the Spansh data is shown in the panel header.',
  reviewed: '0.1.0',
};
