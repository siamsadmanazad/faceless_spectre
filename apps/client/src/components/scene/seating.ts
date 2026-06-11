/**
 * Seat layout — the single source of truth for where each seat sits around the
 * table. Used by opponent hands, ghost hands, and the dealer-hand staging for
 * shuffle animations.
 */

// Table radius for seating (world units)
export const SEAT_RADIUS = 3.8;

// Seat 0 is the local player at the near edge (positive Z).
// Remaining seats fan around the table counterclockwise.
// These angles are measured from +Z axis, going counterclockwise.
export const SEAT_ANGLES: Record<number, number> = {
  0: 0, // near center (local player — rendered by PlayerHand)
  1: Math.PI, // far center
  2: -Math.PI / 3, // near right
  3: Math.PI / 3, // far left
  4: (-2 * Math.PI) / 3, // right
  5: (2 * Math.PI) / 3, // left
};

export function seatAngle(seat: number): number {
  return SEAT_ANGLES[seat] ?? 0;
}

export function seatPosition(seat: number): [number, number, number] {
  const angle = seatAngle(seat);
  return [Math.sin(angle) * SEAT_RADIUS, 0.05, Math.cos(angle) * SEAT_RADIUS];
}

/** Rotate a card fan (or anything seat-anchored) to face the table center. */
export function seatFanYaw(seat: number): number {
  return seatAngle(seat) + Math.PI;
}
