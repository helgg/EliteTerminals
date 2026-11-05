// Sharing what the player sees with the EDDN network (the Elite Dangerous Data Network), so the markets and
// systems other tools show stay fresh. OFF until the player turns it on; never sends anything old (journal replay),
// never sends anything personal. The message shapes follow the public EDDN schemas (EDCD/EDDN, live branch):
// commodity/3, outfitting/2, shipyard/2, journal/1, fssdiscoveryscan/1, fssallbodiesfound/1, fssbodysignals/1,
// navbeaconscan/1, scanbarycentre/1.
import { EventEmitter } from 'node:events';
import { readFileSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const UPLOAD_URL = 'https://eddn.edcd.io:4430/upload/';
export const SOFTWARE_NAME = 'EliteTerminals';
/** EDDN asks for a new version number whenever what is sent changes: bump it with any change below. */
export const SOFTWARE_VERSION = '0.1.1';
const SCHEMAS = 'https://eddn.edcd.io/schemas/';

/** Events older than this are history (a replayed journal), not news. */
const FRESH_MS = 15 * 60e3;
const RETRY_MS = 60e3; // EDDN: wait at least a minute before sending a failed message again
const MAX_TRIES = 5;
const QUEUE_MAX = 500;
const SAME_MARKET_MS = 12 * 3600e3;

type Obj = Record<string, any>;
export interface Outgoing {
  /** Schema name and version, e.g. `commodity/3`. */
  schema: string;
  message: Obj;
}

/** What the sender knows about the session so far (all from the player's own journal). */
export interface UploadContext {
  gameVersion: string;
  gameBuild: string;
  /** Alpha/Beta journals go to the `/test` schemas only. */
  beta: boolean;
  commander: string;
  horizons?: boolean;
  odyssey?: boolean;
  /** The last Location / FSDJump / CarrierJump: what the other events are cross-checked against. */
  system: { name: string; address: number; pos: [number, number, number] } | null;
}

export const newContext = (): UploadContext => ({
  gameVersion: '', gameBuild: '', beta: false, commander: '', system: null,
});

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isPos = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Keeps the context in step with the journal: call for every event, old ones included. */
export function observe(ctx: UploadContext, e: Obj): void {
  switch (e.event) {
    case 'Fileheader':
      ctx.gameVersion = str(e.gameversion);
      ctx.gameBuild = str(e.build);
      ctx.horizons = undefined;
      ctx.odyssey = undefined;
      ctx.system = null;
      break;
    case 'Commander':
      ctx.commander = str(e.Name) || ctx.commander;
      break;
    case 'LoadGame':
      ctx.commander = str(e.Commander) || ctx.commander;
      // only LoadGame says what the player owns; a missing key stays unknown (never guessed)
      ctx.horizons = typeof e.Horizons === 'boolean' ? e.Horizons : undefined;
      ctx.odyssey = typeof e.Odyssey === 'boolean' ? e.Odyssey : undefined;
      if (str(e.gameversion)) ctx.gameVersion = str(e.gameversion);
      if (str(e.build)) ctx.gameBuild = str(e.build);
      break;
    case 'Location':
    case 'FSDJump':
    case 'CarrierJump':
      if (str(e.StarSystem) && isInt(e.SystemAddress) && isPos(e.StarPos)) {
        ctx.system = { name: e.StarSystem, address: e.SystemAddress, pos: e.StarPos };
      }
      break;
  }
}

/** Only the live game's data goes to the live schemas, and only from the current game (4.x). */
export const canSend = (ctx: UploadContext) => ctx.commander !== '' && /^4\./.test(ctx.gameVersion);

/** The system the event says it happened in must be the one the journal put the player in; otherwise drop it. */
function locate(ctx: UploadContext, name: unknown, address: unknown) {
  const s = ctx.system;
  if (!s) return null;
  const hasName = typeof name === 'string' && name !== '';
  const hasAddress = isInt(address);
  if (!hasName && !hasAddress) return null;
  if (hasName && name !== s.name) return null;
  if (hasAddress && address !== s.address) return null;
  return s;
}

/** A copy without any `_Localised` key at any depth (they would name the player's language, not the game's data). */
export function stripLocalised<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripLocalised) as T;
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, val] of Object.entries(v)) if (!k.endsWith('_Localised')) out[k] = stripLocalised(val);
    return out as T;
  }
  return v;
}

const pick = (src: Obj, keys: string[]) => {
  const out: Obj = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
};

