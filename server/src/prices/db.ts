// Local price database (SQLite, node:sqlite): every market heard from EDDN, Spansh scans and the player's
// own Market.json, so trade scans of a region already covered are answered locally, in milliseconds.
// Each market keeps only its newest copy; positions come from systems seen in journal messages or Spansh.
import { DatabaseSync } from 'node:sqlite';
import type { TradeMarket } from '@et/shared';
import { commodityKey } from '../trade/engine.ts';

export interface StationMeta {
  marketId: number;
  station: string;
  system: string;
  systemId64?: number;
  type?: string;
  ls?: number;
  planetary?: boolean;
  pads?: { s: number; m: number; l: number };
  state?: string;
}

export interface MarketPrices {
  marketId: number;
  station: string;
  system: string;
  type?: string;
  updatedAt: string;
  source: TradeMarket['source'];
  /** `key` is the commodity key when `name` is a localised label (the player's Market.json). */
  items: { key?: string; name: string; buy: number; sell: number; supply: number; demand: number; supplyBracket?: number; demandBracket?: number }[];
}

export interface NearQuery {
  pos: [number, number, number];
  radius: number;
  /** Max price age in hours; 0 = any. */
  maxAgeH: number;
  carriers: boolean;
}

/** System and station names are matched loosely ("LHS 3447" = "lhs 3447"). */
export const nameKey = (s: string) => s.trim().toLowerCase();

const PLANETARY = /crater|surface|onfoot|settlement|planetary/i;
export const isPlanetaryType = (type: string) => PLANETARY.test(type);

/** Largest pad by station type, for stations we only know from a price message (no Docked event yet). */
export function padsByType(type: string): { s: number; m: number; l: number } {
  const t = type.toLowerCase();
  if (/outpost/.test(t)) return { s: 1, m: 1, l: 0 };
  if (/settlement|onfoot/.test(t) || !t) return { s: 0, m: 0, l: 0 };
  return { s: 1, m: 1, l: 1 };
}

