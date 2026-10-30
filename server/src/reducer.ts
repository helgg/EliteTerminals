// Applies journal events and companion-file snapshots to the published state.
// Pure apart from mutating the `state` it is given; no I/O here.
import { STATUS_FLAGS, STATUS_FLAGS2, shipLabel, type EdState, type Flags } from '@et/shared';
import { applyCombat } from './combat.ts';
import { applyMining } from './mining.ts';
import { applyColony } from './colony/depots.ts';
import { applyCarrier } from './carrier/state.ts';

export type JournalEvent = { event: string; timestamp?: string; [key: string]: any };

export function decodeFlags(flags = 0, flags2 = 0): Flags {
  const out = {} as Flags;
  // `>>> 0` keeps bit 31 positive: Flags is an unsigned 32-bit value.
  STATUS_FLAGS.forEach((name, bit) => (out[name] = ((flags >>> bit) & 1) === 1));
  STATUS_FLAGS2.forEach((name, bit) => (out[name] = ((flags2 >>> bit) & 1) === 1));
  return out;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function applyEvent(state: EdState, e: JournalEvent): void {
  // Companion files can be older than the journal (e.g. a Market.json from a past session).
  if (e.timestamp && e.timestamp > state.meta.lastEventAt) state.meta.lastEventAt = e.timestamp;

  switch (e.event) {
    case 'Fileheader':
      state.meta.gameVersion = str(e.gameversion);
      state.meta.online = true;
      state.session = { startedAt: e.timestamp ?? '', tradeProfit: 0, tonsSold: 0, tonsBought: 0, sales: 0 };
      break;

    case 'Shutdown':
      state.meta.online = false;
      break;

    case 'Commander':
      state.commander.name = str(e.Name);
      state.commander.fid = str(e.FID);
      break;

    case 'LoadGame':
      state.meta.online = true;
      state.meta.odyssey = e.Odyssey === true;
      state.commander.name = str(e.Commander);
      state.commander.fid = str(e.FID);
      state.commander.gameMode = str(e.GameMode);
      state.commander.credits = e.Credits ?? state.commander.credits;
      state.ship.type = str(e.Ship);
      state.ship.label = shipLabel(str(e.Ship), str(e.Ship_Localised));
      state.ship.name = str(e.ShipName).trim();
      state.ship.ident = str(e.ShipIdent);
      state.ship.fuelCapacity = e.FuelCapacity ?? state.ship.fuelCapacity;
      state.status.fuelMain = e.FuelLevel ?? state.status.fuelMain;
      break;

    // A ship bought or swapped at the shipyard; its Loadout follows.
    case 'ShipyardSwap':
    case 'ShipyardNew':
      state.ship.type = str(e.ShipType);
      state.ship.label = shipLabel(str(e.ShipType), str(e.ShipType_Localised));
      break;

    case 'Loadout':
      // The ship flown now, whatever LoadGame said (ids differ in case: "PantherMkII" / "panthermkii").
      if (str(e.Ship).toLowerCase() !== state.ship.type.toLowerCase()) {
        state.ship.type = str(e.Ship);
        state.ship.label = shipLabel(str(e.Ship));
      }
      state.ship.name = str(e.ShipName).trim();
      state.ship.ident = str(e.ShipIdent);
      state.ship.cargoCapacity = e.CargoCapacity ?? 0;
      state.ship.fuelCapacity = e.FuelCapacity?.Main ?? state.ship.fuelCapacity;
      state.ship.maxJumpRange = e.MaxJumpRange ?? 0;
      state.ship.unladenMass = e.UnladenMass ?? 0;
      state.ship.hullHealth = e.HullHealth ?? 1;
      break;

    case 'Location':
    case 'FSDJump':
    case 'CarrierJump':
      if (e.event === 'CarrierJump') applyCarrier(state, e);
      setSystem(state, e);
      state.location.body = str(e.Body);
      state.location.station = e.Docked ? str(e.StationName) : '';
      state.location.stationType = e.Docked ? str(e.StationType) : '';
      if (e.event === 'FSDJump') {
        state.status.fuelMain = e.FuelLevel ?? state.status.fuelMain;
        state.ship.lastJump = { distance: e.JumpDist ?? 0, fuelUsed: e.FuelUsed ?? 0 };
        state.route.remainingJumps = Math.max(0, state.route.remainingJumps - 1);
      }
      break;

    case 'SupercruiseExit':
    case 'ApproachBody':
      state.location.body = str(e.Body);
      break;

    case 'Docked':
      state.location.station = str(e.StationName);
      state.location.stationType = str(e.StationType);
      break;

    case 'Undocked':
      state.location.station = '';
      state.location.stationType = '';
      break;

    case 'FSDTarget':
      state.route.fsdTarget = str(e.Name);
      state.route.fsdTargetAddress = e.SystemAddress ?? 0;
      if (typeof e.RemainingJumpsInRoute === 'number') state.route.remainingJumps = e.RemainingJumpsInRoute;
      break;

    case 'NavRoute':
      if (Array.isArray(e.Route)) {
        state.route.hops = e.Route.map((h: any) => ({
          system: str(h.StarSystem), address: h.SystemAddress ?? 0, starClass: str(h.StarClass),
          pos: h.StarPos ?? [0, 0, 0],
        }));
        state.route.remainingJumps = Math.max(0, state.route.hops.length - 1);
      }
      break;

    case 'NavRouteClear':
      state.route.hops = [];
      state.route.remainingJumps = 0;
      break;

    case 'ShipTargeted':
      applyTarget(state, e);
      break;

    case 'Cargo':
      if (e.Vessel && e.Vessel !== 'Ship') break; // SRV cargo is a separate hold
      if (Array.isArray(e.Inventory)) {
        state.cargo.items = e.Inventory.map((i: any) => ({
          name: str(i.Name), label: str(i.Name_Localised) || str(i.Name), count: i.Count ?? 0, stolen: i.Stolen ?? 0,
        }));
      }
      if (typeof e.Count === 'number') state.cargo.count = e.Count;
      break;

    case 'CargoTransfer':
      applyCarrier(state, e);
      break;

    case 'MarketBuy':
      applyCarrier(state, e);
      state.commander.credits -= e.TotalCost ?? 0;
      state.session.tonsBought += e.Count ?? 0;
      break;

    case 'MarketSell': {
      applyCarrier(state, e);
      const count = e.Count ?? 0;
      state.commander.credits += e.TotalSale ?? 0;
      state.session.tradeProfit += (e.TotalSale ?? 0) - (e.AvgPricePaid ?? 0) * count;
      state.session.tonsSold += count;
      state.session.sales += 1;
      break;
    }

    case 'CarrierBuy':
    case 'CarrierStats':
    case 'CarrierFinance':
    case 'CarrierBankTransfer':
    case 'CarrierDepositFuel':
    case 'CarrierLocation':
    case 'CarrierJumpRequest':
    case 'CarrierJumpCancelled':
      applyCarrier(state, e);
      break;

    case 'ColonisationConstructionDepot':
    case 'ColonisationContribution':
      applyColony(state, e);
      break;

    case 'Status':
      applyStatus(state, e);
      break;

    case 'Market':
      applyMarket(state, e);
      break;
  }
  applyCombat(state, e);
  applyMining(state, e);
}

function setSystem(state: EdState, e: JournalEvent) {
  const loc = state.location;
  loc.system = str(e.StarSystem);
  loc.address = e.SystemAddress ?? 0;
  loc.pos = e.StarPos ?? loc.pos;
  loc.economy = str(e.SystemEconomy_Localised) || str(e.SystemEconomy);
  loc.secondEconomy = str(e.SystemSecondEconomy_Localised) || str(e.SystemSecondEconomy);
  loc.government = str(e.SystemGovernment_Localised) || str(e.SystemGovernment);
  loc.allegiance = str(e.SystemAllegiance);
  loc.security = str(e.SystemSecurity_Localised) || str(e.SystemSecurity);
  loc.population = e.Population ?? 0;
  loc.controllingPower = str(e.ControllingPower);
  loc.powers = Array.isArray(e.Powers) ? e.Powers.map(String) : [];
  loc.powerState = str(e.PowerplayState);
  loc.faction = str(e.SystemFaction?.Name);
  loc.factionState = str(e.SystemFaction?.FactionState);
}

function applyTarget(state: EdState, e: JournalEvent) {
  const t = state.target;
  t.seq += 1;
  if (!e.TargetLocked) {
    state.target = { ...t, locked: false, ship: '', pilot: '', rank: '', faction: '', legalStatus: '',
      bounty: 0, shield: null, hull: null, subsystem: '', subsystemId: '', subsystemHealth: null, scanStage: 0 };
    return;
  }
  const ship = shipLabel(str(e.Ship), str(e.Ship_Localised));
  const pilot = str(e.PilotName_Localised) || str(e.PilotName);
  // A new lock (stage 0) or a different ship: forget what the previous lock told us.
  if (e.ScanStage === 0 || ship !== t.ship || (pilot && pilot !== t.pilot)) {
    Object.assign(t, { pilot: '', rank: '', faction: '', legalStatus: '', bounty: 0, shield: null, hull: null,
      subsystem: '', subsystemId: '', subsystemHealth: null, scanStage: 0 });
  }
  t.locked = true;
  t.ship = ship;
  t.scanStage = typeof e.ScanStage === 'number' ? e.ScanStage : t.scanStage;
  // Higher scan stages add fields; keep what earlier stages gave us for the same lock.
  if ('PilotName' in e) t.pilot = str(e.PilotName_Localised) || str(e.PilotName);
  if ('PilotRank' in e) t.rank = str(e.PilotRank);
  if ('Faction' in e) t.faction = str(e.Faction);
  if ('LegalStatus' in e) t.legalStatus = str(e.LegalStatus);
  if ('Bounty' in e) t.bounty = e.Bounty ?? 0;
  if ('ShieldHealth' in e) t.shield = e.ShieldHealth;
  if ('HullHealth' in e) t.hull = e.HullHealth;
  if ('Subsystem' in e) {
    t.subsystem = str(e.Subsystem_Localised) || str(e.Subsystem);
    t.subsystemId = str(e.Subsystem);
    t.subsystemHealth = e.SubsystemHealth ?? null;
  }
}

export function applyStatus(state: EdState, e: JournalEvent) {
  state.flags = decodeFlags(e.Flags ?? 0, e.Flags2 ?? 0);
  const s = state.status;
  if (Array.isArray(e.Pips)) {
    const [sys, eng, wep] = e.Pips;
    state.pips = { sys, eng, wep };
  }
  if (typeof e.FireGroup === 'number') s.fireGroup = e.FireGroup;
  if (typeof e.GuiFocus === 'number') s.guiFocus = e.GuiFocus;
  if (e.Fuel) {
    s.fuelMain = e.Fuel.FuelMain ?? s.fuelMain;
    s.fuelReservoir = e.Fuel.FuelReservoir ?? s.fuelReservoir;
  }
  if (typeof e.Cargo === 'number') {
    s.cargo = e.Cargo;
    state.cargo.count = e.Cargo;
  }
  s.legalState = str(e.LegalState) || s.legalState;
  s.heading = e.Heading ?? null;
  s.latitude = e.Latitude ?? null;
  s.longitude = e.Longitude ?? null;
  s.altitude = e.Altitude ?? null;
  s.planetRadius = typeof e.PlanetRadius === 'number' ? e.PlanetRadius : null;
  s.bodyName = str(e.BodyName);
  s.destination = str(e.Destination?.Name_Localised) || str(e.Destination?.Name);
  state.destination = e.Destination
    ? { system: e.Destination.System ?? 0, body: e.Destination.Body ?? 0, name: s.destination }
    : { system: 0, body: 0, name: '' };
  // Balance is the authoritative credit figure whenever the game provides it.
  if (typeof e.Balance === 'number') state.commander.credits = e.Balance;
}

export function applyMarket(state: EdState, e: JournalEvent) {
  if (!Array.isArray(e.Items)) return;
  state.market = {
    marketId: e.MarketID ?? 0,
    station: str(e.StationName),
    stationType: str(e.StationType),
    system: str(e.StarSystem),
    updatedAt: str(e.timestamp),
    items: e.Items.map((i: any) => ({
      name: str(i.Name),
      label: str(i.Name_Localised) || str(i.Name),
      category: str(i.Category_Localised) || str(i.Category),
      buy: i.BuyPrice ?? 0,
      sell: i.SellPrice ?? 0,
      meanPrice: i.MeanPrice ?? 0,
      stock: i.Stock ?? 0,
      demand: i.Demand ?? 0,
      stockBracket: typeof i.StockBracket === 'number' ? i.StockBracket : 0,
      demandBracket: typeof i.DemandBracket === 'number' ? i.DemandBracket : 0,
    })),
  };
}
