// The player's fleet carrier from the journal (OBSERVED 2026-10-29/30): CarrierStats when the carrier
// management opens, CarrierFinance, CarrierDepositFuel, CarrierLocation at login; CarrierJumpRequest /
// CarrierJumpCancelled (Journal Manual) for a jump scheduled; CarrierJump when the player rides it.
import type { CarrierState, EdState } from '@et/shared';
import type { JournalEvent } from '../reducer.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Cargo moves at cargoAt met again while replaying a journal (not kept on disk). */
const replayed = new WeakMap<CarrierState, number>();

/**
 * One cargo move, unless already counted. Moves are deltas and the journal is replayed onto the copy kept on disk:
 * a move before the last one applied is skipped, and at the same second only those beyond the count seen there.
 */
function moveCargo(c: CarrierState, at: string, moves: { type: string; label: string; count: number }[]) {
  if (at && c.cargoAt) {
    if (at < c.cargoAt) return;
    if (at === c.cargoAt) {
      const n = (replayed.get(c) ?? 0) + 1;
      replayed.set(c, n);
      if (n <= c.cargoSeen) return;
      c.cargoSeen = n;
    } else {
      c.cargoAt = at;
      c.cargoSeen = 1;
      replayed.set(c, 1);
    }
  } else if (at) {
    c.cargoAt = at;
    c.cargoSeen = 1;
    replayed.set(c, 1);
  }
  for (const m of moves) {
    const name = m.type.toLowerCase();
    let row = c.cargo.find((x) => x.name === name);
    // no Type_Localised when the name is one word ("polymers"): capitalised as the game shows it
    if (!row) c.cargo.push((row = { name, label: m.label || m.type.charAt(0).toUpperCase() + m.type.slice(1), count: 0 }));
    if (m.label) row.label = m.label;
    row.count = Math.max(0, row.count + m.count);
  }
  c.cargo = c.cargo.filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
}

export function applyCarrier(state: EdState, e: JournalEvent): void {
  const c = state.carrier;
  if (e.event === 'CargoTransfer') {
    if (!c.id) return;
    const moves = (Array.isArray(e.Transfers) ? e.Transfers : []).map((t: any) => ({
      type: str(t.Type), label: str(t.Type_Localised), count: (t.Direction === 'toship' ? -1 : 1) * num(t.Count),
    }));
    moveCargo(c, str(e.timestamp), moves);
    return;
  }
  if (e.event === 'MarketBuy' || e.event === 'MarketSell') {
    // the player trading with the carrier's own market (selling into its buy order fills it)
    if (!c.id || num(e.MarketID) !== c.id) return;
    const sign = e.event === 'MarketSell' ? 1 : -1;
    moveCargo(c, str(e.timestamp), [{ type: str(e.Type), label: str(e.Type_Localised), count: sign * num(e.Count) }]);
    return;
  }
  const id = num(e.CarrierID) || num(e.MarketID);
  // one carrier per player: the first one seen, or a new one bought
  if (e.event !== 'CarrierBuy' && c.id && id && id !== c.id) return;
  const at = str(e.timestamp);
  switch (e.event) {
    case 'CarrierBuy':
      Object.assign(c, { id, callsign: str(e.Callsign), system: str(e.Location), systemAddress: num(e.SystemAddress) });
      break;
    case 'CarrierStats': {
      const u = e.SpaceUsage ?? {};
      const f = e.Finance ?? {};
      Object.assign(c, {
        id, callsign: str(e.Callsign) || c.callsign, name: str(e.Name) || c.name, fuel: num(e.FuelLevel),
        space: {
          total: num(u.TotalCapacity), crew: num(u.Crew), cargo: num(u.Cargo), reserved: num(u.CargoSpaceReserved),
          packs: num(u.ShipPacks) + num(u.ModulePacks), free: num(u.FreeSpace),
        },
        balance: num(f.CarrierBalance), available: num(f.AvailableBalance), statsAt: at,
      });
      break;
    }
    case 'CarrierFinance':
      Object.assign(c, { id, balance: num(e.CarrierBalance), available: num(e.AvailableBalance) });
      break;
    case 'CarrierDepositFuel':
      c.id = id;
      c.fuel = num(e.Total);
      break;
    case 'CarrierLocation':
      Object.assign(c, { id, system: str(e.StarSystem), systemAddress: num(e.SystemAddress) });
      if (c.jump && c.jump.system.toLowerCase() === c.system.toLowerCase()) c.jump = null;
      break;
    case 'CarrierJumpRequest':
      c.id = id;
      c.jump = { system: str(e.SystemName), body: str(e.Body), departAt: str(e.DepartureTime) };
      break;
    case 'CarrierJumpCancelled':
      c.jump = null;
      break;
    case 'CarrierJump':
      // the player rode the jump: docked (MarketID is the carrier) or on foot aboard (OBSERVED 2026-10-30: no
      // MarketID then; the jump scheduled to that system tells it apart)
      if (!c.id) return;
      if (id ? id !== c.id : c.jump?.system.toLowerCase() !== str(e.StarSystem).toLowerCase()) return;
      Object.assign(c, { system: str(e.StarSystem), systemAddress: num(e.SystemAddress), jump: null });
      break;
    default:
      return;
  }
  c.updatedAt = at || c.updatedAt;
}

/** The copy kept on disk unless the journal read now knows something newer. Pure, for tests. */
export function mergeCarrier(saved: CarrierState, live: CarrierState): CarrierState {
  if (!saved.id || (live.id && live.updatedAt >= saved.updatedAt)) return live;
  // fields added since the copy was saved start from their defaults
  return { ...live, ...saved };
}
