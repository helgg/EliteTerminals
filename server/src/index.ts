// Local server: reads the game's journals and serves state + the web UI to the LAN.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { CarrierRoute, CarrierRouteQuery, ClientMessage, ColonyQuery, MiningSellQuery, ServerMessage, TradePathQuery, TradeQuery, TradeWatch } from '@et/shared';
import { JournalReader } from './reader.ts';
import { Controls } from './controls.ts';
import { findGameDir } from './binds.ts';
import { createWin32Sender } from './input.ts';
import { Galaxy, summary } from './galaxy.ts';
import { MarketScanner } from './trade/markets.ts';
import { TradeService } from './trade/service.ts';
import { ColonyService } from './colony/service.ts';
import { mergeDepots } from './colony/depots.ts';
import { commodityKey } from './trade/engine.ts';
import { searchSystems } from './trade/reference.ts';
import { checkWatch, watchedMarkets } from './prices/watch.ts';
import { PriceDb } from './prices/db.ts';
import { EddnListener } from './prices/eddn.ts';
import { MarketHistory } from './marketHistory.ts';
import { clipText, setClipboard } from './clipboard.ts';
import { panelAddresses } from './lan.ts';
import { Favorites, toFavorite } from './favorites.ts';
import { TradePins, toPin } from './tradePins.ts';
import { HOTSPOT_COMMODITIES, Rings, type HotspotQuery } from './rings.ts';
import { systemRings } from './mining.ts';
import { mergeCarrier } from './carrier/state.ts';
import { carrierRoute } from './carrier/route.ts';

