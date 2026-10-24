// Shared state model and wire protocol between server and web client.
// Field names follow the public Elite Dangerous Journal Manual where possible.

/** Status.json `Flags` bits 0..31, in bit order. */
export const STATUS_FLAGS = [
  'docked', 'landed', 'landingGearDown', 'shieldsUp', 'supercruise', 'flightAssistOff',
  'hardpointsDeployed', 'inWing', 'lightsOn', 'cargoScoopDeployed', 'silentRunning',
  'scoopingFuel', 'srvHandbrake', 'srvTurretView', 'srvTurretRetracted', 'srvDriveAssist',
  'fsdMassLocked', 'fsdCharging', 'fsdCooldown', 'lowFuel', 'overHeating', 'hasLatLong',
  'isInDanger', 'beingInterdicted', 'inMainShip', 'inFighter', 'inSrv', 'hudAnalysisMode',
  'nightVision', 'altitudeFromAverageRadius', 'fsdJump', 'srvHighBeam',
] as const;

/** Status.json `Flags2` bits (Odyssey), in bit order. */
export const STATUS_FLAGS2 = [
  'onFoot', 'inTaxi', 'inMulticrew', 'onFootInStation', 'onFootOnPlanet', 'aimDownSight',
  'lowOxygen', 'lowHealth', 'cold', 'hot', 'veryCold', 'veryHot', 'glideMode',
  'onFootInHangar', 'onFootSocialSpace', 'onFootExterior', 'breathableAtmosphere',
  'telepresenceMulticrew', 'physicalMulticrew', 'fsdHyperdriveCharging',
] as const;

export type StatusFlag = (typeof STATUS_FLAGS)[number];
export type StatusFlag2 = (typeof STATUS_FLAGS2)[number];
export type Flags = Record<StatusFlag | StatusFlag2, boolean>;

export interface CargoItem {
  name: string;
  label: string;
  count: number;
  stolen: number;
}

export interface MarketItem {
  name: string;
  label: string;
  category: string;
  buy: number;
  sell: number;
  meanPrice: number;
  stock: number;
  demand: number;
}

export interface RouteHop {
  system: string;
  address: number;
  starClass: string;
  pos: [number, number, number];
}

export interface EdState {
  meta: {
    online: boolean;
    journal: string;
    gameVersion: string;
    odyssey: boolean;
    lastEventAt: string;
    parseErrors: number;
  };
  commander: { name: string; fid: string; gameMode: string; credits: number };
  ship: {
    type: string;
    label: string;
    name: string;
    ident: string;
    cargoCapacity: number;
    fuelCapacity: number;
    maxJumpRange: number;
    hullHealth: number;
  };
  flags: Flags;
  status: {
    guiFocus: number;
    fireGroup: number;
    legalState: string;
    fuelMain: number;
    fuelReservoir: number;
    cargo: number;
    heading: number | null;
    latitude: number | null;
    longitude: number | null;
    altitude: number | null;
    destination: string;
  };
  /** Half-pips, 0..8 each. */
  pips: { sys: number; eng: number; wep: number };
  location: {
    system: string;
    address: number;
    pos: [number, number, number];
    body: string;
    station: string;
    economy: string;
    secondEconomy: string;
    government: string;
    allegiance: string;
    security: string;
    population: number;
  };
  route: { hops: RouteHop[]; fsdTarget: string; remainingJumps: number };
  target: {
    locked: boolean;
    ship: string;
    pilot: string;
    rank: string;
    faction: string;
    legalStatus: string;
    bounty: number;
    shield: number | null;
    hull: number | null;
    subsystem: string;
    subsystemHealth: number | null;
  };
  cargo: { items: CargoItem[]; count: number };
  market: { station: string; system: string; updatedAt: string; items: MarketItem[] };
  session: {
    startedAt: string;
    tradeProfit: number;
    tonsSold: number;
    tonsBought: number;
    sales: number;
  };
}

export function emptyFlags(): Flags {
  const flags = {} as Flags;
  for (const name of STATUS_FLAGS) flags[name] = false;
  for (const name of STATUS_FLAGS2) flags[name] = false;
  return flags;
}

export function initialState(): EdState {
  return {
    meta: { online: false, journal: '', gameVersion: '', odyssey: false, lastEventAt: '', parseErrors: 0 },
    commander: { name: '', fid: '', gameMode: '', credits: 0 },
    ship: { type: '', label: '', name: '', ident: '', cargoCapacity: 0, fuelCapacity: 0, maxJumpRange: 0, hullHealth: 1 },
    flags: emptyFlags(),
    status: {
      guiFocus: 0, fireGroup: 0, legalState: '', fuelMain: 0, fuelReservoir: 0, cargo: 0,
      heading: null, latitude: null, longitude: null, altitude: null, destination: '',
    },
    pips: { sys: 4, eng: 4, wep: 4 },
    location: {
      system: '', address: 0, pos: [0, 0, 0], body: '', station: '', economy: '', secondEconomy: '',
      government: '', allegiance: '', security: '', population: 0,
    },
    route: { hops: [], fsdTarget: '', remainingJumps: 0 },
    target: {
      locked: false, ship: '', pilot: '', rank: '', faction: '', legalStatus: '', bounty: 0,
      shield: null, hull: null, subsystem: '', subsystemHealth: null,
    },
    cargo: { items: [], count: 0 },
    market: { station: '', system: '', updatedAt: '', items: [] },
    session: { startedAt: '', tradeProfit: 0, tonsSold: 0, tonsBought: 0, sales: 0 },
  };
}

// --- Wire protocol (WebSocket, JSON) ---

export type ServerMessage =
  | { type: 'state'; state: EdState }
  | { type: 'commandResult'; id: string; ok: boolean; error?: string };

export type ClientMessage = { type: 'command'; id: string; command: string };
