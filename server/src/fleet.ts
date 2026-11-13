// FLEET: the commander's ships and how each one is fitted, from the journal (StoredShips for the list, Loadout for the
// fit of the ship that is flown). The game only reports a ship's fit while it is flown, so the last fit seen is kept on
// disk and each ship says when it was seen. Pure apart from the file and journal helpers at the bottom.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { shipLabel, type FleetModule, type FleetShip, type FleetSnapshot, type ModuleGroup } from '@et/shared';

type Obj = Record<string, any>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const RATING = ['', 'E', 'D', 'C', 'B', 'A'];
const MOUNT_SIZE: Record<string, number> = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4 };
const CORE_SLOTS = ['PowerPlant', 'MainEngines', 'FrameShiftDrive', 'LifeSupport', 'PowerDistributor', 'Radar', 'FuelTank'];

/** Friendly names for the module ids the journal uses (hpt_… / int_…); anything else is read from its own words. */
const NAMES: Record<string, string> = {
  powerplant: 'Power Plant', engine: 'Thrusters', hyperdrive: 'Frame Shift Drive', hyperdrive_overcharge: 'FSD (Overcharge)',
  lifesupport: 'Life Support', powerdistributor: 'Power Distributor', sensors: 'Sensors', fueltank: 'Fuel Tank',
  shieldgenerator: 'Shield Generator', cargorack: 'Cargo Rack', corrosionproofcargorack: 'Cargo Rack (Corrosion)',
  fuelscoop: 'Fuel Scoop', refinery: 'Refinery', hullreinforcement: 'Hull Reinforcement', modulereinforcement: 'Module Reinforcement',
  guardianfsdbooster: 'Guardian FSD Booster', guardianpowerplant: 'Guardian Power Plant', fighterbay: 'Fighter Hangar', buggybay: 'SRV Hangar',
  passengercabin: 'Passenger Cabin', shieldcellbank: 'Shield Cell Bank', repairer: 'AFM Unit', supercruiseassist: 'Supercruise Assist',
  dockingcomputer_advanced: 'Advanced Docking Computer', dockingcomputer_standard: 'Standard Docking Computer',
  planetapproachsuite: 'Planetary Approach Suite', detailedsurfacescanner: 'Detailed Surface Scanner',
  stellarbodydiscoveryscanner_advanced: 'Detailed Discovery Scanner', stellarbodydiscoveryscanner_standard: 'Intermediate Discovery Scanner',
  stellarbodydiscoveryscanner_intermediate: 'Intermediate Discovery Scanner', expmodulestabiliser: 'Experimental Weapon Stabiliser',
  dronecontrol_collection: 'Collector Limpet Controller', dronecontrol_prospector: 'Prospector Limpet Controller',
  dronecontrol_fueltransfer: 'Fuel Transfer Limpet Controller', dronecontrol_resourcesiphon: 'Hatch Breaker Limpet Controller',
  dronecontrol_repair: 'Repair Limpet Controller', dronecontrol_decontamination: 'Decontamination Limpet Controller',
  dronecontrol_recon: 'Recon Limpet Controller', dronecontrol_research: 'Research Limpet Controller', metaalloyhullreinforcement: 'Meta Alloy Hull Reinforcement',
  pulselaser: 'Pulse Laser', pulselaserburst: 'Burst Laser', beamlaser: 'Beam Laser', multicannon: 'Multi-Cannon', cannon: 'Cannon',
  plasmaaccelerator: 'Plasma Accelerator', railgun: 'Rail Gun', slugshot: 'Fragment Cannon', basicmissilerack: 'Missile Rack',
  dumbfiremissilerack: 'Missile Rack', drunkmissilerack: 'Pack-Hound', advancedtorppylon: 'Torpedo Pylon', mininglaser: 'Mining Laser', miningtoolv2: 'Mining Tool',
  mining_abrblstr: 'Abrasion Blaster', mining_seismchrgwarhd: 'Seismic Charge Launcher', mining_subsurfdispmisle: 'Sub-Surface Missile',
  plasmashockcannon: 'Shock Cannon', shieldbooster: 'Shield Booster', chafflauncher: 'Chaff Launcher', heatsinklauncher: 'Heat Sink Launcher',
  plasmapointdefence: 'Point Defence', electroniccountermeasure: 'Electronic Countermeasure', cargoscanner: 'Cargo Scanner',
  crimescanner: 'Kill Warrant Scanner', cloudscanner: 'Frame Shift Wake Scanner', mrascanner: 'Pulse Wave Analyser', xenoscanner: 'Xeno Scanner',
  antiunknownshutdown: 'Shutdown Field Neutraliser', causticsinklauncher: 'Caustic Sink Launcher',
  guardian_gausscannon: 'Guardian Gauss Cannon', guardian_plasmalauncher: 'Guardian Plasma Charger', guardian_shardcannon: 'Guardian Shard Cannon',
  flakmortar: 'Remote Release Flak Launcher', flechettelauncher: 'Remote Release Flechette Launcher', minelauncher: 'Mine Launcher',
  atventdisruptor: 'AX Multi-Cannon', atmulticannon: 'AX Multi-Cannon', atdumbfiremissile: 'AX Missile Rack',
};
const ARMOUR: Record<string, string> = {
  grade1: 'Lightweight Alloy', grade2: 'Reinforced Alloy', grade3: 'Military Grade Composite', mirrored: 'Mirrored Surface Composite', reactive: 'Reactive Surface Composite',
};

