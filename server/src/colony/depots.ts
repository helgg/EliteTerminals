// Construction sites the player has docked at (COLONY v2): what each one needs and what was delivered.
// From the journal (OBSERVED 2026-10-29, Col 359 Sector FM-M d7-90): ColonisationConstructionDepot repeats every
// ~15 s while docked with the whole list; ColonisationContribution (Journal Manual) adds a delivery in between.
import type { ColonyDepot, EdState } from '@et/shared';
import type { JournalEvent } from '../reducer.ts';

/** The primary port's time limit from the beacon (community guides; the journal does not say). */
export const DEADLINE_DAYS = 28;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** "$EXT_PANEL_ColonisationShip; Archambault Territory" → "Colonisation Ship · Archambault Territory". */
export function siteName(raw: string): string {
  return raw
    .split(';')
    .map((p) => p.trim().replace(/^\$EXT_PANEL_/, '').replace(/([a-z])([A-Z])/g, '$1 $2'))
    .filter(Boolean)
    .join(' · ');
}

export function applyColony(state: EdState, e: JournalEvent): void {
  const at = str(e.timestamp);
  const depots = state.colony.depots;
  if (e.event === 'ColonisationConstructionDepot') {
    const marketId = num(e.MarketID);
    if (!marketId) return;
    let d = depots.find((x) => x.marketId === marketId);
    if (d && at && d.updatedAt > at) return; // an older copy (replaying an earlier journal)
    if (!d) {
      d = {
        marketId, system: '', station: '', body: '', pos: [0, 0, 0], progress: 0, complete: false, failed: false,
        resources: [], firstSeenAt: at, updatedAt: at,
        deadline: at ? new Date(Date.parse(at) + DEADLINE_DAYS * 864e5).toISOString() : '', deadlineSet: false,
      };
      depots.unshift(d);
    }
    // the site is where the player is docked when the event comes
    if (state.location.station && state.location.system) {
      d.system = state.location.system;
      d.station = siteName(state.location.station);
      d.body = state.location.body;
      d.pos = state.location.pos;
    }
    d.progress = num(e.ConstructionProgress);
    d.complete = e.ConstructionComplete === true;
    d.failed = e.ConstructionFailed === true;
    d.resources = (Array.isArray(e.ResourcesRequired) ? e.ResourcesRequired : []).map((r: any) => ({
      name: str(r.Name), label: str(r.Name_Localised) || str(r.Name),
      required: num(r.RequiredAmount), provided: num(r.ProvidedAmount), payment: num(r.Payment),
    }));
    d.updatedAt = at || d.updatedAt;
  } else if (e.event === 'ColonisationContribution') {
    const d = depots.find((x) => x.marketId === num(e.MarketID));
    if (!d) return;
    for (const c of Array.isArray(e.Contributions) ? e.Contributions : []) {
      const r = d.resources.find((x) => x.name.toLowerCase() === str(c.Name).toLowerCase());
      if (r) r.provided = Math.min(r.required, r.provided + num(c.Amount));
    }
    d.updatedAt = at || d.updatedAt;
  }
}

/** Depots kept on disk merged with those just read: the newer copy of each wins. Pure, for tests. */
export function mergeDepots(saved: ColonyDepot[], live: ColonyDepot[]): ColonyDepot[] {
  const out = new Map(saved.map((d) => [d.marketId, d]));
  for (const d of live) {
    const old = out.get(d.marketId);
    if (!old || d.updatedAt >= old.updatedAt) {
      out.set(d.marketId, old?.deadlineSet ? { ...d, deadline: old.deadline, deadlineSet: true, firstSeenAt: old.firstSeenAt } : d);
    }
  }
  return [...out.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
