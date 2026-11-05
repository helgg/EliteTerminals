<script lang="ts">
  import { LANDMARKS, POI_WINDOWED, REGION_GRID, REGION_NAMES, distance, regionAt, regionGrid, type Pos, type PoiKind, type PoiResult, type RichesResult, type RichesStop } from '@et/shared';
  import { copyName } from '../copy.svelte.ts';
  import PlotButton from '../trade/PlotButton.svelte';
  import ExpButton from './ExpButton.svelte';
  import { credits } from './explore.ts';

  // The galaxy seen from above (x right, z up: the core is at the top): the 42 codex regions with their borders, the
  // well-known places, the system on show, where you are and the route you plotted. Drag to move, wheel or pinch to zoom.
  let { system, name, here = null, hereName = '', route = [], carrier = null, jumpRange = 0, height = 320, onexpand }: {
    system: Pos;
    name: string;
    here?: Pos | null;
    hereName?: string;
    route?: { system: string; pos: Pos }[];
    /** Your fleet carrier, for its jump ring. */
    carrier?: { name: string; system: string; pos: Pos } | null;
    /** The ship's jump range (ly): what the road to riches is planned for, to start with. */
    jumpRange?: number;
    height?: number | string;
    /** Shown as a ⤢ button when given (the card version opens the big one). */
    onexpand?: () => void;
  } = $props();

  const N = REGION_GRID.size;
  const CELL = REGION_GRID.cell;
  const X_RANGE = [-46000, 46000] as const;
  const Z_RANGE = [-26000, 68000] as const;
  const MIN_SCALE = 0.002;
  const MAX_SCALE = 4;

  let box: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let w = $state(300);
  let h = $state(300);
  let view = $state({ x: 0, z: 22000, k: 0.004 });
  let hover = $state<{ x: number; z: number; region: string } | null>(null);
  let dirty = true;
  let fitted = false;

  // ---- layers: stars worth a detour and sites worth a trip (Spansh). Tap a point for its card.
  const LAYERS: { id: PoiKind; label: string; colour: string; hint: string }[] = [
    { id: 'neutron', label: 'NEUTRON', colour: '#7fe3ff', hint: 'Neutron stars: the nearest 500 around the centre of the map, more as you zoom in' },
    { id: 'blackhole', label: 'BLACK HOLE', colour: '#c58cff', hint: 'Black holes: the nearest 500 around the centre of the map, more as you zoom in' },
    { id: 'guardian', label: 'GUARDIAN', colour: '#9af070', hint: 'Bodies with Guardian sites, the whole galaxy' },
    { id: 'thargoid', label: 'THARGOID', colour: '#ff5a4a', hint: 'Bodies with Thargoid signals, the whole galaxy' },
  ];
  const WINDOW_MAX_LY = 1500; // a window wider than this is not asked for: zoom in
  let on = $state<Record<PoiKind, boolean>>(readLayers());
  function readLayers(): Record<PoiKind, boolean> {
    const d = { neutron: false, blackhole: false, guardian: false, thargoid: false };
    try { return { ...d, ...JSON.parse(localStorage.getItem('et.galaxy.layers') ?? '{}') }; } catch { return d; }
  }
  $effect(() => {
    const v = JSON.stringify(on);
    try { localStorage.setItem('et.galaxy.layers', v); } catch { /* not remembered */ }
  });
  let data = $state<Partial<Record<PoiKind, PoiResult>>>({});
  let loading = $state<Partial<Record<PoiKind, boolean>>>({});
  let failed = $state('');
  let tooWide = $state(false);
  const asked: Partial<Record<PoiKind, string>> = {};

  const windowOf = () => {
    const radius = 0.55 * Math.hypot(w, h) / view.k;
    return { radius, centre: [view.x, system[1], view.z] as Pos };
  };
  async function load(kind: PoiKind) {
    let body: { kind: PoiKind; center?: Pos; radius?: number } = { kind };
    let key: string = kind;
    if (POI_WINDOWED.includes(kind)) {
      const win = windowOf();
      if (win.radius > WINDOW_MAX_LY) return;
      body = { kind, center: win.centre, radius: win.radius };
      // the server snaps the window; asking again for what is already on show only costs a look at its cache
      key = `${Math.round(win.radius / 25)}|${win.centre.map((v) => Math.round(v / Math.max(10, win.radius / 4))).join(',')}`;
    }
    if (asked[kind] === key) return;
    asked[kind] = key;
    loading[kind] = true;
    try {
      const res = await fetch('/api/explore/pois', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
      if (asked[kind] === key) { data[kind] = out; failed = ''; dirty = true; }
    } catch (err) {
      failed = (err as Error).message;
      delete asked[kind]; // ask again next time
    } finally {
      loading[kind] = false;
    }
  }
  let settle: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    // after the map has been still for a moment, ask for what the layers on show are missing
    void view.x; void view.z; void view.k; void on.neutron; void on.blackhole; void on.guardian; void on.thargoid;
    clearTimeout(settle);
    tooWide = (on.neutron || on.blackhole) && windowOf().radius > WINDOW_MAX_LY;
    settle = setTimeout(() => { for (const l of LAYERS) if (on[l.id]) void load(l.id); }, 450);
    return () => clearTimeout(settle);
  });
  const shown = (k: PoiKind) => (on[k] ? data[k]?.points ?? [] : []);
  const count = (k: PoiKind) => data[k]?.points.length ?? 0;

  // ---- the carrier's jump ring (a carrier jumps 500 ly at most) and a road to riches (Spansh's route planner)
  const CARRIER_JUMP = 500;
  const RICH = '#ffd24a';
  const flag = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
  const remember = (key: string, v: boolean) => { try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* not remembered */ } };
  let ring = $state(flag('et.galaxy.ring'));
  let richesOn = $state(flag('et.galaxy.riches'));
  $effect(() => remember('et.galaxy.ring', ring));
  $effect(() => remember('et.galaxy.riches', richesOn));
  let rRange = $state(0);
  let rStops = $state(15);
  $effect(() => { if (!rRange && jumpRange > 0) rRange = Math.round(jumpRange * 10) / 10; });
  let riches = $state<RichesResult | null>(null);
  let richesBusy = $state(false);
  let richesErr = $state('');
  async function planRiches() {
    richesBusy = true; richesErr = '';
    try {
      const res = await fetch('/api/explore/riches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: hereName, range: rRange || 30, stops: rStops }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
      riches = out; dirty = true;
      const b = bounds(out.stops.map((st: RichesStop) => st.pos));
      if (b) view = b;
    } catch (err) {
      richesErr = (err as Error).message;
    } finally {
      richesBusy = false;
    }
  }
  /** A view that holds all the points, a little loose. */
  function bounds(ps: Pos[]) {
    if (!ps.length) return null;
    const xs = ps.map((p) => p[0]), zs = ps.map((p) => p[2]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(w / Math.max(60, (x1 - x0) * 1.5), h / Math.max(60, (z1 - z0) * 1.5))));
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, k };
  }
  const stopsShown = $derived((riches?.stops ?? []).map((st, i) => ({ st, i })).filter((x) => x.i > 0 && x.st.bodies.length));
  function stopCard(st: RichesStop, i: number): Picked {
    return {
      name: st.system, system: st.system, pos: st.pos, kind: `ROAD TO RICHES · STOP ${i}`, colour: RICH,
      detail: `${st.bodies.length} ${st.bodies.length === 1 ? 'body' : 'bodies'} · ${credits(st.value)} Cr`,
      lines: st.bodies.map((b) => `${b.name.startsWith(st.system) ? b.name.slice(st.system.length).trim() || b.name : b.name} · ${b.subtype}${b.terraformable ? ' (terraformable)' : ''} · ${credits(b.value)}`),
    };
  }
  function focusStop(st: RichesStop, i: number) {
    view = { x: st.pos[0], z: st.pos[2], k: Math.max(view.k, 0.3) };
    picked = stopCard(st, i);
    dirty = true;
  }
  const toCarrier = () => carrier && (view = { x: carrier.pos[0], z: carrier.pos[2], k: Math.min(w, h) / (2.4 * CARRIER_JUMP) });
  /** What the layers on show hold within one jump of the carrier (true distance, the height counts). */
  const inRange = $derived(
    carrier && ring
      ? LAYERS.map((l) => ({ l, n: shown(l.id).filter((p) => distance(p.pos, carrier.pos) <= CARRIER_JUMP).length })).filter((x) => x.n)
      : [],
  );
  const animated = $derived(!!(carrier && ring) || !!(richesOn && riches));
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the point under a tap, and its card
  type Picked = { name: string; system: string; pos: Pos; kind: string; colour: string; detail: string; lines?: string[] };
  let picked = $state<Picked | null>(null);
  function pickAt(px: number, py: number) {
    let best: Picked | null = null, bd = 14;
    const test = (p: Picked) => {
      const d = Math.hypot(sx(p.pos[0]) - px, sz(p.pos[2]) - py);
      if (d < bd) { bd = d; best = p; }
    };
    for (const l of LAYERS) for (const p of shown(l.id)) test({ ...p, kind: l.label, colour: l.colour });
    if (richesOn && riches) riches.stops.forEach((st, i) => { if (i > 0 && st.bodies.length) test(stopCard(st, i)); });
    for (const l of LANDMARKS) test({ name: l.name, system: l.name, pos: l.pos, kind: 'LANDMARK', colour: '#e9dccd', detail: '' });
    picked = best;
    dirty = true;
  }
  const lyTo = (a: Pos, b: Pos) => { const d = distance(a, b); return d < 10 ? `${d.toFixed(1)} ly` : `${Math.round(d).toLocaleString('en-US')} ly`; };

  // ---- region layers, built once and shared by every map on screen
  const TILE = 128; // cells per border tile: only the tiles in view are stroked
  type Layers = { fill: HTMLCanvasElement; tiles: Path2D[]; labels: { id: number; name: string; x: number; z: number; cells: number }[]; grid: Uint8Array };
  let layers: Layers | null = null;
  /** One 32-bit pixel (little endian ABGR) per cell: writing through a Uint32Array is far faster than ImageData.data. */
  const paint = (cells: Uint8Array, colour: (id: number) => number) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const x = cv.getContext('2d')!;
    const img = x.createImageData(N, N);
    const px = new Uint32Array(img.data.buffer);
    const lut = Array.from({ length: REGION_NAMES.length }, (_, id) => colour(id));
    for (let i = 0; i < cells.length; i++) { const v = lut[cells[i]]; if (v) px[i] = v; }
    x.putImageData(img, 0, 0);
    return cv;
  };
  function build(): Layers {
    if (layers) return layers;
    const grid = regionGrid();
    const abgr = (r: number, g: number, b: number, a: number) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    const fill = paint(grid, (id) => (id ? abgr(...hsl((id * 137.5) % 360, 0.5, 0.46), 46) : 0));
    // borders on the cell edges, merged into runs and cut into tiles
    const tiles: Path2D[] = Array.from({ length: Math.ceil(N / TILE) ** 2 }, () => new Path2D());
    const T = Math.ceil(N / TILE);
    const wx = (px: number) => REGION_GRID.x0 + px * CELL;
    const wz = (pz: number) => REGION_GRID.z0 + pz * CELL;
    for (let pz = 0; pz < N - 1; pz++) { // horizontal edges between row pz and pz + 1
      let start = -1;
      for (let px = 0; px <= N; px++) {
        const diff = px < N && grid[pz * N + px] !== grid[(pz + 1) * N + px];
        const cut = px % TILE === 0;
        if (start >= 0 && (!diff || cut)) { const t = tiles[Math.floor(pz / TILE) * T + Math.floor((px - 1) / TILE)]; t.moveTo(wx(start), wz(pz + 1)); t.lineTo(wx(px), wz(pz + 1)); start = -1; }
        if (diff && start < 0) start = px;
      }
    }
    for (let px = 0; px < N - 1; px++) { // vertical edges between column px and px + 1
      let start = -1;
      for (let pz = 0; pz <= N; pz++) {
        const diff = pz < N && grid[pz * N + px] !== grid[pz * N + px + 1];
        const cut = pz % TILE === 0;
        if (start >= 0 && (!diff || cut)) { const t = tiles[Math.floor((pz - 1) / TILE) * T + Math.floor(px / TILE)]; t.moveTo(wx(px + 1), wz(start)); t.lineTo(wx(px + 1), wz(pz)); start = -1; }
        if (diff && start < 0) start = pz;
      }
    }
    // a label spot per region: the region's own cell nearest to its mean
    const sum = new Map<number, { sx: number; sz: number; n: number }>();
    for (let pz = 0; pz < N; pz += 2) for (let px = 0; px < N; px += 2) {
      const id = grid[pz * N + px];
      if (!id) continue;
      const a = sum.get(id) ?? { sx: 0, sz: 0, n: 0 };
      a.sx += px; a.sz += pz; a.n++;
      sum.set(id, a);
    }
    const labels = [...sum.entries()].map(([id, a]) => {
      const mx = a.sx / a.n, mz = a.sz / a.n;
      let best = [mx, mz], bd = Infinity;
      for (let pz = 0; pz < N; pz += 8) for (let px = 0; px < N; px += 8) {
        if (grid[pz * N + px] !== id) continue;
        const d = (px - mx) ** 2 + (pz - mz) ** 2;
        if (d < bd) { bd = d; best = [px, pz]; }
      }
      return { id, name: REGION_NAMES[id] ?? '', x: wx(best[0]), z: wz(best[1]), cells: a.n * 4 };
    });
    layers = { fill, tiles, labels, grid };
    return layers;
  }
  function hsl(hue: number, s: number, l: number): [number, number, number] {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => { const k = (n + hue / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }

  // the region of the system, painted brighter
  const mine = $derived(regionAt(system[0], system[2]));
  let hi: HTMLCanvasElement | null = null;
  let hiId = -1;
  function highlight(id: number) {
    if (id === hiId) return hi;
    hiId = id;
    if (!id) return (hi = null);
    // 255, 122, 24 at alpha 58
    return (hi = paint(build().grid, (i) => (i === id ? ((58 << 24) | (24 << 16) | (122 << 8) | 255) >>> 0 : 0)));
  }

  // ---- view
  const fit = () => {
    const k = Math.min(w / (X_RANGE[1] - X_RANGE[0]), h / (Z_RANGE[1] - Z_RANGE[0]));
    view = { x: (X_RANGE[0] + X_RANGE[1]) / 2, z: (Z_RANGE[0] + Z_RANGE[1]) / 2, k };
  };
  const toSystem = (k = 0.06) => (view = { x: system[0], z: system[2], k });
  const toHere = () => here && (view = { x: here[0], z: here[2], k: view.k });
  const sx = (x: number) => w / 2 + (x - view.x) * view.k;
  const sz = (z: number) => h / 2 - (z - view.z) * view.k;
  const wx = (px: number) => view.x + (px - w / 2) / view.k;
  const wz = (py: number) => view.z - (py - h / 2) / view.k;
  function zoom(f: number, px = w / 2, py = h / 2) {
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.k * f));
    const x = wx(px), z = wz(py);
    view = { k, x: x - (px - w / 2) / k, z: z + (py - h / 2) / k };
  }

  // ---- drawing
  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const c = canvas.getContext('2d')!;
    const L = build();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, bw, bh);
    // world → pixels, z up
    c.setTransform(view.k * dpr, 0, 0, -view.k * dpr, (w / 2 - view.x * view.k) * dpr, (h / 2 + view.z * view.k) * dpr);
    const span = N * CELL;
    c.imageSmoothingEnabled = false;
    c.drawImage(L.fill, REGION_GRID.x0, REGION_GRID.z0, span, span);
    const H = highlight(mine?.id ?? 0);
    if (H) c.drawImage(H, REGION_GRID.x0, REGION_GRID.z0, span, span);
    c.lineWidth = 1 / view.k;
    c.strokeStyle = 'rgb(255 181 69 / 0.30)';
    const T = Math.ceil(N / TILE);
    const tw = TILE * CELL;
    const tx0 = Math.max(0, Math.floor((wx(0) - REGION_GRID.x0) / tw)), tx1 = Math.min(T - 1, Math.floor((wx(w) - REGION_GRID.x0) / tw));
    const tz0 = Math.max(0, Math.floor((wz(h) - REGION_GRID.z0) / tw)), tz1 = Math.min(T - 1, Math.floor((wz(0) - REGION_GRID.z0) / tw));
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) c.stroke(L.tiles[tz * T + tx]);
    // pixel space from here on
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the galactic centre
    const cx = sx(25.2), cz = sz(25900);
    // a soft glow that stays small on screen and fades out as you zoom in (a 500 ly view is no place for a haze)
    const gr = Math.min(90, Math.max(10, 1500 * view.k));
    const fade = Math.min(1, Math.max(0, 1 - (view.k - 0.03) / 0.07));
    if (fade > 0) {
      const glow = c.createRadialGradient(cx, cz, 0, cx, cz, gr);
      glow.addColorStop(0, `rgb(255 220 150 / ${(0.55 * fade).toFixed(3)})`); glow.addColorStop(1, 'rgb(255 160 60 / 0)');
      c.fillStyle = glow; c.fillRect(cx - gr, cz - gr, gr * 2, gr * 2);
    }
    // region names: only those with room for them
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const l of L.labels) {
      const room = l.cells * (CELL * view.k) ** 2;
      const px = sx(l.x), py = sz(l.z);
      if (px < -80 || px > w + 80 || py < -20 || py > h + 20) continue;
      const own = l.id === mine?.id;
      const size = Math.max(7, Math.min(13, 6 + Math.sqrt(room) / 40));
      if (!own && room < l.name.length * size * size * 0.9) continue;
      c.font = `${own ? 700 : 400} ${size}px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`;
      c.fillStyle = own ? 'rgb(255 181 69 / 0.95)' : 'rgb(233 220 205 / 0.55)';
      c.fillText(l.name.toUpperCase(), px, py);
    }
    // layers: glowing points, the sites a little larger; names once there is room for them
    c.globalCompositeOperation = 'lighter';
    for (const l of LAYERS) {
      const pts = shown(l.id);
      if (!pts.length) continue;
      const r = l.id === 'guardian' || l.id === 'thargoid' ? 2.6 : 1.8;
      c.fillStyle = l.colour;
      for (const p of pts) {
        const px = sx(p.pos[0]), py = sz(p.pos[2]);
        if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
        c.globalAlpha = 0.9; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
        c.globalAlpha = pts.length > 150 ? 0.08 : 0.16; c.beginPath(); c.arc(px, py, r * 3.2, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (view.k > 0.12) {
      c.font = `10px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`; c.textAlign = 'left';
      for (const l of LAYERS) {
        const pts = shown(l.id).filter((p) => { const px = sx(p.pos[0]), py = sz(p.pos[2]); return px > 0 && px < w && py > 0 && py < h; });
        if (pts.length > 60) continue;
        c.fillStyle = l.colour;
        for (const p of pts) c.fillText(p.system, sx(p.pos[0]) + 7, sz(p.pos[2]) + 3);
      }
    }
    // the picked point
    if (picked) {
      const px = sx(picked.pos[0]), py = sz(picked.pos[2]);
      c.strokeStyle = picked.colour; c.lineWidth = 1.5;
      c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.stroke();
    }
    // the carrier's jump ring: a pulse leaving the carrier and a slowly turning dashed edge
    const t = performance.now();
    if (carrier && ring) {
      const cx = sx(carrier.pos[0]), cy = sz(carrier.pos[2]), R = CARRIER_JUMP * view.k;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgb(255 181 69 / 0.045)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      const ph = (t % 3200) / 3200;
      c.strokeStyle = `rgb(255 181 69 / ${(0.35 * (1 - ph)).toFixed(3)})`; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, R * (0.55 + 0.45 * ph), 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgb(255 181 69 / 0.9)'; c.lineWidth = 1.5; c.setLineDash([10, 6]); c.lineDashOffset = -(t / 60) % 16;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#ffb545'; c.shadowColor = '#ffb545'; c.shadowBlur = 8;
      c.fillRect(cx - 3, cy - 3, 6, 6); c.shadowBlur = 0;
      if (R > 40) {
        c.font = `700 10px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`; c.textAlign = 'center';
        const lab = `${carrier.name} · ${CARRIER_JUMP} LY`; const lw = c.measureText(lab).width;
        c.fillStyle = 'rgb(11 7 5 / 0.75)'; c.fillRect(cx - lw / 2 - 4, cy - R - 17, lw + 8, 14);
        c.fillStyle = '#ffb545'; c.fillText(lab, cx, cy - R - 6);
      }
    }
    // the road to riches: a glowing line with a stop for every system that pays
    if (richesOn && riches && riches.stops.length > 1) {
      const pts = riches.stops.map((p) => [sx(p.pos[0]), sz(p.pos[2])] as const);
      const trace = () => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
      c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round';
      c.strokeStyle = 'rgb(255 210 74 / 0.12)'; c.lineWidth = 8; trace(); c.stroke();
      c.strokeStyle = 'rgb(255 210 74 / 0.95)'; c.lineWidth = 1.6; c.setLineDash([9, 5]); c.lineDashOffset = -(t / 45) % 14; trace(); c.stroke(); c.setLineDash([]);
      c.globalCompositeOperation = 'source-over';
      c.font = `700 10px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      riches.stops.forEach((st, i) => {
        if (!i || !st.bodies.length) return;
        const [x, y] = pts[i];
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;
        const r = 4 + Math.min(4, st.value / 1.5e6);
        c.fillStyle = RICH; c.shadowColor = RICH; c.shadowBlur = 8; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
        if (r >= 6 || view.k > 0.05) { c.fillStyle = '#1a0f05'; c.fillText(String(i), x, y + 0.5); }
      });
      c.textBaseline = 'alphabetic';
    }
    // route
    if (route.length > 1) {
      c.strokeStyle = 'rgb(55 198 212 / 0.9)'; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath();
      route.forEach((p, i) => (i ? c.lineTo(sx(p.pos[0]), sz(p.pos[2])) : c.moveTo(sx(p.pos[0]), sz(p.pos[2]))));
      c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgb(55 198 212)';
      if (view.k > 0.01) for (const p of route) c.fillRect(sx(p.pos[0]) - 1.5, sz(p.pos[2]) - 1.5, 3, 3);
    }
    // landmarks
    c.font = `10px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`;
    for (const l of LANDMARKS) {
      const px = sx(l.pos[0]), py = sz(l.pos[2]);
      c.fillStyle = l.kind === 'core' ? '#ffd98a' : l.kind === 'home' ? '#e9dccd' : '#9af070';
      c.beginPath(); c.arc(px, py, 3, 0, Math.PI * 2); c.fill();
      if (Math.hypot(px - sx(system[0]), py - sz(system[2])) > 44) { c.textAlign = 'left'; c.fillText(l.name, px + 6, py + 3); }
    }
    // you
    if (here && distance(here, system) > 0.5) marker(c, sx(here[0]), sz(here[2]), '#37c6d4', hereName || 'YOU', 'left');
    // the system
    marker(c, sx(system[0]), sz(system[2]), '#ff7a18', name, 'right', true);
    // scale bar
    const nice = [1, 2, 5].flatMap((m) => [1, 10, 100, 1000, 10000].map((p) => m * p)).sort((a, b) => a - b).find((v) => v * view.k >= 60) ?? 10000;
    c.strokeStyle = c.fillStyle = 'rgb(233 220 205 / 0.8)'; c.lineWidth = 1; c.textAlign = 'left'; c.font = `10px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`;
    c.beginPath(); c.moveTo(10, h - 14); c.lineTo(10, h - 10); c.lineTo(10 + nice * view.k, h - 10); c.lineTo(10 + nice * view.k, h - 14); c.stroke();
    c.fillText(`${nice.toLocaleString('en-US')} ly`, 10, h - 18);
    dirty = false;
  }
  function marker(c: CanvasRenderingContext2D, px: number, py: number, col: string, text: string, side: 'left' | 'right', ring = false) {
    if (ring) {
      c.strokeStyle = col; c.lineWidth = 1.5;
      c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.35; c.beginPath(); c.arc(px, py, 15, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 8;
    c.beginPath(); c.arc(px, py, ring ? 4 : 3.5, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
    c.font = `700 11px ${getComputedStyle(box).getPropertyValue('--mono') || 'monospace'}`;
    const tw = c.measureText(text).width;
    const flip = side === 'right' ? px + 14 + tw > w : px - 14 - tw < 0;
    const left = side === 'right' ? !flip : flip;
    const lx = left ? px + 14 : px - 14;
    c.textAlign = left ? 'left' : 'right';
    c.fillStyle = 'rgb(11 7 5 / 0.75)';
    c.fillRect(left ? lx - 3 : lx - tw - 3, py - 17, tw + 6, 14);
    c.fillStyle = col;
    c.fillText(text, lx, py - 6);
  }

  $effect(() => {
    void system; void here; void route; void name; void view; void data; void on.neutron; void on.blackhole; void on.guardian; void on.thargoid; void picked; void carrier; void ring; void riches; void richesOn;
    dirty = true;
  });
  $effect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => {
      w = Math.max(100, box.clientWidth); h = Math.max(100, box.clientHeight);
      if (!fitted) { fitted = true; toSystem(0); fit(); }
      dirty = true;
    });
    ro.observe(box);
    let raf = 0;
    let lastDraw = 0;
    const loop = (now: number) => {
      // the ring and the road move: about 15 frames a second (each one redraws the whole map), none for those who asked for calm
      if (dirty || (animated && !calm && now - lastDraw > 66)) { draw(); lastDraw = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  });

  // ---- pointer: drag, pinch, wheel
  const pts = new Map<number, { x: number; y: number }>();
  let last = 0;
  let press: { x: number; y: number; moved: number } | null = null;
  function down(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    press = pts.size === 0 ? { x: e.offsetX, y: e.offsetY, moved: 0 } : null;
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    last = pts.size === 2 ? pinchDist() : 0;
  }
  const pinchDist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  function move(e: PointerEvent) {
    const p = pts.get(e.pointerId);
    if (!p) {
      hover = { x: wx(e.offsetX), z: wz(e.offsetY), region: regionAt(wx(e.offsetX), wz(e.offsetY))?.name ?? 'outside the region map' };
      return;
    }
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const d = pinchDist();
      const [a, b] = [...pts.values()];
      if (last) zoom(d / last, (a.x + b.x) / 2, (a.y + b.y) / 2);
      last = d;
      return;
    }
    if (press) press.moved = Math.max(press.moved, Math.hypot(e.offsetX - press.x, e.offsetY - press.y));
    view = { ...view, x: view.x - (e.offsetX - p.x) / view.k, z: view.z + (e.offsetY - p.y) / view.k };
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  }
  const up = (e: PointerEvent) => {
    // a tap (hardly moved, nothing else touching) picks the point under it; a tap on empty map drops the card
    if (press && pts.size === 1 && press.moved < 5 && e.type === 'pointerup') pickAt(e.offsetX, e.offsetY);
    press = null;
    pts.delete(e.pointerId);
    last = 0;
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0016), e.offsetX, e.offsetY); };
</script>

<div class="gm" bind:this={box} style:height={typeof height === 'number' ? `${height}px` : height} style:--mono="var(--mono)">
  <canvas
    bind:this={canvas}
    style:width="100%" style:height="100%"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
    onpointerleave={() => (hover = null)} onwheel={wheel} ondblclick={(e) => zoom(2, e.offsetX, e.offsetY)}
    aria-label="Galaxy map of {name}"
  ></canvas>
  {#if hover}
    <div class="tip"><b>{hover.region.toUpperCase()}</b><span>{Math.round(hover.x).toLocaleString('en-US')} · {Math.round(hover.z).toLocaleString('en-US')}</span></div>
  {/if}
  <div class="layers" role="group" aria-label="Layers">
    {#each LAYERS as l (l.id)}
      <button class:on={on[l.id]} style:--c={l.colour} title={l.hint} onclick={() => (on[l.id] = !on[l.id])}>
        <i aria-hidden="true"></i>{l.label}{#if on[l.id] && count(l.id)}<em>{count(l.id).toLocaleString('en-US')}</em>{/if}{#if loading[l.id]}<b class="spin" aria-label="loading"></b>{/if}
      </button>
    {/each}
    {#if carrier}
      <button class:on={ring} style:--c="#ffb545" title="The {CARRIER_JUMP} ly a carrier jumps at most, around {carrier.name} in {carrier.system}" onclick={() => (ring = !ring)}><i aria-hidden="true"></i>CARRIER {CARRIER_JUMP} LY</button>
    {/if}
    <button class:on={richesOn} style:--c={RICH} title="A road to riches planned by Spansh: systems whose worlds pay most for a scan and a mapping" onclick={() => (richesOn = !richesOn)}><i aria-hidden="true"></i>RICHES{#if richesOn && riches}<em>{stopsShown.length}</em>{/if}</button>
    {#if inRange.length}<span class="note">IN {CARRIER_JUMP} LY OF THE CARRIER · {inRange.map((x) => `${x.n.toLocaleString('en-US')} ${x.l.label}`).join(' · ')}</span>{/if}
    {#if tooWide}<span class="note">ZOOM IN TO LOAD STARS</span>
    {:else if (on.neutron && data.neutron?.more) || (on.blackhole && data.blackhole?.more)}<span class="note">NEAREST 500 TO THE CENTRE · ZOOM IN FOR MORE</span>{/if}
    {#if failed}<span class="note bad" title={failed}>SPANSH NOT ANSWERING</span>{/if}
  </div>
  {#if richesOn}
    <div class="rich" role="group" aria-label="Road to riches">
      <header><b>ROAD TO RICHES</b><button class="x" onclick={() => (richesOn = false)} aria-label="Close">✕</button></header>
      <span class="dim">A loop from {hereName || 'where you are'}, planned by Spansh</span>
      <div class="row">
        <label>RANGE<input type="number" min="5" max="500" step="0.5" bind:value={rRange} /><u>ly</u></label>
        <label>STOPS<input type="number" min="3" max="100" step="1" bind:value={rStops} /></label>
      </div>
      <button class="go" disabled={richesBusy} onclick={planRiches}>{richesBusy ? 'PLANNING…' : riches ? 'RECALCULATE' : 'CALCULATE'}</button>
      {#if richesBusy}<span class="dim">Spansh takes a few seconds</span>{/if}
      {#if richesErr}<span class="bad">{richesErr}</span>{/if}
      {#if riches && !richesBusy}
        <span class="sum">{stopsShown.length} SYSTEMS · <b>{credits(riches.value)}</b> CR</span>
        <ol>
          {#each stopsShown as { st, i } (i)}
            <li><button onclick={() => focusStop(st, i)} title="Show {st.system}"><span class="n">{i}</span><span class="nm">{st.system}</span><em>{credits(st.value)}</em></button></li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
  {#if picked}
    <div class="card" style:--c={picked.colour} role="dialog" aria-label={picked.system}>
      <header><i></i><span class="kind">{picked.kind}</span><button class="x" onclick={() => { picked = null; dirty = true; }} aria-label="Close">✕</button></header>
      <b class="sys">{picked.system.toUpperCase()}</b>
      {#if picked.name !== picked.system}<span class="dim">{picked.name}</span>{/if}
      {#if picked.detail}<span class="muted">{picked.detail}</span>{/if}
      {#if picked.lines?.length}<ul class="lines">{#each picked.lines as ln (ln)}<li>{ln}</li>{/each}</ul>{/if}
      <span class="dim">{regionAt(picked.pos[0], picked.pos[2])?.name ?? 'outside the region map'}</span>
      <span class="far">
        {#if here}<span>FROM YOU <b>{lyTo(here, picked.pos)}</b></span>{/if}
        {#if !here || distance(here, system) > 0.5}<span>FROM {name.toUpperCase()} <b>{lyTo(system, picked.pos)}</b></span>{/if}
      </span>
      <div class="acts">
        <button class="copy" onclick={() => copyName(picked!.system)} title="Copy the system name (to the PC's clipboard too)">COPY</button>
        <PlotButton system={picked.system} />
        <ExpButton system={picked.system} />
      </div>
    </div>
  {/if}
  <div class="tools">
    <button onclick={() => zoom(1.6)} aria-label="Zoom in">＋</button>
    <button onclick={() => zoom(1 / 1.6)} aria-label="Zoom out">－</button>
    <button onclick={() => toSystem()} title="Centre on {name}">SYS</button>
    {#if carrier}<button onclick={toCarrier} title="Centre on {carrier.name}">CAR</button>{/if}
    {#if here}<button onclick={toHere} title="Centre on {hereName || 'your position'}">YOU</button>{/if}
    <button onclick={fit} title="The whole galaxy">ALL</button>
    {#if onexpand}<button onclick={onexpand} aria-label="Open the big map" title="Open the big map">⤢</button>{/if}
  </div>
</div>

<style>
  .gm { position: relative; width: 100%; background: #070402; border: 1px solid var(--rule); overflow: hidden; touch-action: none; }
  canvas { display: block; cursor: grab; }
  canvas:active { cursor: grabbing; }
  .tip { z-index: 2;
    position: absolute; left: 8px; top: 8px; display: flex; flex-direction: column; gap: 1px; padding: 4px 8px; pointer-events: none;
    background: rgb(11 7 5 / 0.85); border: 1px solid var(--rule); font-size: 11px; color: var(--muted);
  }
  .tip b { color: var(--hud-hi); font-size: 11px; letter-spacing: 0.08em; }
  .tools { position: absolute; right: 6px; top: 6px; display: flex; gap: 3px; }
  .layers { position: absolute; right: 6px; bottom: 6px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: calc(100% - 12px); }
  .layers button {
    display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; background: rgb(21 16 11 / 0.88); border: 1px solid var(--rule);
    color: var(--muted); font: inherit; font-size: 10px; letter-spacing: 0.08em; cursor: pointer;
  }
  .layers button i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid var(--c); }
  .layers button.on { color: var(--text); border-color: var(--c); }
  .layers button.on i { background: var(--c); box-shadow: 0 0 6px var(--c); }
  .layers em { font-style: normal; color: var(--dim); font-variant-numeric: tabular-nums; }
  .layers .spin { width: 8px; height: 8px; border: 1px solid var(--c); border-right-color: transparent; border-radius: 50%; animation: gm-spin 0.8s linear infinite; }
  .note { align-self: center; padding: 0 6px; font-size: 10px; letter-spacing: 0.08em; color: var(--hud-hi); background: rgb(11 7 5 / 0.8); }
  .note.bad { color: var(--danger); }
  @keyframes gm-spin { to { transform: rotate(360deg); } }
  .card {
    position: absolute; left: 8px; bottom: 30px; width: min(260px, calc(100% - 16px)); display: flex; flex-direction: column; gap: 3px; padding: 8px 10px 10px;
    background: rgb(21 16 11 / 0.96); border: 1px solid var(--c); box-shadow: 0 0 14px color-mix(in srgb, var(--c) 35%, transparent); font-size: 11px;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }
  .card header { display: flex; align-items: center; gap: 6px; }
  .card header i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 6px var(--c); }
  .card .kind { font-size: 10px; letter-spacing: 0.12em; color: var(--c); }
  .card .x { margin-left: auto; width: 24px; height: 22px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi); font-size: 11px; cursor: pointer; }
  .card .sys { font-size: 14px; letter-spacing: 0.06em; color: var(--text); overflow-wrap: anywhere; }
  .card .far { display: flex; flex-wrap: wrap; gap: 2px 12px; color: var(--dim); font-size: 10px; letter-spacing: 0.06em; }
  .card .far b { color: var(--telemetry); font-weight: 700; }
  .card .acts { display: flex; gap: 6px; margin-top: 5px; }
  .card .copy {
    flex: none; min-width: 58px; padding: 5px 7px 4px; font: inherit; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; border: 0;
    color: var(--hud-hi); background: color-mix(in srgb, var(--hud-hi) 14%, var(--steel)); box-shadow: inset 0 2px var(--hud-hi);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%);
  }
  .card .copy:hover { background: color-mix(in srgb, var(--hud-hi) 24%, var(--steel)); }
  .rich {
    position: absolute; left: 8px; top: 58px; width: min(230px, calc(100% - 16px)); max-height: calc(100% - 108px); overflow-y: auto; display: flex; flex-direction: column; gap: 5px;
    padding: 8px 10px 10px; background: rgb(21 16 11 / 0.95); border: 1px solid #ffd24a; box-shadow: 0 0 14px rgb(255 210 74 / 0.25); font-size: 11px;
  }
  .rich header { display: flex; align-items: center; gap: 6px; }
  .rich header b { font-size: 10px; letter-spacing: 0.12em; color: #ffd24a; }
  .rich .x { margin-left: auto; width: 24px; height: 22px; background: var(--steel); border: 1px solid var(--rule); color: var(--hud-hi); font-size: 11px; cursor: pointer; }
  .rich .row { display: flex; gap: 8px; }
  .rich label { display: flex; align-items: center; gap: 4px; font-size: 9px; letter-spacing: 0.1em; color: var(--dim); }
  .rich input { width: 52px; height: 24px; padding: 0 4px; background: #0b0705; border: 1px solid var(--rule); color: var(--text); font: inherit; font-size: 11px; }
  .rich u { text-decoration: none; }
  .rich .go {
    padding: 6px 8px 5px; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; cursor: pointer; border: 0; color: #ffd24a;
    background: color-mix(in srgb, #ffd24a 14%, var(--steel)); box-shadow: inset 0 2px #ffd24a;
  }
  .rich .go:disabled { opacity: 0.6; cursor: progress; }
  .rich .bad { color: var(--danger); }
  .rich .sum { font-size: 10px; letter-spacing: 0.08em; color: var(--dim); }
  .rich .sum b { color: #ffd24a; }
  .rich ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .rich ol button { display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 4px; background: transparent; border: 0; color: var(--text); font: inherit; font-size: 11px; text-align: left; cursor: pointer; }
  .rich ol button:hover { background: rgb(255 210 74 / 0.12); }
  .rich .n { flex: none; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: #ffd24a; color: #1a0f05; font-size: 10px; font-weight: 700; }
  .rich .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rich em { font-style: normal; color: var(--telemetry); font-variant-numeric: tabular-nums; }
  .card .lines { margin: 2px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; max-height: 110px; overflow-y: auto; color: var(--dim); font-size: 10px; }
  .tools button {
    min-width: 30px; height: 28px; padding: 0 7px; background: rgb(36 26 16 / 0.9); border: 1px solid var(--rule); color: var(--hud-hi);
    font: inherit; font-size: 10px; letter-spacing: 0.08em; cursor: pointer;
  }
  .tools button:hover { background: var(--hud); color: #1a0f05; }
</style>
