import type { HelpDoc } from './types.ts';

export const engineering: HelpDoc = {
  about: 'Your engineering materials and the engineers, so you know what you hold and how close each upgrade is without leaving the cockpit.',
  setup: [
    { title: 'Game files', text: 'Materials are read from the game and kept up to date as you collect, trade, craft and synthesise. Nothing to set up.' },
    { title: 'Plotting', text: 'PLOT needs a key bound for Galaxy Map in the game, as in FLIGHT.' },
  ],
  use: [
    { title: 'Materials', text: 'Raw, manufactured and encoded materials by grade, with the storage limit of each grade.' },
    { title: 'Search and sort', text: 'Type to search by name; sort by grade, name or count.' },
    { title: 'Engineers', text: 'Every engineer with their state (known, invited, unlocked) and the grade reached.' },
    { title: 'Where to find them', text: 'Under each engineer: the system and base, and how far that is from you. Tap the system name to copy it (to the PC\'s clipboard too, ready for the galaxy map), PLOT sends the route to the game, EXP opens the system in EXPLORE. An engineer with no system listed is one whose base could not be confirmed yet.' },
  ],
  tips: ['Phones have their own pages for materials and engineers.'],
  data: 'Materials and engineer progress come from your own journal. The engineers\' systems are a fixed table checked against Spansh; nothing is fetched at run time.',
  reviewed: '0.1.0',
};
