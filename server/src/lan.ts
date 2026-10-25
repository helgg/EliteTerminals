// Addresses other devices on the network can open the panel at, best first, with a QR code for each.
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import type { PanelAddress } from '@et/shared';

/**
 * The address the PC uses to reach the outside world: "connecting" a UDP socket only picks a route,
 * nothing is sent. Virtual adapters (VirtualBox, WSL, Hyper-V) never win this, the Wi-Fi/Ethernet does.
 */
export function routedAddress(timeoutMs = 500): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const done = (address: string | null) => {
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(address);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    socket.on('error', () => done(null));
    socket.connect(53, '1.1.1.1', () => {
      try { done(socket.address().address); } catch { done(null); }
    });
  });
}

// Adapters a phone on the Wi-Fi cannot reach.
const VIRTUAL = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|tailscale|zerotier/i;
// ...also when Windows names them "Ethernet 2": VirtualBox, Hyper-V, VMware and Parallels MAC prefixes.
const VIRTUAL_MAC = /^(0a:00:27|08:00:27|00:15:5d|00:50:56|00:0c:29|00:1c:42)/i;

export async function panelAddresses(port: number): Promise<PanelAddress[]> {
  const routed = await routedAddress();
  const found = Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((i) => ({ name, ...i })))
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => ({ name: i.name, address: i.address, primary: i.address === routed, virtual: VIRTUAL.test(i.name) || VIRTUAL_MAC.test(i.mac) }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || Number(a.virtual) - Number(b.virtual));
  return Promise.all(
    found.map(async (i) => {
      const url = `http://${i.address}:${port}`;
      // Dark modules on a light ground: every phone camera reads that; inverted codes fail on some.
      const svg = await QRCode.toString(url, {
        type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0b0705', light: '#ffe2bd' },
      });
      return { url, name: i.name, primary: i.primary, virtual: i.virtual, svg };
    }),
  );
}
