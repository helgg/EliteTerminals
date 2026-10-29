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
  /** The game's supply/demand level: 0 none, 1 low, 2 medium, 3 high. */
  stockBracket: number;
  demandBracket: number;
}

/** One station's market as the player last saw it docked there (Market.json). */
export interface MarketSnapshot {
  marketId: number;
  station: string;
  stationType: string;
  system: string;
  updatedAt: string;
  items: MarketItem[];
}

export interface RouteHop {
  system: string;
  address: number;
  starClass: string;
  pos: [number, number, number];
}

/** Galaxy data for one system, from Spansh (public API) plus the journal for the current system. */
export interface SystemInfo {
  id64: number;
  name: string;
  security: string;
  allegiance: string;
  government: string;
  economy: string;
  population: number;
  controllingPower: string;
  powers: string[];
  powerState: string;
  faction: string;
  factionState: string;
  needsPermit: boolean;
  primaryStar: string;
  updatedAt: string;
}

export interface BodyInfo {
  name: string;
  type: string;
  subType: string;
  distance: number;
  mainStar: boolean;
  terraforming: string;
}

export interface StationInfo {
  name: string;
  type: string;
  distance: number;
  pads: { s: number; m: number; l: number };
  services: string[];
  body: string;
}

export interface SystemDetail extends SystemInfo {
  bodies: BodyInfo[];
  stations: StationInfo[];
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
    /** Loadout's MaxJumpRange: empty hold, only the fuel for one jump. */
    maxJumpRange: number;
    unladenMass: number;
    hullHealth: number;
    lastJump: { distance: number; fuelUsed: number };
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
    /** Radius of the body under the ship, in metres (Status.json, Odyssey); null away from a body. */
    planetRadius: number | null;
    /** Body the latitude/longitude refer to (Status.json BodyName). */
    bodyName: string;
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
    controllingPower: string;
    powers: string[];
    powerState: string;
    faction: string;
    factionState: string;
    stationType: string;
  };
  /** What the player has selected as destination (Status.json): a system, or a body/station in this one. */
  destination: { system: number; body: number; name: string };
  route: { hops: RouteHop[]; fsdTarget: string; fsdTargetAddress: number; remainingJumps: number };
  /** Spansh lookups: summaries for route/target systems, full detail for the current and target system. */
  /** Local price database and the live EDDN feed. */
  prices: {
    live: boolean;
    /** Markets stored from EDDN since the server started. */
    heard: number;
    lastAt: string;
    /** Markets with prices in the local database. */
    stored: number;
  };
  /** The picked trade route, priced again as new prices arrive; null when none is watched. */
  tradeWatch: WatchState | null;
  /** Systems (or stations) the player saved here, newest first: the game keeps its own bookmarks on Frontier's servers. */
  favorites: Favorite[];
  /** Routes pinned on the TRADE screen, newest first. */
  tradePins: TradePin[];
  galaxy: {
    systems: Record<string, SystemInfo>;
    current: SystemDetail | null;
    target: SystemDetail | null;
    /** The body targeted in this system, from Spansh's body endpoint: ring types ("Icy"…), empty when none. */
    targetBody: { system: number; body: number; rings: string[] } | null;
  };
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
    /** The game's internal subsystem id ("$int_powerplant_size8_class5_name;"), stable across languages. */
    subsystemId: string;
    subsystemHealth: number | null;
    /** 0 = ship type only, 1 = pilot and rank, 2 = shield/hull, 3 = faction, legal status, bounty, subsystem. */
    scanStage: number;
    /** Counts ShipTargeted events: tells a macro the game answered, even when it reported the same ship again. */
    seq: number;
  };
  combat: CombatState;
  /** The console's macros, shared by every screen open on the panel. */
  macros: MacroState;
  mining: MiningState;
  cargo: { items: CargoItem[]; count: number };
  market: MarketSnapshot;
  /** Player's active control presets and the keyboard key behind each bindable action. */
  controls: { presets: string[]; keys: Record<string, string> };
  session: {
    startedAt: string;
    tradeProfit: number;
    tonsSold: number;
    tonsBought: number;
    sales: number;
  };
}

/** A ship the player scanned in the current instance (cleared on every instance change). */
export interface Contact {
  ship: string;
  pilot: string;
  rank: string;
  /** "Wanted", "Clean"… from ShipTargeted scan stage 3; "" until then. */
  legalStatus: string;
  bounty: number;
  faction: string;
  seenAt: string;
}

