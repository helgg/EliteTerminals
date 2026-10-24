// Number and age formatting shared by the screens.

export const cr = (n: number) => Math.round(n).toLocaleString('en-US');

/** 12 345 678 → "12.3M"; keeps tables narrow. */
export function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

export function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** fresh < 3 h, ok < 24 h, stale beyond. */
export const ageTone = (hours: number) => (hours < 3 ? 'fresh' : hours < 24 ? 'ok' : 'stale');

export function duration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
