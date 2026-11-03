import type { Tab } from '../tabs.ts';
import type { HelpDoc } from './types.ts';
import { flight } from './flight.ts';
import { combat } from './combat.ts';
import { explore } from './explore.ts';
import { mining } from './mining.ts';
import { trade } from './trade.ts';
import { colony } from './colony.ts';
import { carrier } from './carrier.ts';
import { engineering } from './engineering.ts';

// Every screen needs an entry (server/test/help.test.ts fails otherwise).
export const HELP: Record<Tab, HelpDoc> = {
  FLIGHT: flight, COMBAT: combat, EXPLORE: explore, MINING: mining,
  TRADE: trade, COLONY: colony, CARRIER: carrier, ENGINEERING: engineering,
};