/** A massacre mission: kill `killCount` ships of `targetFaction`, reported by the journal. */
export interface MassacreMission {
  id: number;
  /** Faction that gave the mission; kills count once per giving faction (missions stack). */
  faction: string;
  targetFaction: string;
  killCount: number;
  kills: number;
  reward: number;
  expiry: string;
  /** MissionRedirected: every kill is in, go back to the giver. */
  done: boolean;
}

export interface MacroState {
  /** AUTO NEXT: after each kill, one screen locks the best target. */
  autoNext: boolean;
  /** Macro running on some screen now, '' when none. */
  running: string;
  /** How the last target search ended ("nothing in range"…), '' when it found one. */
  note: string;
  /** The macro that note is about. */
  noteFor: string;
  /** Last fighter order the game accepted, from any screen: the journal never reports orders. */
  order: string;
  /** Last throttle detent the game accepted (SetSpeed…); the journal never reports throttle position. */
  throttle: string;
  /** Contacts (keyOf) the last lap of the targets did not find: out of sensor range, or dead. */
  absent: string[];
  /** Contact being locked from the list, for its row to show it. */
  locking: string;
  /** The route being plotted from the favourites: where to, how far it got, and why it stopped. */
  plot: { system: string; stage: string; error: string };
}

/** What a screen may change in MacroState for every other one. */
export type SharedMacros = Partial<Pick<MacroState, 'absent' | 'locking' | 'plot'>>;

export interface CombatState {
  contacts: Contact[];
  missions: MassacreMission[];
  fighter: 'none' | 'docked' | 'out' | 'destroyed';
  /** Ammo of the ship's consumables from Loadout (the journal does not report their use). */
  heatSinks: number;
  shieldCells: number;
  chaff: number;
  rebuy: number;
  session: {
    bounties: number;
    bonds: number;
    kills: number;
    /** Bounties and bonds earned this session and not redeemed yet. */
    unredeemed: number;
    firstKillAt: string;
    lastKillAt: string;
  };
}

/** One asteroid read by a prospector limpet (ProspectedAsteroid). */
export interface Prospect {
  at: string;
  /** Proportions in %, biggest first. `name` is the game's internal name ("LowTemperatureDiamond"). */
  materials: { name: string; label: string; pct: number }[];
  /** Material content: 'High' | 'Medium' | 'Low', '' when the game gave none. */
  content: string;
  /** % of the asteroid left to mine (100 = untouched). */
  remaining: number;
  /** Core of a motherlode asteroid (crack it with seismic charges), '' when none. */
  motherlode: string;
  /** Where the ship was when the limpet reported, when the game gave a position (near a body). */
  pos: GeoPoint | null;
}

/** A place on (or above) a body: degrees, metres above the surface. */
export interface GeoPoint {
  lat: number;
  lon: number;
  alt: number;
}

export interface RingSignal {
  name: string;
  count: number;
}

/** A planetary ring of the current system, with its hotspots. */
export interface RingInfo {
  /** "Borann A 2 A Ring". */
  name: string;
  /** Parent body, "Borann A 2". */
  body: string;
  /** "Icy", "Metal Rich", "Metallic", "Rocky". */
  type: string;
  /** "Pristine", "Major", "Common", "Low", "Depleted"; '' when unknown. */
  reserve: string;
  /** Distance of the parent body from the arrival star, in ls. */
  ls: number;
  signals: RingSignal[];
  /** Hotspots from the player's own surface scan (SAASignalsFound), not from Spansh. */
  own: boolean;
}

/** A ring with hotspots of one commodity near the player (Spansh's body search). */
export interface HotspotMatch {
  system: string;
  body: string;
  ring: string;
  type: string;
  reserve: string;
  /** From the player, in ly. */
  distance: number;
  ls: number;
  /** Hotspots of the commodity asked for in that ring. */
  count: number;
  /** Every hotspot of the ring. */
  signals: RingSignal[];
}

/** Mining tools fitted (Loadout); the journal does not report when they fire. */
export interface MiningTools {
  lasers: number;
  abrasion: number;
  seismic: number;
  subsurface: number;
  /** Pulse wave analyser. */
  pulseWave: boolean;
  prospector: boolean;
  collector: boolean;
  refinery: boolean;
}

export interface MiningState {
  /** Newest first, at most 30. */
  prospects: Prospect[];
  tools: MiningTools;
  /** The current system's rings (Spansh, overridden by the player's own scans); null while unknown. */
  rings: RingInfo[] | null;
  /** Hotspots the player's own scans found, by ring name. */
  scanned: Record<string, RingSignal[]>;
  /** Where the ship (or SRV) has been around the current body, for the radar; live only (Status.json). */
  trail: { body: string; radius: number; points: GeoPoint[] };
  session: {
    prospected: number;
    /** Tons refined per commodity, most first. */
    refined: { name: string; label: string; count: number }[];
    cracked: number;
    /** Limpets launched, by type. */
    prospectors: number;
    collectors: number;
    firstRefinedAt: string;
    lastRefinedAt: string;
  };
}