function withFlags(ctx: UploadContext, msg: Obj): Obj {
  if (ctx.horizons !== undefined) msg.horizons = ctx.horizons;
  if (ctx.odyssey !== undefined) msg.odyssey = ctx.odyssey;
  return msg;
}

// ---- journal/1: the events the schema lists (CodexEntry has its own schema and is not sent) ----

export const JOURNAL_EVENTS = new Set(['Docked', 'FSDJump', 'Scan', 'Location', 'SAASignalsFound', 'CarrierJump']);
/** Keys that are about the player, not the game; the schema forbids them. */
const PERSONAL = [
  'ActiveFine', 'CockpitBreach', 'BoostUsed', 'FuelLevel', 'FuelUsed', 'JumpDist', 'Latitude', 'Longitude', 'Wanted',
  'IsNewEntry', 'NewTraitsDiscovered', 'Traits', 'VoucherAmount',
];
const PERSONAL_FACTION = ['HappiestSystem', 'HomeSystem', 'MyReputation', 'SquadronFaction'];
const JUMPS = new Set(['FSDJump', 'Location', 'CarrierJump']);

export function fromJournalEvent(ctx: UploadContext, e: Obj): Outgoing[] {
  const ev = str(e.event);
  if (JOURNAL_EVENTS.has(ev) && typeof e.timestamp === 'string') {
    const msg = stripLocalised(e);
    for (const k of PERSONAL) delete msg[k];
    if (Array.isArray(msg.Factions)) {
      msg.Factions = msg.Factions.map((f: Obj) => {
        if (!isObj(f)) return f;
        for (const k of PERSONAL_FACTION) delete f[k];
        return f;
      });
    }
    if (JUMPS.has(ev)) {
      // these events say where the player is
      if (!str(msg.StarSystem) || !isInt(msg.SystemAddress) || !isPos(msg.StarPos)) return [];
    } else {
      const at = locate(ctx, msg.StarSystem, msg.SystemAddress);
      if (!at) return [];
      msg.StarSystem = at.name;
      msg.SystemAddress = at.address;
      msg.StarPos = at.pos;
    }
    return [{ schema: 'journal/1', message: withFlags(ctx, msg) }];
  }
  const out = fromExplorationEvent(ctx, e);
  return out ? [out] : [];
}

// ---- one schema per exploration event; each lists exactly the keys it allows ----

function fromExplorationEvent(ctx: UploadContext, e: Obj): Outgoing | null {
  const base = { timestamp: e.timestamp, event: e.event };
  if (typeof e.timestamp !== 'string') return null;
  switch (e.event) {
    case 'FSSDiscoveryScan': {
      const at = locate(ctx, e.SystemName, e.SystemAddress);
      if (!at || !isInt(e.BodyCount) || !isInt(e.NonBodyCount)) return null;
      return {
        schema: 'fssdiscoveryscan/1',
        message: withFlags(ctx, {
          ...base, SystemName: at.name, StarPos: at.pos, SystemAddress: at.address, BodyCount: e.BodyCount, NonBodyCount: e.NonBodyCount,
        }),
      };
    }
    case 'FSSAllBodiesFound': {
      const at = locate(ctx, e.SystemName, e.SystemAddress);
      if (!at || !isInt(e.Count)) return null;
      return {
        schema: 'fssallbodiesfound/1',
        message: withFlags(ctx, { ...base, SystemName: at.name, StarPos: at.pos, SystemAddress: at.address, Count: e.Count }),
      };
    }
    case 'FSSBodySignals': {
      const at = locate(ctx, undefined, e.SystemAddress);
      if (!at || !isInt(e.BodyID) || !Array.isArray(e.Signals)) return null;
      const signals = e.Signals.filter((s: unknown) => isObj(s) && str(s.Type) && isInt(s.Count)).map((s: Obj) => ({ Type: s.Type, Count: s.Count }));
      if (!signals.length) return null;
      const msg: Obj = {
        ...base, StarSystem: at.name, StarPos: at.pos, SystemAddress: at.address, BodyID: e.BodyID, Signals: signals,
      };
      if (str(e.BodyName)) msg.BodyName = e.BodyName;
      return { schema: 'fssbodysignals/1', message: withFlags(ctx, msg) };
    }
    case 'NavBeaconScan': {
      const at = locate(ctx, undefined, e.SystemAddress);
      if (!at || !isInt(e.NumBodies)) return null;
      return {
        schema: 'navbeaconscan/1',
        message: withFlags(ctx, { ...base, StarSystem: at.name, StarPos: at.pos, SystemAddress: at.address, NumBodies: e.NumBodies }),
      };
    }
    case 'ScanBaryCentre': {
      const at = locate(ctx, e.StarSystem, e.SystemAddress);
      if (!at || !isInt(e.BodyID)) return null;
      const orbit = pick(e, [
        'SemiMajorAxis', 'Eccentricity', 'OrbitalInclination', 'Periapsis', 'OrbitalPeriod', 'AscendingNode', 'MeanAnomaly',
      ]);
      for (const v of Object.values(orbit)) if (typeof v !== 'number') return null;
      return {
        schema: 'scanbarycentre/1',
        message: withFlags(ctx, { ...base, StarSystem: at.name, StarPos: at.pos, SystemAddress: at.address, BodyID: e.BodyID, ...orbit }),
      };
    }
  }
  return null;
}

