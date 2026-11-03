// Where each engineer lives: the system and the base, with the system's coordinates (for the distance).
// Facts of the game, not in the journal. Each row was checked against Spansh on 2026-11-03: a station with that exact name
// exists in that system (CONFIDENCE HIGH that it is the engineer's base; the engineer -> base link itself is public game
// knowledge). Engineers not listed here are UNKNOWN: Hero Ferrari, Jude Navarro, Baltanos, Bill Turner, Terra Velasquez,
// Wellington Beck, Yarden Bond, Chloe Sedesi (no matching station was found), so the screen shows no system for them.
// Domino Green, Professor Palin, Kit Fowler, Didi Vatermann: the base name matched a station elsewhere than first guessed
// and the Spansh location was taken (CONFIDENCE MED): worth a look in the game.

import type { Pos } from './galaxy.ts';

export interface EngineerSite {
  system: string;
  base: string;
  pos: Pos;
}

/** By the engineer's name as the journal writes it. */
export const ENGINEER_SITES: Readonly<Record<string, EngineerSite>> = {
  'Felicity Farseer': { system: 'Deciat', base: "Farseer Inc", pos: [122.625, -0.8125, -47.28125] },
  'Elvira Martuuk': { system: 'Khun', base: "Long Sight Base", pos: [-171.59375, 19.96875, -56.96875] },
  'Liz Ryder': { system: 'Eurybia', base: "Demolition Unlimited", pos: [51.40625, -54.40625, -30.5] },
  "Tod 'The Blaster' McQuinn": { system: 'Wolf 397', base: "Trophy Camp", pos: [40.0, 79.21875, -10.40625] },
  'Lei Cheung': { system: 'Laksak', base: "Trader's Rest", pos: [-21.53125, -6.3125, 116.03125] },
  'Selene Jean': { system: 'Kuk', base: "Prospector's Rest", pos: [-21.28125, 69.09375, -16.3125] },
  'Hera Tani': { system: 'Kuwemaki', base: "The Jet's Hole", pos: [134.65625, -226.90625, -7.8125] },
  'Marsha Hicks': { system: 'Tir', base: "The Watchtower", pos: [-9532.9375, -923.4375, 19799.125] },
  'Juri Ishmaak': { system: 'Giryak', base: "Pater's Memorial", pos: [14.6875, 27.65625, 108.65625] },
  'Broo Tarquin': { system: 'Muang', base: "Broo's Legacy", pos: [17.03125, -172.78125, -3.46875] },
  'Petra Olmanova': { system: 'Asura', base: "Sanctuary", pos: [-9550.28125, -916.65625, 19816.1875] },
  'Tiana Fortune': { system: 'Achenar', base: "Fortune's Loss", pos: [67.5, -119.46875, 24.84375] },
  'Etienne Dorn': { system: 'Los', base: "Kraken's Retreat", pos: [-9509.34375, -886.3125, 19820.125] },
  'The Dweller': { system: 'Wyrd', base: "Black Hide", pos: [-11.625, 31.53125, -3.9375] },
  'Lori Jameson': { system: 'Shinrarta Dezhra', base: "Jameson Base", pos: [55.71875, 17.59375, 27.15625] },
  'Ram Tah': { system: 'Meene', base: "Phoenix Base", pos: [118.78125, -56.4375, -97.1875] },
  'Didi Vatermann': { system: 'Leesti', base: "Vatermann LLC", pos: [72.75, 48.75, 68.25] },
  'Zacariah Nemo': { system: 'Yoru', base: "Nemo Cyber Party Base", pos: [97.875, -86.90625, 64.125] },
  'Professor Palin': { system: 'Arque', base: "Abel Laboratory", pos: [66.5, 38.0625, 61.125] },
  'The Sarge': { system: 'Beta-3 Tucani', base: "The Beach", pos: [32.25, -55.1875, 23.875] },
  'Colonel Bris Dekker': { system: 'Sol', base: "Dekker's Yard", pos: [0.0, 0.0, 0.0] },
  'Mel Brandon': { system: 'Luchtaine', base: "The Brig", pos: [-9523.3125, -914.46875, 19825.90625] },
  'Domino Green': { system: 'Deriso', base: "The Divine Apparatus", pos: [-9520.3125, -909.5, 19808.75] },
  'Eleanor Bresa': { system: 'Desy', base: "Bresa Modifications", pos: [-9534.21875, -912.21875, 19792.375] },
  'Rosa Dayette': { system: 'Kojeara', base: "Rosa's Shop", pos: [-9513.09375, -908.84375, 19814.28125] },
  'Kit Fowler': { system: 'Mantuate', base: "Fowler's Folly", pos: [58.40625, -45.1875, 67.75] },
};

export const engineerSite = (name: string): EngineerSite | undefined => ENGINEER_SITES[name];
