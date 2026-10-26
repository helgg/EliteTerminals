// Live prices from EDDN (the Elite Dangerous Data Network relay): commodity/3 messages carry a market's prices,
// journal/1 Docked / FSDJump / Location / CarrierJump carry system positions and station details.
// Listens only while the server runs; messages are written to the price database in batches.
import { EventEmitter } from 'node:events';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import type { MarketPrices, PriceDb, StationMeta } from './db.ts';

export const RELAY = 'tcp://eddn.edcd.io:9500';
const FLUSH_MS = 1000;
const RETRY_MS = 30e3;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** A commodity/3 message → market prices; null for anything else. Pure, for tests. */
export function fromEddnCommodity(env: any): MarketPrices | null {
  if (!str(env?.$schemaRef).includes('/commodity/3')) return null;
  const m = env.message ?? {};
  if (!num(m.marketId) || !str(m.stationName) || !str(m.systemName) || !Array.isArray(m.commodities)) return null;
  return {
    marketId: m.marketId,
    station: m.stationName,
    system: m.systemName,
    type: str(m.stationType) || undefined,
    updatedAt: str(m.timestamp),
    source: 'eddn',
    items: m.commodities.map((c: any) => ({
      name: str(c.name), buy: num(c.buyPrice), sell: num(c.sellPrice), supply: num(c.stock), demand: num(c.demand),
      supplyBracket: num(c.stockBracket), demandBracket: num(c.demandBracket),
    })),
  };
}

export interface JournalFacts {
  system: { name: string; pos: [number, number, number]; id64: number } | null;
  station: StationMeta | null;
}

/** A journal/1 message → the system it was sent from and, for Docked, the station. Pure, for tests. */
export function fromEddnJournal(env: any): JournalFacts | null {
  if (!str(env?.$schemaRef).includes('/journal/1')) return null;
  const m = env.message ?? {};
  const ev = str(m.event);
  if (!['Docked', 'FSDJump', 'Location', 'CarrierJump'].includes(ev)) return null;
  const pos = Array.isArray(m.StarPos) && m.StarPos.length === 3 ? (m.StarPos as [number, number, number]) : null;
  const name = str(m.StarSystem);
  const system = name && pos ? { name, pos, id64: num(m.SystemAddress) } : null;
  let station: StationMeta | null = null;
  if (ev === 'Docked' && num(m.MarketID) && str(m.StationName)) {
    const p = m.LandingPads;
    station = {
      marketId: m.MarketID, station: m.StationName, system: name, systemId64: num(m.SystemAddress),
      type: str(m.StationType) || undefined,
      ls: typeof m.DistFromStarLS === 'number' ? m.DistFromStarLS : undefined,
      pads: p && typeof p === 'object' ? { s: num(p.Small), m: num(p.Medium), l: num(p.Large) } : undefined,
      state: str(m.StationFaction?.FactionState) || undefined,
    };
  }
  return { system, station };
}

export interface EddnStats {
  connected: boolean;
  /** Messages stored since the server started. */
  markets: number;
  systems: number;
  lastAt: string;
  error: string;
}

/** Subscribes to the relay and feeds the database; emits 'stats' after each batch. */
export class EddnListener extends EventEmitter {
  readonly stats: EddnStats = { connected: false, markets: 0, systems: 0, lastAt: '', error: '' };
  private pending: any[] = [];
  private timer: NodeJS.Timeout | null = null;
  private sock: any = null;
  private stopped = false;
  readonly db: PriceDb;

  constructor(db: PriceDb) {
    super();
    this.db = db;
  }

  start() {
    this.stopped = false;
    void this.run();
  }

  stop() {
    this.stopped = true;
    this.sock?.close();
    this.flush();
  }

  private async run() {
    while (!this.stopped) {
      try {
        // loaded lazily so a missing native build only disables live prices
        const { Subscriber } = createRequire(import.meta.url)('zeromq');
        this.sock = new Subscriber();
        this.sock.connect(RELAY);
        this.sock.subscribe('');
        this.stats.connected = true;
        this.stats.error = '';
        this.emit('stats', this.stats);
        for await (const [frame] of this.sock) {
          try {
            this.pending.push(JSON.parse(inflateSync(frame).toString('utf8')));
          } catch {
            continue; // a malformed message is skipped, the stream goes on
          }
          this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
        }
      } catch (err) {
        this.stats.error = (err as Error).message;
      }
      this.stats.connected = false;
      this.emit('stats', this.stats);
      if (!this.stopped) await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }

  /** Writes the messages received since the last flush, in one transaction. */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = this.pending;
    this.pending = [];
    if (!batch.length) return;
    let markets = 0;
    let systems = 0;
    const touched = new Set<number>();
    this.db.batch(() => {
      for (const env of batch) {
        const prices = fromEddnCommodity(env);
        if (prices) {
          if (this.db.putMarket(prices)) {
            markets++;
            touched.add(prices.marketId);
          }
          continue;
        }
        const facts = fromEddnJournal(env);
        if (facts?.system) {
          this.db.putSystem(facts.system.name, facts.system.pos, facts.system.id64);
          systems++;
        }
        if (facts?.station) this.db.putStation(facts.station);
      }
    });
    this.stats.markets += markets;
    this.stats.systems += systems;
    if (markets) this.stats.lastAt = new Date().toISOString();
    this.emit('stats', this.stats);
    if (touched.size) this.emit('markets', touched);
  }
}