// ---- stations: the files the game writes when a services screen opens ----

const hasStation = (f: Obj) => isInt(f.MarketID) && str(f.StationName) && str(f.StarSystem) && str(f.timestamp);

/** Market.json → commodity/3. */
export function fromMarketFile(ctx: UploadContext, f: Obj): Outgoing | null {
  if (!isObj(f) || !hasStation(f) || !Array.isArray(f.Items) || !locate(ctx, f.StarSystem, undefined)) return null;
  const commodities: Obj[] = [];
  for (const it of f.Items) {
    if (!isObj(it) || !str(it.Name)) continue;
    // limpets and the like are not for sale at the station's market
    if (/nonmarketable/i.test(str(it.Category))) continue;
    const num = ['MeanPrice', 'BuyPrice', 'Stock', 'SellPrice', 'Demand'].every((k) => isInt(it[k]));
    const bracket = (v: unknown) => v === 0 || v === 1 || v === 2 || v === 3 || v === '';
    if (!num || !bracket(it.StockBracket) || !bracket(it.DemandBracket)) continue;
    const row: Obj = {
      name: str(it.Name).replace(/^\$/, '').replace(/_name;$/i, ''),
      meanPrice: it.MeanPrice, buyPrice: it.BuyPrice, stock: it.Stock, stockBracket: it.StockBracket,
      sellPrice: it.SellPrice, demand: it.Demand, demandBracket: it.DemandBracket,
    };
    const flags = (['Consumer', 'Producer', 'Rare'] as const).filter((k) => it[k] === true);
    if (flags.length) row.statusFlags = flags;
    commodities.push(row);
  }
  if (!commodities.length) return null;
  // StationType is left out on purpose: the schema's README asks senders to remove it
  const msg: Obj = { systemName: f.StarSystem, stationName: f.StationName, marketId: f.MarketID, timestamp: f.timestamp, commodities };
  if (str(f.CarrierDockingAccess)) msg.carrierDockingAccess = f.CarrierDockingAccess;
  return { schema: 'commodity/3', message: withFlags(ctx, msg) };
}

const MODULE_RE = /^Hpt_|^hpt_|^Int_|^int_|_Armour_|_armour_/;
/** The game's own spelling of the prefix, as the schema's examples show. */
const capitalise = (name: string) => name.replace(MODULE_RE, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());

/** Outfitting.json → outfitting/2 (names only, and only what the station sells to anyone). */
export function fromOutfittingFile(ctx: UploadContext, f: Obj): Outgoing | null {
  if (!isObj(f) || !hasStation(f) || !Array.isArray(f.Items) || !locate(ctx, f.StarSystem, undefined)) return null;
  // items tied to the Cmdr (PowerPlay, tech broker) carry a sku: the schema's README says to drop them, except the landing one
  const forAll = (i: unknown) => isObj(i) && (i.sku == null || i.sku === 'ELITE_HORIZONS_V_PLANETARY_LANDINGS');
  const names = f.Items.map((i: unknown) => (isObj(i) && forAll(i) ? str(i.Name) : ''))
    .filter((n: string) => MODULE_RE.test(n) && n.toLowerCase() !== 'int_planetapproachsuite')
    .map(capitalise);
  const modules = [...new Set(names)].sort();
  if (!modules.length) return null;
  const msg = { systemName: f.StarSystem, stationName: f.StationName, marketId: f.MarketID, timestamp: f.timestamp, modules };
  return { schema: 'outfitting/2', message: withFlags(ctx, msg) };
}

