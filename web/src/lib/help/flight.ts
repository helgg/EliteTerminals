import type { HelpDoc } from './types.ts';

export const flight: HelpDoc = {
  about: 'The cockpit companion: your ship, the next jump and the controls you reach for most, on a second screen. Tap a button and the panel presses the key you bound in the game.',
  setup: [
    { title: 'Game files', text: 'The panel reads your journals and Status.json while the game runs, read-only. Nothing to install in the game. With the game closed it shows the last known state.' },
    { title: 'Key bindings', text: 'Buttons use your active bindings. A button with no key bound says "no bind" and stays disabled: bind it in the game controls, then press SYNC in the status bar.' },
    { title: 'Plotting routes', text: 'PLOT needs a keyboard key for Galaxy Map in the game controls. The panel opens the map, types the name and closes it once the game confirms the route.' },
    { title: 'Another device', text: 'Tap the ED·ET logo (top left) for a QR code and scan it with a tablet or phone on the same network. If it cannot connect, allow port 8420 in the Windows firewall for private networks.' },
  ],
  use: [
    { title: 'Frame shift drive', text: 'The ring shows the drive state (ready, charging, jumping, supercruise, mass locked, cooldown). Beside it: jump range, fuel and the jumps the tank still holds. HYPERSPACE, SUPERCRUISE, FSD AUTO and NEXT SYSTEM press the matching keys.' },
    { title: 'Route', text: 'The plotted jumps with star class, fuel stars, distance, security and powerplay. The target card shows a hologram of the system, station or ring you are aiming at.' },
    { title: 'Favorites', text: '★ HERE saves the system you are in, + FIND saves any system by name. PLOT sends the route to the game; the row turns ROUTED when your route ends there. NEAR sorts by distance; EDIT removes entries. EXP opens the system in EXPLORE.' },
    { title: 'Ship and System', text: 'SHIP shows fuel, cargo, hull, jump range, legal state and warnings. SYSTEM lists every station with pad size, distance and services; filter ALL, ORBITAL, SURFACE or CARRIER, and star one to make it a favourite.' },
    { title: 'Power', text: 'Tap SYS, ENG or WEP to add a pip. DEF, RUN, ATK and RESET press keys until the real pips match the preset.' },
    { title: 'Ship systems', text: 'Landing gear, cargo scoop, lights, silent running and more, grouped as flight, combat, HUD & lights and nav. They light up from the game\'s own status flags.' },
    { title: 'Throttle and BOOST', text: 'The vertical throttle sets the speed in steps from 100% to reverse; ZERO stops. BOOST fires the engine boost.' },
  ],
  tips: [
    'Hover a button on a PC to see which key it sends.',
    'The status bar shows the result of every command, and a failed one says why.',
    'The game keeps its bookmarks on Frontier\'s servers, so favourites live on your PC and every device shows the same ones.',
    'On tablets the favourites open from ★ FAV in the route strip; on phones switch between ROUTE and FAVORITES.',
  ],
  data: 'Ship, route, target and drive come from your own journals and Status.json. Systems, stations and rings are enriched from Spansh. Favourites are kept on the PC.',
  reviewed: '0.1.0',
};
