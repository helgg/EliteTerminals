// TRADE screen state that must survive switching tabs (the screen component is unmounted).
import type { TradeResult } from '@et/shared';

export const tradeStore = $state({
  result: null as TradeResult | null,
  selected: '',
  selectedChain: '',
  tab: 'loop' as 'loop' | 'linear' | 'finder' | 'local',
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
  } catch {
    // server unreachable: the SCAN button still works once it is back
  }
}