const title = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** What a fitted module is, from its slot and its id. Exported for tests. */
export function moduleInfo(slot: string, item: string): { group: ModuleGroup; label: string; size: number; rating: string; mount: string } | null {
  const id = item.toLowerCase();
  if (/armour_/.test(id)) {
    return { group: 'armour', label: ARMOUR[id.split('_armour_')[1]] ?? title(id.split('_armour_')[1] ?? id), size: 0, rating: '', mount: '' };
  }
  if (id.startsWith('hpt_')) {
    const tokens = id.slice(4).split('_');
    const mount = ['fixed', 'gimbal', 'turret'].find((m) => tokens.includes(m)) ?? '';
    const cls = Number(/_class(\d)/.exec(id)?.[1] ?? 0);
    const key = tokens.filter((t) => !['fixed', 'gimbal', 'turret'].includes(t) && !(t in MOUNT_SIZE) && !/^(size|class)\d+$/.test(t)).join('_');
    // utility mounts sit on the "Tiny" slots; the others take their size from the slot
    const utility = /^Tiny/.test(slot) || tokens.includes('tiny');
    const size = utility ? 0 : MOUNT_SIZE[/^(Small|Medium|Large|Huge)/.exec(slot)?.[1]?.toLowerCase() ?? ''] ?? 0;
    return { group: utility ? 'utility' : 'hardpoint', label: NAMES[key] ?? title(key), size, rating: cls ? RATING[cls] ?? '' : '', mount };
  }
  if (id.startsWith('int_')) {
    const m = /^int_(.+?)(?:_size(\d+))?(?:_class(\d))?$/.exec(id);
    if (!m) return null;
    const key = m[1];
    return {
      group: CORE_SLOTS.includes(slot) ? 'core' : 'internal', label: NAMES[key] ?? title(key), size: Number(m[2] ?? 0),
      rating: m[3] ? RATING[Number(m[3])] ?? '' : '', mount: '',
    };
  }
  return null; // paint, decals, cockpit, hatch, voice pack…
}

function fromModule(m: Obj): FleetModule | null {
  const info = moduleInfo(str(m.Slot), str(m.Item));
  if (!info) return null;
  const eng = m.Engineering as Obj | undefined;
  return {
    slot: str(m.Slot), item: str(m.Item).toLowerCase(), ...info, on: m.On !== false, health: num(m.Health) || 1, value: num(m.Value),
    engineering: eng
      ? {
          blueprint: title(str(eng.BlueprintName)), level: num(eng.Level), quality: num(eng.Quality),
          experimental: str(eng.ExperimentalEffect_Localised) || title(str(eng.ExperimentalEffect)),
        }
      : null,
  };
}

const GROUP_ORDER: ModuleGroup[] = ['hardpoint', 'utility', 'armour', 'core', 'internal'];

/** Fits come out of the Loadout in slot order already; this keeps them in the order the card prints them. */
export function sortModules(list: FleetModule[]): FleetModule[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) => GROUP_ORDER.indexOf(a.m.group) - GROUP_ORDER.indexOf(b.m.group) || a.i - b.i)
    .map((x) => x.m);
}

export class FleetStore {
  ships = new Map<number, FleetShip>();
  currentId = 0;
  /** Timestamp of the StoredShips this list was last rebuilt from. */
  storedAt = '';
  rev = 0;
  private file: string;
  private saved = '';

  constructor(cacheDir: string) {
    this.file = join(cacheDir, 'fleet.json');
  }

  snapshot(): FleetSnapshot {
    const ships = [...this.ships.values()].sort((a, b) => Number(b.id === this.currentId) - Number(a.id === this.currentId) || b.value - a.value || a.id - b.id);
    return { currentId: this.currentId, storedAt: this.storedAt, ships };
  }

  private ship(id: number, at: string): FleetShip {
    let s = this.ships.get(id);
    if (!s) {
      s = { id, type: '', label: '', name: '', ident: '', value: 0, hot: false, system: '', station: '', at, loadout: null };
      this.ships.set(id, s);
    }
    if (at > s.at) s.at = at;
    return s;
  }

