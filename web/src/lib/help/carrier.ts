import type { HelpDoc } from './types.ts';

export const carrier: HelpDoc = {
  about: 'Your fleet carrier at a glance: where it is, its tritium, space, cargo and money, how long the balance covers the upkeep, and a jump planner with the tritium of each jump.',
  setup: [
    { title: 'Game files', text: 'The sheet is built from the journal and shows the carrier as it last appeared there.' },
    { title: 'Weekly upkeep', text: 'Type the weekly upkeep the game shows into PER WEEK. It is kept on the PC, so every device shows it. Until then, the most it can cost (about 30 M Cr) is used and marked as an estimate.' },
    { title: 'Internet', text: 'The jump planner uses Spansh\'s carrier router.' },
  ],
  use: [
    { title: 'Status sheet', text: 'Sections for where it is and a scheduled jump with its countdown, TRITIUM in the tank, SPACE used (services, cargo, buy orders, packs), CARGO by commodity and FINANCES (balance, available, reserve).' },
    { title: 'Cargo', text: 'Tracked from your own transfers and trades with the carrier and checked against the total the game reports. Cargo moved on another machine is not seen.' },
    { title: 'Upkeep and income', text: 'How long the balance covers the upkeep, the next charge (Thursdays 07:00 UTC), the date it is paid until and when to top up with a four-week margin. INCOME compares the last 7 days (rises minus your own deposits) to the weekly upkeep, as a bar with the 100% mark. COSTS mix upkeep, jumps and buy orders, because the balance cannot tell them apart.' },
    { title: 'Jump planner', text: 'Enter the destination and any stops, plus USED, TANK and TRITIUM IN CARGO if they differ from what the journal shows. The route is a chain of stop cards with the distance and tritium of each jump, and the totals (jumps, distance, tritium).' },
    { title: 'Stop card tags', text: 'HERE and NEXT mark your place, JUMPING the jump in progress, STOP a waypoint, SHORT a jump shorter than the range, REFUEL means move tritium from the cargo into the tank before that jump. Icy rings with tritium to mine are flagged (pristine ones in green). The planner also says how much to buy before leaving.' },
  ],
  tips: [
    'The card shows the tank and cargo after each jump, so you can see where it runs short.',
  ],
  data: 'The sheet comes from your journal and what you type. Routes come from Spansh. Upkeep and cargo corrections are kept on the PC.',
  reviewed: '0.1.0',
};