/** Display names for ship ids whose journal events often come without a `_Localised` name. */
const SHIP_NAMES: Record<string, string> = {
  adder: 'Adder', anaconda: 'Anaconda', asp: 'Asp Explorer', asp_scout: 'Asp Scout', belugaliner: 'Beluga Liner',
  cobramkiii: 'Cobra Mk III', cobramkiv: 'Cobra Mk IV', cobramkv: 'Cobra Mk V', corsair: 'Corsair',
  cutter: 'Imperial Cutter', diamondback: 'Diamondback Scout', diamondbackxl: 'Diamondback Explorer',
  dolphin: 'Dolphin', eagle: 'Eagle', empire_courier: 'Imperial Courier', empire_eagle: 'Imperial Eagle',
  empire_trader: 'Imperial Clipper', federation_corvette: 'Federal Corvette',
  federation_dropship: 'Federal Dropship', federation_dropship_mkii: 'Federal Assault Ship',
  federation_gunship: 'Federal Gunship', ferdelance: 'Fer-de-Lance', hauler: 'Hauler',
  independant_trader: 'Keelback', krait_light: 'Krait Phantom', krait_mkii: 'Krait Mk II', mamba: 'Mamba',
  mandalay: 'Mandalay', orca: 'Orca', panthermkii: 'Panther Clipper Mk II', python: 'Python',
  python_nx: 'Python Mk II', sidewinder: 'Sidewinder', type6: 'Type-6 Transporter', type7: 'Type-7 Transporter',
  type8: 'Type-8 Transporter', type9: 'Type-9 Heavy', type9_military: 'Type-10 Defender',
  typex: 'Alliance Chieftain', typex_2: 'Alliance Crusader', typex_3: 'Alliance Challenger', viper: 'Viper Mk III',
  viper_mkiv: 'Viper Mk IV', vulture: 'Vulture',
};

/** A ship's display name: the game's localised one when given, else from its id. */
export function shipLabel(id: string, localised = ''): string {
  return localised || SHIP_NAMES[id.toLowerCase()] || id;
}

export function initialCombat(): CombatState {
  return {
    contacts: [], missions: [], fighter: 'none', heatSinks: 0, shieldCells: 0, chaff: 0, rebuy: 0,
    session: { bounties: 0, bonds: 0, kills: 0, unredeemed: 0, firstKillAt: '', lastKillAt: '' },
  };
}

export function initialMining(): MiningState {
  return {
    prospects: [],
    tools: { lasers: 0, abrasion: 0, seismic: 0, subsurface: 0, pulseWave: false, prospector: false, collector: false, refinery: false },
    rings: null,
    scanned: {},
    trail: { body: '', radius: 0, points: [] },
    session: { prospected: 0, refined: [], cracked: 0, prospectors: 0, collectors: 0, firstRefinedAt: '', lastRefinedAt: '' },
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
    ship: { type: '', label: '', name: '', ident: '', cargoCapacity: 0, fuelCapacity: 0, maxJumpRange: 0, unladenMass: 0, hullHealth: 1, lastJump: { distance: 0, fuelUsed: 0 } },
    flags: emptyFlags(),
    status: {
      guiFocus: 0, fireGroup: 0, legalState: '', fuelMain: 0, fuelReservoir: 0, cargo: 0,
      heading: null, latitude: null, longitude: null, altitude: null, planetRadius: null, bodyName: '', destination: '',
    },
    pips: { sys: 4, eng: 4, wep: 4 },
    location: {
      system: '', address: 0, pos: [0, 0, 0], body: '', station: '', economy: '', secondEconomy: '',
      government: '', allegiance: '', security: '', population: 0,
      controllingPower: '', powers: [], powerState: '', faction: '', factionState: '', stationType: '',
    },
    destination: { system: 0, body: 0, name: '' },
    route: { hops: [], fsdTarget: '', fsdTargetAddress: 0, remainingJumps: 0 },
    prices: { live: false, heard: 0, lastAt: '', stored: 0 },
    tradeWatch: null,
    favorites: [],
    tradePins: [],
    galaxy: { systems: {}, current: null, target: null, targetBody: null },
    target: {
      locked: false, ship: '', pilot: '', rank: '', faction: '', legalStatus: '', bounty: 0,
      shield: null, hull: null, subsystem: '', subsystemId: '', subsystemHealth: null, scanStage: 0, seq: 0,
    },
    combat: initialCombat(),
    macros: {
      autoNext: false, running: '', note: '', noteFor: '', order: '', throttle: '', absent: [], locking: '',
      plot: { system: '', stage: '', error: '' },
    },
    mining: initialMining(),
    cargo: { items: [], count: 0 },
    market: { marketId: 0, station: '', stationType: '', system: '', updatedAt: '', items: [] },
    controls: { presets: [], keys: {} },
    session: { startedAt: '', tradeProfit: 0, tonsSold: 0, tonsBought: 0, sales: 0 },
  };
}

