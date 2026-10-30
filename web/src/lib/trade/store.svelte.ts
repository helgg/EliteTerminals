// TRADE screen state that must survive switching tabs (the screen component is unmounted).
import type { TradePathResult, TradeResult } from '@et/shared';

export const tradeStore = $state({
  result: null as TradeResult | null,
  selected: '',
  selectedChain: '',
  /** A → B: the last path search and the path picked in it. */
  path: null as TradePathResult | null,
  selectedPath: '',
  tab: 'loop' as 'loop' | 'linear' | 'path' | 'finder' | 'local',
  /** List only the pinned routes (and those a scan left out). */
  pinnedOnly: false,
  loaded: false,
});

/** After a page reload, pick up the server's last scan instead of scanning again. */
export async function restoreLast() {
  if (tradeStore.loaded) return;
  tradeStore.loaded = true;
  try {
    const res = await fetch('/api/trade/last');
    if (res.status === 200) {
      tradeStore.result = await res.json();
      tradeStore.selected ||= tradeStore.result?.routes[0]?.id ?? '';
      tradeStore.selectedChain ||= tradeStore.result?.chains?.[0]?.id ?? '';
    }
    const path = await fetch('/api/trade/last-path');
    if (path.status === 200) {
      tradeStore.path = await path.json();
      tradeStore.selectedPath ||= bestPath(tradeStore.path);
    }
  } catch {
    // server unreachable: the SCAN button still works once it is back
  }
}

/** The path paying most per hour: the one picked when a search comes back. */
export const bestPath = (r: TradePathResult | null) =>
  [...(r?.paths ?? [])].sort((a, b) => b.perHour - a.perHour)[0]?.id ?? '';
