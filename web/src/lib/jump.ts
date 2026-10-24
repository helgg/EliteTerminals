import type { EdState } from '@et/shared';

/**
 * Jump range with what the ship is carrying now.
 * The game's MaxJumpRange assumes an empty hold and only one jump's worth of fuel; for a fixed fuel
 * burn the FSD's range scales with 1/mass, so scale it by unladen mass over current total mass.
 * Ignores the one-jump fuel term in the reference mass (a few tonnes against hundreds or thousands).
 */
export function currentJumpRange(s: EdState): number {
  const { maxJumpRange, unladenMass } = s.ship;
  if (!maxJumpRange || !unladenMass) return maxJumpRange;
  const mass = unladenMass + s.cargo.count + s.status.fuelMain + s.status.fuelReservoir;
  return (maxJumpRange * unladenMass) / mass;
}

/** Range with a full hold and a full tank: what a trade run actually flies with. */
export function ladenJumpRange(s: EdState): number {
  const { maxJumpRange, unladenMass, cargoCapacity, fuelCapacity } = s.ship;
  if (!maxJumpRange || !unladenMass) return maxJumpRange;
  return (maxJumpRange * unladenMass) / (unladenMass + cargoCapacity + fuelCapacity);
}