/** The game's ship identifiers (from the community's FDevIDs table), keyed by lower case as the journal writes them. */
const SHIP_SYMBOLS = (
  'SideWinder Eagle Hauler Adder Viper CobraMkIII Type6 Dolphin Type7 Asp Vulture Empire_Trader Federation_Dropship Orca Type9 ' +
  'Python BelugaLiner FerDeLance Anaconda Federation_Corvette Cutter DiamondBack Empire_Courier DiamondBackXL Empire_Eagle ' +
  'Federation_Dropship_MkII Federation_Gunship Viper_MkIV CobraMkIV Independant_Trader Asp_Scout Type9_Military Krait_MkII TypeX ' +
  'TypeX_2 TypeX_3 Krait_Light Mamba Python_NX Type8 Mandalay CobraMkV Corsair PantherMkII LakonMiner Explorer_NX SmallCombat01_NX ' +
  'MediumTransport01 AnacondaMkII'
).split(' ');
const SHIPS = new Map(SHIP_SYMBOLS.map((s) => [s.toLowerCase(), s]));

/** Shipyard.json → shipyard/2. A ship the table does not know is left out rather than sent with a guessed spelling. */
export function fromShipyardFile(ctx: UploadContext, f: Obj): Outgoing | null {
  if (!isObj(f) || !hasStation(f) || !Array.isArray(f.PriceList) || !locate(ctx, f.StarSystem, undefined)) return null;
  const ships = f.PriceList.map((p: unknown) => (isObj(p) ? SHIPS.get(str(p.ShipType).toLowerCase()) : undefined))
    .filter((s: string | undefined): s is string => !!s);
  const unique = [...new Set(ships)].sort();
  if (!unique.length) return null;
  const msg: Obj = { systemName: f.StarSystem, stationName: f.StationName, marketId: f.MarketID, timestamp: f.timestamp, ships: unique };
  if (typeof f.AllowCobraMkIV === 'boolean') msg.allowCobraMkIV = f.AllowCobraMkIV;
  return { schema: 'shipyard/2', message: withFlags(ctx, msg) };
}

export const STATION_FILES: Record<string, { file: string; build: (ctx: UploadContext, f: Obj) => Outgoing | null }> = {
  Market: { file: 'Market.json', build: fromMarketFile },
  Outfitting: { file: 'Outfitting.json', build: fromOutfittingFile },
  Shipyard: { file: 'Shipyard.json', build: fromShipyardFile },
};

/** The whole message as EDDN wants it. `test` sends it to the schema's `/test` form. */
export function envelope(ctx: UploadContext, out: Outgoing, test: boolean): Obj {
  return {
    $schemaRef: `${SCHEMAS}${out.schema}${test ? '/test' : ''}`,
    header: {
      uploaderID: ctx.commander,
      softwareName: SOFTWARE_NAME,
      softwareVersion: SOFTWARE_VERSION,
      gameversion: ctx.gameVersion,
      gamebuild: ctx.gameBuild,
    },
    message: out.message,
  };
}

export interface UploadStats {
  enabled: boolean;
  /** `ET_EDDN_UPLOAD` set in the environment decides, and the switch on screen cannot change it. */
  locked: boolean;
  /** Everything goes to EDDN's test schemas (a beta game, or ET_EDDN_UPLOAD_TEST=1). */
  test: boolean;
  sent: number;
  failed: number;
  queued: number;
  lastAt: string;
  lastError: string;
}

interface Queued {
  body: string;
  tries: number;
  nextAt: number;
}

export class EddnUploader extends EventEmitter {
  readonly ctx = newContext();
  private readonly file: string;
  private readonly dir: string;
  private enabled = false;
  private readonly locked: boolean;
  private readonly forceTest: boolean;
  private queue: Queued[] = [];
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private seen = new Map<string, { hash: string; at: number }>();
  private counts = { sent: 0, failed: 0, lastAt: '', lastError: '' };
  private readonly fetcher: typeof fetch;

  /** `dir` is the journal folder (where Market.json and the other station files are written). */
  constructor(cacheDir: string, dir: string, fetcher: typeof fetch = fetch) {
    super();
    this.dir = dir;
    this.fetcher = fetcher;
    this.file = join(cacheDir, 'eddn-upload.json');
    const env = process.env.ET_EDDN_UPLOAD;
    this.locked = env === '0' || env === '1';
    this.forceTest = process.env.ET_EDDN_UPLOAD_TEST === '1';
    if (env === '1') this.enabled = true;
    else if (env !== '0') {
      try {
        this.enabled = JSON.parse(readFileSync(this.file, 'utf8')).enabled === true;
      } catch {
        // off until the player turns it on
      }
    }
  }

