// COLONY screen state that must survive switching tabs (the screen component is unmounted).
import type { ColonyResult } from '@et/shared';

export const colonyStore = $state({
  result: null as ColonyResult | null,
  selected: 0,
  loaded: false,
});

/** After a page reload, pick up the server's last search instead of searching again. */
export async function restoreLastColony() {
  if (colonyStore.loaded) return;
  colonyStore.loaded = true;
  try {
    const res = await fetch('/api/colony/last');
    if (res.status === 200) {
      colonyStore.result = await res.json();
      colonyStore.selected ||= colonyStore.result?.systems[0]?.id64 ?? 0;
    }
  } catch {
    // server unreachable: SEARCH still works once it is back
  }
}
