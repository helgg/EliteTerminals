import type { HelpDoc } from './types.ts';

export const engineering: HelpDoc = {
  about: 'Your engineering materials and the engineers, so you know what you hold and how close each upgrade is without leaving the cockpit.',
  setup: [
    { title: 'Game files', text: 'Materials are read from the game and kept up to date as you collect, trade, craft and synthesise. Nothing to set up.' },
  ],
  use: [
    { title: 'Materials', text: 'Raw, manufactured and encoded materials by grade, with the storage limit of each grade.' },
    { title: 'Search and sort', text: 'Type to search by name; sort by grade, name or count.' },
    { title: 'Engineers', text: 'Every engineer with their state (known, invited, unlocked) and the grade reached.' },
  ],
  tips: ['Phones have their own pages for materials and engineers.'],
  data: 'Everything comes from your own journal. Nothing uses the network.',
  reviewed: '0.1.0',
};