  start() {
    this.timer ??= setInterval(() => void this.pump(), 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get stats(): UploadStats {
    return {
      enabled: this.enabled, locked: this.locked, test: this.testMode(), sent: this.counts.sent, failed: this.counts.failed,
      queued: this.queue.length, lastAt: this.counts.lastAt, lastError: this.counts.lastError,
    };
  }

  setEnabled(on: boolean) {
    if (this.locked || on === this.enabled) return;
    this.enabled = on;
    if (!on) this.queue = [];
    mkdirSync(join(this.file, '..'), { recursive: true });
    void writeFile(this.file, JSON.stringify({ enabled: on })).catch(() => {});
    this.emit('stats', this.stats);
  }

  /** The newest journal is an Alpha/Beta one: tell the sender so everything goes to the test schemas. */
  setJournal(name: string) {
    this.ctx.beta = /^Journal(Alpha|Beta)\./.test(name);
  }

  private testMode() {
    return this.forceTest || this.ctx.beta;
  }

  /** Every journal event, in order. Old events (a replay) only update what is known; they are never sent. */
  feed(e: Obj, live: boolean) {
    observe(this.ctx, e);
    if (!live || !this.enabled || !canSend(this.ctx)) return;
    const age = Date.now() - Date.parse(str(e.timestamp));
    if (!(age >= -60e3 && age <= FRESH_MS)) return;
    const station = STATION_FILES[str(e.event)];
    if (station) {
      void this.fromFile(e, station);
      return;
    }
    for (const out of fromJournalEvent(this.ctx, e)) this.enqueue(out);
  }

  private async fromFile(e: Obj, station: (typeof STATION_FILES)[string]) {
    // the file is the data; the journal event only says it was just written, and for which market
    let f: Obj | null = null;
    for (let i = 0; i < 3 && !f; i++) {
      try {
        const parsed = JSON.parse(await readFile(join(this.dir, station.file), 'utf8'));
        if (isObj(parsed) && parsed.MarketID === e.MarketID && parsed.timestamp === e.timestamp) f = parsed;
      } catch {
        // half-written: try again
      }
      if (!f) await new Promise((r) => setTimeout(r, 150));
    }
    if (!f || !this.enabled) return;
    const out = station.build(this.ctx, f);
    if (out) this.enqueue(out, `${out.schema}:${f.MarketID}`);
  }

  private enqueue(out: Outgoing, dedupeKey?: string) {
    if (dedupeKey) {
      // the same content again within hours adds nothing (the services screen is opened often)
      const { timestamp: _t, ...rest } = out.message;
      const hash = JSON.stringify(rest);
      const prev = this.seen.get(dedupeKey);
      if (prev && prev.hash === hash && Date.now() - prev.at < SAME_MARKET_MS) return;
      this.seen.set(dedupeKey, { hash, at: Date.now() });
      if (this.seen.size > 2000) this.seen.delete(this.seen.keys().next().value as string);
    }
    if (this.queue.length >= QUEUE_MAX) this.queue.shift();
    this.queue.push({ body: JSON.stringify(envelope(this.ctx, out, this.testMode())), tries: 0, nextAt: 0 });
    this.emit('stats', this.stats);
    void this.pump();
  }

  /** Sends what is due, one message at a time. */
  pump(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain() {
    {
      for (;;) {
        const now = Date.now();
        const i = this.queue.findIndex((q) => q.nextAt <= now);
        if (i < 0) break;
        const item = this.queue[i];
        const result = await this.post(item.body);
        if (!this.enabled) break; // switched off while sending
        if (result === 'ok') {
          this.queue.splice(this.queue.indexOf(item), 1);
          this.counts.sent += 1;
          this.counts.lastAt = new Date().toISOString();
        } else if (result.drop || ++item.tries >= MAX_TRIES) {
          this.queue.splice(this.queue.indexOf(item), 1);
          this.counts.failed += 1;
          this.counts.lastError = result.error;
        } else {
          item.nextAt = Date.now() + RETRY_MS;
          this.counts.lastError = result.error;
        }
        this.emit('stats', this.stats);
      }
    }
  }

  private async post(body: string): Promise<'ok' | { drop: boolean; error: string }> {
    try {
      const res = await this.fetcher(UPLOAD_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15e3),
      });
      const text = (await res.text()).slice(0, 200);
      if (res.status === 200) return 'ok';
      // 400 (the message is wrong) and 426 (this version of ours is refused) are never sent again; 413 is too large
      return { drop: [400, 413, 426].includes(res.status), error: `HTTP ${res.status} ${text}`.trim() };
    } catch (err) {
      return { drop: false, error: (err as Error).message };
    }
  }
}
