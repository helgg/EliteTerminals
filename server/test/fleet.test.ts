// FLEET: the ships of the commander and the fit of each, from StoredShips and Loadout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FleetStore, moduleInfo } from '../src/fleet.ts';

const store = () => new FleetStore('.');
const stored = (timestamp: string, ships: object[]) => ({
  event: 'StoredShips', timestamp, StationName: 'KTX-01Y', StarSystem: 'Col 359', ShipsHere: ships, ShipsRemote: [],
});

test('modules are named from their ids, with size, rating and mount', () => {
  assert.deepEqual(moduleInfo('MediumHardpoint3', 'hpt_pulselaser_gimbal_medium'), { group: 'hardpoint', label: 'Pulse Laser', size: 2, rating: '', mount: 'gimbal' });
  assert.deepEqual(moduleInfo('MediumMiningHardpoint1', 'hpt_mining_subsurfdispmisle_fixed_medium'), { group: 'hardpoint', label: 'Sub-Surface Missile', size: 2, rating: '', mount: 'fixed' });
  assert.equal(moduleInfo('TinyHardpoint1', 'hpt_chafflauncher_tiny')?.group, 'utility');
  assert.deepEqual(moduleInfo('FrameShiftDrive', 'int_hyperdrive_size5_class5'), { group: 'core', label: 'Frame Shift Drive', size: 5, rating: 'A', mount: '' });
  assert.deepEqual(moduleInfo('Slot01_Size6', 'int_cargorack_size6_class1'), { group: 'internal', label: 'Cargo Rack', size: 6, rating: 'E', mount: '' });
  assert.equal(moduleInfo('Armour', 'federation_corvette_armour_grade3')?.label, 'Military Grade Composite');
  assert.equal(moduleInfo('PaintJob', 'paintjob_python_default_01'), null);
});

test('the stored ships make the list; a Loadout adds the fit and marks the ship flown', () => {
  const f = store();
  f.apply(stored('2026-11-12T14:00:00Z', [
    { ShipID: 24, ShipType: 'federation_corvette', ShipType_Localised: 'Federal Corvette', Name: 'vendetta', Value: 500 },
    { ShipID: 51, ShipType: 'mamba', Value: 300 },
  ]));
  assert.equal(f.ships.size, 2);
  assert.equal(f.ships.get(51)!.label, 'Mamba');
  assert.equal(f.ships.get(51)!.station, 'KTX-01Y');
  f.apply({
    event: 'Loadout', timestamp: '2026-11-12T15:00:00Z', Ship: 'federation_corvette', ShipID: 24, ShipName: 'vendetta', ShipIdent: 'Z-1', MaxJumpRange: 18.2,
    UnladenMass: 1802, CargoCapacity: 8, HullValue: 100, ModulesValue: 50, FuelCapacity: { Main: 32, Reserve: 0.8 },
    Modules: [{ Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', On: true, Health: 1 }, { Slot: 'PaintJob', Item: 'paintjob_x' }],
  });
  const s = f.ships.get(24)!;
  assert.equal(f.currentId, 24);
  assert.equal(s.loadout?.modules.length, 1);
  assert.equal(s.loadout?.maxJump, 18.2);
  assert.equal(f.ships.get(51)!.loadout, null);
});

test('a ship that is gone from the list is dropped, but the one flown stays; old events do not undo new ones', () => {
  const f = store();
  f.apply({ event: 'Loadout', timestamp: '2026-11-12T15:00:00Z', Ship: 'mamba', ShipID: 51, Modules: [] });
  f.apply(stored('2026-11-12T16:00:00Z', [{ ShipID: 24, ShipType: 'federation_corvette', Value: 5 }]));
  assert.deepEqual([...f.ships.keys()].sort(), [24, 51]);
  f.apply(stored('2026-11-12T10:00:00Z', []));
  assert.equal(f.ships.size, 2);
  f.apply(stored('2026-11-12T17:00:00Z', []));
  assert.deepEqual([...f.ships.keys()], [51]);
  f.apply({ event: 'ShipyardSell', timestamp: '2026-11-12T18:00:00Z', SellShipID: 51 });
  assert.equal(f.ships.size, 0);
});
