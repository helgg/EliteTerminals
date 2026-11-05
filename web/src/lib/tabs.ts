// The screens, in the order of the tabs. Each one has a tutorial in lib/help (a test checks it).
// Two groups: COCKPIT screens press the game's keys for the player (binds); PLANNER screens only read and plan.
export const GROUPS = [
  { id: 'cockpit', name: 'COCKPIT', note: 'sends your binds to the game', tabs: ['FLIGHT', 'COMBAT', 'MINING'] },
  { id: 'planner', name: 'PLANNER', note: 'reads and plans, presses nothing', tabs: ['EXPLORE', 'TRADE', 'COLONY', 'CARRIER', 'ENGINEERING'] },
] as const;
export const TABS = GROUPS.flatMap((g) => g.tabs);
export type Tab = (typeof GROUPS)[number]['tabs'][number];