// --- Trade (M3) ---

export interface TradeMarket {
  marketId: number;
  station: string;
  system: string;
  systemId64: number;
  pos: [number, number, number];
  /** Distance from the system's arrival star, in light-seconds. */
  ls: number;
  type: string;
  planetary: boolean;
  pads: { s: number; m: number; l: number };
  /** State of the station's controlling faction ("Boom", "Expansion"…); "" when unknown. */
  state: string;
  updatedAt: string;
  /** "spansh", "eddn" (live network feed) or "local" (the player's own Market.json, which is fresher). */
  source: 'spansh' | 'eddn' | 'local';
  items: {
    name: string; buy: number; sell: number; supply: number; demand: number;
    /** Game brackets (1 low … 3 high), only known for markets the player docked at. */
    supplyBracket?: number; demandBracket?: number;
  }[];
}

/** A system offered by the trade reference picker. */
export interface Favorite {
  id: string;
  system: string;
  /** A station in that system, or '' for the system itself. The route always goes to the system. */
  station: string;
  stationType: string;
  /** Galactic coordinates when known, for the distance. */
  pos: [number, number, number] | null;
  addedAt: string;
}

export interface SystemMatch {
  name: string;
  pos: [number, number, number];
  /** From the player, in ly. */
  distance: number;
}

export interface TradeQuery {
  /** Scan around this system instead of the current one; '' or absent = the current system. */
  reference?: string;
  radius: number;
  /** Max price age in hours; 0 = any. */
  maxAgeH: number;
  pad: 'S' | 'M' | 'L';
  planetary: boolean;
  carriers: boolean;
  /** Only routes that start at the current station / system (export from here). */
  exportHere: boolean;
  /** Only routes that end at the current station / system (import to here). Both on = either. */
  importHere: boolean;
  /** Faction states wanted at either end ("Boom"…); empty = any. */
  states: string[];
  /** Legs of a linear route (stops = hops + 1, at most 5 stops). */
  hops: number;
  maxLs: number;
  /** Minimum stock at the buying station, in t; 0 = any. */
  minSupply: number;
  /** Minimum demand at the selling station, in t; 0 = any. */
  minDemand: number;
  cargo: number;
  capital: number;
  jumpRange: number;
}

export interface TradeEnd {
  marketId: number;
  station: string;
  system: string;
  ls: number;
  type: string;
  pad: string;
  planetary: boolean;
  state: string;
  /** Distance from the player, in ly. */
  fromMe: number;
  ageH: number;
  /** Prices from the player's own Market.json (what the game showed), not from Spansh. */
  live?: boolean;
}

/** An address of this PC where other devices can open the panel, with its QR code (SVG markup). */
export interface PanelAddress {
  url: string;
  /** Network adapter name, e.g. "Ethernet" or "Wi-Fi". */
  name: string;
  /** The adapter the PC routes through: the one phones on the same Wi-Fi can reach. */
  primary: boolean;
  /** VirtualBox, WSL, Hyper-V...: not reachable from other devices. */
  virtual: boolean;
  svg: string;
}

/** One commodity of a cargo load. */
export interface LegItem {
  commodity: string;
  buy: number;
  sell: number;
  /** Per ton. */
  profit: number;
  amount: number;
  supply: number;
  demand: number;
  /** 1 low, 2 medium, 3 high: the game's bracket when known, otherwise estimated against nearby markets. */
  supplyLevel: number;
  demandLevel: number;
  /** True when the level is the game's own bracket (from the player's Market.json). */
  supplyExact: boolean;
  demandExact: boolean;
}

