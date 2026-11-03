// The screens, in the order of the tabs. Each one has a tutorial in lib/help (a test checks it).
export const TABS = ['FLIGHT', 'COMBAT', 'EXPLORE', 'MINING', 'TRADE', 'COLONY', 'CARRIER', 'ENGINEERING'] as const;
export type Tab = (typeof TABS)[number];