const PORT = Number(process.env.PORT ?? 8420);
const HOST = process.env.HOST ?? '0.0.0.0';
const JOURNAL_DIR =
  process.env.ED_JOURNAL_DIR ?? join(homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
const WEB_DIST = resolve(import.meta.dirname, '../../web/dist');
const BINDINGS_DIR =
  process.env.ED_BINDINGS_DIR ?? join(homedir(), 'AppData', 'Local', 'Frontier Developments', 'Elite Dangerous', 'Options', 'Bindings');
const CACHE_DIR = process.env.ET_CACHE_DIR ?? join(process.env.LOCALAPPDATA ?? homedir(), 'EliteTerminals');
const BROADCAST_MS = 100;

const reader = new JournalReader(JOURNAL_DIR);
const controls = new Controls(BINDINGS_DIR, findGameDir(), process.platform === 'win32' ? createWin32Sender() : null);
const galaxy = new Galaxy(CACHE_DIR);
await galaxy.load();
const rings = new Rings();
const scanner = new MarketScanner(CACHE_DIR);
await scanner.load();
const history = new MarketHistory(CACHE_DIR);
await history.load();
const favorites = new Favorites(CACHE_DIR);
await favorites.load();
reader.state.favorites = favorites.list;
const pins = new TradePins(CACHE_DIR);
await pins.load();
reader.state.tradePins = pins.list;
mkdirSync(CACHE_DIR, { recursive: true });
const prices = new PriceDb(join(CACHE_DIR, 'prices.db'));
const trade = new TradeService(scanner, () => reader.state, () => history.markets, prices);
const colony = new ColonyService(CACHE_DIR, (name) => {
  const loc = reader.state.location;
  if (!name.trim() || name.trim().toLowerCase() === loc.system.toLowerCase()) {
    if (!loc.system) throw new Error('current system unknown: pick a system in FROM');
    return { name: loc.system, pos: loc.pos };
  }
  const sys = prices.system(name);
  if (!sys) throw new Error(`unknown system "${name}": pick it from the list`);
  return sys;
}, (loaded, total) => {
  const data = encode({ type: 'colonyProgress', loaded, total });
  clients.forEach((c) => c.send(data));
});
await colony.load();

// Construction sites are kept on disk: their journals may be on another machine (cloud gaming) next session.
const DEPOTS_FILE = join(CACHE_DIR, 'colony-depots.json');
try {
  reader.state.colony.depots = JSON.parse(readFileSync(DEPOTS_FILE, 'utf8'));
} catch {
  // none yet
}
let savedDepots = JSON.stringify(reader.state.colony.depots);
const saveDepots = () => {
  const now = JSON.stringify(reader.state.colony.depots);
  if (now === savedDepots) return;
  savedDepots = now;
  void writeFile(DEPOTS_FILE, now).catch((err: Error) => app.log.warn({ error: err.message }, 'colony depots not saved'));
};
// The carrier too: CarrierStats only comes when its management opens, CarrierLocation only at login.
const CARRIER_FILE = join(CACHE_DIR, 'carrier.json');
try {
  reader.state.carrier = mergeCarrier(JSON.parse(readFileSync(CARRIER_FILE, 'utf8')), reader.state.carrier);
} catch {
  // none yet
}
let savedCarrier = JSON.stringify(reader.state.carrier);
const saveCarrier = () => {
  const now = JSON.stringify(reader.state.carrier);
  if (now === savedCarrier || !reader.state.carrier.id) return;
  savedCarrier = now;
  void writeFile(CARRIER_FILE, now).catch((err: Error) => app.log.warn({ error: err.message }, 'carrier not saved'));
};
let lastCarrierRoute: CarrierRoute | null = null;

// Live prices only while the server runs; ET_EDDN=0 turns the feed off.
const eddn = new EddnListener(prices);
if (process.env.ET_EDDN !== '0') eddn.start();
const syncPrices = () => {
  reader.state.prices = { live: eddn.stats.connected, heard: eddn.stats.markets, lastAt: eddn.stats.lastAt, stored: prices.stats().markets };
};
syncPrices();
prices.prune();
setInterval(() => prices.prune(), 3600e3).unref();

// The route the panel has picked: priced again whenever one of its markets gets new prices.
let watch: TradeWatch | null = null;
const recheck = () => {
  reader.state.tradeWatch = watch ? checkWatch(watch, (id) => prices.market(id)) : null;
  scheduleBroadcast();
};
const app = Fastify({ logger: { level: 'info' } });
await app.register(fastifyWebsocket);

const clients = new Set<{ send(data: string): void }>();
const encode = (msg: ServerMessage) => JSON.stringify(msg);

// Coalesce bursts (journal replay, Status.json at several Hz) into at most one push per interval.
let pending: NodeJS.Timeout | null = null;
const scheduleBroadcast = () => {
  pending ??= setTimeout(() => {
    pending = null;
    const data = encode({ type: 'state', state: reader.state });
    clients.forEach((c) => c.send(data));
  }, BROADCAST_MS);
};
/** Asks Spansh about the systems on screen and copies what we already know into the state. */
function refreshGalaxy() {
  const s = reader.state;
  const current = s.location.address;
  const dest = s.destination.system && s.destination.system !== current ? s.destination.system : 0;
  const target = dest || (s.route.fsdTargetAddress !== current ? s.route.fsdTargetAddress : 0);
  const ids = [current, target, ...s.route.hops.map((h) => h.address)].filter(Boolean);
  galaxy.want(ids);
  const systems: typeof s.galaxy.systems = {};
  for (const id of ids) {
    const d = galaxy.get(id);
    if (d) systems[id] = summary(d);
  }
  // a body (not a station) targeted in this system: ask for its rings
  const d = s.destination;
  const here = galaxy.get(current);
  const isStation = here?.stations.some((st) => st.name.toLowerCase() === d.name.toLowerCase());
  let targetBody: typeof s.galaxy.targetBody = null;
  if (d.system && d.system === current && d.body > 0 && d.name && !isStation) {
    galaxy.wantBody(d.system, d.body);
    const rings = galaxy.bodyRings(d.system, d.body);
    if (rings) targetBody = { system: d.system, body: d.body, rings };
  }
  s.galaxy = { systems, current: here, target: target ? galaxy.get(target) : null, targetBody };
  // the MINING screen's rings of this system (Spansh, once per system and TTL) with the player's own ring scans
  s.mining.rings = systemRings(s.location.system, rings.of(s.location.system), s.mining.scanned);
}

// --- macros: they run on the screens; the server keeps one shared view of them ---
type Screen = { send(data: string): void };
/** The screen last used (a key, a macro): the one AUTO NEXT runs on. */
let lastScreen: Screen | null = null;
/** The screen running a macro now, to stop it from any other. */
let macroScreen: Screen | null = null;
let kills = -1;
function watchKills() {
  const now = reader.state.combat.session.kills;
  const more = kills >= 0 && now > kills;
  kills = now;
  if (!more || !reader.state.macros.autoNext) return;
  // Let the wreck clear the target first; then one screen only, or they fight over the target.
  setTimeout(() => {
    const screen = lastScreen && clients.has(lastScreen) ? lastScreen : [...clients][0];
    screen?.send(encode({ type: 'runMacro', macro: 'NextBest' }));
  }, 1200);
}

let lastMarketAt = '';
reader.on('change', () => {
  saveDepots();
  saveCarrier();
  refreshGalaxy();
  watchKills();
  scheduleBroadcast();
  const m = reader.state.market;
  if (m.updatedAt && m.updatedAt !== lastMarketAt) {
    lastMarketAt = m.updatedAt;
    void history.record(structuredClone(m)).catch((err: Error) =>
      app.log.warn({ error: err.message }, 'market history not saved'));
    // the player's own market goes into the database too, keyed by the game's internal names
    const loc = reader.state.location;
    prices.putSystem(loc.system, loc.pos, loc.address);
    prices.putMarket({
      marketId: m.marketId, station: m.station, system: m.system, type: m.stationType || undefined,
      updatedAt: m.updatedAt, source: 'local',
      items: m.items.map((i) => ({
        key: commodityKey(i.name), name: i.label || i.name, buy: i.buy, sell: i.sell, supply: i.stock, demand: i.demand,
        supplyBracket: i.stockBracket, demandBracket: i.demandBracket,
      })),
    });
    if (watchedMarkets(watch).has(m.marketId)) recheck();
  }
});
eddn.on('markets', (ids: Set<number>) => {
  if ([...watchedMarkets(watch)].some((id) => ids.has(id))) recheck();
});
eddn.on('stats', () => {
  syncPrices();
  scheduleBroadcast();
});
eddn.on('stats', (st) => st.error && app.log.warn({ error: st.error }, 'EDDN feed down, retrying'));
rings.on('change', () => {
  refreshGalaxy();
  scheduleBroadcast();
});
galaxy.on('change', () => {
  refreshGalaxy();
  scheduleBroadcast();
});
controls.on('change', () => {
  reader.state.controls = { presets: controls.presets, keys: controls.keyLabels() };
  scheduleBroadcast();
});

app.get('/ws', { websocket: true }, (socket) => {
  clients.add(socket);
  socket.send(encode({ type: 'state', state: reader.state }));
  socket.on('message', (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const macros = reader.state.macros;
    if (msg.type === 'autoNext') {
      lastScreen = socket;
      macros.autoNext = msg.on === true;
      if (!macros.autoNext && macros.running === 'NextBest') macroScreen?.send(encode({ type: 'stopMacro' }));
      scheduleBroadcast();
    } else if (msg.type === 'macro') {
      lastScreen = socket;
      macroScreen = msg.running ? socket : null;
      macros.running = String(msg.running ?? '');
      if (msg.running) macros.note = '';
      else if (msg.note !== undefined) {
        macros.note = String(msg.note);
        macros.noteFor = String(msg.noteFor ?? '');
      }
      scheduleBroadcast();
    } else if (msg.type === 'stopMacro') {
      macroScreen?.send(encode({ type: 'stopMacro' }));
    } else if (msg.type === 'share') {
      const p = msg.patch ?? {};
      if (Array.isArray(p.absent)) macros.absent = p.absent.map(String);
      if (typeof p.locking === 'string') macros.locking = p.locking;
      if (p.plot && typeof p.plot === 'object') {
        macros.plot = { system: String(p.plot.system ?? ''), stage: String(p.plot.stage ?? ''), error: String(p.plot.error ?? '') };
      }
      scheduleBroadcast();
    } else if (msg.type === 'command' || msg.type === 'paste') {
      lastScreen = socket;
      const job = msg.type === 'paste'
        ? setClipboard(clipText(msg.text)).then(() => controls.paste())
        : controls.run(String(msg.command));
      const command = msg.type === 'paste' ? 'paste' : msg.command;
      job.then(
        () => {
          app.log.info({ command }, 'command sent');
          // What the journal never reports, kept for every screen: the last fighter order and throttle detent.
          if (command.startsWith('Order') || command.startsWith('SetSpeed')) {
            macros[command.startsWith('Order') ? 'order' : 'throttle'] = command;
            scheduleBroadcast();
          }
          socket.send(encode({ type: 'commandResult', id: msg.id, ok: true }));
        },
        (err: Error) => {
          app.log.warn({ command, error: err.message }, 'command failed');
          socket.send(encode({ type: 'commandResult', id: msg.id, ok: false, error: err.message }));
        },
      );
    }
  });
  socket.on('close', () => {
    clients.delete(socket);
    // A screen closed mid-macro: its macro is gone with it.
    if (macroScreen === socket) {
      macroScreen = null;
      reader.state.macros.running = '';
      reader.state.macros.locking = '';
      scheduleBroadcast();
    }
  });
});

app.get('/api/state', async () => reader.state);

scanner.on('progress', (p) => {
  const data = encode({ type: 'tradeProgress', ...p });
  clients.forEach((c) => c.send(data));
});

app.post('/api/trade/routes', async (req, reply) => {
  const { query, force } = req.body as { query: TradeQuery; force?: boolean };
  try {
    const result = await trade.routes(query, force === true);
    if (await pins.refresh(result)) {
      reader.state.tradePins = pins.list;
      scheduleBroadcast();
    }
    return result;
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'trade scan failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.post('/api/trade/path', async (req, reply) => {
  const { query, force } = req.body as { query: TradePathQuery; force?: boolean };
  try {
    return await trade.path(query, force === true);
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'trade path failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});
app.get('/api/trade/last-path', async (_req, reply) => trade.lastPath ?? reply.code(204).send());
app.get('/api/trade/stations', async (req) => trade.stations(String((req.query as { system?: string }).system ?? '')));

app.post('/api/colony/search', async (req, reply) => {
  try {
    return await colony.search(req.body as ColonyQuery);
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'colony search failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});
app.post('/api/colony/rescore', async (req, reply) => colony.rescore(req.body as ColonyQuery) ?? reply.code(204).send());
app.post('/api/carrier/route', async (req, reply) => {
  try {
    lastCarrierRoute = await carrierRoute(req.body as CarrierRouteQuery);
    return lastCarrierRoute;
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'carrier route failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});
app.post('/api/carrier/upkeep', async (req, reply) => {
  const w = Number((req.body as { weekly?: unknown } | null)?.weekly ?? 0);
  if (!Number.isFinite(w) || w < 0 || w > 1e9) return reply.code(400).send({ error: 'weekly upkeep out of range' });
  reader.state.carrier.upkeep = Math.round(w);
  saveCarrier();
  scheduleBroadcast();
  return { upkeep: reader.state.carrier.upkeep };
});
app.get('/api/carrier/last-route', async (_req, reply) => lastCarrierRoute ?? reply.code(204).send());
app.get('/api/colony/last', async (_req, reply) => colony.last ?? reply.code(204).send());
app.post('/api/colony/depot', async (req, reply) => {
  const { marketId, deadline } = req.body as { marketId: number; deadline: string };
  const d = reader.state.colony.depots.find((x) => x.marketId === Number(marketId));
  if (!d || Number.isNaN(Date.parse(deadline))) return reply.code(400).send({ error: 'unknown site or date' });
  d.deadline = new Date(deadline).toISOString();
  d.deadlineSet = true;
  saveDepots();
  scheduleBroadcast();
  return d;
});
app.post('/api/colony/markets', async (req, reply) => {
  // near the site (default), or near the player: buy in the bubble, the carrier brings it all in one jump
  const { marketId, query, near } = req.body as { marketId: number; query: TradeQuery; near?: 'site' | 'me' | 'carrier' };
  const d = reader.state.colony.depots.find((x) => x.marketId === Number(marketId));
  if (!d) return reply.code(404).send({ error: 'unknown construction site' });
  // what is already in the hold or on the carrier is not to be bought again
  const have = new Map<string, number>();
  for (const x of [...reader.state.cargo.items, ...reader.state.carrier.cargo]) {
    const k = commodityKey(x.name);
    have.set(k, (have.get(k) ?? 0) + x.count);
  }
  const needs = d.resources
    .map((r) => ({ name: r.label, tons: r.required - r.provided - (have.get(commodityKey(r.name)) ?? 0) }))
    .filter((r) => r.tons > 0);
  try {
    // 'carrier': the carrier parked where the shopping is done (its system's position, from the price database)
    const carrierPos = near === 'carrier' && reader.state.carrier.system ? prices.systemPos(reader.state.carrier.system) : null;
    const pos = carrierPos ?? (near === 'me' && reader.state.location.system ? reader.state.location.pos : d.pos);
    const found = await trade.colonyMarkets(d.marketId, pos, needs, query);
    // the player's own carrier is already counted in `have`: not a place to buy from
    const own = reader.state.carrier.id;
    return own ? { ...found, markets: found.markets.filter((m) => m.end.marketId !== own) } : found;
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message });
  }
});
app.post('/api/colony/hide', async (req) => {
  const { id64, name, reason } = req.body as { id64: number; name: string; reason: 'not allowed' | 'claimed' | null };
  return (await colony.hide(Number(id64), String(name ?? ''), reason === 'not allowed' || reason === 'claimed' ? reason : null)) ?? {};
});
app.get('/api/colony/claim', async (req, reply) => {
  const { system, ly } = req.query as { system?: string; ly?: string };
  try {
    return await colony.claimAt(String(system ?? ''), Math.min(Math.max(Number(ly) || 15, 1), 20));
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.get('/api/connect', async () => panelAddresses(PORT));
app.get('/api/market/history', async () => history.markets);
app.post('/api/trade/watch', async (req) => {
  const w = (req.body as { watch?: TradeWatch | null }).watch ?? null;
  for (const id of watchedMarkets(watch)) prices.tracked.delete(id);
  watch = w && Array.isArray(w.legs) && w.legs.length ? w : null;
  for (const id of watchedMarkets(watch)) prices.tracked.add(id);
  recheck();
  return reader.state.tradeWatch;
});
app.get('/api/prices/history', async (req) => {
  const { market, commodity } = req.query as { market?: string; commodity?: string };
  return prices.history(Number(market), String(commodity ?? ''));
});
app.get('/api/systems', async (req) =>
  searchSystems(prices, String((req.query as { q?: string }).q ?? ''), reader.state.location.pos));

app.post('/api/clipboard', async (req, reply) => {
  const text = clipText((req.body as { text?: unknown } | null)?.text);
  if (!text) return reply.code(400).send({ error: 'empty text' });
  try {
    await setClipboard(text);
    return { ok: true };
  } catch (err) {
    return reply.code(500).send({ error: (err as Error).message });
  }
});

app.post('/api/favorites', async (req, reply) => {
  const f = toFavorite(req.body);
  if (!f) return reply.code(400).send({ error: 'no system' });
  f.pos ??= prices.systemPos(f.system); // saved from a trade route: the database knows where it is
  await favorites.add(f);
  reader.state.favorites = favorites.list;
  scheduleBroadcast();
  return favorites.list;
});
app.delete('/api/favorites/:id', async (req, reply) => {
  if (!(await favorites.remove(String((req.params as { id: string }).id)))) return reply.code(404).send({ error: 'not found' });
  reader.state.favorites = favorites.list;
  scheduleBroadcast();
  return favorites.list;
});

app.post('/api/trade/pins', async (req, reply) => {
  const p = toPin(req.body);
  if (!p) return reply.code(400).send({ error: 'not a route' });
  await pins.add(p);
  reader.state.tradePins = pins.list;
  scheduleBroadcast();
  return pins.list;
});
app.delete('/api/trade/pins/:id', async (req, reply) => {
  if (!(await pins.remove(String((req.params as { id: string }).id)))) return reply.code(404).send({ error: 'not found' });
  reader.state.tradePins = pins.list;
  scheduleBroadcast();
  return pins.list;
});
app.get('/api/trade/last', async (_req, reply) => trade.last ?? reply.code(204).send());

app.post('/api/trade/commodity', async (req) => {
  const { name, query } = req.body as { name: string; query: TradeQuery };
  return trade.quotes(String(name), query);
});

app.post('/api/mining/sell', async (req, reply) => {
  try {
    return await trade.sells(req.body as MiningSellQuery);
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'mining sell scan failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.get('/api/mining/commodities', async () => HOTSPOT_COMMODITIES);
app.post('/api/mining/hotspots', async (req, reply) => {
  const q = req.body as Partial<HotspotQuery>;
  try {
    return await rings.hotspots({
      commodity: String(q.commodity ?? ''), reference: String(q.reference || reader.state.location.system || 'Sol'),
      radius: Math.min(Math.max(Number(q.radius) || 50, 5), 500), minCount: Number(q.minCount) || 1, pristine: q.pristine === true,
    });
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'hotspot search failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST });
} else {
  app.get('/', async () => 'Web UI not built: run `npm run build` (or `npm run dev:web` for Vite on :5173).');
}

controls.start();
await reader.start();
await app.listen({ port: PORT, host: HOST });

const lan = (await panelAddresses(PORT)).filter((a) => !a.virtual).map((a) => a.url);
app.log.info(
  { journalDir: JOURNAL_DIR, presets: controls.presets, boundActions: Object.keys(controls.keyLabels()).length, open: lan },
  'EliteTerminals ready',
);