/** "lowtemperaturediamonds" → "Lowtemperaturediamonds": only used until a proper name is heard. */
const fallbackName = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS systems (
  key TEXT PRIMARY KEY, name TEXT NOT NULL, id64 INTEGER, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS systems_x ON systems (x);
CREATE TABLE IF NOT EXISTS stations (
  market_id INTEGER PRIMARY KEY, name TEXT NOT NULL, system_key TEXT NOT NULL, system TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '', ls REAL NOT NULL DEFAULT 0, planetary INTEGER NOT NULL DEFAULT 0,
  pad_s INTEGER, pad_m INTEGER, pad_l INTEGER, state TEXT NOT NULL DEFAULT '',
  market_at TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS stations_system ON stations (system_key);
CREATE TABLE IF NOT EXISTS prices (
  market_id INTEGER NOT NULL, key TEXT NOT NULL, buy INTEGER NOT NULL, sell INTEGER NOT NULL,
  supply INTEGER NOT NULL, demand INTEGER NOT NULL, supply_bracket INTEGER, demand_bracket INTEGER,
  PRIMARY KEY (market_id, key)
);
CREATE TABLE IF NOT EXISTS price_history (
  market_id INTEGER NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, buy INTEGER NOT NULL, sell INTEGER NOT NULL,
  supply INTEGER NOT NULL, demand INTEGER NOT NULL, PRIMARY KEY (market_id, key, at)
);
CREATE TABLE IF NOT EXISTS commodity_names (key TEXT PRIMARY KEY, name TEXT NOT NULL, rank INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scans (
  x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, radius REAL NOT NULL, carriers INTEGER NOT NULL,
  max_age_h REAL NOT NULL, at INTEGER NOT NULL
);
`;

export class PriceDb {
  readonly db: DatabaseSync;
  private q;
  /** Markets whose every price change is kept in the history (visited ones, the watched route). */
  readonly tracked = new Set<number>();

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);
    this.q = {
      system: this.db.prepare(`INSERT INTO systems (key, name, id64, x, y, z) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET name = excluded.name, id64 = coalesce(excluded.id64, id64),
        x = excluded.x, y = excluded.y, z = excluded.z`),
      systemPos: this.db.prepare('SELECT name, id64, x, y, z FROM systems WHERE key = ?'),
      systemsLike: this.db.prepare("SELECT name, x, y, z FROM systems WHERE key >= ? AND key < ? || char(1114111) LIMIT ?"),
      // only fields we were told overwrite what is stored
      station: this.db.prepare(`INSERT INTO stations (market_id, name, system_key, system, type, ls, planetary, pad_s, pad_m, pad_l, state)
        VALUES (?, ?, ?, ?, coalesce(?, ''), coalesce(?, 0), coalesce(?, 0), ?, ?, ?, coalesce(?, ''))
        ON CONFLICT (market_id) DO UPDATE SET name = excluded.name, system_key = excluded.system_key, system = excluded.system,
        type = coalesce(?, type), ls = coalesce(?, ls), planetary = coalesce(?, planetary),
        pad_s = coalesce(excluded.pad_s, pad_s), pad_m = coalesce(excluded.pad_m, pad_m), pad_l = coalesce(excluded.pad_l, pad_l),
        state = coalesce(?, state)`),
      marketAt: this.db.prepare('SELECT market_at FROM stations WHERE market_id = ?'),
      setMarket: this.db.prepare('UPDATE stations SET market_at = ?, source = ? WHERE market_id = ?'),
      clearPrices: this.db.prepare('DELETE FROM prices WHERE market_id = ?'),
      price: this.db.prepare(`INSERT INTO prices (market_id, key, buy, sell, supply, demand, supply_bracket, demand_bracket)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
      name: this.db.prepare(`INSERT INTO commodity_names (key, name, rank) VALUES (?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET name = excluded.name, rank = excluded.rank WHERE excluded.rank >= rank`),
      names: this.db.prepare('SELECT key, name FROM commodity_names'),
      history: this.db.prepare(`INSERT OR IGNORE INTO price_history (market_id, key, at, buy, sell, supply, demand)
        SELECT market_id, key, ?, buy, sell, supply, demand FROM prices WHERE market_id = ?`),
      historyOf: this.db.prepare('SELECT at, buy, sell, supply, demand FROM price_history WHERE market_id = ? AND key = ? ORDER BY at'),
      prune: this.db.prepare('DELETE FROM price_history WHERE at < ?'),
      itemsOf: this.db.prepare('SELECT key, buy, sell, supply, demand FROM prices WHERE market_id = ?'),
      scan: this.db.prepare('INSERT INTO scans (x, y, z, radius, carriers, max_age_h, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      scans: this.db.prepare('SELECT x, y, z, radius, carriers, max_age_h FROM scans WHERE at >= ?'),
      near: this.db.prepare(`SELECT s.*, y.x, y.y, y.z, y.id64 FROM stations s JOIN systems y ON y.key = s.system_key
        WHERE y.x BETWEEN ? AND ? AND y.y BETWEEN ? AND ? AND y.z BETWEEN ? AND ? AND s.market_at != ''`),
      pricesOf: this.db.prepare(`SELECT * FROM prices WHERE market_id IN (SELECT value FROM json_each(?))`),
      count: this.db.prepare(`SELECT (SELECT count(*) FROM systems) systems, (SELECT count(*) FROM stations WHERE market_at != '') markets,
        (SELECT count(*) FROM prices) prices`),
    };
  }

  close() {
    this.db.close();
  }

  /** Runs `fn` in one transaction (EDDN messages are written in batches). */
  batch(fn: () => void) {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  putSystem(name: string, pos: [number, number, number], id64?: number) {
    if (!name || !Array.isArray(pos) || pos.length !== 3) return;
    this.q.system.run(nameKey(name), name, id64 ?? null, pos[0], pos[1], pos[2]);
  }

  systemPos(name: string): [number, number, number] | null {
    return this.system(name)?.pos ?? null;
  }

  system(name: string): { name: string; id64: number; pos: [number, number, number] } | null {
    const r = this.q.systemPos.get(nameKey(name)) as { name: string; id64: number | null; x: number; y: number; z: number } | undefined;
    return r ? { name: r.name, id64: r.id64 ?? 0, pos: [r.x, r.y, r.z] } : null;
  }

  /** Known systems whose name starts with `prefix` (case-insensitive). */
  searchSystems(prefix: string, limit: number): { name: string; pos: [number, number, number] }[] {
    const k = nameKey(prefix);
    return (this.q.systemsLike.all(k, k, limit) as { name: string; x: number; y: number; z: number }[])
      .map((r) => ({ name: r.name, pos: [r.x, r.y, r.z] }));
  }

  putStation(m: StationMeta) {
    if (!m.marketId || !m.station || !m.system) return;
    const type = m.type || null;
    const planetary = m.planetary ?? (type ? isPlanetaryType(type) : undefined);
    const pl = planetary === undefined ? null : planetary ? 1 : 0;
    const ls = m.ls ?? null;
    const state = m.state ?? null;
    this.q.station.run(
      m.marketId, m.station, nameKey(m.system), m.system, type, ls, pl,
      m.pads?.s ?? null, m.pads?.m ?? null, m.pads?.l ?? null, state,
      type, ls, pl, state,
    );
  }

  /** Stores a market's prices, unless we already hold a newer copy. Returns whether it was stored. */
  putMarket(m: MarketPrices): boolean {
    if (!m.marketId || !m.updatedAt) return false;
    const held = (this.q.marketAt.get(m.marketId) as { market_at: string } | undefined)?.market_at ?? '';
    if (held && Date.parse(held) > Date.parse(m.updatedAt)) return false;
    this.putStation({ marketId: m.marketId, station: m.station, system: m.system, type: m.type });
    this.q.clearPrices.run(m.marketId);
    // English names from Spansh beat the journal's localised labels and the bare EDDN symbols
    const rank = m.source === 'spansh' ? 2 : m.source === 'local' ? 1 : 0;
    for (const i of m.items) {
      if (!((i.buy > 0 && i.supply > 0) || (i.sell > 0 && i.demand > 0))) continue;
      const key = i.key ?? commodityKey(i.name);
      this.q.price.run(m.marketId, key, i.buy, i.sell, i.supply, i.demand, i.supplyBracket ?? null, i.demandBracket ?? null);
      if (rank > 0) this.q.name.run(key, i.name, rank);
    }
    this.q.setMarket.run(m.updatedAt, m.source, m.marketId);
    if (m.source === 'local') this.tracked.add(m.marketId);
    if (this.tracked.has(m.marketId)) this.q.history.run(m.updatedAt, m.marketId);
    return true;
  }

  /** A whole Spansh scan: systems, stations and prices. */
  putSpansh(markets: TradeMarket[]) {
    this.batch(() => {
      for (const m of markets) {
        this.putSystem(m.system, m.pos, m.systemId64);
        this.putStation({
          marketId: m.marketId, station: m.station, system: m.system, type: m.type, ls: m.ls,
          planetary: m.planetary, pads: m.pads, state: m.state,
        });
        this.putMarket({ ...m, source: 'spansh' });
      }
    });
  }

  /** Remembers that a region was scanned from Spansh, so the next scan there can be answered locally. */
  markScanned(q: NearQuery, at = Date.now()) {
    this.q.scan.run(q.pos[0], q.pos[1], q.pos[2], q.radius, q.carriers ? 1 : 0, q.maxAgeH, at);
  }

  /** Whether a Spansh scan since `since` already covered the sphere asked for. */
  covered(q: NearQuery, since: number): boolean {
    const rows = this.q.scans.all(since) as { x: number; y: number; z: number; radius: number; carriers: number; max_age_h: number }[];
    // a scan limited to fresh prices doesn't cover a query for older ones
    return rows.some((r) => (r.carriers || !q.carriers) && (r.max_age_h === 0 || (q.maxAgeH > 0 && q.maxAgeH <= r.max_age_h)) &&
      Math.hypot(r.x - q.pos[0], r.y - q.pos[1], r.z - q.pos[2]) + q.radius <= r.radius + 0.01);
  }

  /** Markets within `radius` ly of `pos`, in the shape the trade engine takes. */
  near(q: NearQuery, now = Date.now()): TradeMarket[] {
    const [x, y, z] = q.pos;
    const r = q.radius;
    const rows = (this.q.near.all(x - r, x + r, y - r, y + r, z - r, z + r) as any[]).filter((s) =>
      Math.hypot(s.x - x, s.y - y, s.z - z) <= r &&
      (q.carriers || !/carrier/i.test(s.type)) &&
      (!q.maxAgeH || now - Date.parse(s.market_at) <= q.maxAgeH * 3.6e6));
    if (!rows.length) return [];
    const names = new Map((this.q.names.all() as { key: string; name: string }[]).map((n) => [n.key, n.name]));
    const items = new Map<number, TradeMarket['items']>();
    for (const p of this.q.pricesOf.all(JSON.stringify(rows.map((s) => s.market_id))) as any[]) {
      let list = items.get(p.market_id);
      if (!list) items.set(p.market_id, (list = []));
      list.push({
        name: names.get(p.key) ?? fallbackName(p.key), buy: p.buy, sell: p.sell, supply: p.supply, demand: p.demand,
        ...(p.supply_bracket !== null ? { supplyBracket: p.supply_bracket } : {}),
        ...(p.demand_bracket !== null ? { demandBracket: p.demand_bracket } : {}),
      });
    }
    return rows.map((s) => {
      const known = s.pad_s !== null || s.pad_m !== null || s.pad_l !== null;
      return {
        marketId: s.market_id, station: s.name, system: s.system, systemId64: s.id64 ?? 0,
        pos: [s.x, s.y, s.z] as [number, number, number], ls: s.ls, type: s.type, planetary: s.planetary === 1,
        pads: known ? { s: s.pad_s ?? 0, m: s.pad_m ?? 0, l: s.pad_l ?? 0 } : padsByType(s.type),
        state: s.state, updatedAt: s.market_at, source: s.source as TradeMarket['source'],
        items: items.get(s.market_id) ?? [],
      };
    });
  }

  /** A market's current prices by commodity key, and when they were taken; null when not held. */
  market(marketId: number): { at: string; items: Map<string, { buy: number; sell: number; supply: number; demand: number }> } | null {
    const at = (this.q.marketAt.get(marketId) as { market_at: string } | undefined)?.market_at;
    if (!at) return null;
    const rows = this.q.itemsOf.all(marketId) as { key: string; buy: number; sell: number; supply: number; demand: number }[];
    return { at, items: new Map(rows.map(({ key, ...q }) => [key, q])) };
  }

  /** Price history of one commodity at one market, oldest first. */
  history(marketId: number, name: string) {
    return this.q.historyOf.all(marketId, commodityKey(name)) as { at: string; buy: number; sell: number; supply: number; demand: number }[];
  }

  /** Drops history older than `keepMs` (7 days by default). */
  prune(keepMs = 7 * 24 * 3600e3, now = Date.now()) {
    this.q.prune.run(new Date(now - keepMs).toISOString());
  }

  stats(): { systems: number; markets: number; prices: number } {
    return this.q.count.get() as { systems: number; markets: number; prices: number };
  }
}