/** A full cargo load from A to B: the hold filled with the most profitable mix of commodities. */
export interface TradeLeg {
  /** Commodity bringing the most profit (the label shown in tables). */
  commodity: string;
  /** The load, most profitable part first. */
  items: LegItem[];
  /** Tons carried. */
  amount: number;
  /** Credits spent buying the load. */
  cost: number;
  total: number;
  /** Average profit per ton. */
  profit: number;
  /** Stock and demand of the main commodity. */
  supply: number;
  demand: number;
}

export interface TradeRoute {
  id: string;
  src: TradeEnd;
  dst: TradeEnd;
  hopLy: number;
  jumps: number;
  leg: TradeLeg;
  /** Best cargo for the way back, when the pair is worth running as a loop. */
  back: TradeLeg | null;
  pct: number;
  /** Estimated seconds for one leg (jumps + supercruise + docking). */
  legSeconds: number;
  perHour: number;
  loopPerHour: number;
}

/** A one-way chain A→B→C…: at each stop sell everything and buy the best load for the next one. */
export interface TradeChain {
  id: string;
  /** Consecutive legs; legs[i].dst is legs[i+1].src. `back` and `loopPerHour` are unused. */
  legs: TradeRoute[];
  total: number;
  seconds: number;
  perHour: number;
}

/**
 * A route pinned on the TRADE screen, followed across scans: it keeps the figures of the last scan that found it
 * (`seenAt`), so it still shows when a new scan leaves it out.
 */
export interface TradePin {
  /** The route or chain id (market ids joined): the same route gets the same id in every scan. */
  id: string;
  kind: 'loop' | 'linear';
  pinnedAt: string;
  seenAt: string;
  route?: TradeRoute;
  chain?: TradeChain;
}

/** The route the player picked, sent by the panel so the server can watch its markets. */
export interface TradeWatch {
  /** The route or chain id. */
  id: string;
  legs: {
    src: number;
    dst: number;
    srcName: string;
    dstName: string;
    items: { commodity: string; buy: number; sell: number; amount: number }[];
  }[];
}

/** Something that cut a watched route's profit since it was picked. */
export interface WatchAlert {
  legIndex: number;
  commodity: string;
  /** profit: profit per ton fell; supply/demand: fewer tons than the load; gone: no longer traded there. */
  kind: 'profit' | 'supply' | 'demand' | 'gone';
  /** The station whose numbers changed. */
  where: 'src' | 'dst';
  src: string;
  dst: string;
  was: number;
  now: number;
}

export interface WatchState {
  id: string;
  /** Credits per run when the route was picked, and with the prices known now. */
  profitWas: number;
  profitNow: number;
  alerts: WatchAlert[];
  /** Time of the newest prices the check used. */
  checkedAt: string;
}

/** Where to sell what the player mined: the best stations near the player, per commodity in the hold. */
export interface MiningSellQuery {
  names: string[];
  radius: number;
  maxAgeH: number;
  pad: 'S' | 'M' | 'L';
  planetary: boolean;
  carriers: boolean;
}

export interface CommodityQuote {
  commodity: string;
  price: number;
  /** Stock when buying, demand when selling. */
  volume: number;
  end: TradeEnd;
}

export interface TradeResult {
  query: TradeQuery;
  reference: string;
  stations: number;
  fetchedAt: string;
  /** Loop routes: A→B with the best load back B→A. */
  routes: TradeRoute[];
  /** Linear routes: chains of `query.hops` legs. */
  chains: TradeChain[];
  /** Faction states seen in the scanned markets, for the filter. */
  states: string[];
  /** Every commodity traded in the scanned markets, for the commodity finder. */
  commodities: string[];
}

// --- Wire protocol (WebSocket, JSON) ---

export type ServerMessage =
  | { type: 'state'; state: EdState }
  | { type: 'commandResult'; id: string; ok: boolean; error?: string }
  | { type: 'tradeProgress'; loaded: number; total: number; done: boolean; error?: string }
  /** Runs a macro on this screen (AUTO NEXT after a kill goes to one screen only). */
  | { type: 'runMacro'; macro: string }
  /** Stops the macro running on this screen: another one asked. */
  | { type: 'stopMacro' };

export type ClientMessage =
  | { type: 'command'; id: string; command: string }
  /** Puts the text on the PC's clipboard and presses Ctrl+V in the game (galaxy map search). */
  | { type: 'paste'; id: string; text: string }
  | { type: 'autoNext'; on: boolean }
  /** This screen started or ended a macro. */
  | { type: 'macro'; running: string; note?: string; noteFor?: string }
  /** Stop the macro running on whichever screen runs it. */
  | { type: 'stopMacro' }
  /** Macro progress every screen shows (contacts gone, the one being locked, the route being plotted). */
  | { type: 'share'; patch: SharedMacros };
