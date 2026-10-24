// WebSocket link to the local server; exposes the live game state as Svelte 5 runes.
import { initialState, type ClientMessage, type EdState, type ServerMessage } from '@et/shared';

export const link = $state({ connected: false, state: initialState() as EdState });

let socket: WebSocket | null = null;
let seq = 0;

export function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => (link.connected = true);
  socket.onclose = () => {
    link.connected = false;
    setTimeout(connect, 1500);
  };
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    if (msg.type === 'state') link.state = msg.state;
  };
}

export function sendCommand(command: string) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const msg: ClientMessage = { type: 'command', id: String(++seq), command };
  socket.send(JSON.stringify(msg));
}