  /** Feeds one journal event (old ones too: every update checks its timestamp). True when something changed. */
  apply(e: Obj): boolean {
    const at = str(e.timestamp);
    switch (e.event) {
      case 'StoredShips': {
        if (at < this.storedAt) return false;
        this.storedAt = at;
        const listed = new Set<number>();
        for (const x of [...(e.ShipsHere ?? []), ...(e.ShipsRemote ?? [])] as Obj[]) {
          const id = num(x.ShipID);
          if (!id) continue;
          listed.add(id);
          const s = this.ship(id, at);
          s.type = str(x.ShipType);
          s.label = shipLabel(s.type, str(x.ShipType_Localised));
          s.name = str(x.Name).trim();
          s.value = num(x.Value);
          s.hot = x.Hot === true;
          const here = (e.ShipsHere ?? []).includes(x);
          s.system = str(here ? e.StarSystem : x.StarSystem);
          s.station = here ? str(e.StationName) : '';
        }
        for (const [id, s] of this.ships) if (!listed.has(id) && id !== this.currentId && s.at <= at) this.ships.delete(id);
        break;
      }
      case 'Loadout': {
        const id = num(e.ShipID);
        if (!id) return false;
        const s = this.ship(id, at);
        if (s.loadout && s.loadout.at > at) return false;
        s.label = shipLabel(str(e.Ship), s.type.toLowerCase() === str(e.Ship).toLowerCase() ? s.label : '');
        s.type = str(e.Ship);
        s.name = str(e.ShipName).trim();
        s.ident = str(e.ShipIdent).trim();
        s.value = num(e.HullValue) + num(e.ModulesValue) || s.value;
        s.loadout = {
          at, maxJump: num(e.MaxJumpRange), mass: num(e.UnladenMass), cargo: num(e.CargoCapacity), fuelMain: num(e.FuelCapacity?.Main),
          fuelReserve: num(e.FuelCapacity?.Reserve), hullHealth: num(e.HullHealth) || 1, rebuy: num(e.Rebuy),
          hullValue: num(e.HullValue), modulesValue: num(e.ModulesValue),
          modules: sortModules((Array.isArray(e.Modules) ? e.Modules : []).map(fromModule).filter((m: FleetModule | null): m is FleetModule => m !== null)),
        };
        this.currentId = id;
        break;
      }
      case 'ShipyardSwap':
        if (num(e.ShipID)) this.currentId = num(e.ShipID);
        else return false;
        break;
      case 'ShipyardNew': {
        const id = num(e.NewShipID);
        if (!id) return false;
        const s = this.ship(id, at);
        s.type = str(e.ShipType);
        s.label = shipLabel(s.type, str(e.ShipType_Localised));
        break;
      }
      case 'ShipyardSell':
        if (!this.ships.delete(num(e.SellShipID))) return false;
        break;
      case 'SetUserShipName': {
        const s = this.ships.get(num(e.ShipID));
        if (!s) return false;
        s.name = str(e.UserShipName).trim();
        s.ident = str(e.UserShipId).trim();
        break;
      }
      default:
        return false;
    }
    this.rev += 1;
    return true;
  }

  async load(): Promise<void> {
    try {
      const d = JSON.parse(await readFile(this.file, 'utf8')) as FleetSnapshot;
      this.currentId = d.currentId ?? 0;
      this.storedAt = d.storedAt ?? '';
      for (const s of d.ships ?? []) this.ships.set(s.id, s);
      this.saved = JSON.stringify(this.snapshot());
    } catch {
      // nothing kept yet
    }
  }

  async save(): Promise<void> {
    const now = JSON.stringify(this.snapshot());
    if (now === this.saved) return;
    this.saved = now;
    await writeFile(this.file, now);
  }

  /** The journals of earlier sessions: oldest first, only the lines about ships. `since` skips journals untouched since. */
  async scan(dir: string, since = 0): Promise<void> {
    let names: string[];
    try {
      names = (await readdir(dir)).filter((n) => /^Journal(Alpha|Beta)?\..+\.log$/.test(n)).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      if (since && ((await stat(path).catch(() => null))?.mtimeMs ?? 0) < since) continue;
      const text = await readFile(path, 'utf8').catch(() => '');
      for (const line of text.split(/\r?\n/)) {
        if (!/"event":\s*"(StoredShips|Loadout|ShipyardSwap|ShipyardNew|ShipyardSell|SetUserShipName)"/.test(line)) continue;
        try {
          this.apply(JSON.parse(line));
        } catch {
          // a half-written line
        }
      }
    }
  }
}
