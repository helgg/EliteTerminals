import type { HelpDoc } from './types.ts';

export const mining: HelpDoc = {
  about: 'Asteroid mining from your ship: what each rock is worth, the session so far, the rings around you and where to sell. Mining in the Rhino on a planet surface is not built yet.',
  setup: [
    { title: 'Limpets', text: 'Fire a prospector limpet at a rock and its materials appear here. Refine ore in the cockpit and the session starts counting.' },
    { title: 'Prices', text: 'Sell prices come from the markets near you (the same data as TRADE). They fill in a few seconds after your first prospect.' },
    { title: 'Buttons', text: 'The console sends your own binds to the game, as in FLIGHT and COMBAT. A tile with NO BIND needs a key set in the game.' },
  ],
  use: [
    { title: 'On a phone', text: 'The screen splits in four pages with the bar at the bottom (on its side, down the left): PROSPECT (prospector, rock value, asteroids), SESSION, FIND (AROUND with RINGS, HOTSPOTS, ORES and SELL) and CONSOLE (your binds). A tablet or a monitor on its end shows two columns over the console.' },
    { title: 'Around', text: 'The AROUND box above the tabs sets the system RINGS, HOTSPOTS, ORES and SELL look at. It starts as your current system; type a name and pick it to look elsewhere, and HERE brings it back. Rings come from Spansh and prices from the markets around that system (distances are from it too).' },
    { title: 'Prospector', text: 'The last rock: MINE when a target ore is at least the threshold, RICH when it is worth much more than usual, CORE for a motherlode, SKIP otherwise. Tap a material to cycle it: target, ignore, plain. TARGETS and IGNORE open lists to pick from; the ≥ % buttons set the threshold.' },
    { title: 'Worth and RICH', text: 'WORTH is credits per ton broken off, using the best sell price found nearby. A rock is RICH at 75% or more of the best rock you prospected and at least 2,000 Cr/t. It is an estimate: a ton of fragments is assumed to refine in the shares the prospector shows.' },
    { title: 'Rock value', text: 'Inside a ring the game gives no position, so instead of a radar this panel shows each prospected rock as a bar, oldest to newest (the height follows the value on a square-root scale, so poor rocks stay visible; with no price yet it follows the biggest share in the rock), with how many were rich, how many rocks since the last one, and cores. A rock worth nothing (every mineral ignored, or none priced) gets a short red bar so the chart has no gaps; the left axis gives Cr/t and the dashed line is where RICH starts. Tap a bar (or a row of ASTEROIDS) to see that rock: each mineral with its share, best price per ton and the Cr/t it adds; BEST goes back to the richest. Below, MINERALS IN THIS FIELD sums every rock: in how many it showed up, its mean and best share and its price. Near a body the radar shows your trail and the rocks instead.' },
    { title: 'Asteroids', text: 'The rocks before the last one with verdict, best target, Cr/t, content level (L, M, H) and what is left.' },
    { title: 'Session', text: 'Refined tons, tons and credits per hour from the first refined ton, hold space, limpets left and used, and which mining tools your ship has. A session starts with your first prospector limpet or refined ton and ends when you go to supercruise or jump away; the rocks seen are cleared with it and the last three sessions are listed as PREVIOUS (tons, rocks, cores). A bar warns when the hold is nearly full (5% free, at least 2 t) and when it is full.' },
    { title: 'Rings', text: 'The rings of this system with type, reserve level and hotspots, dearest first, with the price of each hotspot mineral; BEST HERE names the best ring and ore. OVERLAP keeps only rings with 2, 3 or 4+ hotspots of the same mineral. RES sites are not known to the app yet. A ◆ marks a mineral that can occur as a core. A ring you scanned yourself with the detailed surface scanner (OWN SCAN) replaces what Spansh knows.' },
    { title: 'Ores', text: 'What each ore pays within the sell range: BEST price, AVG (the mean of the best stations found, up to 20) and how many markets buy it. A bar shows the best against the rest. The MARK buttons set an ore as a target (★) or to ignore (✕); the same lists drive the prospector, the value chart and the sale, so a mark made here shows in TARGETS/IGNORE and the other way round. SHOW narrows the list to your targets or to the ores with hotspots in this system. Prices need markets nearby that were seen recently, so a quiet region can show few.' },
    { title: 'Hotspots', text: 'The HOTSPOTS tab is the finder.' },
    { title: 'Hotspot finder', text: 'Pick a mineral and a radius, FIND lists the nearest rings with its hotspots, around the AROUND system (PRISTINE for full reserves). OVERLAP · SPOTS/RING 2+ or 3+ lists only rings with that many hotspots of the mineral: Spansh gives the count per ring, not where they sit, so it shows rings that can have overlapping hotspots, not a guarantee. PLOT sets the route in the game.' },
    { title: 'Sell', text: 'For each ore in the hold or refined, the best stations within range: price, demand, distance, pad size and how old the price is.' },
  ],
  tips: [
    'Cores (motherlodes) are rare: the journal only reveals one when the prospector reads it. The ◆ in RINGS shows where the minerals that can have one are.',
    'If you did not set targets, RICH still finds the rocks that pay best here and now.',
  ],
  data: 'Everything comes from your own journal and Status.json, plus Spansh for rings and hotspots and the local price database for selling. Nothing is sent anywhere.',
  reviewed: '0.1.0',
};
