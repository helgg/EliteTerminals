// Local server: reads the game's journals and serves state + the web UI to the LAN.
import { existsSync } from 'node:fs';
import { networkInterfaces, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { ClientMessage, ServerMessage, TradeQuery } from '@et/shared';
import { JournalReader } from './reader.ts';
import { Controls } from './controls.ts';
import { findGameDir } from './binds.ts';
import { createWin32Sender } from './input.ts';
import { Galaxy, summary } from './galaxy.ts';
import { MarketScanner } from './trade/markets.ts';
import { TradeService } from './trade/service.ts';

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
const scanner = new MarketScanner(CACHE_DIR);
await scanner.load();
const trade = new TradeService(scanner, () => reader.state);
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
  s.galaxy = { systems, current: galaxy.get(current), target: target ? galaxy.get(target) : null };
}

reader.on('change', () => {
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
    if (msg.type === 'command') {
      controls.run(String(msg.command)).then(
        () => {
          app.log.info({ command: msg.command }, 'command sent');
          socket.send(encode({ type: 'commandResult', id: msg.id, ok: true }));
        },
        (err: Error) => {
          app.log.warn({ command: msg.command, error: err.message }, 'command failed');
          socket.send(encode({ type: 'commandResult', id: msg.id, ok: false, error: err.message }));
        },
      );
    }
  });
  socket.on('close', () => clients.delete(socket));
});

app.get('/api/state', async () => reader.state);

scanner.on('progress', (p) => {
  const data = encode({ type: 'tradeProgress', ...p });
  clients.forEach((c) => c.send(data));
});

app.post('/api/trade/routes', async (req, reply) => {
  const { query, force } = req.body as { query: TradeQuery; force?: boolean };
  try {
    return await trade.routes(query, force === true);
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, 'trade scan failed');
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.get('/api/trade/last', async (_req, reply) => trade.last ?? reply.code(204).send());

app.post('/api/trade/commodity', async (req) => {
  const { name, query } = req.body as { name: string; query: TradeQuery };
  return trade.quotes(String(name), query);
});

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST });
} else {
  app.get('/', async () => 'Web UI not built: run `npm run build` (or `npm run dev:web` for Vite on :5173).');
}

controls.start();
await reader.start();
await app.listen({ port: PORT, host: HOST });

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i!.address}:${PORT}`);
app.log.info(
  { journalDir: JOURNAL_DIR, presets: controls.presets, boundActions: Object.keys(controls.keyLabels()).length, open: lan },
  'EliteTerminals ready',
);
