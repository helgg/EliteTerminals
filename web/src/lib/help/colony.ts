import type { HelpDoc } from './types.ts';

export const colony: HelpDoc = {
  about: 'A colonisation helper: find a system worth claiming, follow the construction sites you dock at, see what is left to buy and plan what to build next.',
  setup: [
    { title: 'Game files', text: 'Construction sites are tracked from your journal as you dock and deliver. They are kept on the PC, so they stay up to date when you play elsewhere. A delivery made on a machine whose journal this one cannot read is not seen: use MARK COMPLETE.' },
    { title: 'Internet', text: 'The finder and the facility catalogue use Spansh and RavenColonial.' },
    { title: 'Your carrier', text: 'What the carrier holds comes from your own moves. Cargo moved on another machine is not seen: type the real figure in the Carrier column of the shopping list.' },
  ],
  use: [
    { title: 'FIND A SYSTEM', text: 'Uncolonised systems within reach of populated space (up to the MAX LY TO POPULATED you set), ranked by landable bodies, ring hotspots, pristine rings, belts, gas giants, life-bearing worlds and a scoopable star. PROFILE (BALANCED, MINING, BUILD) changes the weights; each system opens as a body tree with tags.' },
    { title: 'What is left out', text: 'Permit-locked, already colonised or being colonised, fixed stations, systems with a controlling faction or allegiance, and Thargoid or Guardian sites. Human signals only warn. Hide a system the game refused with NOT ALLOWED or CLAIMED.' },
    { title: 'Claim at', text: 'The nearest stations offering System Colonisation within 15 ly, with PLOT.' },
    { title: 'ALL SYSTEMS', text: 'Every system with a construction site, one row each. Picking one makes it the system BUILD and PLAN work on (shown as ◆ beside the tabs).' },
    { title: 'BUILD', text: 'Each construction site of that system, with progress (delivered, left, in the hold, on your carrier, still to buy), the delivery ship\'s trips and pace, the deadline and the reward so far. MARK COMPLETE closes a site whose deliveries were made on a machine this one cannot read; UNDO COMPLETE brings it back.' },
    { title: 'Shopping list and where to buy', text: 'What is left, in the hold and on the carrier per commodity. Markets around the site, around you or around your carrier that stock the rest, those covering most first. Include or leave out surface ports and other players\' carriers; tap a market to mark the list (green covers in full, yellow in part).' },
    { title: 'PLAN', text: 'Unlocks after the first construction of the system is complete. Shows the facility catalogue read from RavenColonial, body slots as the game\'s map shows them, a total to compare options and a vocation finder.' },
  ],
  tips: [
    'PLAN ↗ in the finder opens the system in RavenColonial.',
    'EXP next to PLOT opens the system in EXPLORE.',
    'The age of each system\'s data is shown, so you know how stale a claim check may be.',
  ],
  data: 'Sites come from your journal. Systems and bodies come from Spansh; facilities from RavenColonial. Everything is kept on the PC.',
  reviewed: '0.1.0',
};
