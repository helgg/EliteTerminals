import type { HelpDoc } from './types.ts';

export const trade: HelpDoc = {
  about: 'A trade-route planner: scan the markets around you or around any system, rank the routes by what pays, and keep prices current while the server runs.',
  setup: [
    { title: 'Game files', text: 'Your ship, credits and docked market (Market.json) come from the game. The game closed or a ship with no cargo racks: type the hold size and laden jump range to plan with.' },
    { title: 'Internet', text: 'Scans use Spansh, and live prices come from the EDDN network while the server runs. Every market heard is kept in a local database, so later scans of a region come back in a fraction of a second.' },
    { title: 'Key for plotting', text: 'PLOT needs a key bound for Galaxy Map in the game.' },
  ],
  use: [
    { title: 'Scan', text: 'Pick FROM (where you are or any system, with name search; optionally one station), the radius (10 to 80 ly), your cargo and jump range, then scan. Sort the routes by Cr/t, total profit, Cr/h or profit %.' },
    { title: 'LOOP ROUTES', text: 'A → B → A routes. Tap a route to see its detail: the stations, the commodities and the live prices.' },
    { title: 'LINEAR ROUTES', text: 'Chains of up to five stops. Set STOPS next to the tabs. The trip to the first stop is drawn as an amber INITIAL TRIP lane.' },
    { title: 'A → B', text: 'Pick a start and a destination (each with an optional station) and get the best trade path for every number of stops along the corridor, up to 500 ly, with PLOT on each stop.' },
    { title: 'CARRIER TRADE', text: 'For your fleet carrier’s hold: it loads a commodity where it is plentiful and cheap, jumps (500 ly at most per jump, up to the JUMPS you allow), and unloads where it pays much more, while your ship shuttles between the carrier and the markets. Set where to LOAD (blank = the carrier’s system), the radii, the stock and demand minimums (10 000 t), the ship’s hold and jump range, then SEARCH. Each route shows the lot, the markets it comes from and goes to, the carrier’s jumps and tritium, the ship trips, the upkeep for the time it takes, the net and the net per hour. It reads the local database only, so it is as good as the prices EDDN and your scans have gathered: every price shows its age.' },
    { title: 'COMMODITY and MARKET', text: 'COMMODITY finds where a commodity sells or buys best. MARKET shows the station you are docked at, your visited markets and the session profit.' },
    { title: 'Filters', text: 'Maximum price age, landing pad, distance from the star, minimum supply and demand, EXPORT and IMPORT of a chosen station, faction states, PLANETARY and CARRIERS. Mixed loads fill your hold within your stock, demand and credits.' },
    { title: 'Pins and watch', text: 'Tap ◇ on a route to pin it: pinned routes keep a cyan rail in later scans and PINNED lists only them (marked "not in this scan" if a scan left them out). A picked route is priced again whenever one of its markets gets new prices, and a warning shows what changed.' },
    { title: 'Favourites', text: 'The ☆ beside a station or system saves it to the FLIGHT favourites for one-tap plotting.' },
  ],
  tips: [
    'Tap a station or system name to copy it to the PC\'s clipboard, ready to paste in the galaxy map.',
    'A start or end whose prices are older than the filter stays in an A → B path, but nothing is traded there.',
    'Pins are kept on the PC, so every device sees the same ones. Prices of visited and watched markets are kept for 7 days.',
    'CARRIER TRADE leaves out other players’ carriers (their prices are often made up), construction sites and prices far off the commodity’s usual, and counts them under the list. PRICE SLIP is an assumption: how much a price moves when you take all of a market’s stock or demand.',
    'On a phone the pages are SCAN, ROUTES, ROUTE and MARKET.',
  ],
  data: 'Markets and prices come from your own Market.json, Spansh and the EDDN network. Pins are kept on the PC.',
  reviewed: '0.1.0',
};
