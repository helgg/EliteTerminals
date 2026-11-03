import type { HelpDoc } from './types.ts';

export const combat: HelpDoc = {
  about: 'A combat console: every ship scanned around you ranked by bounty, one-tap target picking, your session figures and checked macros for the controls you need in a fight.',
  setup: [
    { title: 'Game files', text: 'Contacts, bounties and missions come from your journals while you play. Nothing to install in the game.' },
    { title: 'Key bindings', text: 'The console presses your own bindings. An action with no key bound shows "no bind" and stays disabled. Subsystem lock and fighter orders also need their keys bound in the game.' },
    { title: 'Macros', text: 'A macro presses one key at a time and waits for the game to confirm each step (status flags, pips, the ship or subsystem targeted) before the next. The game window must be focusable, or the command is refused.' },
  ],
  use: [
    { title: 'Contacts', text: 'Ships scanned in this instance with pilot, rank, legal status, bounty and faction. Sort by any column (highest bounty first), filter WANTED, MASSACRE or CLEAN, and tap a row to lock that ship in the game.' },
    { title: 'NEXT WANTED · NEXT MASSACRE · AUTO NEXT', text: 'One quick lap of the targets in range, then the best one: a ship of your massacre target faction, else the highest bounty. The next pick is marked ★ and ships that left sensor range are dimmed. AUTO NEXT repeats after every kill. A search gives up after 30 s, when nothing locks or when you pick a target yourself, and says why.' },
    { title: 'Session', text: 'Bounties, unredeemed vouchers, Cr/h, kills, combat bonds, massacre progress per giving faction and how many rebuys your credits cover.' },
    { title: 'Console', text: 'Colour-coded groups: power presets, one-tap subsystem lock (power plant, drives, FSD, shield generator, distributor, cargo hatch), fighter orders, escape (emergency jump, submit & run, recall & jump), defence (heat sink, shield cell, chaff, ECM, silent running, combos) and wing assist.' },
    { title: 'Stopping a macro', text: 'Tap a running macro again to stop it. This works from any screen.' },
  ],
  tips: [
    'Ships with the same type and pilot name (patrols) are told apart by their rank.',
    'Several devices stay in step: after a kill only the screen you used last picks the next target.',
    'On phones the pages are TARGETS, ATTACK, FIGHTER and SURVIVE.',
  ],
  data: 'Everything comes from your own journals and Status.json. Nothing here uses the network.',
  reviewed: '0.1.0',
};
