// Which of the 6 layouts this screen gets (docs/design/RESPONSIVE-FLIGHT.md). One source of truth:
// components read `viewport.vp`, CSS reads the same value from <html data-vp="…">.
export type DeviceClass = 'phone' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';
export type Vp = `${DeviceClass}-${Orientation}`;

export const VPS: Vp[] = [
  'phone-portrait', 'phone-landscape', 'tablet-portrait', 'tablet-landscape', 'desktop-portrait', 'desktop-landscape',
];

/**
 * By the short side, not the width: a phone on its side is 844 wide and still a phone.
 * phone < 500 ≤ tablet (iPad mini 744 … iPad Pro 12.9" 1024×1366) < desktop.
 */
export function classify(width: number, height: number): Vp {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const device: DeviceClass = short < 500 ? 'phone' : short < 1100 && long < 1400 ? 'tablet' : 'desktop';
  return `${device}-${width >= height ? 'landscape' : 'portrait'}`;
}

export const viewport = $state({
  vp: 'desktop-landscape' as Vp,
  device: 'desktop' as DeviceClass,
  orientation: 'landscape' as Orientation,
  width: 0,
  height: 0,
  /** Set by ?vp=… for testing a layout on the wrong screen. */
  forced: false,
});

/** Starts tracking the window; call once at start-up. */
export function startViewport() {
  const asked = new URLSearchParams(location.search).get('vp') as Vp | null;
  const forced = asked && VPS.includes(asked) ? asked : null;
  const update = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const vp = forced ?? classify(width, height);
    const [device, orientation] = vp.split('-') as [DeviceClass, Orientation];
    Object.assign(viewport, { vp, device, orientation, width, height, forced: !!forced });
    document.documentElement.dataset.vp = vp;
    document.documentElement.dataset.device = device;
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  return () => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
}
