// WebSocket link to the local server; exposes the live game state as Svelte 5 runes.
import { initialState, type ClientMessage, type EdState, type ServerMessage } from '@et/shared';

export const link = $state({
  connected: false,
  state: initialState() as EdState,
  /** Last command outcome, shown in the status strip. */
  last: null as { command: string; ok: boolean; error?: string; at: number } | null,
  /** Last throttle detent the game accepted; the journal never reports throttle position. */
  throttleCmd: '' as string,
  /** Spansh market scan progress for the TRADE screen. */
  tradeProgress: null as { loaded: number; total: number; done: boolean } | null,
});

let socket: WebSocket | null = null;
let seq = 0;
const inFlight = new Map<string, string>();
const waiting = new Map<string, (ok: boolean) => void>();

export function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => (link.connected = true);
  socket.onclose = () => {
    link.connected = false;
    // Commands in flight will never be answered: let macros waiting on them stop.
    waiting.forEach((done) => done(false));
    waiting.clear();
    setTimeout(connect, 1500);
  };
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    if (msg.type === 'state') link.state = msg.state;
    else if (msg.type === 'tradeProgress') link.tradeProgress = msg;
    else if (msg.type === 'commandResult') {
      const command = inFlight.get(msg.id) ?? '?';
      inFlight.delete(msg.id);
      link.last = { command, ok: msg.ok, error: msg.error, at: Date.now() };
      waiting.get(msg.id)?.(msg.ok);
      waiting.delete(msg.id);
      if (msg.ok && command.startsWith('SetSpeed')) link.throttleCmd = command;
    }
  };
}

/** Keyboard key bound to an action in the player's presets, or undefined if it cannot be sent. */
export function keyFor(action: string): string | undefined {
  return link.state.controls.keys[action];
}

export function sendCommand(command: string): string | undefined {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const id = String(++seq);
  inFlight.set(id, command);
  const msg: ClientMessage = { type: 'command', id, command };
  socket.send(JSON.stringify(msg));
  // A short tick under the finger on tablets that can vibrate (not iPad/Safari).
  try { navigator.vibrate?.(12); } catch {}
  return id;
}

/** Sends a command and resolves once the server reports whether the key reached the game. */
export function runCommand(command: string): Promise<boolean> {
  const id = sendCommand(command);
  if (!id) return Promise.resolve(false);
  return new Promise((resolve) => waiting.set(id, resolve));
}

/** Puts `text` on the PC's clipboard and presses Ctrl+V in the game; resolves like `runCommand`. */
export function pasteText(text: string): Promise<boolean> {
  if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
  const id = String(++seq);
  inFlight.set(id, 'paste');
  const msg: ClientMessage = { type: 'paste', id, text };
  socket.send(JSON.stringify(msg));
  return new Promise((resolve) => waiting.set(id, resolve));
}
