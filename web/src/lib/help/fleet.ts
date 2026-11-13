import type { HelpDoc } from './types.ts';

export const fleet: HelpDoc = {
  about: 'Every ship you own as a card: a hologram and the numbers on the front, everything fitted on the back, so you remember what each one is.',
  setup: [
    { title: 'Game files', text: 'Nothing to set up. The list comes from the game when you open the shipyard; the fit of a ship is read while you fly it.' },
  ],
  use: [
    { title: 'Cards', text: 'One card per ship: model, name and ident, jump range, mass, cargo, fuel, value, rebuy and where it is stored. The ship you are flying is marked IN USE and comes first.' },
    { title: 'Turn a card', text: 'Tap a card to turn it over: hardpoints, utility mounts, armour, core and internal modules with size, rating and mount, and the engineering applied to each.' },
    { title: 'Fit not seen yet', text: 'The game reports how a ship is fitted only while you fly it. A ship you never flew since this app began reading shows FIT NOT SEEN YET; fly it once and its fit is kept from then on, with the date it was read. A fit you changed in the shipyard shows after you fly that ship again.' },
    { title: 'Hologram', text: 'A 3D wireframe of the ship that sways slowly: the hull outline of its real plan, thickness from its real size, the canopy, turrets and engines. The weapons you have fitted show as orange dots, bigger for bigger mounts. A few models have no measured outline yet and show a generic hull with their real proportions; the size under the hologram is length × width × height in metres.' },
  ],
  tips: ['Value is what the game reports for the ship with its modules.'],
  data: 'All of it comes from your own journal (StoredShips and Loadout). The last fit seen of each ship is kept on this PC. Nothing is fetched online.',
  reviewed: '0.1.0',
};
